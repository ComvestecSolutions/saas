/**
 * Admin-app universal-search loader tests (admin-app
 * implementation plan §9 — Phase 2 Desk Core commit 7,
 * item 11). Covers the discriminated-union mapping of the
 * universal-search route-data trio that backs the bottom
 * Command Strip omnibar.
 *
 * Boundary contracts verified here:
 *   - empty query short-circuits to `shell` without hitting
 *     the platform service (the loader is allowed to short-
 *     circuit because the contract requires
 *     `Schema.NonEmptyString` for `query`)
 *   - missing subscriber-journey session id → `shell`
 *   - `UniversalSearchUnauthorized` → `denied`
 *   - `UniversalSearchMissingActorIdentity` → `denied`
 *   - non-tagged Error → `error` (description from `.message`)
 *
 * Trust-resolution and live federated-search behavior are
 * exercised end-to-end in the universal-search-service tests
 * (`tests/platform/universal-search-service.test.ts`). The
 * loader test only pins the discriminated-union mapping the
 * admin-app omnibar consumes.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Effect } from "effect";

import * as platform from "@comvestec/platform";
import { loadAdminUniversalSearchRouteDataFromRequest } from "../../apps/admin-app/src/lib/universal-search-route-data";

const resolveTrustedRequestContextFromSessionIdSpy = vi.spyOn(
  platform,
  "resolveTrustedRequestContextFromSessionId",
);
const runUniversalSearchFromEnvironmentSpy = vi.spyOn(
  platform,
  "runUniversalSearchFromEnvironment",
);

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const fakeRequestContext = {
  actorType: "platform-operator",
  actorId: "usr_platform_operator_1",
  scope: "platform",
  scopeId: "platform",
} as const;

const okResult = {
  result: {
    query: "acme",
    entries: [
      {
        facet: "tenants" as const,
        id: "ten_acme",
        label: "Acme Holdings",
        scopeTag: "tenant" as const,
        permalink: "/r/tenant/ten_acme",
        fieldClassification: "public",
      },
    ],
    partialFailures: [],
    indexFreshness: {
      lastReindexedAt: new Date(0).toISOString(),
      isFresh: true,
    },
    correlationId: "corr_test",
    generatedAt: new Date(0).toISOString(),
  },
  fromCache: false,
};

const mockResolveContextOk = () =>
  resolveTrustedRequestContextFromSessionIdSpy.mockImplementation(
    () => Effect.succeed(fakeRequestContext) as never,
  );

describe("admin-app universal-search loader", () => {
  beforeEach(() => {
    resolveTrustedRequestContextFromSessionIdSpy.mockReset();
    runUniversalSearchFromEnvironmentSpy.mockReset();
  });

  afterAll(() => {
    resolveTrustedRequestContextFromSessionIdSpy.mockRestore();
    runUniversalSearchFromEnvironmentSpy.mockRestore();
  });

  it("short-circuits to shell when the query is empty", async () => {
    mockResolveContextOk();
    runUniversalSearchFromEnvironmentSpy.mockImplementation(
      () => Effect.succeed(okResult) as never,
    );
    const result = await Effect.runPromise(
      loadAdminUniversalSearchRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        { query: "   " },
      ),
    );
    expect(result.kind).toBe("shell");
    expect(runUniversalSearchFromEnvironmentSpy).not.toHaveBeenCalled();
  });

  it("returns shell when the subscriber-journey session id is missing", async () => {
    mockResolveContextOk();
    runUniversalSearchFromEnvironmentSpy.mockImplementation(
      () => Effect.succeed(okResult) as never,
    );
    const result = await Effect.runPromise(
      loadAdminUniversalSearchRouteDataFromRequest(
        buildRequest(undefined),
        {},
        { query: "acme" },
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with the result envelope on the happy path", async () => {
    mockResolveContextOk();
    runUniversalSearchFromEnvironmentSpy.mockImplementation(
      () => Effect.succeed(okResult) as never,
    );
    const result = await Effect.runPromise(
      loadAdminUniversalSearchRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        { query: "acme" },
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.result.entries).toHaveLength(1);
    expect(result.result.entries[0]?.permalink).toBe("/r/tenant/ten_acme");
    expect(result.fromCache).toBe(false);
  });

  it("maps UniversalSearchUnauthorized to denied", async () => {
    mockResolveContextOk();
    runUniversalSearchFromEnvironmentSpy.mockImplementation(
      () =>
        Effect.fail({
          _tag: "UniversalSearchUnauthorized",
        } as const) as never,
    );
    const result = await Effect.runPromise(
      loadAdminUniversalSearchRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        { query: "acme" },
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("maps UniversalSearchMissingActorIdentity to denied", async () => {
    mockResolveContextOk();
    runUniversalSearchFromEnvironmentSpy.mockImplementation(
      () =>
        Effect.fail({
          _tag: "UniversalSearchMissingActorIdentity",
        } as const) as never,
    );
    const result = await Effect.runPromise(
      loadAdminUniversalSearchRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        { query: "acme" },
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("maps IdentitySessionRequestContextNotFoundError to stale-session", async () => {
    resolveTrustedRequestContextFromSessionIdSpy.mockImplementation(
      () =>
        Effect.fail({
          _tag: "IdentitySessionRequestContextNotFoundError",
        } as const) as never,
    );
    runUniversalSearchFromEnvironmentSpy.mockImplementation(
      () => Effect.succeed(okResult) as never,
    );
    const result = await Effect.runPromise(
      loadAdminUniversalSearchRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        { query: "acme" },
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns error when the platform helper raises an untagged Error", async () => {
    mockResolveContextOk();
    runUniversalSearchFromEnvironmentSpy.mockImplementation(
      () =>
        Effect.fail(
          new Error("Upstream universal-search service unavailable."),
        ) as never,
    );
    const result = await Effect.runPromise(
      loadAdminUniversalSearchRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        { query: "acme" },
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Search unavailable");
    expect(result.description).toBe(
      "Upstream universal-search service unavailable.",
    );
  });

  it("forwards the typed prefixFilter to the service", async () => {
    mockResolveContextOk();
    const runMock = runUniversalSearchFromEnvironmentSpy.mockImplementation(
      () => Effect.succeed(okResult) as never,
    );
    await Effect.runPromise(
      loadAdminUniversalSearchRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        { query: "acme", prefixFilter: "t" },
      ),
    );
    expect(runMock).toHaveBeenCalled();
    const callArgs = runMock.mock.calls[0]?.[1];
    expect(callArgs?.query.prefixFilter).toBe("t");
    expect(callArgs?.query.reasonCatalogId).toBe("universal-search.read");
  });
});
