import { Effect } from "effect";
import { authorizationRelation, platformScope } from "@comvestec/contracts";
import {
  makeTenantInvitationPostgresRepository,
  type PostgresDatabase,
  type PostgresInsertBuilder,
  tenantMembershipInvitationsTable,
} from "@comvestec/modules";

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

const createTenantInvitationPersistenceDatabase = () => {
  type PersistedTable = Parameters<PostgresDatabase["insert"]>[0];
  type PersistedValues = Parameters<
    PostgresInsertBuilder<PersistedTable>["values"]
  >[0];

  const invitations = new Map<
    string,
    typeof tenantMembershipInvitationsTable.$inferSelect
  >();

  const persistRows = (table: PersistedTable, values: PersistedValues) => {
    const rows = Array.isArray(values) ? values : [values];

    for (const row of rows) {
      if (table !== tenantMembershipInvitationsTable) {
        continue;
      }

      const invitation =
        row as typeof tenantMembershipInvitationsTable.$inferInsert;

      invitations.set(invitation.invitationId, {
        invitationId: invitation.invitationId,
        tenantScope: invitation.tenantScope,
        tenantScopeId: invitation.tenantScopeId,
        tokenHash: invitation.tokenHash ?? null,
        recipientEmail: invitation.recipientEmail,
        relation: invitation.relation,
        status: invitation.status ?? "pending",
        issuedBy: invitation.issuedBy,
        correlationId: invitation.correlationId ?? null,
        issuedAt: invitation.issuedAt ?? new Date(),
        expiresAt: invitation.expiresAt,
        reminderQueuedAt: invitation.reminderQueuedAt ?? null,
        expiryNotificationQueuedAt:
          invitation.expiryNotificationQueuedAt ?? null,
        redeemedAt: invitation.redeemedAt ?? null,
        redeemedBy: invitation.redeemedBy ?? null,
        revokedAt: invitation.revokedAt ?? null,
        revokedBy: invitation.revokedBy ?? null,
      });
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

  const update = () => ({
    set: (
      values: Partial<typeof tenantMembershipInvitationsTable.$inferSelect>,
    ) => ({
      where: (condition: unknown) => ({
        returning: async () => {
          const filters = extractConditionFilters(condition);
          const updatedRows: Array<
            typeof tenantMembershipInvitationsTable.$inferSelect
          > = [];

          for (const [invitationId, invitation] of invitations.entries()) {
            const matches = Object.entries(filters).every(
              ([key, value]) =>
                invitation[
                  key as keyof typeof tenantMembershipInvitationsTable.$inferSelect
                ] === value,
            );

            if (!matches) {
              continue;
            }

            const nextInvitation = {
              ...invitation,
              ...values,
            } satisfies typeof tenantMembershipInvitationsTable.$inferSelect;

            invitations.set(invitationId, nextInvitation);
            updatedRows.push(nextInvitation);
          }

          return updatedRows;
        },
      }),
    }),
  });

  return {
    invitations,
    database: {
      insert,
      select: () => ({
        from: (table: PersistedTable) => ({
          where: async () =>
            table === tenantMembershipInvitationsTable
              ? [...invitations.values()]
              : [],
        }),
      }),
      update,
      transaction: async (callback) =>
        callback({
          insert,
          update,
        }),
    } as PostgresDatabase,
  };
};

describe("modules tenant invitation persistence", () => {
  it("persists, lists, and revokes durable tenant invitation records", async () => {
    const database = createTenantInvitationPersistenceDatabase();
    const repository = await Effect.runPromise(
      makeTenantInvitationPostgresRepository(database.database),
    );

    await Effect.runPromise(
      repository.createInvitation({
        invitationId: "invite_org_1_admin_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        tokenHash: "hash_org_1_admin_1",
        recipientEmail: "admin@example.com",
        relation: authorizationRelation.admin,
        status: "pending",
        issuedBy: "usr_platform_operator",
        correlationId: "corr_tenant_invite_1",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: "2026-05-05T12:00:00.000Z",
      }),
    );
    await Effect.runPromise(
      repository.createInvitation({
        invitationId: "invite_org_2_viewer_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_2",
        tokenHash: "hash_org_2_viewer_1",
        recipientEmail: "viewer@example.com",
        relation: authorizationRelation.viewer,
        status: "pending",
        issuedBy: "usr_platform_operator",
        issuedAt: "2026-05-01T10:00:00.000Z",
        expiresAt: "2026-05-04T10:00:00.000Z",
      }),
    );

    const listBeforeRevoke = await Effect.runPromise(
      repository.listInvitationsByTenant({
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
      }),
    );

    expect(listBeforeRevoke).toEqual([
      {
        invitationId: "invite_org_1_admin_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        tokenHash: "hash_org_1_admin_1",
        recipientEmail: "admin@example.com",
        relation: authorizationRelation.admin,
        status: "pending",
        issuedBy: "usr_platform_operator",
        correlationId: "corr_tenant_invite_1",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: "2026-05-05T12:00:00.000Z",
      },
    ]);

    const byTokenHash = await Effect.runPromise(
      repository.getInvitationByTokenHash({
        tokenHash: "hash_org_1_admin_1",
      }),
    );

    expect(byTokenHash).toEqual(listBeforeRevoke[0]);

    const redeemed = await Effect.runPromise(
      repository.redeemInvitation({
        tenantScope: platformScope.organization,
        tenantScopeId: "org_2",
        invitationId: "invite_org_2_viewer_1",
        redeemedBy: "usr_member_2",
        redeemedAt: "2026-05-01T11:00:00.000Z",
      }),
    );

    expect(redeemed).toEqual({
      invitationId: "invite_org_2_viewer_1",
      tenantScope: platformScope.organization,
      tenantScopeId: "org_2",
      tokenHash: "hash_org_2_viewer_1",
      recipientEmail: "viewer@example.com",
      relation: authorizationRelation.viewer,
      status: "redeemed",
      issuedBy: "usr_platform_operator",
      issuedAt: "2026-05-01T10:00:00.000Z",
      expiresAt: "2026-05-04T10:00:00.000Z",
      redeemedAt: "2026-05-01T11:00:00.000Z",
      redeemedBy: "usr_member_2",
    });

    const redeemedAgain = await Effect.runPromise(
      repository.redeemInvitation({
        tenantScope: platformScope.organization,
        tenantScopeId: "org_2",
        invitationId: "invite_org_2_viewer_1",
        redeemedBy: "usr_member_3",
        redeemedAt: "2026-05-01T12:00:00.000Z",
      }),
    );

    expect(redeemedAgain).toBeUndefined();

    const revoked = await Effect.runPromise(
      repository.revokeInvitation({
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        invitationId: "invite_org_1_admin_1",
        revokedBy: "usr_platform_operator",
        revokedAt: "2026-05-02T13:00:00.000Z",
      }),
    );

    expect(revoked).toEqual({
      invitationId: "invite_org_1_admin_1",
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      tokenHash: "hash_org_1_admin_1",
      recipientEmail: "admin@example.com",
      relation: authorizationRelation.admin,
      status: "revoked",
      issuedBy: "usr_platform_operator",
      correlationId: "corr_tenant_invite_1",
      issuedAt: "2026-05-02T12:00:00.000Z",
      expiresAt: "2026-05-05T12:00:00.000Z",
      revokedAt: "2026-05-02T13:00:00.000Z",
      revokedBy: "usr_platform_operator",
    });

    const stored = await Effect.runPromise(
      repository.getInvitationById({
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        invitationId: "invite_org_1_admin_1",
      }),
    );

    expect(stored).toEqual(revoked);
    expect(database.invitations.get("invite_org_1_admin_1")).toMatchObject({
      status: "revoked",
      revokedBy: "usr_platform_operator",
    });
    expect(database.invitations.get("invite_org_2_viewer_1")).toMatchObject({
      status: "redeemed",
      redeemedBy: "usr_member_2",
    });
  });
});
