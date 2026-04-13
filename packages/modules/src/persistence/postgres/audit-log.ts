import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const auditLogEventsTable = pgTable(
  "audit_log_events",
  {
    eventId: text("event_id").notNull(),
    moduleId: varchar("module_id", { length: 64 }).notNull(),
    action: text("action").notNull(),
    target: text("target").notNull(),
    actorId: text("actor_id").notNull(),
    tenantScope: varchar("tenant_scope", { length: 32 }).notNull(),
    tenantScopeId: text("tenant_scope_id").notNull(),
    reason: text("reason"),
    correlationId: text("correlation_id"),
    requestContext: jsonb("request_context")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId] }),
    index("audit_log_events_module_idx").on(table.moduleId, table.recordedAt),
    index("audit_log_events_scope_idx").on(
      table.tenantScope,
      table.tenantScopeId,
    ),
  ],
);
