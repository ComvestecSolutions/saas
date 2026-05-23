/**
 * GlitchTip issues read HTTP transport tests (admin-app implementation
 * plan §9 item 10 — batch B vendor #3). Mirrors the postal-mail-log-read
 * HTTP test: exercises the
 * `createGlitchTipIssuesReadHttpHandlerWithDependencies` seam with an
 * injected request-context resolver + service double so we cover
 * routing, query decoding, error-tag → status mapping, 405
 * method-not-allowed, 404 unknown sub-path, and the backend-api
 * registry pin.
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformScope,
  reasonCatalogId,
  type GlitchTipIssue,
  type RequestContext,
} from "@comvestec/contracts";
import {
  GlitchTipIssuesReadAdapterClientError,
  GlitchTipIssuesReadMissingActorIdentity,
  GlitchTipIssuesReadReasonNotInCatalog,
  GlitchTipIssuesReadUnauthorized,
  createGlitchTipIssuesReadHttpHandlerWithDependencies,
  glitchTipIssuesReadApiBasePath,
  glitchTipIssuesReadApiPath,
  type GlitchTipIssuesReadServiceImpl,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_glitchtip_http_operator",
  sessionId: "sess_glitchtip_http",
  correlationId: "corr_glitchtip_http",
  reason: "glitchtip issues read http unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const targetTenant = {
  scope: platformScope.organization,
  scopeId: "tenant-acme",
} as const;

const fakeIssue = (
  overrides: Partial<GlitchTipIssue> = {},
): GlitchTipIssue => ({
  issueId: overrides.issueId ?? "issue_test_001",
  projectSlug: overrides.projectSlug ?? "platform-api",
  title: overrides.title ?? "TypeError: undefined is not a function",
  level: overrides.level ?? "error",
  culprit: overrides.culprit ?? "platform/api/index.ts",
  status: overrides.status ?? "unresolved",
  eventCount: overrides.eventCount ?? 3,
  userCount: overrides.userCount ?? 2,
  firstSeenAt: overrides.firstSeenAt ?? "2026-01-01T00:00:00.000Z",
  lastSeenAt: overrides.lastSeenAt ?? "2026-01-01T00:05:00.000Z",
});

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(
    new Error(`unexpected glitchtip-issues-read HTTP service call: ${method}`),
  );

const createServiceDouble = (
  overrides: Partial<GlitchTipIssuesReadServiceImpl> = {},
): GlitchTipIssuesReadServiceImpl => ({
  getById: overrides.getById ?? (() => unexpectedServiceCall("getById")),
  listByProject:
    overrides.listByProject ?? (() => unexpectedServiceCall("listByProject")),
  listByLevel:
    overrides.listByLevel ?? (() => unexpectedServiceCall("listByLevel")),
});

const createTestHandler = (
  service: Partial<GlitchTipIssuesReadServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createGlitchTipIssuesReadHttpHandlerWithDependencies({
    resolveRequestContext: (resolverOverride ??
      (() => Effect.succeed(trustedRequestContext))) as (
      request: Request,
    ) => Effect.Effect<RequestContext, never>,
    runWithService: (use) => use(createServiceDouble(service)),
  });

const url = (path: string) => `http://localhost${path}`;

const tenantQs = () =>
  `tenantScope=${encodeURIComponent(targetTenant.scope)}` +
  `&tenantScopeId=${encodeURIComponent(targetTenant.scopeId)}` +
  `&reasonCatalogId=${encodeURIComponent(reasonCatalogId.glitchTipIssuesRead)}`;

const byIdQs = (issueId = "issue_test_001") =>
  `?${tenantQs()}&issueId=${encodeURIComponent(issueId)}`;
const byProjectQs = (projectSlug = "platform-api") =>
  `?${tenantQs()}&projectSlug=${encodeURIComponent(projectSlug)}`;
const byLevelQs = (level = "error") =>
  `?${tenantQs()}&level=${encodeURIComponent(level)}`;

// ---------------------------------------------------------------------------
// Path table + registry pin
// ---------------------------------------------------------------------------

describe("glitchtip-issues-read HTTP — path table + registry", () => {
  it("pins the public base path and per-route literals", () => {
    expect(glitchTipIssuesReadApiBasePath).toBe("/api/glitchtip-issues-read");
    expect(glitchTipIssuesReadApiPath).toEqual({
      byId: "/api/glitchtip-issues-read/by-id",
      byProject: "/api/glitchtip-issues-read/by-project",
      byLevel: "/api/glitchtip-issues-read/by-level",
    });
  });

  it("is registered against the canonical backend API router via glitchTipIssuesReadApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(backendApiSource.includes("glitchTipIssuesReadApiBasePath")).toBe(
      true,
    );
    expect(backendApiSource.includes("glitchTipIssuesReadHandler")).toBe(true);
    expect(
      backendApiSource.includes("handleGlitchTipIssuesReadHttpRequest"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// by-id (GET)
// ---------------------------------------------------------------------------

describe("glitchtip-issues-read HTTP — by-id", () => {
  it("returns the entry on GET happy path (200)", async () => {
    const issue = fakeIssue();
    let receivedId: string | undefined;
    const handler = createTestHandler({
      getById: (input) => {
        receivedId = input.query.issueId;
        return Effect.succeed(Option.some({ issue, isFresh: true }));
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${glitchTipIssuesReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      entry: { issue, isFresh: true },
    });
    expect(receivedId).toBe("issue_test_001");
  });

  it("returns { entry: null } when no entry is found (option-none)", async () => {
    const handler = createTestHandler({
      getById: () => Effect.succeed(Option.none()),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${glitchTipIssuesReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ entry: null });
  });

  it("returns 400 when the query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(glitchTipIssuesReadApiPath.byId), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps GlitchTipIssuesReadUnauthorized to 401", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new GlitchTipIssuesReadUnauthorized({
            operation: "getById",
            requestingActorType: actorType.individualUser,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${glitchTipIssuesReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps GlitchTipIssuesReadMissingActorIdentity to 401", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new GlitchTipIssuesReadMissingActorIdentity({ operation: "getById" }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${glitchTipIssuesReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps GlitchTipIssuesReadReasonNotInCatalog to 400", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new GlitchTipIssuesReadReasonNotInCatalog({
            operation: "getById",
            reasonCatalogId: "not-in-catalog",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${glitchTipIssuesReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps GlitchTipIssuesReadAdapterClientError to 502", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new GlitchTipIssuesReadAdapterClientError({
            operation: "getById",
            tenant: targetTenant,
            cause: new Error("upstream"),
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${glitchTipIssuesReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(502);
  });

  it("maps GlitchtipAdapterRequestError to 502 via the runtime-error channel", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail({
          _tag: "GlitchtipAdapterRequestError",
        } as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${glitchTipIssuesReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(502);
  });

  it("maps GlitchtipAdapterTransportError to 502 via the runtime-error channel", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail({
          _tag: "GlitchtipAdapterTransportError",
        } as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${glitchTipIssuesReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(502);
  });

  it("returns 500 for unknown / untagged service errors", async () => {
    const handler = createTestHandler({
      getById: () => Effect.fail(new Error("boom") as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${glitchTipIssuesReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(500);
  });

  it("maps the missing-session-header tag to 401 via the resolver seam", async () => {
    const handler = createTestHandler({}, () =>
      Effect.fail({
        _tag: "SubscriberJourneySessionIdMissingError",
      } as const),
    );
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${glitchTipIssuesReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
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
      handler(
        new Request(url(`${glitchTipIssuesReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// by-project (GET)
// ---------------------------------------------------------------------------

describe("glitchtip-issues-read HTTP — by-project", () => {
  it("returns the issues on GET happy path (200)", async () => {
    const issues = [fakeIssue()];
    let receivedProject: string | undefined;
    const handler = createTestHandler({
      listByProject: (input) => {
        receivedProject = input.query.projectSlug;
        return Effect.succeed({ issues, isFresh: true });
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${glitchTipIssuesReadApiPath.byProject}${byProjectQs()}`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      issues,
      isFresh: true,
    });
    expect(receivedProject).toBe("platform-api");
  });

  it("returns 400 when the by-project query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(glitchTipIssuesReadApiPath.byProject), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// by-level (GET)
// ---------------------------------------------------------------------------

describe("glitchtip-issues-read HTTP — by-level", () => {
  it("returns the matching issues on GET happy path (200)", async () => {
    const issues = [fakeIssue()];
    let receivedLevel: string | undefined;
    const handler = createTestHandler({
      listByLevel: (input) => {
        receivedLevel = input.query.level;
        return Effect.succeed({ issues, isFresh: true });
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${glitchTipIssuesReadApiPath.byLevel}${byLevelQs()}`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      issues,
      isFresh: true,
    });
    expect(receivedLevel).toBe("error");
  });

  it("returns 400 when the by-level query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(glitchTipIssuesReadApiPath.byLevel), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 405 / 404
// ---------------------------------------------------------------------------

describe("glitchtip-issues-read HTTP — method-not-allowed + unknown sub-path", () => {
  it("rejects POST on /by-id with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(glitchTipIssuesReadApiPath.byId), { method: "POST" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects POST on /by-project with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(glitchTipIssuesReadApiPath.byProject), {
          method: "POST",
        }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects POST on /by-level with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(glitchTipIssuesReadApiPath.byLevel), {
          method: "POST",
        }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("returns 404 on unknown sub-path", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/glitchtip-issues-read/not-a-route"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});
