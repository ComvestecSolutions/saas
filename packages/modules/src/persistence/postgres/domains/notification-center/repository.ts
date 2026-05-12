import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  type NotificationCenterDigestCandidateRecord,
  NotificationCenterDigestCandidateRecordSchema,
  type NotificationCenterDigestRunRecord,
  NotificationCenterDigestRunRecordSchema,
  type NotificationCenterDigestRunReference,
  NotificationCenterDigestRunReferenceSchema,
  type NotificationCenterEmailPreferenceRecord,
  NotificationCenterEmailPreferenceRecordSchema,
  type NotificationCenterEmailPreferenceReference,
  NotificationCenterEmailPreferenceReferenceSchema,
  type NotificationCenterEmailReceiptReference,
  NotificationCenterEmailReceiptReferenceSchema,
  type NotificationCenterEmailReceiptRecord,
  NotificationCenterEmailReceiptRecordSchema,
} from "@comvestec/contracts";
import {
  notificationCenterDigestCandidatesTable,
  notificationCenterDigestRunsTable,
  notificationCenterEmailPreferencesTable,
  notificationCenterEmailReceiptsTable,
} from "./schema";

type NotificationCenterEmailReceiptRow =
  typeof notificationCenterEmailReceiptsTable.$inferSelect;
type NotificationCenterEmailPreferenceRow =
  typeof notificationCenterEmailPreferencesTable.$inferSelect;
type NotificationCenterDigestRunRow =
  typeof notificationCenterDigestRunsTable.$inferSelect;
type NotificationCenterDigestCandidateRow =
  typeof notificationCenterDigestCandidatesTable.$inferSelect;
type NotificationCenterEmailReceiptInsert =
  typeof notificationCenterEmailReceiptsTable.$inferInsert;
type NotificationCenterEmailPreferenceInsert =
  typeof notificationCenterEmailPreferencesTable.$inferInsert;
type NotificationCenterDigestRunInsert =
  typeof notificationCenterDigestRunsTable.$inferInsert;
type NotificationCenterDigestCandidateInsert =
  typeof notificationCenterDigestCandidatesTable.$inferInsert;

export type NotificationCenterPostgresQueryable = {
  readonly createEmailReceipt: (
    record: NotificationCenterEmailReceiptInsert,
  ) => Promise<NotificationCenterEmailReceiptRow>;
  readonly findDigestRun: (
    input: NotificationCenterDigestRunReference,
  ) => Promise<NotificationCenterDigestRunRow | undefined>;
  readonly listDigestCandidatesByDigestRun: (input: {
    readonly digestRunId: string;
  }) => Promise<readonly NotificationCenterDigestCandidateRow[]>;
  readonly findEmailReceipt: (
    input: NotificationCenterEmailReceiptReference,
  ) => Promise<NotificationCenterEmailReceiptRow | undefined>;
  readonly findEmailPreference: (
    input: NotificationCenterEmailPreferenceReference,
  ) => Promise<NotificationCenterEmailPreferenceRow | undefined>;
  readonly upsertDigestCandidate: (
    record: NotificationCenterDigestCandidateInsert,
  ) => Promise<NotificationCenterDigestCandidateRow>;
  readonly upsertDigestRun: (
    record: NotificationCenterDigestRunInsert,
  ) => Promise<NotificationCenterDigestRunRow>;
  readonly upsertEmailPreference: (
    record: NotificationCenterEmailPreferenceInsert,
  ) => Promise<NotificationCenterEmailPreferenceRow>;
};

export type NotificationCenterPostgresRepositoryQueryError = {
  readonly _tag: "NotificationCenterPostgresRepositoryQueryError";
  readonly operation:
    | "createEmailReceipt"
    | "findDigestRun"
    | "findEmailReceipt"
    | "listDigestCandidatesByDigestRun"
    | "upsertDigestCandidate"
    | "upsertDigestRun";
  readonly cause: unknown;
};

export type NotificationCenterPostgresPreferenceQueryError = {
  readonly _tag: "NotificationCenterPostgresRepositoryQueryError";
  readonly operation: "findEmailPreference" | "upsertEmailPreference";
  readonly cause: unknown;
};

export type NotificationCenterPostgresRepositoryError =
  | ParseResult.ParseError
  | NotificationCenterPostgresRepositoryQueryError
  | NotificationCenterPostgresPreferenceQueryError;

const normalizeRecipient = (recipient: string) =>
  recipient.trim().toLowerCase();

const toIsoString = (value: Date | string | null | undefined) =>
  value == null
    ? undefined
    : value instanceof Date
      ? value.toISOString()
      : value;

const buildEmailReceiptRecord = (row: NotificationCenterEmailReceiptRow) =>
  Schema.decodeUnknown(NotificationCenterEmailReceiptRecordSchema)({
    notificationId: row.notificationId,
    tenantScope: row.tenantScope,
    tenantScopeId: row.tenantScopeId,
    channel: row.channel,
    recipient: row.recipient,
    template: row.template,
    status: row.status,
    ...(row.emailDeliveryMessageId != null
      ? { emailDeliveryMessageId: row.emailDeliveryMessageId }
      : {}),
    ...(row.queueReceiptId != null
      ? { queueReceiptId: row.queueReceiptId }
      : {}),
    ...(row.queueFailureSummary != null
      ? { queueFailureSummary: row.queueFailureSummary }
      : {}),
    ...(row.suppressionReason != null
      ? { suppressionReason: row.suppressionReason }
      : {}),
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  });

const buildEmailPreferenceRecord = (
  row: NotificationCenterEmailPreferenceRow,
) =>
  Schema.decodeUnknown(NotificationCenterEmailPreferenceRecordSchema)({
    tenantScope: row.tenantScope,
    tenantScopeId: row.tenantScopeId,
    channel: row.channel,
    recipient: row.recipient,
    template: row.template,
    enabled: row.enabled,
    updatedBy: row.updatedBy,
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  });

const buildDigestRunRecord = (row: NotificationCenterDigestRunRow) =>
  Schema.decodeUnknown(NotificationCenterDigestRunRecordSchema)({
    digestRunId: row.digestRunId,
    tenantScope: row.tenantScope,
    tenantScopeId: row.tenantScopeId,
    recipient: row.recipient,
    channel: row.channel,
    template: row.template,
    scheduledAt: toIsoString(row.scheduledAt) ?? new Date().toISOString(),
    ...(row.startedAt != null ? { startedAt: toIsoString(row.startedAt) } : {}),
    ...(row.completedAt != null
      ? { completedAt: toIsoString(row.completedAt) }
      : {}),
    status: row.status,
    itemCount: row.itemCount,
    ...(row.emailDeliveryMessageId != null
      ? { emailDeliveryMessageId: row.emailDeliveryMessageId }
      : {}),
    ...(row.queueReceiptId != null
      ? { queueReceiptId: row.queueReceiptId }
      : {}),
    ...(row.failureSummary != null
      ? { failureSummary: row.failureSummary }
      : {}),
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  });

const buildDigestCandidateRecord = (
  row: NotificationCenterDigestCandidateRow,
) =>
  Schema.decodeUnknown(NotificationCenterDigestCandidateRecordSchema)({
    candidateId: row.candidateId,
    sourceNotificationId: row.sourceNotificationId,
    digestRunId: row.digestRunId,
    tenantScope: row.tenantScope,
    tenantScopeId: row.tenantScopeId,
    channel: row.channel,
    recipient: row.recipient,
    sourceTemplate: row.sourceTemplate,
    digestTemplate: row.digestTemplate,
    windowEndsAt: toIsoString(row.windowEndsAt) ?? new Date().toISOString(),
    invoiceNumber: row.invoiceNumber,
    invoiceUrl: row.invoiceUrl,
    dueAt: toIsoString(row.dueAt) ?? new Date().toISOString(),
    totalDue: row.totalDue,
    ...(row.digestedAt != null
      ? { digestedAt: toIsoString(row.digestedAt) }
      : {}),
    ...(row.canceledAt != null
      ? { canceledAt: toIsoString(row.canceledAt) }
      : {}),
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  });

const buildEmailReceiptRow = (
  record: NotificationCenterEmailReceiptRecord,
): NotificationCenterEmailReceiptInsert => ({
  notificationId: record.notificationId,
  tenantScope: record.tenantScope,
  tenantScopeId: record.tenantScopeId,
  channel: record.channel,
  recipient: normalizeRecipient(record.recipient),
  template: record.template,
  status: record.status,
  emailDeliveryMessageId: record.emailDeliveryMessageId ?? null,
  queueReceiptId: record.queueReceiptId ?? null,
  queueFailureSummary: record.queueFailureSummary ?? null,
  suppressionReason: record.suppressionReason ?? null,
  createdAt: new Date(record.createdAt),
  updatedAt: new Date(record.updatedAt),
});

const buildEmailPreferenceRow = (
  record: NotificationCenterEmailPreferenceRecord,
): NotificationCenterEmailPreferenceInsert => ({
  tenantScope: record.tenantScope,
  tenantScopeId: record.tenantScopeId,
  channel: record.channel,
  recipient: normalizeRecipient(record.recipient),
  template: record.template,
  enabled: record.enabled,
  updatedBy: record.updatedBy,
  createdAt: new Date(record.createdAt),
  updatedAt: new Date(record.updatedAt),
});

const buildDigestRunRow = (
  record: NotificationCenterDigestRunRecord,
): NotificationCenterDigestRunInsert => ({
  digestRunId: record.digestRunId,
  tenantScope: record.tenantScope,
  tenantScopeId: record.tenantScopeId,
  recipient: normalizeRecipient(record.recipient),
  channel: record.channel,
  template: record.template,
  scheduledAt: new Date(record.scheduledAt),
  startedAt: record.startedAt == null ? null : new Date(record.startedAt),
  completedAt: record.completedAt == null ? null : new Date(record.completedAt),
  status: record.status,
  itemCount: record.itemCount,
  emailDeliveryMessageId: record.emailDeliveryMessageId ?? null,
  queueReceiptId: record.queueReceiptId ?? null,
  failureSummary: record.failureSummary ?? null,
  createdAt: new Date(record.createdAt),
  updatedAt: new Date(record.updatedAt),
});

const buildDigestCandidateRow = (
  record: NotificationCenterDigestCandidateRecord,
): NotificationCenterDigestCandidateInsert => ({
  candidateId: record.candidateId,
  sourceNotificationId: record.sourceNotificationId,
  digestRunId: record.digestRunId,
  tenantScope: record.tenantScope,
  tenantScopeId: record.tenantScopeId,
  channel: record.channel,
  recipient: normalizeRecipient(record.recipient),
  sourceTemplate: record.sourceTemplate,
  digestTemplate: record.digestTemplate,
  windowEndsAt: new Date(record.windowEndsAt),
  invoiceNumber: record.invoiceNumber,
  invoiceUrl: record.invoiceUrl,
  dueAt: new Date(record.dueAt),
  totalDue: record.totalDue,
  digestedAt: record.digestedAt == null ? null : new Date(record.digestedAt),
  canceledAt: record.canceledAt == null ? null : new Date(record.canceledAt),
  createdAt: new Date(record.createdAt),
  updatedAt: new Date(record.updatedAt),
});

export type NotificationCenterPostgresRepositoryService = {
  readonly createEmailReceipt: (
    input: NotificationCenterEmailReceiptRecord,
  ) => Effect.Effect<
    NotificationCenterEmailReceiptRecord,
    NotificationCenterPostgresRepositoryError
  >;
  readonly findDigestRun: (
    input: NotificationCenterDigestRunReference,
  ) => Effect.Effect<
    NotificationCenterDigestRunRecord | undefined,
    NotificationCenterPostgresRepositoryError
  >;
  readonly listDigestCandidatesByDigestRun: (input: {
    readonly digestRunId: string;
  }) => Effect.Effect<
    readonly NotificationCenterDigestCandidateRecord[],
    NotificationCenterPostgresRepositoryError
  >;
  readonly findEmailReceipt: (
    input: NotificationCenterEmailReceiptReference,
  ) => Effect.Effect<
    NotificationCenterEmailReceiptRecord | undefined,
    NotificationCenterPostgresRepositoryError
  >;
  readonly findEmailPreference: (
    input: NotificationCenterEmailPreferenceReference,
  ) => Effect.Effect<
    NotificationCenterEmailPreferenceRecord | undefined,
    NotificationCenterPostgresRepositoryError
  >;
  readonly upsertDigestCandidate: (
    input: NotificationCenterDigestCandidateRecord,
  ) => Effect.Effect<
    NotificationCenterDigestCandidateRecord,
    NotificationCenterPostgresRepositoryError
  >;
  readonly upsertDigestRun: (
    input: NotificationCenterDigestRunRecord,
  ) => Effect.Effect<
    NotificationCenterDigestRunRecord,
    NotificationCenterPostgresRepositoryError
  >;
  readonly upsertEmailPreference: (
    input: NotificationCenterEmailPreferenceRecord,
  ) => Effect.Effect<
    NotificationCenterEmailPreferenceRecord,
    NotificationCenterPostgresRepositoryError
  >;
};

export class NotificationCenterPostgresRepository extends Context.Tag(
  "NotificationCenterPostgresRepository",
)<
  NotificationCenterPostgresRepository,
  NotificationCenterPostgresRepositoryService
>() {}

export const makeNotificationCenterPostgresRepository = (
  database: NotificationCenterPostgresQueryable,
) =>
  Effect.succeed<NotificationCenterPostgresRepositoryService>({
    createEmailReceipt: (input: NotificationCenterEmailReceiptRecord) =>
      Schema.decodeUnknown(NotificationCenterEmailReceiptRecordSchema)(
        input,
      ).pipe(
        Effect.flatMap((record) =>
          Effect.tryPromise({
            try: () =>
              database.createEmailReceipt(buildEmailReceiptRow(record)),
            catch: (cause) =>
              ({
                _tag: "NotificationCenterPostgresRepositoryQueryError",
                operation: "createEmailReceipt",
                cause,
              }) satisfies NotificationCenterPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) => buildEmailReceiptRecord(row)),
      ),
    findDigestRun: (input: NotificationCenterDigestRunReference) =>
      Schema.decodeUnknown(NotificationCenterDigestRunReferenceSchema)(
        input,
      ).pipe(
        Effect.flatMap((reference) =>
          Effect.tryPromise({
            try: () => database.findDigestRun(reference),
            catch: (cause) =>
              ({
                _tag: "NotificationCenterPostgresRepositoryQueryError",
                operation: "findDigestRun",
                cause,
              }) satisfies NotificationCenterPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildDigestRunRecord(row),
        ),
      ),
    findEmailReceipt: (input: NotificationCenterEmailReceiptReference) =>
      Schema.decodeUnknown(NotificationCenterEmailReceiptReferenceSchema)(
        input,
      ).pipe(
        Effect.flatMap((reference) =>
          Effect.tryPromise({
            try: () => database.findEmailReceipt(reference),
            catch: (cause) =>
              ({
                _tag: "NotificationCenterPostgresRepositoryQueryError",
                operation: "findEmailReceipt",
                cause,
              }) satisfies NotificationCenterPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildEmailReceiptRecord(row),
        ),
      ),
    listDigestCandidatesByDigestRun: (input: {
      readonly digestRunId: string;
    }) =>
      Schema.decodeUnknown(NotificationCenterDigestRunReferenceSchema)({
        digestRunId: input.digestRunId,
      }).pipe(
        Effect.flatMap((reference) =>
          Effect.tryPromise({
            try: () =>
              database.listDigestCandidatesByDigestRun({
                digestRunId: reference.digestRunId,
              }),
            catch: (cause) =>
              ({
                _tag: "NotificationCenterPostgresRepositoryQueryError",
                operation: "listDigestCandidatesByDigestRun",
                cause,
              }) satisfies NotificationCenterPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((rows) =>
          Effect.forEach(rows, (row) => buildDigestCandidateRecord(row), {
            concurrency: 1,
          }),
        ),
      ),
    findEmailPreference: (input: NotificationCenterEmailPreferenceReference) =>
      Schema.decodeUnknown(NotificationCenterEmailPreferenceReferenceSchema)(
        input,
      ).pipe(
        Effect.flatMap((reference) =>
          Effect.tryPromise({
            try: () =>
              database.findEmailPreference({
                ...reference,
                recipient: normalizeRecipient(reference.recipient),
              }),
            catch: (cause) =>
              ({
                _tag: "NotificationCenterPostgresRepositoryQueryError",
                operation: "findEmailPreference",
                cause,
              }) satisfies NotificationCenterPostgresPreferenceQueryError,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildEmailPreferenceRecord(row),
        ),
      ),
    upsertDigestCandidate: (input: NotificationCenterDigestCandidateRecord) =>
      Schema.decodeUnknown(NotificationCenterDigestCandidateRecordSchema)(
        input,
      ).pipe(
        Effect.flatMap((record) =>
          Effect.tryPromise({
            try: () =>
              database.upsertDigestCandidate(buildDigestCandidateRow(record)),
            catch: (cause) =>
              ({
                _tag: "NotificationCenterPostgresRepositoryQueryError",
                operation: "upsertDigestCandidate",
                cause,
              }) satisfies NotificationCenterPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) => buildDigestCandidateRecord(row)),
      ),
    upsertDigestRun: (input: NotificationCenterDigestRunRecord) =>
      Schema.decodeUnknown(NotificationCenterDigestRunRecordSchema)(input).pipe(
        Effect.flatMap((record) =>
          Effect.tryPromise({
            try: () => database.upsertDigestRun(buildDigestRunRow(record)),
            catch: (cause) =>
              ({
                _tag: "NotificationCenterPostgresRepositoryQueryError",
                operation: "upsertDigestRun",
                cause,
              }) satisfies NotificationCenterPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) => buildDigestRunRecord(row)),
      ),
    upsertEmailPreference: (input: NotificationCenterEmailPreferenceRecord) =>
      Schema.decodeUnknown(NotificationCenterEmailPreferenceRecordSchema)(
        input,
      ).pipe(
        Effect.flatMap((record) =>
          Effect.tryPromise({
            try: () =>
              database.upsertEmailPreference(buildEmailPreferenceRow(record)),
            catch: (cause) =>
              ({
                _tag: "NotificationCenterPostgresRepositoryQueryError",
                operation: "upsertEmailPreference",
                cause,
              }) satisfies NotificationCenterPostgresPreferenceQueryError,
          }),
        ),
        Effect.flatMap((row) => buildEmailPreferenceRecord(row)),
      ),
  });

export const makeNotificationCenterPostgresRepositoryLayer = (
  database: NotificationCenterPostgresQueryable,
) =>
  Layer.effect(
    NotificationCenterPostgresRepository,
    makeNotificationCenterPostgresRepository(database),
  );
