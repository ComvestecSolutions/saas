import { and, eq, sql } from "drizzle-orm";
import type {
  NotificationCenterDigestRunReference,
  NotificationCenterEmailReceiptReference,
} from "@comvestec/contracts";
import type { PostgresDatabase } from "../../database";
import {
  notificationCenterDigestCandidatesTable,
  notificationCenterDigestRunsTable,
  notificationCenterEmailPreferencesTable,
  notificationCenterEmailReceiptsTable,
} from "./schema";
import type { NotificationCenterPostgresQueryable } from "./repository";

type EmailPreferenceRowLookup = {
  readonly tenantScope: string;
  readonly tenantScopeId: string;
  readonly recipient: string;
  readonly template: string;
};

const selectEmailReceiptRow = async (
  database: PostgresDatabase,
  notificationId: string,
) => {
  const rows = await database
    .select()
    .from(notificationCenterEmailReceiptsTable)
    .where(
      eq(notificationCenterEmailReceiptsTable.notificationId, notificationId),
    );

  return rows[0];
};

const requireEmailReceiptRow = (
  row: typeof notificationCenterEmailReceiptsTable.$inferSelect | undefined,
  notificationId: string,
) => {
  if (row === undefined) {
    throw new Error(
      `Expected notification-center email receipt row for ${notificationId}.`,
    );
  }

  return row;
};

const selectEmailPreferenceRow = async (
  database: PostgresDatabase,
  input: EmailPreferenceRowLookup,
) => {
  const rows = await database
    .select()
    .from(notificationCenterEmailPreferencesTable)
    .where(
      and(
        eq(
          notificationCenterEmailPreferencesTable.tenantScope,
          input.tenantScope,
        ),
        eq(
          notificationCenterEmailPreferencesTable.tenantScopeId,
          input.tenantScopeId,
        ),
        eq(notificationCenterEmailPreferencesTable.channel, "email"),
        eq(notificationCenterEmailPreferencesTable.recipient, input.recipient),
        eq(notificationCenterEmailPreferencesTable.template, input.template),
      ),
    );

  return rows[0];
};

const requireEmailPreferenceRow = (
  row: typeof notificationCenterEmailPreferencesTable.$inferSelect | undefined,
  input: EmailPreferenceRowLookup,
) => {
  if (row === undefined) {
    throw new Error(
      `Expected notification-center email preference row for ${input.tenantScope}:${input.tenantScopeId}:${input.recipient}:${input.template}.`,
    );
  }

  return row;
};

const selectDigestRunRow = async (
  database: PostgresDatabase,
  digestRunId: string,
) => {
  const rows = await database
    .select()
    .from(notificationCenterDigestRunsTable)
    .where(eq(notificationCenterDigestRunsTable.digestRunId, digestRunId));

  return rows[0];
};

const requireDigestRunRow = (
  row: typeof notificationCenterDigestRunsTable.$inferSelect | undefined,
  digestRunId: string,
) => {
  if (row === undefined) {
    throw new Error(
      `Expected notification-center digest run row for ${digestRunId}.`,
    );
  }

  return row;
};

const selectDigestCandidateRows = async (
  database: PostgresDatabase,
  digestRunId: string,
) =>
  database
    .select()
    .from(notificationCenterDigestCandidatesTable)
    .where(
      eq(notificationCenterDigestCandidatesTable.digestRunId, digestRunId),
    );

const selectDigestCandidateRow = async (
  database: PostgresDatabase,
  candidateId: string,
) => {
  const rows = await database
    .select()
    .from(notificationCenterDigestCandidatesTable)
    .where(
      eq(notificationCenterDigestCandidatesTable.candidateId, candidateId),
    );

  return rows[0];
};

const requireDigestCandidateRow = (
  row: typeof notificationCenterDigestCandidatesTable.$inferSelect | undefined,
  candidateId: string,
) => {
  if (row === undefined) {
    throw new Error(
      `Expected notification-center digest candidate row for ${candidateId}.`,
    );
  }

  return row;
};

export const buildNotificationCenterPostgresQueryable = (
  database: PostgresDatabase,
): NotificationCenterPostgresQueryable => ({
  createEmailReceipt: async (record) => {
    await database
      .insert(notificationCenterEmailReceiptsTable)
      .values(record)
      .execute();

    return requireEmailReceiptRow(
      await selectEmailReceiptRow(database, record.notificationId),
      record.notificationId,
    );
  },
  findEmailReceipt: async ({
    notificationId,
  }: NotificationCenterEmailReceiptReference) =>
    selectEmailReceiptRow(database, notificationId),
  findDigestRun: async ({
    digestRunId,
  }: NotificationCenterDigestRunReference) =>
    selectDigestRunRow(database, digestRunId),
  listDigestCandidatesByDigestRun: async ({ digestRunId }) =>
    selectDigestCandidateRows(database, digestRunId),
  findEmailPreference: async (input) =>
    selectEmailPreferenceRow(database, input),
  upsertDigestCandidate: async (record) => {
    await database
      .insert(notificationCenterDigestCandidatesTable)
      .values(record)
      .onConflictDoUpdate({
        target: [notificationCenterDigestCandidatesTable.candidateId],
        set: {
          sourceNotificationId: sql`excluded.source_notification_id`,
          digestRunId: sql`excluded.digest_run_id`,
          tenantScope: sql`excluded.tenant_scope`,
          tenantScopeId: sql`excluded.tenant_scope_id`,
          channel: sql`excluded.channel`,
          recipient: sql`excluded.recipient`,
          sourceTemplate: sql`excluded.source_template`,
          digestTemplate: sql`excluded.digest_template`,
          windowEndsAt: sql`excluded.window_ends_at`,
          invoiceNumber: sql`excluded.invoice_number`,
          invoiceUrl: sql`excluded.invoice_url`,
          dueAt: sql`excluded.due_at`,
          totalDue: sql`excluded.total_due`,
          digestedAt: sql`excluded.digested_at`,
          canceledAt: sql`excluded.canceled_at`,
          createdAt: sql`${notificationCenterDigestCandidatesTable.createdAt}`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .execute();

    return requireDigestCandidateRow(
      await selectDigestCandidateRow(database, record.candidateId),
      record.candidateId,
    );
  },
  upsertDigestRun: async (record) => {
    await database
      .insert(notificationCenterDigestRunsTable)
      .values(record)
      .onConflictDoUpdate({
        target: [notificationCenterDigestRunsTable.digestRunId],
        set: {
          tenantScope: sql`excluded.tenant_scope`,
          tenantScopeId: sql`excluded.tenant_scope_id`,
          recipient: sql`excluded.recipient`,
          channel: sql`excluded.channel`,
          template: sql`excluded.template`,
          scheduledAt: sql`excluded.scheduled_at`,
          startedAt: sql`excluded.started_at`,
          completedAt: sql`excluded.completed_at`,
          status: sql`excluded.status`,
          itemCount: sql`excluded.item_count`,
          emailDeliveryMessageId: sql`excluded.email_delivery_message_id`,
          queueReceiptId: sql`excluded.queue_receipt_id`,
          failureSummary: sql`excluded.failure_summary`,
          createdAt: sql`${notificationCenterDigestRunsTable.createdAt}`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .execute();

    return requireDigestRunRow(
      await selectDigestRunRow(database, record.digestRunId),
      record.digestRunId,
    );
  },
  upsertEmailPreference: async (record) => {
    await database
      .insert(notificationCenterEmailPreferencesTable)
      .values(record)
      .onConflictDoUpdate({
        target: [
          notificationCenterEmailPreferencesTable.tenantScope,
          notificationCenterEmailPreferencesTable.tenantScopeId,
          notificationCenterEmailPreferencesTable.channel,
          notificationCenterEmailPreferencesTable.recipient,
          notificationCenterEmailPreferencesTable.template,
        ],
        set: {
          enabled: sql`excluded.enabled`,
          updatedBy: sql`excluded.updated_by`,
          createdAt: sql`${notificationCenterEmailPreferencesTable.createdAt}`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .execute();

    return requireEmailPreferenceRow(
      await selectEmailPreferenceRow(database, {
        tenantScope: record.tenantScope,
        tenantScopeId: record.tenantScopeId,
        recipient: record.recipient,
        template: record.template,
      }),
      {
        tenantScope: record.tenantScope,
        tenantScopeId: record.tenantScopeId,
        recipient: record.recipient,
        template: record.template,
      },
    );
  },
});
