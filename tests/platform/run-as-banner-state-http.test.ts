/**
 * Run-as banner state HTTP transport tests (admin-app implementation
 * plan §9 item 14). Mirrors the capability-snapshot-v2 HTTP test:
 * exercises `createRunAsBannerStateHttpHandlerWithDependencies` with
 * an injected request-context resolver + service double so we cover
 * routing, body decoding, error-tag → status mapping, 405
 * method-not-allowed, 404 unknown sub-path, and the backend-api
 * registry pin.
 */
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformScope,
  reasonCatalogId,
  runAsBannerStateAuditAction,
  type RequestContext,
  type RunAsBannerState,
} from "@comvestec/contracts";
import {
  createRunAsBannerStateHttpHandlerWithDependencies,
  runAsBannerStateApiBasePath,
  runAsBannerStateApiPath,
  RunAsBannerStateGrantNotFound,
  RunAsBannerStateMissingActorIdentity,
  RunAsBannerStateReasonActionMismatch,
  RunAsBannerStateReasonAttachmentRequired,
  RunAsBannerStateReasonNotInCatalog,
  RunAsBannerStateUnauthorized,
  type RunAsBannerStateServiceImpl,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_run_as_banner_state_http_operator",
  sessionId: "sess_run_as_banner_state_http",
  correlationId: "corr_run_as_banner_state_http",
  reason: reasonCatalogId.runAsBannerStateRelease,
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const inactiveBanner = (): RunAsBannerState => ({
  active: false,
  releasable: false,
});

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(new Error(`unexpected run-as-banner-state call: ${method}`));

const createServiceDouble = (
  overrides: Partial<RunAsBannerStateServiceImpl> = {},
): RunAsBannerStateServiceImpl => ({
  queryBanner:
    overrides.queryBanner ?? (() => unexpectedServiceCall("queryBanner")),
  releaseGrant:
    overrides.releaseGrant ?? (() => unexpectedServiceCall("releaseGrant")),
});

const createTestHandler = (
  service: Partial<RunAsBannerStateServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createRunAsBannerStateHttpHandlerWithDependencies({
    resolveRequestContext: (resolverOverride ??
      (() => Effect.succeed(trustedRequestContext))) as (
      request: Request,
    ) => Effect.Effect<RequestContext, never>,
    runWithService: (use) => use(createServiceDouble(service)),
  });

const url = (path: string) => `http://localhost${path}`;

const releaseBody = (overrides: Record<string, unknown> = {}) => ({
  grantId: "mbg_target_release",
  reason: reasonCatalogId.runAsBannerStateRelease,
  reasonAttachmentText: "runbook://run-as/release",
  ...overrides,
});

const postJson = (path: string, body: unknown) =>
  new Request(url(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const getRequest = (path: string) => new Request(url(path), { method: "GET" });

// ---------------------------------------------------------------------------
// Path table + registry pin
// ---------------------------------------------------------------------------

describe("run-as-banner-state HTTP — path table + registry", () => {
  it("pins the public base path and per-route literals", () => {
    expect(runAsBannerStateApiBasePath).toBe("/api/run-as-banner-state");
    expect(runAsBannerStateApiPath).toEqual({
      banner: "/api/run-as-banner-state/banner",
      release: "/api/run-as-banner-state/release",
    });
  });

  it("is registered against the canonical backend API router via runAsBannerStateApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(backendApiSource.includes("runAsBannerStateApiBasePath")).toBe(true);
    expect(backendApiSource.includes("runAsBannerStateHandler")).toBe(true);
    expect(backendApiSource.includes("handleRunAsBannerStateHttpRequest")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// GET /banner
// ---------------------------------------------------------------------------

describe("run-as-banner-state HTTP — /banner", () => {
  it("returns 200 { banner, fromCache } on happy path", async () => {
    const banner = inactiveBanner();
    const handler = createTestHandler({
      queryBanner: () => Effect.succeed({ banner, fromCache: false }),
    });
    const response = await Effect.runPromise(
      handler(getRequest(runAsBannerStateApiPath.banner)),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      banner,
      fromCache: false,
    });
  });

  it("maps RunAsBannerStateUnauthorized to 401", async () => {
    const handler = createTestHandler({
      queryBanner: () =>
        Effect.fail(
          new RunAsBannerStateUnauthorized({
            operation: "queryBanner",
            requestingActorType: actorType.individualUser,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(getRequest(runAsBannerStateApiPath.banner)),
    );
    expect(response.status).toBe(401);
  });

  it("maps RunAsBannerStateMissingActorIdentity to 401", async () => {
    const handler = createTestHandler({
      queryBanner: () =>
        Effect.fail(
          new RunAsBannerStateMissingActorIdentity({
            operation: "queryBanner",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(getRequest(runAsBannerStateApiPath.banner)),
    );
    expect(response.status).toBe(401);
  });

  it("returns 500 for unknown / untagged service errors", async () => {
    const handler = createTestHandler({
      queryBanner: () => Effect.fail(new Error("boom") as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(getRequest(runAsBannerStateApiPath.banner)),
    );
    expect(response.status).toBe(500);
  });

  it("maps the missing-session-header tag to 401 via the resolver seam", async () => {
    const handler = createTestHandler({}, () =>
      Effect.fail({ _tag: "SubscriberJourneySessionIdMissingError" } as const),
    );
    const response = await Effect.runPromise(
      handler(getRequest(runAsBannerStateApiPath.banner)),
    );
    expect(response.status).toBe(401);
  });

  it("maps IdentitySessionRequestContextNotFoundError to 404 via the resolver seam", async () => {
    const handler = createTestHandler({}, () =>
      Effect.fail({
        _tag: "IdentitySessionRequestContextNotFoundError",
      } as const),
    );
    const response = await Effect.runPromise(
      handler(getRequest(runAsBannerStateApiPath.banner)),
    );
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /release
// ---------------------------------------------------------------------------

describe("run-as-banner-state HTTP — /release", () => {
  it("returns 202 { accepted, grantId } on happy path", async () => {
    const handler = createTestHandler({
      releaseGrant: () =>
        Effect.succeed({
          accepted: true as const,
          grantId: "mbg_target_release",
        }),
    });
    const response = await Effect.runPromise(
      handler(postJson(runAsBannerStateApiPath.release, releaseBody())),
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      grantId: "mbg_target_release",
    });
  });

  it("returns 400 when the body schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        postJson(runAsBannerStateApiPath.release, {
          /* missing grantId + reason + reasonAttachmentText */
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(runAsBannerStateApiPath.release), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not-json",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps RunAsBannerStateReasonNotInCatalog to 400", async () => {
    const handler = createTestHandler({
      releaseGrant: () =>
        Effect.fail(
          new RunAsBannerStateReasonNotInCatalog({
            operation: "releaseGrant",
            reasonCatalogId: "not-in-catalog",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(runAsBannerStateApiPath.release, releaseBody())),
    );
    expect(response.status).toBe(400);
  });

  it("maps RunAsBannerStateReasonActionMismatch to 400", async () => {
    const handler = createTestHandler({
      releaseGrant: () =>
        Effect.fail(
          new RunAsBannerStateReasonActionMismatch({
            operation: "releaseGrant",
            reasonCatalogId: reasonCatalogId.universalSearchRead,
            auditAction: runAsBannerStateAuditAction.released,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(runAsBannerStateApiPath.release, releaseBody())),
    );
    expect(response.status).toBe(400);
  });

  it("maps RunAsBannerStateReasonAttachmentRequired to 400", async () => {
    const handler = createTestHandler({
      releaseGrant: () =>
        Effect.fail(
          new RunAsBannerStateReasonAttachmentRequired({
            operation: "releaseGrant",
            reasonCatalogId: reasonCatalogId.runAsBannerStateRelease,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(runAsBannerStateApiPath.release, releaseBody())),
    );
    expect(response.status).toBe(400);
  });

  it("maps RunAsBannerStateGrantNotFound to 404", async () => {
    const handler = createTestHandler({
      releaseGrant: () =>
        Effect.fail(
          new RunAsBannerStateGrantNotFound({
            id: "mbg_missing",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(runAsBannerStateApiPath.release, releaseBody())),
    );
    expect(response.status).toBe(404);
  });

  it("maps RunAsBannerStateUnauthorized to 401 (non-grantee + non-admin-owner rejected)", async () => {
    const handler = createTestHandler({
      releaseGrant: () =>
        Effect.fail(
          new RunAsBannerStateUnauthorized({
            operation: "releaseGrant",
            requestingActorType: actorType.supportOperator,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(runAsBannerStateApiPath.release, releaseBody())),
    );
    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 405 / 404
// ---------------------------------------------------------------------------

describe("run-as-banner-state HTTP — method-not-allowed + unknown sub-path", () => {
  it("rejects POST on /banner with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(runAsBannerStateApiPath.banner), { method: "POST" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects GET on /release with 405 + Allow: POST", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(runAsBannerStateApiPath.release), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it("returns 404 on unknown sub-path", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/run-as-banner-state/not-a-route"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});
