import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const supportOperationsCasesTable = pgTable(
  "support_operations_cases",
  {
    caseId: text("case_id").notNull(),
    supportAgent: text("support_agent").notNull(),
    tenantScope: varchar("tenant_scope", { length: 32 }).notNull(),
    tenantScopeId: text("tenant_scope_id").notNull(),
    summary: text("summary").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("open"),
    priority: varchar("priority", { length: 16 }).notNull().default("normal"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    lastUpdatedAt: timestamp("last_updated_at", {
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.caseId] }),
    index("support_ops_cases_status_idx").on(table.status, table.lastUpdatedAt),
    index("support_ops_cases_tenant_idx").on(
      table.tenantScope,
      table.tenantScopeId,
      table.lastUpdatedAt,
    ),
    index("support_ops_cases_agent_idx").on(
      table.supportAgent,
      table.lastUpdatedAt,
    ),
  ],
);

export const supportOperationsImpersonationSessionsTable = pgTable(
  "support_operations_impersonation_sessions",
  {
    caseId: text("case_id").notNull(),
    supportAgent: text("support_agent").notNull(),
    impersonatedUser: text("impersonated_user").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    approvedBy: text("approved_by").notNull(),
    reason: text("reason").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.caseId] }),
    index("support_ops_impersonation_status_idx").on(
      table.status,
      table.startedAt,
    ),
    index("support_ops_impersonation_agent_idx").on(
      table.supportAgent,
      table.startedAt,
    ),
  ],
);

export const supportOperationsBreakGlassIncidentsTable = pgTable(
  "support_operations_break_glass_incidents",
  {
    caseId: text("case_id").notNull(),
    supportAgent: text("support_agent").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 32 })
      .notNull()
      .default("pending-review"),
    approvedBy: text("approved_by").notNull(),
    reason: text("reason").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.caseId] }),
    index("support_ops_break_glass_status_idx").on(
      table.status,
      table.startedAt,
    ),
    index("support_ops_break_glass_agent_idx").on(
      table.supportAgent,
      table.startedAt,
    ),
  ],
);
