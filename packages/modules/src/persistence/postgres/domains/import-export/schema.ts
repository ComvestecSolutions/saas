import {
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const importExportJobsTable = pgTable("import_export_jobs", {
  jobId: text("job_id").primaryKey(),
  tenantScope: varchar("tenant_scope", { length: 32 }).notNull(),
  tenantScopeId: text("tenant_scope_id").notNull(),
  source: varchar("source", { length: 64 }).notNull(),
  format: varchar("format", { length: 16 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  requestedBy: text("requested_by").notNull(),
  rowCount: integer("row_count"),
  artifactFileId: text("artifact_file_id"),
  lastError: text("last_error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
