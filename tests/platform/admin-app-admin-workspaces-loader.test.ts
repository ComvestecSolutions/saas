/**
 * Admin-app `/admin/workspaces` loader tests (admin-app implementation
 * plan §11 — Phase 7 admin-org screens commit 7b-1). Covers the
 * discriminated-union mapping of the `/admin/workspaces` loader trio
 * backed live by `listAdminWorkspacesFromEnvironment` (Phase 7a-1
 * canonical alias of `listWorkspacesFromEnvironment`). The loader
 * composes a trusted request-context resolve, sources the
 * `ownerSubjectId` from `requestContext.actorId`, and reduces a
 * missing actor id to stale-session because the helper cannot
 * identify the requesting operator without it.
 *
 *   - missing subscriber-journey session id → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - resolved context without an actor id → `stale-session`
 *   - happy path → `ready` carrying owner + workspaces
 *   - upstream list helper Error → `error` carrying upstream copy
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  loadAdminWorkspacesRouteDataFromRequest,
  type AdminWorkspacesDependencies,
} from "../../apps/admin-app/src/lib/admin-workspaces-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/admin/workspaces", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const trustedContext = {
  actorId: "usr_admin_owner",
  actorType: "admin-owner",
} as const;

const sampleWorkspace = {
  id: "wsp_1",
  ownerSubjectId: "usr_admin_owner",
  name: "Daily driver",
  position: 1,
  serializedLayout: '{"panes":[]}',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(1000).toISOString(),
};

const succeedingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed(trustedContext),
  listAdminWorkspaces: () => Effect.succeed([sampleWorkspace]),
} as unknown as AdminWorkspacesDependencies;

const contextWithoutActor = {
  resolveTrustedRequestContext: () =>
    Effect.succeed({ actorType: "admin-owner" }),
  listAdminWorkspaces: () => Effect.succeed([]),
} as unknown as AdminWorkspacesDependencies;

const failingContext = (tag: string): AdminWorkspacesDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    listAdminWorkspaces: () => Effect.succeed([]),
  }) as unknown as AdminWorkspacesDependencies;

const failingList = (error: unknown): AdminWorkspacesDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed(trustedContext),
    listAdminWorkspaces: () => Effect.fail(error),
  }) as unknown as AdminWorkspacesDependencies;

describe("admin-app /admin/workspaces loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminWorkspacesRouteDataFromRequest(
        buildRequest(undefined),
        {},
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns stale-session when the identity session context is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminWorkspacesRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        failingContext("IdentitySessionRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns stale-session when the resolved context has no actor id", async () => {
    const result = await Effect.runPromise(
      loadAdminWorkspacesRouteDataFromRequest(
        buildRequest("sess-actorless"),
        {},
        contextWithoutActor,
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns ready with the owner subject id and workspaces", async () => {
    const result = await Effect.runPromise(
      loadAdminWorkspacesRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.ownerSubjectId).toBe("usr_admin_owner");
    expect(result.workspaces).toHaveLength(1);
    expect(result.workspaces[0]?.id).toBe("wsp_1");
  });

  it("returns error with upstream copy when the list helper raises an Error", async () => {
    const result = await Effect.runPromise(
      loadAdminWorkspacesRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        failingList(new Error("Admin-workspaces port down.")),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Admin workspaces unavailable");
    expect(result.description).toBe("Admin-workspaces port down.");
  });
});
