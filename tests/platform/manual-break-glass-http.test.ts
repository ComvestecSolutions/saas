/**
 * Manual break-glass HTTP transport tests (admin-app
 * implementation plan §9 item 5 follow-up). Exercises the
 * `createManualBreakGlassHttpHandlerWithDependencies` seam with
 * an injected request-context resolver + service double so we
 * cover routing, JSON/query decoding, error-tag → status mapping,
 * 405 method-not-allowed, 404 unknown sub-path, and the
 * backend-api registry pin.
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformScope,
  reasonCatalogId,
  type ManualBreakGlassGrant,
  type RequestContext,
} from "@comvestec/contracts";
import { manualBreakGlassGrantStatus } from "@comvestec/modules";
import {
  BreakGlassActiveLimitExceeded,
  BreakGlassGrantAlreadyReleased,
  BreakGlassGrantExpired,
  BreakGlassGrantNotFound,
  BreakGlassReasonNotInCatalog,
  BreakGlassTtlExceeded,
  BreakGlassUnauthorized,
  ManualBreakGlassMissingActorIdentity,
  createManualBreakGlassHttpHandlerWithDependencies,
  manualBreakGlassApiBasePath,
  manualBreakGlassApiPath,
  type ManualBreakGlassServiceImpl,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_mbg_http_operator",
  sessionId: "sess_mbg_http",
  correlationId: "corr_mbg_http",
  reason: "manual break-glass http unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const fakeGrant = (
  overrides: Partial<ManualBreakGlassGrant> = {},
): ManualBreakGlassGrant => ({
  id: overrides.id ?? "mbg_fake",
  grantedTo: overrides.grantedTo ?? "usr_grantee",
  grantedBy: overrides.grantedBy ?? "usr_mbg_http_operator",
  targetTenant: overrides.targetTenant ?? {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
  reasonCatalogId: overrides.reasonCatalogId ?? reasonCatalogId.breakGlassIssue,
  reasonNarrative: overrides.reasonNarrative ?? "incident triage",
  issuedAt: overrides.issuedAt ?? "2024-01-01T00:00:00.000Z",
  expiresAt: overrides.expiresAt ?? "2024-01-01T00:30:00.000Z",
  status: overrides.status ?? manualBreakGlassGrantStatus.active,
  correlationId: overrides.correlationId ?? "corr_mbg_http",
  ...(overrides.releasedAt === undefined
    ? {}
    : { releasedAt: overrides.releasedAt }),
  ...(overrides.releasedBy === undefined
    ? {}
    : { releasedBy: overrides.releasedBy }),
  ...(overrides.releaseReasonCatalogId === undefined
    ? {}
    : { releaseReasonCatalogId: overrides.releaseReasonCatalogId }),
});

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(
    new Error(`unexpected manual-break-glass HTTP service call: ${method}`),
  );

const createServiceDouble = (
  overrides: Partial<ManualBreakGlassServiceImpl> = {},
): ManualBreakGlassServiceImpl => ({
  issueGrant:
    overrides.issueGrant ?? (() => unexpectedServiceCall("issueGrant")),
  releaseGrant:
    overrides.releaseGrant ?? (() => unexpectedServiceCall("releaseGrant")),
  listActiveGrantsForSubject:
    overrides.listActiveGrantsForSubject ??
    (() => unexpectedServiceCall("listActiveGrantsForSubject")),
  lookupGrant:
    overrides.lookupGrant ?? (() => unexpectedServiceCall("lookupGrant")),
  currentBreakGlassContextForActor:
    overrides.currentBreakGlassContextForActor ??
    (() => unexpectedServiceCall("currentBreakGlassContextForActor")),
  autoExpireStaleGrants:
    overrides.autoExpireStaleGrants ??
    (() => unexpectedServiceCall("autoExpireStaleGrants")),
});

const createTestHandler = (
  service: Partial<ManualBreakGlassServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createManualBreakGlassHttpHandlerWithDependencies({
    resolveRequestContext: (resolverOverride ??
      (() => Effect.succeed(trustedRequestContext))) as (
      request: Request,
    ) => Effect.Effect<RequestContext, never>,
    runWithService: (use) => use(createServiceDouble(service)),
  });

const url = (path: string) => `http://localhost${path}`;

const issueBody = () =>
  JSON.stringify({
    grantedTo: "usr_grantee",
    targetTenant: {
      scope: platformScope.platform,
      scopeId: platformScope.platform,
    },
    reasonCatalogId: reasonCatalogId.breakGlassIssue,
    reasonNarrative: "incident triage",
    reasonAttachmentText: "runbook://incident/INC-2001",
    expiresAt: "2024-01-01T00:30:00.000Z",
  });

const releaseBody = () =>
  JSON.stringify({
    releaseReasonCatalogId: reasonCatalogId.breakGlassRelease,
  });

// ---------------------------------------------------------------------------
// Path table + registry pin
// ---------------------------------------------------------------------------

describe("manual-break-glass HTTP — path table + registry", () => {
  it("pins the public base path and per-route literals", () => {
    expect(manualBreakGlassApiBasePath).toBe("/api/manual-break-glass");
    expect(manualBreakGlassApiPath).toEqual({
      issue: "/api/manual-break-glass/grants",
      list: "/api/manual-break-glass/grants",
      current: "/api/manual-break-glass/grants/current",
      release: "/api/manual-break-glass/grants/:id/release",
    });
  });

  it("is registered against the canonical backend API router via manualBreakGlassApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(backendApiSource.includes("manualBreakGlassApiBasePath")).toBe(true);
    expect(backendApiSource.includes("manualBreakGlassHandler")).toBe(true);
    expect(backendApiSource.includes("handleManualBreakGlassHttpRequest")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Issue
// ---------------------------------------------------------------------------

describe("manual-break-glass HTTP — issue grant", () => {
  it("returns the issued grant on POST happy path (201)", async () => {
    const grant = fakeGrant({ id: "mbg_issued" });
    const handler = createTestHandler({
      issueGrant: () => Effect.succeed(grant),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(manualBreakGlassApiPath.issue), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: issueBody(),
        }),
      ),
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ grant });
  });

  it("returns 400 for malformed JSON", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(manualBreakGlassApiPath.issue), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not json",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 for body failing the schema", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(manualBreakGlassApiPath.issue), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grantedTo: "" }),
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps BreakGlassReasonNotInCatalog to 400", async () => {
    const handler = createTestHandler({
      issueGrant: () =>
        Effect.fail(
          new BreakGlassReasonNotInCatalog({
            operation: "issue",
            reasonCatalogId: "bogus",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(manualBreakGlassApiPath.issue), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: issueBody(),
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps BreakGlassTtlExceeded to 422", async () => {
    const handler = createTestHandler({
      issueGrant: () =>
        Effect.fail(
          new BreakGlassTtlExceeded({
            expiresAt: "2099-01-01T00:00:00.000Z",
            maxTtlMinutes: 60,
            nowIso: "2024-01-01T00:00:00.000Z",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(manualBreakGlassApiPath.issue), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: issueBody(),
        }),
      ),
    );
    expect(response.status).toBe(422);
  });

  it("maps BreakGlassActiveLimitExceeded to 409", async () => {
    const handler = createTestHandler({
      issueGrant: () =>
        Effect.fail(
          new BreakGlassActiveLimitExceeded({
            grantedTo: "usr_grantee",
            activeCount: 3,
            maxActiveGrantsPerSupportOperator: 3,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(manualBreakGlassApiPath.issue), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: issueBody(),
        }),
      ),
    );
    expect(response.status).toBe(409);
  });

  it("maps BreakGlassUnauthorized to 401", async () => {
    const handler = createTestHandler({
      issueGrant: () =>
        Effect.fail(
          new BreakGlassUnauthorized({
            operation: "issue",
            requestingActorId: "usr_intruder",
            requestingActorType: actorType.individualUser,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(manualBreakGlassApiPath.issue), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: issueBody(),
        }),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps ManualBreakGlassMissingActorIdentity to 401", async () => {
    const handler = createTestHandler({
      issueGrant: () =>
        Effect.fail(
          new ManualBreakGlassMissingActorIdentity({ operation: "issue" }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(manualBreakGlassApiPath.issue), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: issueBody(),
        }),
      ),
    );
    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// List active
// ---------------------------------------------------------------------------

describe("manual-break-glass HTTP — list active grants", () => {
  it("returns the active grants envelope on GET happy path", async () => {
    const grants = [fakeGrant({ id: "mbg_a" }), fakeGrant({ id: "mbg_b" })];
    let receivedSubjectId: string | undefined;
    const handler = createTestHandler({
      listActiveGrantsForSubject: (input) => {
        receivedSubjectId = input.subjectId;
        return Effect.succeed(grants);
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          `${url(manualBreakGlassApiPath.list)}?subjectId=usr_grantee`,
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ grants });
    expect(receivedSubjectId).toBe("usr_grantee");
  });

  it("returns 400 when subjectId query parameter is missing", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(manualBreakGlassApiPath.list), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Current grant for trusted actor
// ---------------------------------------------------------------------------

describe("manual-break-glass HTTP — current grant for trusted actor", () => {
  it("returns the current grant on GET happy path", async () => {
    const grant = fakeGrant({ id: "mbg_current" });
    let receivedSubjectId: string | undefined;
    const handler = createTestHandler({
      currentBreakGlassContextForActor: (input) => {
        receivedSubjectId = input.subjectId;
        return Effect.succeed(Option.some(grant));
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(manualBreakGlassApiPath.current), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ grant });
    expect(receivedSubjectId).toBe(trustedRequestContext.actorId);
  });

  it("returns { grant: null } when there is no current grant", async () => {
    const handler = createTestHandler({
      currentBreakGlassContextForActor: () => Effect.succeed(Option.none()),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(manualBreakGlassApiPath.current), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ grant: null });
  });
});

// ---------------------------------------------------------------------------
// Release
// ---------------------------------------------------------------------------

describe("manual-break-glass HTTP — release grant", () => {
  it("returns the released grant on POST happy path", async () => {
    const released = fakeGrant({
      id: "mbg_released",
      status: manualBreakGlassGrantStatus.released,
      releasedAt: "2024-01-01T00:10:00.000Z",
      releasedBy: "usr_mbg_http_operator",
      releaseReasonCatalogId: reasonCatalogId.breakGlassRelease,
    });
    let receivedId: string | undefined;
    const handler = createTestHandler({
      releaseGrant: (input) => {
        receivedId = input.release.id;
        return Effect.succeed(released);
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url("/api/manual-break-glass/grants/mbg_released/release"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: releaseBody(),
          },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ grant: released });
    expect(receivedId).toBe("mbg_released");
  });

  it("maps BreakGlassGrantNotFound to 404", async () => {
    const handler = createTestHandler({
      releaseGrant: () =>
        Effect.fail(new BreakGlassGrantNotFound({ id: "mbg_missing" })),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/manual-break-glass/grants/mbg_missing/release"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: releaseBody(),
        }),
      ),
    );
    expect(response.status).toBe(404);
  });

  it("maps BreakGlassGrantAlreadyReleased to 409", async () => {
    const handler = createTestHandler({
      releaseGrant: () =>
        Effect.fail(
          new BreakGlassGrantAlreadyReleased({
            id: "mbg_dbl",
            currentStatus: manualBreakGlassGrantStatus.released,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/manual-break-glass/grants/mbg_dbl/release"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: releaseBody(),
        }),
      ),
    );
    expect(response.status).toBe(409);
  });

  it("maps BreakGlassGrantExpired to 410", async () => {
    const handler = createTestHandler({
      releaseGrant: () =>
        Effect.fail(
          new BreakGlassGrantExpired({
            id: "mbg_expired",
            expiresAt: "2020-01-01T00:00:00.000Z",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/manual-break-glass/grants/mbg_expired/release"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: releaseBody(),
        }),
      ),
    );
    expect(response.status).toBe(410);
  });

  it("returns 500 for unknown / untagged service errors", async () => {
    const handler = createTestHandler({
      releaseGrant: () => Effect.fail(new Error("boom") as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/manual-break-glass/grants/mbg_boom/release"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: releaseBody(),
        }),
      ),
    );
    expect(response.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// 405 / 404
// ---------------------------------------------------------------------------

describe("manual-break-glass HTTP — method-not-allowed + unknown sub-path", () => {
  it("rejects an unsupported method on /grants/current with 405", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(manualBreakGlassApiPath.current), { method: "POST" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects an unsupported method on /grants/:id/release with 405", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/manual-break-glass/grants/mbg_x/release"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it("returns 404 on unknown sub-path", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/manual-break-glass/not-a-route"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});
