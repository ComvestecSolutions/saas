/**
 * Admin-organization Drizzle tables per ADR-023.
 *
 * The admin organization is the single logical SaaS-operator org
 * that runs the platform itself. It is **not** a tenant: rows in
 * `admin_members` / `admin_member_invitations` carry no
 * `tenant_scope` / `tenant_scope_id` columns, and queries through
 * the {@link adminMembersTable} and
 * {@link adminMemberInvitationsTable} tables intentionally do
 * **not** join any tenant table. This preserves the ADR-023
 * tenant-isolation invariant that admin-org rows cannot leak
 * through tenant-list queries (or vice versa).
 *
 * Audit events for membership lifecycle (invite, redeem, role
 * change, remove) are recorded via the central
 * {@link import("../governance/audit-log").auditLogEventsTable}
 * keyed by `platformModuleId.adminOrganization`, per ADR-023.
 *
 * Column inventory extends the ADR-023 minimum so the read-boundary
 * decode can satisfy the canonical `AdminMemberSchema` /
 * `AdminMemberInvitationSchema` contracts exported from
 * `@comvestec/contracts`.
 */
import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const adminMembersTable = pgTable(
  "admin_members",
  {
    id: uuid("id").notNull().defaultRandom(),
    keycloakSubjectId: text("keycloak_subject_id"),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: varchar("role", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("admin_members_email_uq").on(table.email),
    uniqueIndex("admin_members_keycloak_subject_uq").on(
      table.keycloakSubjectId,
    ),
    index("admin_members_role_idx").on(table.role),
  ],
);

export const adminMemberInvitationsTable = pgTable(
  "admin_member_invitations",
  {
    invitationId: uuid("invitation_id").notNull().defaultRandom(),
    email: text("email").notNull(),
    invitedRole: varchar("invited_role", { length: 32 }).notNull(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => adminMembersTable.id),
    tokenHash: text("token_hash").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by"),
    correlationId: text("correlation_id"),
  },
  (table) => [
    primaryKey({ columns: [table.invitationId] }),
    uniqueIndex("admin_member_invitations_token_hash_uq").on(table.tokenHash),
    index("admin_member_invitations_email_idx").on(table.email),
    index("admin_member_invitations_status_expires_idx").on(
      table.status,
      table.expiresAt,
    ),
  ],
);
