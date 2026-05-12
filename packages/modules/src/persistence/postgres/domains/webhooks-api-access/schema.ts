import { sql } from "drizzle-orm";
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

export const webhookSubscriptionsTable = pgTable(
  "webhook_subscriptions",
  {
    subscriptionId: text("subscription_id").notNull(),
    scope: varchar("scope", { length: 32 }).notNull(),
    scopeId: text("scope_id").notNull(),
    url: text("url").notNull(),
    events: jsonb("events")
      .$type<readonly string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.subscriptionId] }),
    uniqueIndex("webhook_subscriptions_scope_url_idx").on(
      table.scope,
      table.scopeId,
      table.url,
    ),
    index("webhook_subscriptions_scope_status_idx").on(
      table.scope,
      table.scopeId,
      table.status,
    ),
  ],
);

export const webhookOutboundDeliveriesTable = pgTable(
  "webhook_outbound_deliveries",
  {
    deliveryId: text("delivery_id").notNull(),
    subscriptionId: text("subscription_id").notNull(),
    scope: varchar("scope", { length: 32 }).notNull(),
    scopeId: text("scope_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: text("payload").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    exhaustedAt: timestamp("exhausted_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.deliveryId] }),
    index("webhook_outbound_deliveries_scope_status_idx").on(
      table.scope,
      table.scopeId,
      table.status,
    ),
    index("webhook_outbound_deliveries_subscription_idx").on(
      table.subscriptionId,
      table.createdAt,
    ),
    index("webhook_outbound_deliveries_next_attempt_idx").on(
      table.status,
      table.nextAttemptAt,
    ),
  ],
);

export const webhookApiKeysTable = pgTable(
  "webhook_api_keys",
  {
    apiKeyId: text("api_key_id").notNull(),
    scope: varchar("scope", { length: 32 }).notNull(),
    scopeId: text("scope_id").notNull(),
    label: text("label").notNull(),
    secretHash: text("secret_hash").notNull(),
    prefix: varchar("prefix", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.apiKeyId] }),
    index("webhook_api_keys_scope_status_idx").on(
      table.scope,
      table.scopeId,
      table.status,
    ),
    index("webhook_api_keys_scope_label_idx").on(
      table.scope,
      table.scopeId,
      table.label,
    ),
  ],
);
