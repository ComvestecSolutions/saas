/**
 * Admin-organization persistence tests (slice 1c-persistence).
 *
 * Exercises the AdminOrganizationRepository against an in-memory
 * mock of the Drizzle-shaped PostgresDatabase wrapper. Mirrors the
 * harness pattern used by tests/modules/tenant-invitations-persistence.test.ts,
 * generalised for the two admin-org tables. Covers:
 *
 * - member lookup / list filtering (incl. soft-delete via archivedAt)
 * - invite + redeem flips status, sets acceptedAt, persists member
 * - expired invitation is rejected
 * - unique-email enforcement
 * - countMembersByRole correctness for owner-count invariant
 * - changeMemberRole updates updatedAt
 * - tenant-isolation invariant: neither admin-org table carries a
 *   tenant_scope column
 */
import { Cause, Effect, Exit, Option } from "effect";
import {
  AdminMemberRoleSchema,
  adminMemberInvitationStatus,
  adminMemberRole,
  adminMemberStatus,
} from "@comvestec/contracts";
import {
  adminMemberInvitationsTable,
  adminMembersTable,
  AdminOrgNotFoundError,
  AdminOrgPersistenceError,
  AdminOrgUniqueViolationError,
  makeAdminOrganizationRepository,
  type PostgresDatabase,
  type PostgresInsertBuilder,
} from "@comvestec/modules";

void AdminMemberRoleSchema; // sanity import to ensure exported

const toCamelCase = (value: string) =>
  value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

const extractConditionFilters = (condition: unknown) => {
  const filters: Record<string, unknown> = {};

  const visit = (node: unknown) => {
    if (node === null || typeof node !== "object") {
      return;
    }
    if (!("queryChunks" in node) || !Array.isArray(node.queryChunks)) {
      return;
    }
    let currentColumn: string | undefined;
    for (const chunk of node.queryChunks) {
      if (chunk === null || typeof chunk !== "object") {
        continue;
      }
      if ("queryChunks" in chunk) {
        visit(chunk);
        continue;
      }
      if ("name" in chunk && typeof chunk.name === "string") {
        currentColumn = toCamelCase(chunk.name);
        continue;
      }
      if (
        currentColumn !== undefined &&
        "value" in chunk &&
        typeof chunk.value !== "function" &&
        !Array.isArray(chunk.value)
      ) {
        filters[currentColumn] = chunk.value;
        currentColumn = undefined;
      }
    }
  };

  visit(condition);
  return filters;
};

type MemberRow = typeof adminMembersTable.$inferSelect;
type InvitationRow = typeof adminMemberInvitationsTable.$inferSelect;

const createAdminOrganizationDatabase = () => {
  type PersistedTable = Parameters<PostgresDatabase["insert"]>[0];
  type PersistedValues = Parameters<
    PostgresInsertBuilder<PersistedTable>["values"]
  >[0];

  const members = new Map<string, MemberRow>();
  const invitations = new Map<string, InvitationRow>();

  const persistRows = (table: PersistedTable, values: PersistedValues) => {
    const rows = Array.isArray(values) ? values : [values];
    for (const row of rows) {
      if (table === adminMembersTable) {
        const member = row as typeof adminMembersTable.$inferInsert;
        const id = member.id as string;
        const now = new Date();
        members.set(id, {
          id,
          keycloakSubjectId: (member.keycloakSubjectId ?? null) as
            | string
            | null,
          email: member.email,
          displayName: member.displayName,
          role: member.role,
          status: (member.status ?? adminMemberStatus.active) as string,
          invitedAt: member.invitedAt as Date,
          acceptedAt: (member.acceptedAt ?? null) as Date | null,
          lastActiveAt: (member.lastActiveAt ?? null) as Date | null,
          createdBy: member.createdBy,
          createdAt: (member.createdAt as Date | undefined) ?? now,
          updatedAt: (member.updatedAt as Date | undefined) ?? now,
          archivedAt: (member.archivedAt ?? null) as Date | null,
        });
      } else if (table === adminMemberInvitationsTable) {
        const invitation =
          row as typeof adminMemberInvitationsTable.$inferInsert;
        const id = invitation.invitationId as string;
        invitations.set(id, {
          invitationId: id,
          email: invitation.email,
          invitedRole: invitation.invitedRole,
          invitedBy: invitation.invitedBy,
          tokenHash: invitation.tokenHash,
          status: (invitation.status ??
            adminMemberInvitationStatus.pending) as string,
          issuedAt: (invitation.issuedAt as Date | undefined) ?? new Date(),
          expiresAt: invitation.expiresAt as Date,
          acceptedAt: (invitation.acceptedAt ?? null) as Date | null,
          revokedAt: (invitation.revokedAt ?? null) as Date | null,
          revokedBy: (invitation.revokedBy ?? null) as string | null,
          correlationId: (invitation.correlationId ?? null) as string | null,
        });
      }
    }
  };

  const insert = (table: PersistedTable) => ({
    values: (values: PersistedValues) => ({
      execute: async () => {
        persistRows(table, values);
      },
      onConflictDoUpdate: () => ({
        execute: async () => {
          persistRows(table, values);
        },
      }),
    }),
  });

  const update = (table: PersistedTable) => ({
    set: (values: Record<string, unknown>) => ({
      where: (condition: unknown) => ({
        returning: async () => {
          const filters = extractConditionFilters(condition);
          if (table === adminMembersTable) {
            const updated: MemberRow[] = [];
            for (const [id, member] of members.entries()) {
              const matches = Object.entries(filters).every(
                ([key, value]) =>
                  (member as Record<string, unknown>)[key] === value,
              );
              if (!matches) continue;
              const next = { ...member, ...values } as MemberRow;
              members.set(id, next);
              updated.push(next);
            }
            return updated;
          }
          if (table === adminMemberInvitationsTable) {
            const updated: InvitationRow[] = [];
            for (const [id, invitation] of invitations.entries()) {
              const matches = Object.entries(filters).every(
                ([key, value]) =>
                  (invitation as Record<string, unknown>)[key] === value,
              );
              if (!matches) continue;
              const next = { ...invitation, ...values } as InvitationRow;
              invitations.set(id, next);
              updated.push(next);
            }
            return updated;
          }
          return [];
        },
      }),
    }),
  });

  const select = () => ({
    from: (table: PersistedTable) => ({
      where: async (_condition: unknown) =>
        table === adminMembersTable
          ? ([...members.values()] as MemberRow[])
          : table === adminMemberInvitationsTable
            ? ([...invitations.values()] as InvitationRow[])
            : [],
    }),
  });

  return {
    members,
    invitations,
    database: {
      insert,
      update,
      select,
      transaction: async (callback) => callback({ insert, update }),
    } as PostgresDatabase,
  };
};

const isoExpiresIn = (offsetMs: number) =>
  new Date(Date.now() + offsetMs).toISOString();

describe("modules admin-organization persistence", () => {
  it("tenant-isolation: neither admin-org table declares a tenant_scope column", () => {
    expect(Object.keys(adminMembersTable).includes("tenantScope")).toBe(false);
    expect(Object.keys(adminMembersTable).includes("tenantScopeId")).toBe(
      false,
    );
    expect(
      Object.keys(adminMemberInvitationsTable).includes("tenantScope"),
    ).toBe(false);
    expect(
      Object.keys(adminMemberInvitationsTable).includes("tenantScopeId"),
    ).toBe(false);
  });

  it("supports invite -> redeem -> list and exposes Option.none for missing lookups", async () => {
    const harness = createAdminOrganizationDatabase();
    const repository = await Effect.runPromise(
      makeAdminOrganizationRepository(harness.database),
    );

    // seed a bootstrap owner so the FK invitedBy resolves and the
    // owner-count helper has something to count later.
    const bootstrapOwnerId = crypto.randomUUID();
    harness.members.set(bootstrapOwnerId, {
      id: bootstrapOwnerId,
      keycloakSubjectId: "kc-owner-bootstrap",
      email: "owner@comvestec.test",
      displayName: "Bootstrap Owner",
      role: adminMemberRole.adminOwner,
      status: adminMemberStatus.active,
      invitedAt: new Date("2026-01-01T00:00:00.000Z"),
      acceptedAt: new Date("2026-01-01T00:00:00.000Z"),
      lastActiveAt: null,
      createdBy: "system-bootstrap",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      archivedAt: null,
    });

    const invitation = await Effect.runPromise(
      repository.inviteMember({
        email: "operator@comvestec.test",
        invitedRole: adminMemberRole.adminOperator,
        invitedBy: bootstrapOwnerId,
        tokenHash: "tok_hash_invite_1",
        expiresAt: isoExpiresIn(60 * 60 * 1000),
        correlationId: "corr_invite_1",
      }),
    );

    expect(invitation.email).toBe("operator@comvestec.test");
    expect(invitation.invitedRole).toBe(adminMemberRole.adminOperator);
    expect(invitation.status).toBe(adminMemberInvitationStatus.pending);
    expect(invitation.correlationId).toBe("corr_invite_1");

    const byHash = await Effect.runPromise(
      repository.getInvitationByTokenHash("tok_hash_invite_1"),
    );
    expect(Option.isSome(byHash)).toBe(true);
    expect(Option.getOrThrow(byHash).invitationId).toBe(
      invitation.invitationId,
    );

    const missingInvite = await Effect.runPromise(
      repository.getInvitationByTokenHash("tok_hash_nope"),
    );
    expect(Option.isNone(missingInvite)).toBe(true);

    const member = await Effect.runPromise(
      repository.redeemInvitation({
        invitationId: invitation.invitationId,
        keycloakSubjectId: "kc-operator-1",
        displayName: "Op One",
      }),
    );

    expect(member.email).toBe("operator@comvestec.test");
    expect(member.role).toBe(adminMemberRole.adminOperator);
    expect(member.status).toBe(adminMemberStatus.active);
    expect(member.acceptedAt).toBeDefined();
    expect(member.invitedAt).toBe(invitation.issuedAt);
    expect(member.createdBy).toBe(bootstrapOwnerId);

    const redeemedInvite = harness.invitations.get(invitation.invitationId);
    expect(redeemedInvite?.status).toBe(adminMemberInvitationStatus.redeemed);
    expect(redeemedInvite?.acceptedAt).toBeInstanceOf(Date);

    const listed = await Effect.runPromise(repository.listMembers());
    expect(listed.length).toBe(2);
    expect(listed.map((row) => row.email).sort()).toEqual([
      "operator@comvestec.test",
      "owner@comvestec.test",
    ]);

    const onlyOperators = await Effect.runPromise(
      repository.listMembers({ role: adminMemberRole.adminOperator }),
    );
    expect(onlyOperators.length).toBe(1);
    expect(onlyOperators[0]!.email).toBe("operator@comvestec.test");

    const byEmail = await Effect.runPromise(
      repository.getMembershipByEmail("operator@comvestec.test"),
    );
    expect(Option.isSome(byEmail)).toBe(true);

    const bySubject = await Effect.runPromise(
      repository.getMembershipByKeycloakSubjectId("kc-operator-1"),
    );
    expect(Option.isSome(bySubject)).toBe(true);

    const missingMember = await Effect.runPromise(
      repository.getMember(crypto.randomUUID()),
    );
    expect(Option.isNone(missingMember)).toBe(true);
  });

  it("rejects redemption of an expired invitation with a typed persistence error", async () => {
    const harness = createAdminOrganizationDatabase();
    const repository = await Effect.runPromise(
      makeAdminOrganizationRepository(harness.database),
    );
    const bootstrapOwnerId = crypto.randomUUID();
    harness.members.set(bootstrapOwnerId, {
      id: bootstrapOwnerId,
      keycloakSubjectId: "kc-owner-2",
      email: "owner2@comvestec.test",
      displayName: "Bootstrap Owner 2",
      role: adminMemberRole.adminOwner,
      status: adminMemberStatus.active,
      invitedAt: new Date("2026-01-01T00:00:00.000Z"),
      acceptedAt: new Date("2026-01-01T00:00:00.000Z"),
      lastActiveAt: null,
      createdBy: "system-bootstrap",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      archivedAt: null,
    });

    const invitation = await Effect.runPromise(
      repository.inviteMember({
        email: "late@comvestec.test",
        invitedRole: adminMemberRole.viewer,
        invitedBy: bootstrapOwnerId,
        tokenHash: "tok_hash_expired",
        expiresAt: isoExpiresIn(-60_000),
      }),
    );

    const exit = await Effect.runPromiseExit(
      repository.redeemInvitation({
        invitationId: invitation.invitationId,
        keycloakSubjectId: "kc-late",
        displayName: "Late Joiner",
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = exit.cause;
      const text = JSON.stringify(failure);
      expect(text).toContain("AdminOrgPersistenceError");
      expect(text).toContain("redeemInvitation");
      // The cause is a raw Error whose `message` is not JSON-serialized;
      // assert directly against the structured failure instead.
      const failureOption = Cause.failureOption(failure);
      expect(Option.isSome(failureOption)).toBe(true);
      const value = Option.getOrThrow(failureOption);
      expect(value).toBeInstanceOf(AdminOrgPersistenceError);
      const err = (value as AdminOrgPersistenceError).args.cause;
      expect((err as Error).message).toContain("expired");
    }
  });

  it("enforces tokenHash uniqueness on invite (rejects duplicate invitations)", async () => {
    const harness = createAdminOrganizationDatabase();
    const repository = await Effect.runPromise(
      makeAdminOrganizationRepository(harness.database),
    );
    const bootstrapOwnerId = crypto.randomUUID();
    harness.members.set(bootstrapOwnerId, {
      id: bootstrapOwnerId,
      keycloakSubjectId: "kc-owner-3",
      email: "owner3@comvestec.test",
      displayName: "Bootstrap Owner 3",
      role: adminMemberRole.adminOwner,
      status: adminMemberStatus.active,
      invitedAt: new Date("2026-01-01T00:00:00.000Z"),
      acceptedAt: new Date("2026-01-01T00:00:00.000Z"),
      lastActiveAt: null,
      createdBy: "system-bootstrap",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      archivedAt: null,
    });

    await Effect.runPromise(
      repository.inviteMember({
        email: "first@comvestec.test",
        invitedRole: adminMemberRole.viewer,
        invitedBy: bootstrapOwnerId,
        tokenHash: "tok_collision",
        expiresAt: isoExpiresIn(60_000),
      }),
    );

    const exit = await Effect.runPromiseExit(
      repository.inviteMember({
        email: "second@comvestec.test",
        invitedRole: adminMemberRole.viewer,
        invitedBy: bootstrapOwnerId,
        tokenHash: "tok_collision",
        expiresAt: isoExpiresIn(60_000),
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(JSON.stringify(exit.cause)).toContain(
        "AdminOrgUniqueViolationError",
      );
    }
  });

  it("countMembersByRole returns the unarchived member count per role", async () => {
    const harness = createAdminOrganizationDatabase();
    const repository = await Effect.runPromise(
      makeAdminOrganizationRepository(harness.database),
    );

    const seedMember = (role: string, email: string, archived = false) => {
      const id = crypto.randomUUID();
      harness.members.set(id, {
        id,
        keycloakSubjectId: `kc-${email}`,
        email,
        displayName: email,
        role,
        status: archived
          ? adminMemberStatus.archived
          : adminMemberStatus.active,
        invitedAt: new Date("2026-01-01T00:00:00.000Z"),
        acceptedAt: new Date("2026-01-01T00:00:00.000Z"),
        lastActiveAt: null,
        createdBy: "system-bootstrap",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        archivedAt: archived ? new Date("2026-02-01T00:00:00.000Z") : null,
      });
      return id;
    };

    seedMember(adminMemberRole.adminOwner, "o1@comvestec.test");
    seedMember(adminMemberRole.adminOwner, "o2@comvestec.test");
    seedMember(adminMemberRole.adminOwner, "o3@comvestec.test", true);
    seedMember(adminMemberRole.viewer, "v1@comvestec.test");

    const owners = await Effect.runPromise(
      repository.countMembersByRole(adminMemberRole.adminOwner),
    );
    expect(owners).toBe(2);

    const viewers = await Effect.runPromise(
      repository.countMembersByRole(adminMemberRole.viewer),
    );
    expect(viewers).toBe(1);
  });

  it("soft-deletes via removeMember and hides archived rows from listMembers unless includeArchived is set", async () => {
    const harness = createAdminOrganizationDatabase();
    const repository = await Effect.runPromise(
      makeAdminOrganizationRepository(harness.database),
    );
    const memberId = crypto.randomUUID();
    harness.members.set(memberId, {
      id: memberId,
      keycloakSubjectId: "kc-tobedeleted",
      email: "soft@comvestec.test",
      displayName: "Soft Delete",
      role: adminMemberRole.viewer,
      status: adminMemberStatus.active,
      invitedAt: new Date("2026-01-01T00:00:00.000Z"),
      acceptedAt: new Date("2026-01-01T00:00:00.000Z"),
      lastActiveAt: null,
      createdBy: "system-bootstrap",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      archivedAt: null,
    });

    await Effect.runPromise(repository.removeMember({ memberId }));

    const visible = await Effect.runPromise(repository.listMembers());
    expect(visible.map((m) => m.id)).not.toContain(memberId);

    const withArchived = await Effect.runPromise(
      repository.listMembers({ includeArchived: true }),
    );
    expect(withArchived.map((m) => m.id)).toContain(memberId);

    const archivedRow = harness.members.get(memberId);
    expect(archivedRow?.status).toBe(adminMemberStatus.archived);
    expect(archivedRow?.archivedAt).toBeInstanceOf(Date);

    const removeMissing = await Effect.runPromiseExit(
      repository.removeMember({ memberId: crypto.randomUUID() }),
    );
    expect(Exit.isFailure(removeMissing)).toBe(true);
    if (Exit.isFailure(removeMissing)) {
      expect(JSON.stringify(removeMissing.cause)).toContain(
        "AdminOrgNotFoundError",
      );
    }
  });

  it("changeMemberRole updates the role and bumps updatedAt", async () => {
    const harness = createAdminOrganizationDatabase();
    const repository = await Effect.runPromise(
      makeAdminOrganizationRepository(harness.database),
    );
    const memberId = crypto.randomUUID();
    const initialUpdatedAt = new Date("2026-01-01T00:00:00.000Z");
    harness.members.set(memberId, {
      id: memberId,
      keycloakSubjectId: "kc-rotate",
      email: "rotate@comvestec.test",
      displayName: "Role Rotation",
      role: adminMemberRole.viewer,
      status: adminMemberStatus.active,
      invitedAt: initialUpdatedAt,
      acceptedAt: initialUpdatedAt,
      lastActiveAt: null,
      createdBy: "system-bootstrap",
      createdAt: initialUpdatedAt,
      updatedAt: initialUpdatedAt,
      archivedAt: null,
    });

    const updated = await Effect.runPromise(
      repository.changeMemberRole({
        memberId,
        newRole: adminMemberRole.compliance,
      }),
    );

    expect(updated.role).toBe(adminMemberRole.compliance);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
      initialUpdatedAt.getTime(),
    );

    const changeMissing = await Effect.runPromiseExit(
      repository.changeMemberRole({
        memberId: crypto.randomUUID(),
        newRole: adminMemberRole.viewer,
      }),
    );
    expect(Exit.isFailure(changeMissing)).toBe(true);
    if (Exit.isFailure(changeMissing)) {
      expect(JSON.stringify(changeMissing.cause)).toContain(
        "AdminOrgNotFoundError",
      );
    }
  });

  it("ensureBootstrapOwner inserts the first owner and reactivates a matched member", async () => {
    const harness = createAdminOrganizationDatabase();
    const repository = await Effect.runPromise(
      makeAdminOrganizationRepository(harness.database),
    );

    const inserted = await Effect.runPromise(
      repository.ensureBootstrapOwner({
        keycloakSubjectId: "kc-bootstrap-owner",
        email: "owner@comvestec.test",
        displayName: "Bootstrap Owner",
        createdBy: "kc-bootstrap-owner",
      }),
    );

    expect(inserted.role).toBe(adminMemberRole.adminOwner);
    expect(inserted.status).toBe(adminMemberStatus.active);
    expect(inserted.acceptedAt).toBeDefined();
    expect(harness.members.size).toBe(1);

    const existingMemberId = crypto.randomUUID();
    harness.members.set(existingMemberId, {
      id: existingMemberId,
      keycloakSubjectId: "kc-stale-owner",
      email: "stale-owner@comvestec.test",
      displayName: "Stale Owner",
      role: adminMemberRole.viewer,
      status: adminMemberStatus.archived,
      invitedAt: new Date("2026-01-01T00:00:00.000Z"),
      acceptedAt: null,
      lastActiveAt: null,
      createdBy: "system-bootstrap",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      archivedAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    const updated = await Effect.runPromise(
      repository.ensureBootstrapOwner({
        memberId: existingMemberId,
        keycloakSubjectId: "kc-refreshed-owner",
        email: "refreshed-owner@comvestec.test",
        displayName: "Refreshed Owner",
        createdBy: "ignored-on-update",
      }),
    );

    expect(updated.id).toBe(existingMemberId);
    expect(updated.role).toBe(adminMemberRole.adminOwner);
    expect(updated.status).toBe(adminMemberStatus.active);
    expect(updated.keycloakSubjectId).toBe("kc-refreshed-owner");
    expect(updated.email).toBe("refreshed-owner@comvestec.test");
    expect(updated.displayName).toBe("Refreshed Owner");
    expect(updated.archivedAt).toBeUndefined();
    expect(updated.acceptedAt).toBeDefined();
  });

  it("constructs and exposes the typed errors required by the repository contract", () => {
    const persistence = new AdminOrgPersistenceError({
      operation: "inviteMember",
      cause: new Error("boom"),
    });
    expect(persistence._tag).toBe("AdminOrgPersistenceError");

    const notFound = new AdminOrgNotFoundError({
      entity: "adminMember",
      key: "missing",
    });
    expect(notFound._tag).toBe("AdminOrgNotFoundError");

    const unique = new AdminOrgUniqueViolationError({
      field: "email",
      value: "dup@comvestec.test",
    });
    expect(unique._tag).toBe("AdminOrgUniqueViolationError");
  });
});
