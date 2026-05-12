import { and, eq, sql } from "drizzle-orm";
import { emailSuppressionReason } from "@comvestec/contracts";
import type { PostgresDatabase } from "../../database";
import {
  emailDeliveryTrackingTable,
  emailRecipientSuppressionsTable,
} from "./schema";
import type { EmailDeliveryPostgresQueryable } from "./repository";

const selectTrackedDeliveryRow = async (
  database: PostgresDatabase,
  messageId: string,
) => {
  const rows = await database
    .select()
    .from(emailDeliveryTrackingTable)
    .where(eq(emailDeliveryTrackingTable.messageId, messageId));

  return rows[0];
};

const selectRecipientSuppressionRow = async (
  database: PostgresDatabase,
  recipient: string,
) => {
  const rows = await database
    .select()
    .from(emailRecipientSuppressionsTable)
    .where(eq(emailRecipientSuppressionsTable.recipient, recipient));

  return rows[0];
};

const requireTrackedDeliveryRow = (
  row: typeof emailDeliveryTrackingTable.$inferSelect | undefined,
  messageId: string,
) => {
  if (row === undefined) {
    throw new Error(
      `Expected email delivery tracking row for message ${messageId}.`,
    );
  }

  return row;
};

const requireRecipientSuppressionRow = (
  row: typeof emailRecipientSuppressionsTable.$inferSelect | undefined,
  recipient: string,
) => {
  if (row === undefined) {
    throw new Error(
      `Expected email recipient suppression row for recipient ${recipient}.`,
    );
  }

  return row;
};

const buildTrackedDeliveryUpdatePredicate = (
  update: Parameters<
    EmailDeliveryPostgresQueryable["updateTrackedDelivery"]
  >[0],
) => {
  const expectedUpdatedAt =
    update.currentRecord.updatedAt instanceof Date
      ? update.currentRecord.updatedAt
      : new Date(String(update.currentRecord.updatedAt));

  return and(
    eq(emailDeliveryTrackingTable.messageId, update.currentRecord.messageId),
    eq(emailDeliveryTrackingTable.updatedAt, expectedUpdatedAt),
  );
};

const keepExistingSuppressionSql = sql`
  ${emailRecipientSuppressionsTable.suppressedAt} > excluded.suppressed_at
  or (
    ${emailRecipientSuppressionsTable.suppressedAt} = excluded.suppressed_at
    and (
      case
        when ${emailRecipientSuppressionsTable.reason} = ${emailSuppressionReason.complained} then 1
        else 0
      end
    ) >= (
      case
        when excluded.reason = ${emailSuppressionReason.complained} then 1
        else 0
      end
    )
  )
`;

export const buildEmailDeliveryPostgresQueryable = (
  database: PostgresDatabase,
): EmailDeliveryPostgresQueryable => ({
  createTrackedDelivery: async (record) => {
    await database.insert(emailDeliveryTrackingTable).values(record).execute();

    return requireTrackedDeliveryRow(
      await selectTrackedDeliveryRow(database, record.messageId),
      record.messageId,
    );
  },
  updateTrackedDelivery: async (update) => {
    const rows = await database
      .update(emailDeliveryTrackingTable)
      .set({
        provider: update.nextRecord.provider,
        tenantScope: update.nextRecord.tenantScope,
        tenantScopeId: update.nextRecord.tenantScopeId,
        recipient: update.nextRecord.recipient,
        status: update.nextRecord.status,
        template: update.nextRecord.template,
        senderDisplayName: update.nextRecord.senderDisplayName,
        fromEmail: update.nextRecord.fromEmail,
        replyToEmail: update.nextRecord.replyToEmail,
        sentAt: update.nextRecord.sentAt,
        lastEventAt: update.nextRecord.lastEventAt,
        bounceType: update.nextRecord.bounceType,
        createdAt: update.nextRecord.createdAt,
        updatedAt: update.nextRecord.updatedAt,
      })
      .where(buildTrackedDeliveryUpdatePredicate(update))
      .returning();

    if (rows[0] !== undefined) {
      return rows[0];
    }

    return selectTrackedDeliveryRow(database, update.currentRecord.messageId);
  },
  findTrackedDelivery: async ({ messageId }) =>
    selectTrackedDeliveryRow(database, messageId),
  findRecipientSuppression: async (recipient) =>
    selectRecipientSuppressionRow(database, recipient),
  upsertRecipientSuppression: async (update) => {
    await database
      .insert(emailRecipientSuppressionsTable)
      .values(update.nextRecord)
      .onConflictDoUpdate({
        target: emailRecipientSuppressionsTable.recipient,
        set: {
          reason: sql`case when ${keepExistingSuppressionSql} then ${emailRecipientSuppressionsTable.reason} else excluded.reason end`,
          sourceMessageId: sql`case when ${keepExistingSuppressionSql} then ${emailRecipientSuppressionsTable.sourceMessageId} else excluded.source_message_id end`,
          bounceType: sql`case when ${keepExistingSuppressionSql} then ${emailRecipientSuppressionsTable.bounceType} else excluded.bounce_type end`,
          suppressedAt: sql`case when ${keepExistingSuppressionSql} then ${emailRecipientSuppressionsTable.suppressedAt} else excluded.suppressed_at end`,
          createdAt: sql`${emailRecipientSuppressionsTable.createdAt}`,
          updatedAt: sql`case when ${keepExistingSuppressionSql} then ${emailRecipientSuppressionsTable.updatedAt} else excluded.updated_at end`,
        },
      })
      .execute();

    return requireRecipientSuppressionRow(
      await selectRecipientSuppressionRow(
        database,
        update.nextRecord.recipient,
      ),
      update.nextRecord.recipient,
    );
  },
});
