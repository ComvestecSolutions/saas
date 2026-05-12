import {
  notificationCenterDigestRunStatus,
  notificationCenterReceiptStatus,
} from "@comvestec/contracts";
import {
  boolean,
  integer,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const notificationCenterEmailReceiptsTable = pgTable(
  "notification_center_email_receipts",
  {
    notificationId: text("notification_id").notNull(),
    tenantScope: varchar("tenant_scope", { length: 32 }).notNull(),
    tenantScopeId: text("tenant_scope_id").notNull(),
    channel: varchar("channel", { length: 16 }).notNull(),
    recipient: text("recipient").notNull(),
    template: text("template").notNull(),
    status: varchar("status", { length: 32 })
      .notNull()
      .default(notificationCenterReceiptStatus.queued),
    emailDeliveryMessageId: text("email_delivery_message_id"),
    queueReceiptId: text("queue_receipt_id"),
    queueFailureSummary: text("queue_failure_summary"),
    suppressionReason: text("suppression_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.notificationId] }),
    index("notification_center_email_receipts_tenant_status_idx").on(
      table.tenantScope,
      table.tenantScopeId,
      table.status,
    ),
    index("notification_center_email_receipts_delivery_idx").on(
      table.emailDeliveryMessageId,
    ),
  ],
);

export const notificationCenterEmailPreferencesTable = pgTable(
  "notification_center_email_preferences",
  {
    tenantScope: varchar("tenant_scope", { length: 32 }).notNull(),
    tenantScopeId: text("tenant_scope_id").notNull(),
    channel: varchar("channel", { length: 16 }).notNull(),
    recipient: text("recipient").notNull(),
    template: text("template").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    updatedBy: text("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.tenantScope,
        table.tenantScopeId,
        table.channel,
        table.recipient,
        table.template,
      ],
    }),
    index("notification_center_email_preferences_tenant_recipient_idx").on(
      table.tenantScope,
      table.tenantScopeId,
      table.recipient,
    ),
  ],
);

export const notificationCenterDigestRunsTable = pgTable(
  "notification_center_digest_runs",
  {
    digestRunId: text("digest_run_id").notNull(),
    tenantScope: varchar("tenant_scope", { length: 32 }).notNull(),
    tenantScopeId: text("tenant_scope_id").notNull(),
    recipient: text("recipient").notNull(),
    channel: varchar("channel", { length: 16 }).notNull(),
    template: text("template").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    status: varchar("status", { length: 32 })
      .notNull()
      .default(notificationCenterDigestRunStatus.scheduled),
    itemCount: integer("item_count").notNull().default(0),
    emailDeliveryMessageId: text("email_delivery_message_id"),
    queueReceiptId: text("queue_receipt_id"),
    failureSummary: text("failure_summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.digestRunId] }),
    index("notification_center_digest_runs_tenant_status_idx").on(
      table.tenantScope,
      table.tenantScopeId,
      table.status,
    ),
  ],
);

export const notificationCenterDigestCandidatesTable = pgTable(
  "notification_center_digest_candidates",
  {
    candidateId: text("candidate_id").notNull(),
    sourceNotificationId: text("source_notification_id").notNull(),
    digestRunId: text("digest_run_id").notNull(),
    tenantScope: varchar("tenant_scope", { length: 32 }).notNull(),
    tenantScopeId: text("tenant_scope_id").notNull(),
    channel: varchar("channel", { length: 16 }).notNull(),
    recipient: text("recipient").notNull(),
    sourceTemplate: text("source_template").notNull(),
    digestTemplate: text("digest_template").notNull(),
    windowEndsAt: timestamp("window_ends_at", { withTimezone: true }).notNull(),
    invoiceNumber: text("invoice_number").notNull(),
    invoiceUrl: text("invoice_url").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    totalDue: text("total_due").notNull(),
    digestedAt: timestamp("digested_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.candidateId] }),
    index("notification_center_digest_candidates_run_idx").on(
      table.digestRunId,
      table.digestedAt,
      table.canceledAt,
    ),
    index("notification_center_digest_candidates_source_idx").on(
      table.sourceNotificationId,
    ),
  ],
);
