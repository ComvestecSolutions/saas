import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import type { BillingRepairWorkflowPayload } from "@comvestec/contracts";

export const workflowJobsTable = pgTable(
  "workflow_jobs",
  {
    jobId: text("job_id").notNull(),
    runtime: varchar("runtime", { length: 64 }).notNull(),
    sourceModuleId: varchar("source_module_id", { length: 64 }).notNull(),
    kind: varchar("kind", { length: 64 }).notNull(),
    trigger: varchar("trigger", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    tenantScope: varchar("tenant_scope", { length: 32 }).notNull(),
    tenantScopeId: text("tenant_scope_id").notNull(),
    attempts: integer("attempts").notNull().default(0),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastError: text("last_error"),
    gapReason: varchar("gap_reason", { length: 64 }),
    payload: jsonb("payload").$type<BillingRepairWorkflowPayload>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.jobId] }),
    index("workflow_jobs_due_idx").on(
      table.sourceModuleId,
      table.status,
      table.scheduledAt,
    ),
    index("workflow_jobs_gap_idx").on(
      table.sourceModuleId,
      table.gapReason,
      table.updatedAt,
    ),
    index("workflow_jobs_tenant_idx").on(
      table.tenantScope,
      table.tenantScopeId,
      table.sourceModuleId,
    ),
  ],
);
