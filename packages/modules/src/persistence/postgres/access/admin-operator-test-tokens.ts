/**
 * Admin-operator-test-tokens Drizzle tables per
 * `specs/02-modules/access/admin-operator-test-tokens/spec.md` and
 * admin-app implementation-plan.md §9 item 17.
 *
 * Two tables:
 *
 *   - `admin_operator_test_tokens` — durable, owner-only, one row
 *     per issued token. The plaintext token is **never** persisted;
 *     only the non-secret `token_prefix` (`aott_<8>`) correlator and
 *     the HMAC-SHA-256 `token_hash` of the full encoded token (under
 *     the env-bound signing key) hit the DB.
 *   - `admin_operator_test_token_usage_events` — append-only ring
 *     bounded to the most recent N events per token, retained for
 *     audit correlation only. Long-term history lives in the central
 *     audit log (`platformModuleId.adminOperatorTestTokens` audit
 *     module-id, action enum
 *     `adminOperatorTestTokensAuditAction.{usedSuccess,usedFailure}`).
 *
 * Indexes:
 *
 *   - `admin_operator_test_tokens_prefix_uq` on `token_prefix` —
 *     enforces correlator uniqueness and supports the verify path,
 *     which looks rows up by prefix before the constant-time HMAC
 *     compare on `token_hash`.
 *   - `admin_operator_test_tokens_issued_by_idx` on
 *     `(issued_by, revoked_at)` — list-by-owner with active-only
 *     filtering.
 *   - `admin_operator_test_tokens_expires_at_idx` on `expires_at` —
 *     ring trim / expiring-soon KPI.
 *   - `admin_operator_test_token_usage_events_token_id_idx` on
 *     `(token_id, occurred_at)` — ring trim per token.
 *
 * The migration for these tables is generated via
 * `POSTGRES_URL=postgres://placeholder bun run db:generate` once
 * picked up by the schema-only generator; this file is the source
 * of truth in the meantime so the in-memory test harness can drive
 * the repository.
 */
import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const adminOperatorTestTokensTable = pgTable(
  "admin_operator_test_tokens",
  {
    id: uuid("id").notNull().defaultRandom(),
    tokenPrefix: varchar("token_prefix", { length: 32 }).notNull(),
    tokenHash: text("token_hash").notNull(),
    label: text("label").notNull(),
    issuedBy: text("issued_by").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by"),
    reasonCatalogId: text("reason_catalog_id").notNull(),
    reasonAttachmentText: text("reason_attachment_text"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    lastUsedOutcome: varchar("last_used_outcome", { length: 16 }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("admin_operator_test_tokens_prefix_uq").on(table.tokenPrefix),
    index("admin_operator_test_tokens_issued_by_idx").on(
      table.issuedBy,
      table.revokedAt,
    ),
    index("admin_operator_test_tokens_expires_at_idx").on(table.expiresAt),
  ],
);

export const adminOperatorTestTokenUsageEventsTable = pgTable(
  "admin_operator_test_token_usage_events",
  {
    id: uuid("id").notNull().defaultRandom(),
    tokenId: uuid("token_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    outcome: varchar("outcome", { length: 16 }).notNull(),
    failureReason: varchar("failure_reason", { length: 32 }),
    correlationId: text("correlation_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("admin_operator_test_token_usage_events_token_id_idx").on(
      table.tokenId,
      table.occurredAt,
    ),
  ],
);
