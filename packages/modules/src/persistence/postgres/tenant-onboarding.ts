import { sql } from "drizzle-orm";
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

export const tenantOnboardingRunsTable = pgTable(
  "tenant_onboarding_runs",
  {
    runId: text("run_id").notNull(),
    tenantScope: varchar("tenant_scope", { length: 32 }).notNull(),
    tenantScopeId: text("tenant_scope_id").notNull(),
    triggeredBy: text("triggered_by").notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    currentStepId: text("current_step_id"),
    correlationId: text("correlation_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.runId] }),
    index("tenant_onboarding_runs_scope_idx").on(
      table.tenantScope,
      table.tenantScopeId,
      table.startedAt,
    ),
  ],
);

export const tenantOnboardingStepsTable = pgTable(
  "tenant_onboarding_steps",
  {
    runId: text("run_id").notNull(),
    stepId: text("step_id").notNull(),
    label: text("label").notNull(),
    requiredModuleId: varchar("required_module_id", { length: 64 }),
    status: varchar("status", { length: 32 }).notNull(),
    retryCount: integer("retry_count").notNull().default(0),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.stepId] }),
    index("tenant_onboarding_steps_status_idx").on(table.status, table.runId),
  ],
);
