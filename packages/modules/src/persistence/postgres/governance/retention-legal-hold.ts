import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const retentionPoliciesTable = pgTable(
  "retention_policies",
  {
    policyId: text("policy_id").notNull(),
    scope: varchar("scope", { length: 32 }).notNull(),
    scopeId: text("scope_id").notNull(),
    dataType: text("data_type").notNull(),
    retentionDays: integer("retention_days").notNull(),
    changedBy: text("changed_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.policyId] }),
    uniqueIndex("retention_policies_scope_data_type_idx").on(
      table.scope,
      table.scopeId,
      table.dataType,
    ),
    index("retention_policies_scope_idx").on(table.scope, table.scopeId),
  ],
);

export const retentionLegalHoldsTable = pgTable(
  "retention_legal_holds",
  {
    legalHoldId: text("legal_hold_id").notNull(),
    scope: varchar("scope", { length: 32 }).notNull(),
    scopeId: text("scope_id").notNull(),
    dataType: text("data_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    evidence: text("evidence").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    placedBy: text("placed_by").notNull(),
    placedAt: timestamp("placed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    releasedBy: text("released_by"),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.legalHoldId] }),
    index("retention_legal_holds_scope_status_idx").on(
      table.scope,
      table.scopeId,
      table.status,
    ),
    uniqueIndex("retention_legal_holds_active_target_idx")
      .on(table.scope, table.scopeId, table.dataType, table.targetId)
      .where(sql`${table.status} = 'active'`),
  ],
);
