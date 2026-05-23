/**
 * OpenPanel events read HTTP transport tests (admin-app implementation
 * plan §9 item 10 — batch B vendor #4). Mirrors the glitchtip-issues-read
 * HTTP test: exercises the
 * `createOpenPanelEventsReadHttpHandlerWithDependencies` seam with an
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
  type OpenPanelEvent,
  type RequestContext,
} from "@comvestec/contracts";
import {
  OpenPanelEventsReadAdapterClientError,
  OpenPanelEventsReadMissingActorIdentity,
  OpenPanelEventsReadReasonNotInCatalog,
  OpenPanelEventsReadUnauthorized,
  createOpenPanelEventsReadHttpHandlerWithDependencies,
  openPanelEventsReadApiBasePath,
  openPanelEventsReadApiPath,
  type OpenPanelEventsReadServiceImpl,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_openpanel_http_operator",
  sessionId: "sess_openpanel_http",
  correlationId: "corr_openpanel_http",
  reason: "openpanel events read http unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const targetTenant = {
  scope: platformScope.organization,
  scopeId: "tenant-acme",
} as const;

const fakeEvent = (
  overrides: Partial<OpenPanelEvent> = {},
): OpenPanelEvent => ({
  eventId: overrides.eventId ?? "evt_test_001",
  projectId: overrides.projectId ?? "prj_platform",
  eventName: overrides.eventName ?? "page_view",
  occurredAt: overrides.occurredAt ?? "2026-01-01T00:00:00.000Z",
  properties: overrides.properties ?? "sha256:abcdef0123456789",
  ...(overrides.userId !== undefined ? { userId: overrides.userId } : {}),
  ...(overrides.sessionId !== undefined
    ? { sessionId: overrides.sessionId }
    : {}),
  ...(overrides.country !== undefined ? { country: overrides.country } : {}),
  ...(overrides.path !== undefined ? { path: overrides.path } : {}),
});

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(
    new Error(`unexpected openpanel-events-read HTTP service call: ${method}`),
  );

const createServiceDouble = (
  overrides: Partial<OpenPanelEventsReadServiceImpl> = {},
): OpenPanelEventsReadServiceImpl => ({
  getById: overrides.getById ?? (() => unexpectedServiceCall("getById")),
  listByProject:
    overrides.listByProject ?? (() => unexpectedServiceCall("listByProject")),
  listByEventName:
    overrides.listByEventName ??
    (() => unexpectedServiceCall("listByEventName")),
});

const createTestHandler = (
  service: Partial<OpenPanelEventsReadServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createOpenPanelEventsReadHttpHandlerWithDependencies({
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
  `&reasonCatalogId=${encodeURIComponent(reasonCatalogId.openPanelEventsRead)}`;

const byIdQs = (eventId = "evt_test_001") =>
  `?${tenantQs()}&eventId=${encodeURIComponent(eventId)}`;
const byProjectQs = (projectId = "prj_platform") =>
  `?${tenantQs()}&projectId=${encodeURIComponent(projectId)}`;
const byEventNameQs = (eventName = "page_view") =>
  `?${tenantQs()}&eventName=${encodeURIComponent(eventName)}`;

// ---------------------------------------------------------------------------
// Path table + registry pin
// ---------------------------------------------------------------------------

describe("openpanel-events-read HTTP — path table + registry", () => {
  it("pins the public base path and per-route literals", () => {
    expect(openPanelEventsReadApiBasePath).toBe("/api/openpanel-events-read");
    expect(openPanelEventsReadApiPath).toEqual({
      byId: "/api/openpanel-events-read/by-id",
      byProject: "/api/openpanel-events-read/by-project",
      byEventName: "/api/openpanel-events-read/by-event-name",
    });
  });

  it("is registered against the canonical backend API router via openPanelEventsReadApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(backendApiSource.includes("openPanelEventsReadApiBasePath")).toBe(
      true,
    );
    expect(backendApiSource.includes("openPanelEventsReadHandler")).toBe(true);
    expect(
      backendApiSource.includes("handleOpenPanelEventsReadHttpRequest"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// by-id (GET)
// ---------------------------------------------------------------------------

describe("openpanel-events-read HTTP — by-id", () => {
  it("returns the entry on GET happy path (200)", async () => {
    const event = fakeEvent();
    let receivedId: string | undefined;
    const handler = createTestHandler({
      getById: (input) => {
        receivedId = input.query.eventId;
        return Effect.succeed(Option.some({ event, isFresh: true }));
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${openPanelEventsReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      entry: { event, isFresh: true },
    });
    expect(receivedId).toBe("evt_test_001");
  });

  it("returns { entry: null } when no entry is found (option-none)", async () => {
    const handler = createTestHandler({
      getById: () => Effect.succeed(Option.none()),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${openPanelEventsReadApiPath.byId}${byIdQs()}`), {
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
        new Request(url(openPanelEventsReadApiPath.byId), { method: "GET" }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps OpenPanelEventsReadUnauthorized to 401", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new OpenPanelEventsReadUnauthorized({
            operation: "getById",
            requestingActorType: actorType.individualUser,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${openPanelEventsReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps OpenPanelEventsReadMissingActorIdentity to 401", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new OpenPanelEventsReadMissingActorIdentity({ operation: "getById" }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${openPanelEventsReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("maps OpenPanelEventsReadReasonNotInCatalog to 400", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new OpenPanelEventsReadReasonNotInCatalog({
            operation: "getById",
            reasonCatalogId: "not-in-catalog",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${openPanelEventsReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps OpenPanelEventsReadAdapterClientError to 502", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail(
          new OpenPanelEventsReadAdapterClientError({
            operation: "getById",
            tenant: targetTenant,
            cause: new Error("upstream"),
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${openPanelEventsReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(502);
  });

  it("maps OpenPanelAdapterRequestError to 502 via the runtime-error channel", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail({
          _tag: "OpenPanelAdapterRequestError",
        } as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${openPanelEventsReadApiPath.byId}${byIdQs()}`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(502);
  });

  it("maps OpenPanelAdapterTransportError to 502 via the runtime-error channel", async () => {
    const handler = createTestHandler({
      getById: () =>
        Effect.fail({
          _tag: "OpenPanelAdapterTransportError",
        } as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${openPanelEventsReadApiPath.byId}${byIdQs()}`), {
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
        new Request(url(`${openPanelEventsReadApiPath.byId}${byIdQs()}`), {
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
        new Request(url(`${openPanelEventsReadApiPath.byId}${byIdQs()}`), {
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
        new Request(url(`${openPanelEventsReadApiPath.byId}${byIdQs()}`), {
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

describe("openpanel-events-read HTTP — by-project", () => {
  it("returns the events on GET happy path (200)", async () => {
    const events = [fakeEvent()];
    let receivedProject: string | undefined;
    const handler = createTestHandler({
      listByProject: (input) => {
        receivedProject = input.query.projectId;
        return Effect.succeed({ events, isFresh: true });
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${openPanelEventsReadApiPath.byProject}${byProjectQs()}`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      events,
      isFresh: true,
    });
    expect(receivedProject).toBe("prj_platform");
  });

  it("returns 400 when the by-project query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(openPanelEventsReadApiPath.byProject), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// by-event-name (GET)
// ---------------------------------------------------------------------------

describe("openpanel-events-read HTTP — by-event-name", () => {
  it("returns the matching events on GET happy path (200)", async () => {
    const events = [fakeEvent()];
    let receivedEventName: string | undefined;
    const handler = createTestHandler({
      listByEventName: (input) => {
        receivedEventName = input.query.eventName;
        return Effect.succeed({ events, isFresh: true });
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${openPanelEventsReadApiPath.byEventName}${byEventNameQs()}`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      events,
      isFresh: true,
    });
    expect(receivedEventName).toBe("page_view");
  });

  it("returns 400 when the by-event-name query schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(openPanelEventsReadApiPath.byEventName), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 405 / 404
// ---------------------------------------------------------------------------

describe("openpanel-events-read HTTP — method-not-allowed + unknown sub-path", () => {
  it("rejects POST on /by-id with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(openPanelEventsReadApiPath.byId), { method: "POST" }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects POST on /by-project with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(openPanelEventsReadApiPath.byProject), {
          method: "POST",
        }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects POST on /by-event-name with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(openPanelEventsReadApiPath.byEventName), {
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
        new Request(url("/api/openpanel-events-read/not-a-route"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});
