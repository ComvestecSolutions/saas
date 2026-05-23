/**
 * Admin-app `/admin/members` loader tests (admin-app implementation
 * plan §11 — Phase 7 admin-org screens commit 7b-1). Covers the
 * discriminated-union mapping of the `/admin/members` loader trio
 * backed live by `listAdminOrganizationMembersFromEnvironment`
 * (Phase 7a-1 canonical alias). The loader composes a trusted
 * request-context resolve with the list helper.
 *
 *   - missing subscriber-journey session id → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` from the
 *     context resolver → `stale-session`
 *   - upstream list helper Error → `error` carrying upstream copy
 *   - happy path with empty roster → `ready` with empty array
 *   - happy path with populated roster → `ready` preserving filter
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { adminMemberRole, adminMemberStatus } from "@comvestec/contracts";
import {
  loadAdminMembersRouteDataFromRequest,
  type AdminMembersDependencies,
  type AdminMembersInput,
} from "../../apps/admin-app/src/lib/admin-members-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/admin/members", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const baseInput: AdminMembersInput = {
  filter: { includeArchived: false },
};

const trustedContext = {
  actorId: "usr_admin_owner",
  actorType: "admin-owner",
} as const;

const sampleMember = {
  id: "mbr_1",
  email: "operator@example.test",
  displayName: "Operator One",
  role: adminMemberRole.adminAdmin,
  status: adminMemberStatus.active,
  invitedAt: new Date(0).toISOString(),
  createdBy: "usr_admin_owner",
  updatedAt: new Date(1000).toISOString(),
};

const succeedingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed(trustedContext),
  listAdminOrganizationMembers: () => Effect.succeed([sampleMember]),
} as unknown as AdminMembersDependencies;

const emptyRosterDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed(trustedContext),
  listAdminOrganizationMembers: () => Effect.succeed([]),
} as unknown as AdminMembersDependencies;

const failingContext = (tag: string): AdminMembersDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    listAdminOrganizationMembers: () => Effect.succeed([]),
  }) as unknown as AdminMembersDependencies;

const failingList = (error: unknown): AdminMembersDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed(trustedContext),
    listAdminOrganizationMembers: () => Effect.fail(error),
  }) as unknown as AdminMembersDependencies;

describe("admin-app /admin/members loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminMembersRouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns stale-session when the identity session context is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminMembersRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        baseInput,
        failingContext("IdentitySessionRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns ready with the empty roster", async () => {
    const result = await Effect.runPromise(
      loadAdminMembersRouteDataFromRequest(
        buildRequest("sess-empty"),
        {},
        baseInput,
        emptyRosterDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.members).toEqual([]);
    expect(result.filter).toEqual(baseInput.filter);
  });

  it("returns ready preserving the populated roster and filter", async () => {
    const result = await Effect.runPromise(
      loadAdminMembersRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.members).toHaveLength(1);
    expect(result.members[0]?.id).toBe("mbr_1");
    expect(result.filter?.includeArchived).toBe(false);
  });

  it("returns error with upstream copy when the list helper raises an Error", async () => {
    const result = await Effect.runPromise(
      loadAdminMembersRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        baseInput,
        failingList(new Error("Admin-organization port down.")),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Admin members unavailable");
    expect(result.description).toBe("Admin-organization port down.");
  });
});
