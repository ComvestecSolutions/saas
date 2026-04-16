import { sql } from "drizzle-orm";
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

export const tenantProvisioningReceiptsTable = pgTable(
  "tenant_provisioning_receipts",
  {
    provisioningId: text("provisioning_id").notNull(),
    tenantScope: varchar("tenant_scope", { length: 32 }).notNull(),
    tenantScopeId: text("tenant_scope_id").notNull(),
    ownerActorId: text("owner_actor_id").notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    correlationId: text("correlation_id"),
    authorizationTuples: jsonb("authorization_tuples")
      .$type<readonly Record<string, unknown>[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    requestContext: jsonb("request_context")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    provisionedAt: timestamp("provisioned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.provisioningId] }),
    uniqueIndex("tenant_provisioning_receipts_scope_idx").on(
      table.tenantScope,
      table.tenantScopeId,
    ),
    index("tenant_provisioning_receipts_owner_idx").on(
      table.ownerActorId,
      table.updatedAt,
    ),
  ],
);
