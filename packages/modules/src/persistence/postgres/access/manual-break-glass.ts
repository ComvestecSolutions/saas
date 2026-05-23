/**
 * Manual break-glass Drizzle table per admin-app implementation
 * plan §9 item 5.
 *
 * Persists one row per issued grant. The `(granted_to, status)`
 * composite index supports `countActiveForSubject` and the
 * `listActiveForSubject` lookup that powers `RunAsBanner`; the
 * `expires_at` index supports the auto-expiry sweep.
 *
 * The migration for this table is generated via
 * `POSTGRES_URL=postgres://placeholder bun run db:generate`
 * against the most recent migration template once a live Postgres
 * is available; the schema lives in this file as the source of
 * truth in the meantime so the in-memory test harness can drive it.
 */
import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const manualBreakGlassGrantsTable = pgTable(
  "manual_break_glass_grants",
  {
    id: uuid("id").notNull().defaultRandom(),
    grantedTo: text("granted_to").notNull(),
    grantedBy: text("granted_by").notNull(),
    targetTenantScope: varchar("target_tenant_scope", { length: 32 }).notNull(),
    targetTenantScopeId: text("target_tenant_scope_id").notNull(),
    reasonCatalogId: text("reason_catalog_id").notNull(),
    reasonNarrative: text("reason_narrative").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releasedBy: text("released_by"),
    releaseReasonCatalogId: text("release_reason_catalog_id"),
    correlationId: text("correlation_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("manual_break_glass_granted_to_status_idx").on(
      table.grantedTo,
      table.status,
    ),
    index("manual_break_glass_expires_at_idx").on(table.expiresAt),
  ],
);
