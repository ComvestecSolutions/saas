import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const tenantMembershipInvitationsTable = pgTable(
  "tenant_membership_invitations",
  {
    invitationId: text("invitation_id").notNull(),
    tenantScope: varchar("tenant_scope", { length: 32 }).notNull(),
    tenantScopeId: text("tenant_scope_id").notNull(),
    tokenHash: text("token_hash"),
    recipientEmail: text("recipient_email").notNull(),
    relation: varchar("relation", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    issuedBy: text("issued_by").notNull(),
    correlationId: text("correlation_id"),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    reminderQueuedAt: timestamp("reminder_queued_at", { withTimezone: true }),
    expiryNotificationQueuedAt: timestamp("expiry_notification_queued_at", {
      withTimezone: true,
    }),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    redeemedBy: text("redeemed_by"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by"),
  },
  (table) => [
    primaryKey({ columns: [table.invitationId] }),
    index("tenant_membership_invites_token_hash_idx").on(table.tokenHash),
    index("tenant_membership_invites_scope_idx").on(
      table.tenantScope,
      table.tenantScopeId,
      table.issuedAt,
    ),
    index("tenant_membership_invites_status_idx").on(
      table.status,
      table.expiresAt,
    ),
  ],
);
