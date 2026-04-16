import {
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const tenantBrandingDomainVerificationTable = pgTable(
  "tenant_branding_domain_verifications",
  {
    verificationId: text("verification_id").notNull(),
    scope: varchar("scope", { length: 32 }).notNull(),
    scopeId: text("scope_id").notNull(),
    requestedHost: text("requested_host").notNull(),
    lifecycleState: varchar("lifecycle_state", { length: 32 }).notNull(),
    dnsProof: jsonb("dns_proof").$type<Record<string, unknown>>(),
    approvedBy: text("approved_by"),
    approvalNotes: text("approval_notes"),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.verificationId] }),
    uniqueIndex("tenant_branding_domain_scope_host_idx").on(
      table.scope,
      table.scopeId,
      table.requestedHost,
    ),
  ],
);
