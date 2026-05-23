/**
 * Operator-facing webhook delivery envelope Drizzle table per
 * admin-app implementation plan §9 item 6.
 *
 * Persists one row per outbound delivery attempt envelope. Three
 * indexes back the owner-locked invariants the platform service
 * enforces ABOVE persistence:
 *
 *   - `(subscription_id, payload_hash)` powers the
 *     `findRecentByPayloadHash` lookup that the platform service's
 *     replay-guard window check uses to short-circuit duplicate
 *     enqueues inside `replayGuardWindowMinutes`.
 *   - `(status, next_attempt_at)` is the dispatcher cursor — the
 *     async dispatcher selects pending rows whose `next_attempt_at`
 *     is due.
 *   - `(subscription_id, enqueued_at DESC)` backs the operator
 *     list-by-filter desk surface.
 *
 * The migration for this table is generated via
 * `POSTGRES_URL=postgres://placeholder bun run db:generate`
 * against the most recent migration template once a live Postgres
 * is available; the schema lives in this file as the source of
 * truth in the meantime so the in-memory test harness can drive it.
 */
import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const operatorWebhookDeliveriesTable = pgTable(
  "operator_webhook_deliveries",
  {
    id: uuid("id").notNull().defaultRandom(),
    subscriptionId: text("subscription_id").notNull(),
    targetTenantScope: varchar("target_tenant_scope", { length: 32 }).notNull(),
    targetTenantScopeId: text("target_tenant_scope_id").notNull(),
    eventType: text("event_type").notNull(),
    requestUrl: text("request_url").notNull(),
    requestMethod: varchar("request_method", { length: 8 }).notNull(),
    requestBody: text("request_body").notNull(),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    signature: text("signature").notNull(),
    signatureTimestamp: timestamp("signature_timestamp", {
      withTimezone: true,
    }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    attemptCount: integer("attempt_count").notNull(),
    enqueuedAt: timestamp("enqueued_at", { withTimezone: true }).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastResponseStatus: integer("last_response_status"),
    lastResponseBodySnippet: text("last_response_body_snippet"),
    lastErrorMessage: text("last_error_message"),
    replayOfDeliveryId: text("replay_of_delivery_id"),
    correlationId: text("correlation_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("operator_webhook_deliveries_subscription_payload_idx").on(
      table.subscriptionId,
      table.payloadHash,
    ),
    index("operator_webhook_deliveries_status_next_attempt_at_idx").on(
      table.status,
      table.nextAttemptAt,
    ),
    index("operator_webhook_deliveries_subscription_enqueued_at_idx").on(
      table.subscriptionId,
      table.enqueuedAt,
    ),
  ],
);
