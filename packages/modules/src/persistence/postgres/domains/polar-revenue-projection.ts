/**
 * Polar revenue projection snapshot Drizzle table per admin-app
 * implementation plan §9 item 7.
 *
 * Persists one row per `(tenant_scope, tenant_scope_id,
 * billing_period_start)` snapshot computed by the platform
 * service against the Polar adapter. The composite
 * `(tenant_scope_id, billing_period_start)` index backs the
 * latest-per-tenant read path enforced ABOVE persistence by
 * `OperatorPolarRevenueProjectionService.getLatestForTenant`.
 *
 * The migration for this table is generated via
 * `POSTGRES_URL=postgres://placeholder bun run db:generate`
 * against the most recent migration template once a live Postgres
 * is available; the schema lives in this file as the source of
 * truth in the meantime so the in-memory test harness can drive
 * it.
 */
import {
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const polarRevenueProjectionSnapshotsTable = pgTable(
  "polar_revenue_projection_snapshots",
  {
    id: uuid("id").notNull().defaultRandom(),
    tenantScope: varchar("tenant_scope", { length: 32 }).notNull(),
    tenantScopeId: text("tenant_scope_id").notNull(),
    billingPeriodStart: timestamp("billing_period_start", {
      withTimezone: true,
    }).notNull(),
    billingPeriodEnd: timestamp("billing_period_end", {
      withTimezone: true,
    }).notNull(),
    subscriptionMrrCurrency: varchar("subscription_mrr_currency", {
      length: 3,
    }).notNull(),
    subscriptionMrrAmount: integer("subscription_mrr_amount").notNull(),
    churnRate: numeric("churn_rate", { precision: 6, scale: 5 }).notNull(),
    expansionCurrency: varchar("expansion_currency", { length: 3 }).notNull(),
    expansionAmount: integer("expansion_amount").notNull(),
    contractionCurrency: varchar("contraction_currency", {
      length: 3,
    }).notNull(),
    contractionAmount: integer("contraction_amount").notNull(),
    projectedNextPeriodCurrency: varchar("projected_next_period_currency", {
      length: 3,
    }).notNull(),
    projectedNextPeriodAmount: integer(
      "projected_next_period_amount",
    ).notNull(),
    activeSubscriptionCount: integer("active_subscription_count").notNull(),
    sourcePolarAccountId: text("source_polar_account_id").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
    correlationId: text("correlation_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("polar_revenue_projection_tenant_period_uq").on(
      table.tenantScope,
      table.tenantScopeId,
      table.billingPeriodStart,
    ),
    index("polar_revenue_projection_tenant_period_idx").on(
      table.tenantScopeId,
      table.billingPeriodStart,
    ),
    index("polar_revenue_projection_tenant_computed_idx").on(
      table.tenantScopeId,
      table.computedAt,
    ),
  ],
);
