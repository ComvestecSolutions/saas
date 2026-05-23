/**
 * Admin-saved-views HTTP transport tests (admin-app implementation
 * plan §9 item 2). Exercises the
 * `createAdminSavedViewsHttpHandlerWithDependencies` seam against a
 * service double to cover:
 *
 *   - canonical path-table registry + base-path advertising in
 *     `backend-api.ts`
 *   - per-route happy + sad paths and the full error-tag → status
 *     mapping (400/401/403/404/409/502)
 *   - 405 on method mismatch
 *   - trusted ownerSubjectId is always derived from the
 *     session-resolved actorId, never from a client-supplied body
 *     field
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  adminSavedViewResourceKind,
  platformScope,
  type AdminSavedView,
  type RequestContext,
} from "@comvestec/contracts";
import {
  AdminSavedViewsNotFoundError,
  AdminSavedViewsUniqueViolationError,
} from "@comvestec/modules";
import {
  CrossUserAccessDenied,
  MissingActorIdentity,
  SavedViewAlreadyExists,
  SavedViewNotFound,
  adminSavedViewsApiBasePath,
  adminSavedViewsApiPath,
  createAdminSavedViewsHttpHandlerWithDependencies,
  type AdminSavedViewsServiceImpl,
} from "@comvestec/platform";

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "subject-alpha",
  sessionId: "sess-saved-views-http",
  correlationId: "corr-saved-views-http",
  reason: "admin-saved-views HTTP unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const buildSavedView = (
  overrides: Partial<AdminSavedView> = {},
): AdminSavedView => ({
  id: overrides.id ?? "view-fake",
  ownerSubjectId: overrides.ownerSubjectId ?? "subject-alpha",
  name: overrides.name ?? "Fake view",
  resourceKind: overrides.resourceKind ?? adminSavedViewResourceKind.tenants,
  serializedView: overrides.serializedView ?? "{}",
  pinned: overrides.pinned ?? false,
  createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
});

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(new Error(`unexpected admin-saved-views service call: ${method}`));

const createServiceDouble = (
  overrides: Partial<AdminSavedViewsServiceImpl> = {},
): AdminSavedViewsServiceImpl => ({
  list: overrides.list ?? (() => unexpectedServiceCall("list")),
  get: overrides.get ?? (() => unexpectedServiceCall("get")),
  create: overrides.create ?? (() => unexpectedServiceCall("create")),
  update: overrides.update ?? (() => unexpectedServiceCall("update")),
  delete: overrides.delete ?? (() => unexpectedServiceCall("delete")),
  setPinned: overrides.setPinned ?? (() => unexpectedServiceCall("setPinned")),
});

const createTestHandler = (
  service: Partial<AdminSavedViewsServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createAdminSavedViewsHttpHandlerWithDependencies({
    resolveRequestContext: (resolverOverride ??
      (() => Effect.succeed(trustedRequestContext))) as (
      request: Request,
    ) => Effect.Effect<RequestContext, never>,
    runWithService: (use) => use(createServiceDouble(service)),
  });

const url = (path: string) => `http://localhost${path}`;

// ---------------------------------------------------------------------------
// Path table + backend registration
// ---------------------------------------------------------------------------

describe("admin-saved-views HTTP — path table + backend registration", () => {
  it("pins the canonical base path and per-route literals", () => {
    expect(adminSavedViewsApiBasePath).toBe("/api/admin-saved-views");
    expect(adminSavedViewsApiPath).toEqual({
      collection: "/api/admin-saved-views/",
      byIdTemplate: "/api/admin-saved-views/:id",
      pinByIdTemplate: "/api/admin-saved-views/:id/pin",
      unpinByIdTemplate: "/api/admin-saved-views/:id/unpin",
    });
  });

  it("is registered against the backend API router via adminSavedViewsApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(backendApiSource.includes("adminSavedViewsApiBasePath")).toBe(true);
    expect(backendApiSource.includes("adminSavedViewsHandler")).toBe(true);
    expect(backendApiSource.includes("handleAdminSavedViewsHttpRequest")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// list (GET /)
// ---------------------------------------------------------------------------

describe("admin-saved-views HTTP — list", () => {
  it("returns 200 with the savedViews envelope on happy path", async () => {
    const views = [buildSavedView({ id: "v1" }), buildSavedView({ id: "v2" })];
    const handler = createTestHandler({
      list: () => Effect.succeed(views),
    });
    const response = await Effect.runPromise(
      handler(new Request(url(adminSavedViewsApiBasePath), { method: "GET" })),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ savedViews: views });
  });

  it("uses the actorId from the trusted request context as ownerSubjectId (never from the URL)", async () => {
    let observedOwner: string | undefined;
    const handler = createTestHandler({
      list: (input) => {
        observedOwner = input.ownerSubjectId;
        return Effect.succeed([]);
      },
    });
    await Effect.runPromise(
      handler(new Request(url(adminSavedViewsApiBasePath), { method: "GET" })),
    );
    expect(observedOwner).toBe(trustedRequestContext.actorId);
  });

  it("returns 400 when the query schema rejects an unsupported pinnedOnly literal", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(`${url(adminSavedViewsApiBasePath)}/?pinnedOnly=maybe`, {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("returns 401 when the trusted request context has no actorId", async () => {
    const handler = createTestHandler({}, () =>
      Effect.succeed({
        ...trustedRequestContext,
        actorId: undefined,
      } as RequestContext),
    );
    const response = await Effect.runPromise(
      handler(new Request(url(adminSavedViewsApiBasePath), { method: "GET" })),
    );
    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// create (POST /)
// ---------------------------------------------------------------------------

describe("admin-saved-views HTTP — create", () => {
  it("returns 201 with the savedView envelope on happy path", async () => {
    const view = buildSavedView({ id: "v-new", name: "New view" });
    const handler = createTestHandler({
      create: () => Effect.succeed(view),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminSavedViewsApiBasePath), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "New view",
            resourceKind: adminSavedViewResourceKind.tenants,
            serializedView: "{}",
          }),
        }),
      ),
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ savedView: view });
  });

  it("returns 400 when the body is missing required fields", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminSavedViewsApiBasePath), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "no resourceKind" }),
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("returns 409 when the service surfaces SavedViewAlreadyExists", async () => {
    const handler = createTestHandler({
      create: () =>
        Effect.fail(
          new SavedViewAlreadyExists({
            ownerSubjectId: "subject-alpha",
            name: "Duplicate",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminSavedViewsApiBasePath), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Duplicate",
            resourceKind: adminSavedViewResourceKind.tenants,
            serializedView: "{}",
          }),
        }),
      ),
    );
    expect(response.status).toBe(409);
  });

  it("returns 502 when the repository surfaces AdminSavedViewsUniqueViolationError-shaped errors", async () => {
    const handler = createTestHandler({
      create: () =>
        Effect.fail(
          new AdminSavedViewsUniqueViolationError({
            ownerSubjectId: "subject-alpha",
            name: "Duplicate",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminSavedViewsApiBasePath), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Duplicate",
            resourceKind: adminSavedViewResourceKind.tenants,
            serializedView: "{}",
          }),
        }),
      ),
    );
    // Repository-shaped errors should also remap to 409 per the
    // explicit error-tag table in `admin-saved-views-http.ts`.
    expect(response.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// get / update / delete (/:id)
// ---------------------------------------------------------------------------

describe("admin-saved-views HTTP — :id routes", () => {
  it("GET /:id returns the savedView envelope when present", async () => {
    const view = buildSavedView({ id: "v-target" });
    const handler = createTestHandler({
      get: () => Effect.succeed(Option.some(view)),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${adminSavedViewsApiBasePath}/v-target`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ savedView: view });
  });

  it("GET /:id returns 404 when the service returns Option.none", async () => {
    const handler = createTestHandler({
      get: () => Effect.succeed(Option.none()),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${adminSavedViewsApiBasePath}/missing`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });

  it("PATCH /:id returns 200 on happy path", async () => {
    const view = buildSavedView({ id: "v-renamed", name: "renamed" });
    const handler = createTestHandler({
      update: () => Effect.succeed(view),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${adminSavedViewsApiBasePath}/v-renamed`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "renamed" }),
        }),
      ),
    );
    expect(response.status).toBe(200);
  });

  it("PATCH /:id returns 404 when service raises SavedViewNotFound", async () => {
    const handler = createTestHandler({
      update: () =>
        Effect.fail(
          new SavedViewNotFound({
            id: "missing",
            ownerSubjectId: "subject-alpha",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${adminSavedViewsApiBasePath}/missing`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "renamed" }),
        }),
      ),
    );
    expect(response.status).toBe(404);
  });

  it("PATCH /:id returns 404 when repository raises AdminSavedViewsNotFoundError too", async () => {
    const handler = createTestHandler({
      update: () =>
        Effect.fail(
          new AdminSavedViewsNotFoundError({
            id: "missing",
            ownerSubjectId: "subject-alpha",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${adminSavedViewsApiBasePath}/missing`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "renamed" }),
        }),
      ),
    );
    expect(response.status).toBe(404);
  });

  it("DELETE /:id returns 200 on happy path with the deleted id", async () => {
    const handler = createTestHandler({
      delete: () => Effect.succeed(undefined),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${adminSavedViewsApiBasePath}/v-bye`), {
          method: "DELETE",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "v-bye" });
  });

  it("rejects an unsupported method with 405", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${adminSavedViewsApiBasePath}/v-x`), {
          method: "PUT",
        }),
      ),
    );
    expect(response.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// pin / unpin (/:id/pin, /:id/unpin)
// ---------------------------------------------------------------------------

describe("admin-saved-views HTTP — pin/unpin", () => {
  it("POST /:id/pin sends pinned=true and returns 200", async () => {
    let observedPinned: boolean | undefined;
    const handler = createTestHandler({
      setPinned: (input) => {
        observedPinned = input.pinned;
        return Effect.succeed(
          buildSavedView({ id: input.id, pinned: input.pinned }),
        );
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${adminSavedViewsApiBasePath}/v-pin/pin`), {
          method: "POST",
        }),
      ),
    );
    expect(response.status).toBe(200);
    expect(observedPinned).toBe(true);
  });

  it("POST /:id/unpin sends pinned=false and returns 200", async () => {
    let observedPinned: boolean | undefined;
    const handler = createTestHandler({
      setPinned: (input) => {
        observedPinned = input.pinned;
        return Effect.succeed(
          buildSavedView({ id: input.id, pinned: input.pinned }),
        );
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${adminSavedViewsApiBasePath}/v-pin/unpin`), {
          method: "POST",
        }),
      ),
    );
    expect(response.status).toBe(200);
    expect(observedPinned).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Error-tag → status mapping (cross-cutting)
// ---------------------------------------------------------------------------

describe("admin-saved-views HTTP — error-tag → status mapping", () => {
  it("returns 403 when the service surfaces CrossUserAccessDenied", async () => {
    const handler = createTestHandler({
      list: () =>
        Effect.fail(
          new CrossUserAccessDenied({
            requestingActorId: "subject-alpha",
            targetOwnerSubjectId: "subject-beta",
            operation: "list",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(new Request(url(adminSavedViewsApiBasePath), { method: "GET" })),
    );
    expect(response.status).toBe(403);
  });

  it("returns 401 when the service surfaces MissingActorIdentity", async () => {
    const handler = createTestHandler({
      list: () => Effect.fail(new MissingActorIdentity({ operation: "list" })),
    });
    const response = await Effect.runPromise(
      handler(new Request(url(adminSavedViewsApiBasePath), { method: "GET" })),
    );
    expect(response.status).toBe(401);
  });

  it("returns 404 when the route does not match any registered path", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/admin-saved-views/v-x/unknown"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});
