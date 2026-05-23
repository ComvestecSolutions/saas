/**
 * Universal-search HTTP transport tests (admin-app implementation
 * plan §9 item 11). Mirrors the openpanel-events-read HTTP test:
 * exercises `createUniversalSearchHttpHandlerWithDependencies` with
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
  universalSearchFacet,
  type RequestContext,
  type UniversalSearchResult,
} from "@comvestec/contracts";
import {
  createUniversalSearchHttpHandlerWithDependencies,
  UniversalSearchAllFacetsFailedError,
  UniversalSearchFacetAdapterError,
  UniversalSearchMissingActorIdentity,
  UniversalSearchReasonNotInCatalog,
  UniversalSearchUnauthorized,
  universalSearchApiBasePath,
  universalSearchApiPath,
  type UniversalSearchServiceImpl,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_universal_search_http_operator",
  sessionId: "sess_universal_search_http",
  correlationId: "corr_universal_search_http",
  reason: "universal-search http unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const fakeResult = (): UniversalSearchResult => ({
  query: "acme",
  entries: [
    {
      facet: universalSearchFacet.tenants,
      id: "t-1",
      label: "Acme Tenant",
      scopeTag: "global",
      permalink: "/r/tenants/t-1",
      fieldClassification: "internal",
    },
  ],
  partialFailures: [],
  indexFreshness: {
    lastReindexedAt: "2026-02-01T00:00:00.000Z",
    isFresh: true,
  },
  correlationId: "corr_universal_search_http",
  generatedAt: "2026-02-01T00:00:00.000Z",
});

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(new Error(`unexpected universal-search service call: ${method}`));

const createServiceDouble = (
  overrides: Partial<UniversalSearchServiceImpl> = {},
): UniversalSearchServiceImpl => ({
  searchFacet:
    overrides.searchFacet ?? (() => unexpectedServiceCall("searchFacet")),
  search: overrides.search ?? (() => unexpectedServiceCall("search")),
  requestReindex:
    overrides.requestReindex ?? (() => unexpectedServiceCall("requestReindex")),
});

const createTestHandler = (
  service: Partial<UniversalSearchServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createUniversalSearchHttpHandlerWithDependencies({
    resolveRequestContext: (resolverOverride ??
      (() => Effect.succeed(trustedRequestContext))) as (
      request: Request,
    ) => Effect.Effect<RequestContext, never>,
    runWithService: (use) => use(createServiceDouble(service)),
  });

const url = (path: string) => `http://localhost${path}`;

const postJson = (path: string, body: unknown, method = "POST") =>
  new Request(url(path), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const searchBody = (overrides: Record<string, unknown> = {}) => ({
  query: "acme",
  reasonCatalogId: reasonCatalogId.universalSearchRead,
  ...overrides,
});

const reindexBody = (overrides: Record<string, unknown> = {}) => ({
  reasonCatalogId: reasonCatalogId.universalSearchReindex,
  reasonAttachmentText: "runbook://search/reindex",
  ...overrides,
});

// ---------------------------------------------------------------------------
// Path table + registry pin
// ---------------------------------------------------------------------------

describe("universal-search HTTP — path table + registry", () => {
  it("pins the public base path and per-route literals", () => {
    expect(universalSearchApiBasePath).toBe("/api/universal-search");
    expect(universalSearchApiPath).toEqual({
      search: "/api/universal-search/search",
      reindex: "/api/universal-search/reindex",
    });
  });

  it("is registered against the canonical backend API router via universalSearchApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(backendApiSource.includes("universalSearchApiBasePath")).toBe(true);
    expect(backendApiSource.includes("universalSearchHandler")).toBe(true);
    expect(backendApiSource.includes("handleUniversalSearchHttpRequest")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// /search (POST)
// ---------------------------------------------------------------------------

describe("universal-search HTTP — /search", () => {
  it("returns 200 { result, fromCache } on happy path", async () => {
    const result = fakeResult();
    const handler = createTestHandler({
      search: () => Effect.succeed({ result, fromCache: false }),
    });
    const response = await Effect.runPromise(
      handler(postJson(universalSearchApiPath.search, searchBody())),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result,
      fromCache: false,
    });
  });

  it("returns 400 when the body schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        postJson(universalSearchApiPath.search, { query: "" /* invalid */ }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(universalSearchApiPath.search), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not-json",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps UniversalSearchUnauthorized to 401", async () => {
    const handler = createTestHandler({
      search: () =>
        Effect.fail(
          new UniversalSearchUnauthorized({
            operation: "search",
            requestingActorType: actorType.individualUser,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(universalSearchApiPath.search, searchBody())),
    );
    expect(response.status).toBe(401);
  });

  it("maps UniversalSearchMissingActorIdentity to 401", async () => {
    const handler = createTestHandler({
      search: () =>
        Effect.fail(
          new UniversalSearchMissingActorIdentity({ operation: "search" }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(universalSearchApiPath.search, searchBody())),
    );
    expect(response.status).toBe(401);
  });

  it("maps UniversalSearchReasonNotInCatalog to 400", async () => {
    const handler = createTestHandler({
      search: () =>
        Effect.fail(
          new UniversalSearchReasonNotInCatalog({
            operation: "search",
            reasonCatalogId: "not-in-catalog",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(universalSearchApiPath.search, searchBody())),
    );
    expect(response.status).toBe(400);
  });

  it("maps UniversalSearchAllFacetsFailedError to 503", async () => {
    const handler = createTestHandler({
      search: () =>
        Effect.fail(new UniversalSearchAllFacetsFailedError({ failures: [] })),
    });
    const response = await Effect.runPromise(
      handler(postJson(universalSearchApiPath.search, searchBody())),
    );
    expect(response.status).toBe(503);
  });

  it("maps MeilisearchAdapterRequestError to 502 via the runtime-error channel", async () => {
    const handler = createTestHandler({
      search: () =>
        Effect.fail({
          _tag: "MeilisearchAdapterRequestError",
        } as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(postJson(universalSearchApiPath.search, searchBody())),
    );
    expect(response.status).toBe(502);
  });

  it("maps UniversalSearchFacetAdapterError to 502 via the runtime-error channel", async () => {
    const handler = createTestHandler({
      search: () =>
        Effect.fail(
          new UniversalSearchFacetAdapterError({
            facet: universalSearchFacet.tenants,
            cause: new Error("upstream"),
          }) as unknown as never,
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(universalSearchApiPath.search, searchBody())),
    );
    expect(response.status).toBe(502);
  });

  it("returns 500 for unknown / untagged service errors", async () => {
    const handler = createTestHandler({
      search: () => Effect.fail(new Error("boom") as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(postJson(universalSearchApiPath.search, searchBody())),
    );
    expect(response.status).toBe(500);
  });

  it("maps the missing-session-header tag to 401 via the resolver seam", async () => {
    const handler = createTestHandler({}, () =>
      Effect.fail({
        _tag: "SubscriberJourneySessionIdMissingError",
      } as unknown as never),
    );
    const response = await Effect.runPromise(
      handler(postJson(universalSearchApiPath.search, searchBody())),
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
      handler(postJson(universalSearchApiPath.search, searchBody())),
    );
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// /reindex (POST)
// ---------------------------------------------------------------------------

describe("universal-search HTTP — /reindex", () => {
  it("returns 202 { accepted: true } on happy path", async () => {
    const handler = createTestHandler({
      requestReindex: () =>
        Effect.succeed({
          accepted: true as const,
          facet: universalSearchFacet.tenants,
        }),
    });
    const response = await Effect.runPromise(
      handler(
        postJson(
          universalSearchApiPath.reindex,
          reindexBody({ facet: universalSearchFacet.tenants }),
        ),
      ),
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true });
  });

  it("returns 400 when the body schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(postJson(universalSearchApiPath.reindex, {})),
    );
    expect(response.status).toBe(400);
  });

  it("maps UniversalSearchUnauthorized to 401 (supportOperator rejected)", async () => {
    const handler = createTestHandler({
      requestReindex: () =>
        Effect.fail(
          new UniversalSearchUnauthorized({
            operation: "requestReindex",
            requestingActorType: actorType.supportOperator,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(universalSearchApiPath.reindex, reindexBody())),
    );
    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 405 / 404
// ---------------------------------------------------------------------------

describe("universal-search HTTP — method-not-allowed + unknown sub-path", () => {
  it("rejects GET on /search with 405 + Allow: POST", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(universalSearchApiPath.search), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it("rejects GET on /reindex with 405 + Allow: POST", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(universalSearchApiPath.reindex), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it("returns 404 on unknown sub-path", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/universal-search/not-a-route"), {
          method: "POST",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});
