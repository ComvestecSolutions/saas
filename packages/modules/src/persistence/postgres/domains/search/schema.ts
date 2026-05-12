import type { SearchTenantIndexSettings } from "@comvestec/contracts";
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const searchTenantIndexesTable = pgTable(
  "search_tenant_indexes",
  {
    indexName: text("index_name").notNull(),
    scope: varchar("scope", { length: 32 }).notNull(),
    scopeId: text("scope_id").notNull(),
    lifecycleState: varchar("lifecycle_state", { length: 32 }).notNull(),
    documentCount: integer("document_count").notNull().default(0),
    settings: jsonb("settings").$type<SearchTenantIndexSettings | null>(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.indexName] }),
    uniqueIndex("search_tenant_indexes_scope_unique_idx").on(
      table.scope,
      table.scopeId,
    ),
    index("search_tenant_indexes_scope_state_idx").on(
      table.scope,
      table.scopeId,
      table.lifecycleState,
    ),
  ],
);
