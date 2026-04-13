import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const runtimeConfigOverridesTable = pgTable(
  "runtime_config_overrides",
  {
    overrideId: text("override_id").notNull(),
    moduleId: varchar("module_id", { length: 64 }).notNull(),
    key: text("key").notNull(),
    scope: varchar("scope", { length: 32 }).notNull(),
    scopeId: text("scope_id").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    source: varchar("source", { length: 32 }).notNull(),
    changedBy: text("changed_by").notNull(),
    approvalReason: text("approval_reason"),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.overrideId] }),
    uniqueIndex("runtime_config_overrides_scope_key_idx").on(
      table.moduleId,
      table.key,
      table.scope,
      table.scopeId,
    ),
  ],
);

export const runtimeConfigSyncArtifactsTable = pgTable(
  "runtime_config_sync_artifacts",
  {
    proposalId: text("proposal_id").notNull(),
    moduleId: varchar("module_id", { length: 64 }).notNull(),
    key: text("key").notNull(),
    action: varchar("action", { length: 32 }).notNull(),
    artifactPath: text("artifact_path").notNull(),
    runtimeValue: jsonb("runtime_value").$type<unknown>(),
    codeValue: jsonb("code_value").$type<unknown>(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.proposalId] }),
    index("runtime_config_sync_artifacts_module_idx").on(
      table.moduleId,
      table.generatedAt,
    ),
  ],
);
