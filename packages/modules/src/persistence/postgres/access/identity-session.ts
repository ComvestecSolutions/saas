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

export const identitySessionAuditTable = pgTable(
  "identity_session_audit",
  {
    eventId: text("event_id").notNull(),
    sessionId: text("session_id").notNull(),
    actorId: text("actor_id").notNull(),
    tenantScope: varchar("tenant_scope", { length: 32 }).notNull(),
    tenantScopeId: text("tenant_scope_id").notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    provider: text("provider"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId] }),
    index("identity_session_audit_session_idx").on(
      table.sessionId,
      table.recordedAt,
    ),
  ],
);
