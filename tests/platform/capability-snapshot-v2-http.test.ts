/**
 * Capability snapshot v2 HTTP transport tests (admin-app
 * implementation plan §9 item 13). Mirrors the universal-search
 * HTTP test: exercises
 * `createCapabilitySnapshotV2HttpHandlerWithDependencies` with an
 * injected request-context resolver + service double so we cover
 * routing, body decoding, error-tag → status mapping, 405
 * method-not-allowed, 404 unknown sub-path, and the backend-api
 * registry pin.
 */
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  adminOrgRole,
  capabilitySnapshotV2AuditAction,
  platformScope,
  reasonCatalogId,
  type CapabilitySnapshotV2,
  type RequestContext,
} from "@comvestec/contracts";
import {
  CapabilitySnapshotV2MissingActorIdentity,
  CapabilitySnapshotV2ReasonActionMismatch,
  CapabilitySnapshotV2ReasonNotInCatalog,
  CapabilitySnapshotV2Unauthorized,
  capabilitySnapshotV2ApiBasePath,
  capabilitySnapshotV2ApiPath,
  createCapabilitySnapshotV2HttpHandlerWithDependencies,
  type CapabilitySnapshotV2ServiceImpl,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_capability_snapshot_v2_http_operator",
  sessionId: "sess_capability_snapshot_v2_http",
  correlationId: "corr_capability_snapshot_v2_http",
  reason: reasonCatalogId.capabilitySnapshotV2Read,
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const fakeSnapshot = (): CapabilitySnapshotV2 => ({
  actorId: "usr_capability_snapshot_v2_http_operator",
  actorType: actorType.platformOperator,
  scopes: [],
  permissions: [],
  adminOrgRole: adminOrgRole.none,
  navigationMap: [],
  highRiskAffordances: [],
  derivedAt: "2026-02-01T00:00:00.000Z",
  correlationId: "corr_capability_snapshot_v2_http",
});

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(
    new Error(`unexpected capability-snapshot-v2 service call: ${method}`),
  );

const createServiceDouble = (
  overrides: Partial<CapabilitySnapshotV2ServiceImpl> = {},
): CapabilitySnapshotV2ServiceImpl => ({
  deriveSnapshot:
    overrides.deriveSnapshot ?? (() => unexpectedServiceCall("deriveSnapshot")),
  invalidateCache:
    overrides.invalidateCache ??
    (() => unexpectedServiceCall("invalidateCache")),
});

const createTestHandler = (
  service: Partial<CapabilitySnapshotV2ServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createCapabilitySnapshotV2HttpHandlerWithDependencies({
    resolveRequestContext: (resolverOverride ??
      (() => Effect.succeed(trustedRequestContext))) as (
      request: Request,
    ) => Effect.Effect<RequestContext, never>,
    runWithService: (use) => use(createServiceDouble(service)),
  });

const url = (path: string) => `http://localhost${path}`;

const invalidateBody = (overrides: Record<string, unknown> = {}) => ({
  actorId: "usr_target_to_evict",
  reason: reasonCatalogId.capabilitySnapshotV2Read,
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

describe("capability-snapshot-v2 HTTP — path table + registry", () => {
  it("pins the public base path and per-route literals", () => {
    expect(capabilitySnapshotV2ApiBasePath).toBe("/api/capability-snapshot-v2");
    expect(capabilitySnapshotV2ApiPath).toEqual({
      snapshot: "/api/capability-snapshot-v2/snapshot",
      invalidate: "/api/capability-snapshot-v2/invalidate",
    });
  });

  it("is registered against the canonical backend API router via capabilitySnapshotV2ApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(backendApiSource.includes("capabilitySnapshotV2ApiBasePath")).toBe(
      true,
    );
    expect(backendApiSource.includes("capabilitySnapshotV2Handler")).toBe(true);
    expect(
      backendApiSource.includes("handleCapabilitySnapshotV2HttpRequest"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /snapshot
// ---------------------------------------------------------------------------

describe("capability-snapshot-v2 HTTP — /snapshot", () => {
  it("returns 200 { snapshot, fromCache } on happy path", async () => {
    const snapshot = fakeSnapshot();
    const handler = createTestHandler({
      deriveSnapshot: () => Effect.succeed({ snapshot, fromCache: false }),
    });
    const response = await Effect.runPromise(
      handler(getRequest(capabilitySnapshotV2ApiPath.snapshot)),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      snapshot,
      fromCache: false,
    });
  });

  it("maps CapabilitySnapshotV2Unauthorized to 401", async () => {
    const handler = createTestHandler({
      deriveSnapshot: () =>
        Effect.fail(
          new CapabilitySnapshotV2Unauthorized({
            operation: "deriveSnapshot",
            requestingActorType: actorType.individualUser,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(getRequest(capabilitySnapshotV2ApiPath.snapshot)),
    );
    expect(response.status).toBe(401);
  });

  it("maps CapabilitySnapshotV2MissingActorIdentity to 401", async () => {
    const handler = createTestHandler({
      deriveSnapshot: () =>
        Effect.fail(
          new CapabilitySnapshotV2MissingActorIdentity({
            operation: "deriveSnapshot",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(getRequest(capabilitySnapshotV2ApiPath.snapshot)),
    );
    expect(response.status).toBe(401);
  });

  it("maps CapabilitySnapshotV2ReasonNotInCatalog to 400", async () => {
    const handler = createTestHandler({
      deriveSnapshot: () =>
        Effect.fail(
          new CapabilitySnapshotV2ReasonNotInCatalog({
            operation: "deriveSnapshot",
            reasonCatalogId: "not-in-catalog",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(getRequest(capabilitySnapshotV2ApiPath.snapshot)),
    );
    expect(response.status).toBe(400);
  });

  it("maps CapabilitySnapshotV2ReasonActionMismatch to 400", async () => {
    const handler = createTestHandler({
      deriveSnapshot: () =>
        Effect.fail(
          new CapabilitySnapshotV2ReasonActionMismatch({
            operation: "deriveSnapshot",
            reasonCatalogId: reasonCatalogId.universalSearchRead,
            auditAction: capabilitySnapshotV2AuditAction.snapshotDerived,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(getRequest(capabilitySnapshotV2ApiPath.snapshot)),
    );
    expect(response.status).toBe(400);
  });

  it("returns 500 for unknown / untagged service errors", async () => {
    const handler = createTestHandler({
      deriveSnapshot: () => Effect.fail(new Error("boom") as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(getRequest(capabilitySnapshotV2ApiPath.snapshot)),
    );
    expect(response.status).toBe(500);
  });

  it("maps the missing-session-header tag to 401 via the resolver seam", async () => {
    const handler = createTestHandler({}, () =>
      Effect.fail({ _tag: "SubscriberJourneySessionIdMissingError" } as const),
    );
    const response = await Effect.runPromise(
      handler(getRequest(capabilitySnapshotV2ApiPath.snapshot)),
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
      handler(getRequest(capabilitySnapshotV2ApiPath.snapshot)),
    );
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /invalidate
// ---------------------------------------------------------------------------

describe("capability-snapshot-v2 HTTP — /invalidate", () => {
  it("returns 202 { accepted: true } on happy path", async () => {
    const handler = createTestHandler({
      invalidateCache: () =>
        Effect.succeed({ accepted: true as const, evictedCount: 1 }),
    });
    const response = await Effect.runPromise(
      handler(
        postJson(capabilitySnapshotV2ApiPath.invalidate, invalidateBody()),
      ),
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true });
  });

  it("returns 400 when the body schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        postJson(capabilitySnapshotV2ApiPath.invalidate, {
          /* missing actorId + reason */
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(capabilitySnapshotV2ApiPath.invalidate), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not-json",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps CapabilitySnapshotV2Unauthorized to 401 (non-operator rejected)", async () => {
    const handler = createTestHandler({
      invalidateCache: () =>
        Effect.fail(
          new CapabilitySnapshotV2Unauthorized({
            operation: "invalidateCache",
            requestingActorType: actorType.supportOperator,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        postJson(capabilitySnapshotV2ApiPath.invalidate, invalidateBody()),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("accepts the optional reasonAttachmentText body field", async () => {
    const handler = createTestHandler({
      invalidateCache: () =>
        Effect.succeed({ accepted: true as const, evictedCount: 0 }),
    });
    const response = await Effect.runPromise(
      handler(
        postJson(
          capabilitySnapshotV2ApiPath.invalidate,
          invalidateBody({
            reasonAttachmentText: "runbook://capability/invalidate",
          }),
        ),
      ),
    );
    expect(response.status).toBe(202);
  });
});

// ---------------------------------------------------------------------------
// 405 / 404
// ---------------------------------------------------------------------------

describe("capability-snapshot-v2 HTTP — method-not-allowed + unknown sub-path", () => {
  it("rejects POST on /snapshot with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(capabilitySnapshotV2ApiPath.snapshot), {
          method: "POST",
        }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects GET on /invalidate with 405 + Allow: POST", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(capabilitySnapshotV2ApiPath.invalidate), {
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
        new Request(url("/api/capability-snapshot-v2/not-a-route"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});
