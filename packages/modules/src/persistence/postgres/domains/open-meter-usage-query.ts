/**
 * OpenMeter usage query snapshot Drizzle table per admin-app
 * implementation plan §9 item 8 (admin-only).
 *
 * Persists one row per
 * `(tenant_scope, tenant_scope_id, meter_slug, window_start)`
 * snapshot computed by the platform service against the OpenMeter
 * adapter. The composite unique index enforces one snapshot per
 * tenant per meter per window-start so the
 * latest-per-tenant-meter read path stays O(1); the
 * `(computed_at desc)` covering index supports recency ordering for
 * dashboards.
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
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const openMeterUsageQuerySnapshotsTable = pgTable(
  "open_meter_usage_query_snapshots",
  {
    id: uuid("id").notNull().defaultRandom(),
    tenantScope: varchar("tenant_scope", { length: 32 }).notNull(),
    tenantScopeId: text("tenant_scope_id").notNull(),
    subject: text("subject").notNull(),
    meterSlug: text("meter_slug").notNull(),
    windowStart: timestamp("window_start", {
      withTimezone: true,
    }).notNull(),
    windowEnd: timestamp("window_end", {
      withTimezone: true,
    }).notNull(),
    granularity: varchar("granularity", { length: 16 }).notNull(),
    aggregatedBuckets: jsonb("aggregated_buckets")
      .$type<
        ReadonlyArray<{ readonly windowStart: string; readonly value: number }>
      >()
      .notNull(),
    bucketCount: integer("bucket_count").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
    correlationId: text("correlation_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("open_meter_usage_query_tenant_meter_window_uq").on(
      table.tenantScope,
      table.tenantScopeId,
      table.meterSlug,
      table.windowStart,
    ),
    index("open_meter_usage_query_tenant_computed_idx").on(
      table.tenantScopeId,
      table.computedAt,
    ),
  ],
);
