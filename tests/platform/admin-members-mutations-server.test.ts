import { describe, expect, it } from "vitest";
import {
  adminMemberRole,
  adminMemberStatus,
  type AdminMember,
} from "@comvestec/contracts";

import { resolveInvitingAdminMember } from "../../apps/admin-app/src/lib/admin-members-mutations-server";

const buildMember = (overrides: Partial<AdminMember> = {}): AdminMember => ({
  id: overrides.id ?? "mem_admin_inviter",
  email: overrides.email ?? "admin.inviter@example.com",
  displayName: overrides.displayName ?? "Admin Inviter",
  role: overrides.role ?? adminMemberRole.adminOwner,
  status: overrides.status ?? adminMemberStatus.active,
  invitedAt: overrides.invitedAt ?? "2026-05-25T00:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-05-25T00:00:00.000Z",
  createdBy: overrides.createdBy ?? "mem_admin_inviter",
  ...(overrides.acceptedAt === undefined
    ? {}
    : { acceptedAt: overrides.acceptedAt }),
  ...(overrides.lastActiveAt === undefined
    ? {}
    : { lastActiveAt: overrides.lastActiveAt }),
  ...(overrides.archivedAt === undefined
    ? {}
    : { archivedAt: overrides.archivedAt }),
  ...(overrides.keycloakSubjectId === undefined
    ? { keycloakSubjectId: "kc_admin_inviter" }
    : { keycloakSubjectId: overrides.keycloakSubjectId }),
});

describe("admin members mutation inviter resolution", () => {
  it("maps the current actor id onto the persisted admin member row", () => {
    const invitingMember = buildMember({
      id: "mem_live_inviter",
      keycloakSubjectId: "kc_live_inviter",
      displayName: "Live Inviter",
    });

    expect(
      resolveInvitingAdminMember([invitingMember], "kc_live_inviter"),
    ).toEqual(invitingMember);
  });

  it("throws when the current actor is not represented in the admin member directory", () => {
    expect(() =>
      resolveInvitingAdminMember([buildMember()], "kc_missing_inviter"),
    ).toThrow(
      "Current admin actor kc_missing_inviter is not registered as an admin member.",
    );
  });
});
