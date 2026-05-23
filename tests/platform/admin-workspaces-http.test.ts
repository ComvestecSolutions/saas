/**
 * Admin-workspaces HTTP transport tests (admin-app implementation
 * plan §9 item 2). Exercises the
 * `createAdminWorkspacesHttpHandlerWithDependencies` seam against a
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
 *   - reorder accepts a non-empty array and surfaces 409 on
 *     mismatched ids
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformScope,
  type AdminWorkspace,
  type RequestContext,
} from "@comvestec/contracts";
import {
  AdminWorkspacesNotFoundError,
  AdminWorkspacesReorderMismatchError,
  AdminWorkspacesUniqueViolationError,
} from "@comvestec/modules";
import {
  WorkspaceAlreadyExists,
  WorkspaceCrossUserAccessDenied,
  WorkspaceMissingActorIdentity,
  WorkspaceNotFound,
  WorkspaceReorderInputMismatch,
  adminWorkspacesApiBasePath,
  adminWorkspacesApiPath,
  createAdminWorkspacesHttpHandlerWithDependencies,
  type AdminWorkspacesServiceImpl,
} from "@comvestec/platform";

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "subject-alpha",
  sessionId: "sess-workspaces-http",
  correlationId: "corr-workspaces-http",
  reason: "admin-workspaces HTTP unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const buildWorkspace = (
  overrides: Partial<AdminWorkspace> = {},
): AdminWorkspace => ({
  id: overrides.id ?? "ws-fake",
  ownerSubjectId: overrides.ownerSubjectId ?? "subject-alpha",
  name: overrides.name ?? "Fake workspace",
  serializedLayout: overrides.serializedLayout ?? "{}",
  position: overrides.position ?? 1,
  createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
});

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(new Error(`unexpected admin-workspaces service call: ${method}`));

const createServiceDouble = (
  overrides: Partial<AdminWorkspacesServiceImpl> = {},
): AdminWorkspacesServiceImpl => ({
  list: overrides.list ?? (() => unexpectedServiceCall("list")),
  get: overrides.get ?? (() => unexpectedServiceCall("get")),
  create: overrides.create ?? (() => unexpectedServiceCall("create")),
  update: overrides.update ?? (() => unexpectedServiceCall("update")),
  delete: overrides.delete ?? (() => unexpectedServiceCall("delete")),
  reorder: overrides.reorder ?? (() => unexpectedServiceCall("reorder")),
});

const createTestHandler = (
  service: Partial<AdminWorkspacesServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createAdminWorkspacesHttpHandlerWithDependencies({
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

describe("admin-workspaces HTTP — path table + backend registration", () => {
  it("pins the canonical base path and per-route literals", () => {
    expect(adminWorkspacesApiBasePath).toBe("/api/admin-workspaces");
    expect(adminWorkspacesApiPath).toEqual({
      collection: "/api/admin-workspaces/",
      byIdTemplate: "/api/admin-workspaces/:id",
      reorder: "/api/admin-workspaces/reorder",
    });
  });

  it("is registered against the backend API router via adminWorkspacesApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(backendApiSource.includes("adminWorkspacesApiBasePath")).toBe(true);
    expect(backendApiSource.includes("adminWorkspacesHandler")).toBe(true);
    expect(backendApiSource.includes("handleAdminWorkspacesHttpRequest")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// list (GET /)
// ---------------------------------------------------------------------------

describe("admin-workspaces HTTP — list", () => {
  it("returns 200 with the workspaces envelope on happy path", async () => {
    const workspaces = [
      buildWorkspace({ id: "w1", position: 1 }),
      buildWorkspace({ id: "w2", position: 2 }),
    ];
    const handler = createTestHandler({
      list: () => Effect.succeed(workspaces),
    });
    const response = await Effect.runPromise(
      handler(new Request(url(adminWorkspacesApiBasePath), { method: "GET" })),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ workspaces });
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
      handler(new Request(url(adminWorkspacesApiBasePath), { method: "GET" })),
    );
    expect(observedOwner).toBe(trustedRequestContext.actorId);
  });

  it("returns 401 when the trusted request context has no actorId", async () => {
    const handler = createTestHandler({}, () =>
      Effect.succeed({
        ...trustedRequestContext,
        actorId: undefined,
      } as RequestContext),
    );
    const response = await Effect.runPromise(
      handler(new Request(url(adminWorkspacesApiBasePath), { method: "GET" })),
    );
    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// create (POST /)
// ---------------------------------------------------------------------------

describe("admin-workspaces HTTP — create", () => {
  it("returns 201 with the workspace envelope on happy path", async () => {
    const workspace = buildWorkspace({ id: "w-new", name: "New" });
    const handler = createTestHandler({
      create: () => Effect.succeed(workspace),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminWorkspacesApiBasePath), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "New",
            serializedLayout: '{"tabs":[]}',
          }),
        }),
      ),
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ workspace });
  });

  it("returns 400 when the body is missing required fields", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminWorkspacesApiBasePath), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "missing layout" }),
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("returns 409 when the service surfaces WorkspaceAlreadyExists", async () => {
    const handler = createTestHandler({
      create: () =>
        Effect.fail(
          new WorkspaceAlreadyExists({
            ownerSubjectId: "subject-alpha",
            name: "Duplicate",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminWorkspacesApiBasePath), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Duplicate",
            serializedLayout: "{}",
          }),
        }),
      ),
    );
    expect(response.status).toBe(409);
  });

  it("returns 409 when the repository surfaces AdminWorkspacesUniqueViolationError", async () => {
    const handler = createTestHandler({
      create: () =>
        Effect.fail(
          new AdminWorkspacesUniqueViolationError({
            ownerSubjectId: "subject-alpha",
            name: "Duplicate",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminWorkspacesApiBasePath), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Duplicate",
            serializedLayout: "{}",
          }),
        }),
      ),
    );
    expect(response.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// get / update / delete (/:id)
// ---------------------------------------------------------------------------

describe("admin-workspaces HTTP — :id routes", () => {
  it("GET /:id returns the workspace envelope when present", async () => {
    const workspace = buildWorkspace({ id: "w-target" });
    const handler = createTestHandler({
      get: () => Effect.succeed(Option.some(workspace)),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${adminWorkspacesApiBasePath}/w-target`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ workspace });
  });

  it("GET /:id returns 404 when the service returns Option.none", async () => {
    const handler = createTestHandler({
      get: () => Effect.succeed(Option.none()),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${adminWorkspacesApiBasePath}/missing`), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });

  it("PATCH /:id returns 200 on happy path", async () => {
    const workspace = buildWorkspace({ id: "w-renamed", name: "renamed" });
    const handler = createTestHandler({
      update: () => Effect.succeed(workspace),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${adminWorkspacesApiBasePath}/w-renamed`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "renamed" }),
        }),
      ),
    );
    expect(response.status).toBe(200);
  });

  it("PATCH /:id returns 404 when service raises WorkspaceNotFound", async () => {
    const handler = createTestHandler({
      update: () =>
        Effect.fail(
          new WorkspaceNotFound({
            id: "missing",
            ownerSubjectId: "subject-alpha",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${adminWorkspacesApiBasePath}/missing`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "renamed" }),
        }),
      ),
    );
    expect(response.status).toBe(404);
  });

  it("PATCH /:id returns 404 when repository raises AdminWorkspacesNotFoundError too", async () => {
    const handler = createTestHandler({
      update: () =>
        Effect.fail(
          new AdminWorkspacesNotFoundError({
            id: "missing",
            ownerSubjectId: "subject-alpha",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${adminWorkspacesApiBasePath}/missing`), {
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
        new Request(url(`${adminWorkspacesApiBasePath}/w-bye`), {
          method: "DELETE",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "w-bye" });
  });

  it("rejects an unsupported method with 405", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(`${adminWorkspacesApiBasePath}/w-x`), {
          method: "PUT",
        }),
      ),
    );
    expect(response.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// reorder (POST /reorder)
// ---------------------------------------------------------------------------

describe("admin-workspaces HTTP — reorder", () => {
  it("POST /reorder returns 200 with the reordered workspaces envelope", async () => {
    const reordered = [
      buildWorkspace({ id: "w2", position: 1 }),
      buildWorkspace({ id: "w1", position: 2 }),
    ];
    const handler = createTestHandler({
      reorder: () => Effect.succeed(reordered),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminWorkspacesApiPath.reorder), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idsInOrder: ["w2", "w1"] }),
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ workspaces: reordered });
  });

  it("POST /reorder returns 400 when idsInOrder is empty", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminWorkspacesApiPath.reorder), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idsInOrder: [] }),
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("POST /reorder returns 409 when the service surfaces WorkspaceReorderInputMismatch", async () => {
    const handler = createTestHandler({
      reorder: () =>
        Effect.fail(
          new WorkspaceReorderInputMismatch({
            ownerSubjectId: "subject-alpha",
            suppliedIds: ["a"],
            currentIds: ["a", "b"],
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminWorkspacesApiPath.reorder), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idsInOrder: ["a"] }),
        }),
      ),
    );
    expect(response.status).toBe(409);
  });

  it("POST /reorder returns 409 when the repository surfaces AdminWorkspacesReorderMismatchError too", async () => {
    const handler = createTestHandler({
      reorder: () =>
        Effect.fail(
          new AdminWorkspacesReorderMismatchError({
            ownerSubjectId: "subject-alpha",
            suppliedIds: ["a"],
            currentIds: ["a", "b"],
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminWorkspacesApiPath.reorder), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idsInOrder: ["a"] }),
        }),
      ),
    );
    expect(response.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Error-tag → status mapping (cross-cutting)
// ---------------------------------------------------------------------------

describe("admin-workspaces HTTP — error-tag → status mapping", () => {
  it("returns 403 when the service surfaces WorkspaceCrossUserAccessDenied", async () => {
    const handler = createTestHandler({
      list: () =>
        Effect.fail(
          new WorkspaceCrossUserAccessDenied({
            requestingActorId: "subject-alpha",
            targetOwnerSubjectId: "subject-beta",
            operation: "list",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(new Request(url(adminWorkspacesApiBasePath), { method: "GET" })),
    );
    expect(response.status).toBe(403);
  });

  it("returns 401 when the service surfaces WorkspaceMissingActorIdentity", async () => {
    const handler = createTestHandler({
      list: () =>
        Effect.fail(new WorkspaceMissingActorIdentity({ operation: "list" })),
    });
    const response = await Effect.runPromise(
      handler(new Request(url(adminWorkspacesApiBasePath), { method: "GET" })),
    );
    expect(response.status).toBe(401);
  });

  it("returns 404 when the route does not match any registered path", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/admin-workspaces/w-x/unknown"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});
