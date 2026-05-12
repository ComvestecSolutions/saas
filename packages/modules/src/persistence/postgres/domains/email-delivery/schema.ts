import { emailDeliveryStatus } from "@comvestec/contracts";
import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const emailDeliveryTrackingTable = pgTable(
  "email_delivery_tracking",
  {
    messageId: text("message_id").notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    tenantScope: varchar("tenant_scope", { length: 32 }).notNull(),
    tenantScopeId: text("tenant_scope_id").notNull(),
    recipient: text("recipient").notNull(),
    status: varchar("status", { length: 32 })
      .notNull()
      .default(emailDeliveryStatus.queued),
    template: text("template"),
    senderDisplayName: text("sender_display_name").notNull(),
    fromEmail: text("from_email").notNull(),
    replyToEmail: text("reply_to_email").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    bounceType: varchar("bounce_type", { length: 16 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId] }),
    index("email_delivery_tracking_tenant_sent_idx").on(
      table.tenantScope,
      table.tenantScopeId,
      table.sentAt,
    ),
    index("email_delivery_tracking_status_idx").on(table.status, table.sentAt),
  ],
);

export const emailRecipientSuppressionsTable = pgTable(
  "email_recipient_suppressions",
  {
    suppressionId: text("suppression_id").notNull(),
    recipient: text("recipient").notNull(),
    reason: varchar("reason", { length: 32 }).notNull(),
    sourceMessageId: text("source_message_id").notNull(),
    bounceType: varchar("bounce_type", { length: 16 }),
    suppressedAt: timestamp("suppressed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.suppressionId] }),
    uniqueIndex("email_recipient_suppressions_recipient_idx").on(
      table.recipient,
    ),
  ],
);
