import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  type EmailDeliveryMessageReference,
  EmailDeliveryMessageReferenceSchema,
  type EmailDeliveryTrackingRecord,
  EmailDeliveryTrackingRecordSchema,
  type EmailRecipientSuppressionLookup,
  EmailRecipientSuppressionLookupSchema,
  type EmailRecipientSuppressionRecord,
  EmailRecipientSuppressionRecordSchema,
} from "@comvestec/contracts";
import {
  emailDeliveryTrackingTable,
  emailRecipientSuppressionsTable,
} from "./schema";

type EmailDeliveryTrackingRow = typeof emailDeliveryTrackingTable.$inferSelect;
type EmailRecipientSuppressionRow =
  typeof emailRecipientSuppressionsTable.$inferSelect;

type EmailDeliveryTrackingInsert =
  typeof emailDeliveryTrackingTable.$inferInsert;
type EmailRecipientSuppressionInsert =
  typeof emailRecipientSuppressionsTable.$inferInsert;

export type EmailDeliveryTrackedDeliveryUpdate = {
  readonly currentRecord: EmailDeliveryTrackingInsert;
  readonly nextRecord: EmailDeliveryTrackingInsert;
};

export type EmailRecipientSuppressionUpsert = {
  readonly currentRecord?: EmailRecipientSuppressionInsert;
  readonly nextRecord: EmailRecipientSuppressionInsert;
};

export type EmailDeliveryPostgresQueryable = {
  readonly createTrackedDelivery: (
    record: EmailDeliveryTrackingInsert,
  ) => Promise<EmailDeliveryTrackingRow>;
  readonly updateTrackedDelivery: (
    update: EmailDeliveryTrackedDeliveryUpdate,
  ) => Promise<EmailDeliveryTrackingRow | undefined>;
  readonly findTrackedDelivery: (
    input: EmailDeliveryMessageReference,
  ) => Promise<EmailDeliveryTrackingRow | undefined>;
  readonly findRecipientSuppression: (
    recipient: string,
  ) => Promise<EmailRecipientSuppressionRow | undefined>;
  readonly upsertRecipientSuppression: (
    update: EmailRecipientSuppressionUpsert,
  ) => Promise<EmailRecipientSuppressionRow>;
};

export type EmailDeliveryPostgresRepositoryQueryError = {
  readonly _tag: "EmailDeliveryPostgresRepositoryQueryError";
  readonly operation:
    | "createTrackedDelivery"
    | "updateTrackedDelivery"
    | "findTrackedDelivery"
    | "findRecipientSuppression"
    | "upsertRecipientSuppression";
  readonly cause: unknown;
};

export type EmailDeliveryPostgresRepositoryError =
  | ParseResult.ParseError
  | EmailDeliveryPostgresRepositoryQueryError;

const normalizeRecipient = (recipient: string) =>
  recipient.trim().toLowerCase();

const toIsoString = (value: Date | string | null | undefined) =>
  value == null
    ? undefined
    : value instanceof Date
      ? value.toISOString()
      : value;

const buildTrackedDeliveryRecord = (row: EmailDeliveryTrackingRow) =>
  Schema.decodeUnknown(EmailDeliveryTrackingRecordSchema)({
    messageId: row.messageId,
    provider: row.provider,
    tenantScope: row.tenantScope,
    tenantScopeId: row.tenantScopeId,
    recipient: row.recipient,
    status: row.status,
    ...(row.template != null ? { template: row.template } : {}),
    senderDisplayName: row.senderDisplayName,
    fromEmail: row.fromEmail,
    replyToEmail: row.replyToEmail,
    sentAt: toIsoString(row.sentAt) ?? new Date().toISOString(),
    ...(toIsoString(row.lastEventAt) !== undefined
      ? { lastEventAt: toIsoString(row.lastEventAt) }
      : {}),
    ...(row.bounceType != null ? { bounceType: row.bounceType } : {}),
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  });

const buildRecipientSuppressionRecord = (row: EmailRecipientSuppressionRow) =>
  Schema.decodeUnknown(EmailRecipientSuppressionRecordSchema)({
    suppressionId: row.suppressionId,
    recipient: row.recipient,
    reason: row.reason,
    sourceMessageId: row.sourceMessageId,
    ...(row.bounceType != null ? { bounceType: row.bounceType } : {}),
    suppressedAt: toIsoString(row.suppressedAt) ?? new Date().toISOString(),
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  });

const buildTrackedDeliveryRow = (
  record: EmailDeliveryTrackingRecord,
): EmailDeliveryTrackingInsert => ({
  messageId: record.messageId,
  provider: record.provider,
  tenantScope: record.tenantScope,
  tenantScopeId: record.tenantScopeId,
  recipient: normalizeRecipient(record.recipient),
  status: record.status,
  template: record.template ?? null,
  senderDisplayName: record.senderDisplayName,
  fromEmail: record.fromEmail,
  replyToEmail: record.replyToEmail,
  sentAt: new Date(record.sentAt),
  lastEventAt:
    record.lastEventAt === undefined ? null : new Date(record.lastEventAt),
  bounceType: record.bounceType ?? null,
  createdAt: new Date(record.createdAt),
  updatedAt: new Date(record.updatedAt),
});

const buildRecipientSuppressionRow = (
  record: EmailRecipientSuppressionRecord,
): EmailRecipientSuppressionInsert => ({
  suppressionId: record.suppressionId,
  recipient: normalizeRecipient(record.recipient),
  reason: record.reason,
  sourceMessageId: record.sourceMessageId,
  bounceType: record.bounceType ?? null,
  suppressedAt: new Date(record.suppressedAt),
  createdAt: new Date(record.createdAt),
  updatedAt: new Date(record.updatedAt),
});

export type UpdateTrackedDeliveryInput = {
  readonly currentRecord: EmailDeliveryTrackingRecord;
  readonly nextRecord: EmailDeliveryTrackingRecord;
};

export type UpsertRecipientSuppressionInput = {
  readonly currentRecord?: EmailRecipientSuppressionRecord;
  readonly nextRecord: EmailRecipientSuppressionRecord;
};

export type EmailDeliveryPostgresRepositoryService = {
  readonly createTrackedDelivery: (
    input: EmailDeliveryTrackingRecord,
  ) => Effect.Effect<
    EmailDeliveryTrackingRecord,
    EmailDeliveryPostgresRepositoryError
  >;
  readonly updateTrackedDelivery: (
    input: UpdateTrackedDeliveryInput,
  ) => Effect.Effect<
    EmailDeliveryTrackingRecord | undefined,
    EmailDeliveryPostgresRepositoryError
  >;
  readonly findTrackedDelivery: (
    input: EmailDeliveryMessageReference,
  ) => Effect.Effect<
    EmailDeliveryTrackingRecord | undefined,
    EmailDeliveryPostgresRepositoryError
  >;
  readonly findRecipientSuppression: (
    input: EmailRecipientSuppressionLookup,
  ) => Effect.Effect<
    EmailRecipientSuppressionRecord | undefined,
    EmailDeliveryPostgresRepositoryError
  >;
  readonly upsertRecipientSuppression: (
    input: UpsertRecipientSuppressionInput,
  ) => Effect.Effect<
    EmailRecipientSuppressionRecord,
    EmailDeliveryPostgresRepositoryError
  >;
};

export class EmailDeliveryPostgresRepository extends Context.Tag(
  "EmailDeliveryPostgresRepository",
)<EmailDeliveryPostgresRepository, EmailDeliveryPostgresRepositoryService>() {}

export const makeEmailDeliveryPostgresRepository = (
  database: EmailDeliveryPostgresQueryable,
) =>
  Effect.succeed<EmailDeliveryPostgresRepositoryService>({
    createTrackedDelivery: (input: EmailDeliveryTrackingRecord) =>
      Schema.decodeUnknown(EmailDeliveryTrackingRecordSchema)(input).pipe(
        Effect.flatMap((record) =>
          Effect.tryPromise({
            try: () =>
              database.createTrackedDelivery(buildTrackedDeliveryRow(record)),
            catch: (cause) =>
              ({
                _tag: "EmailDeliveryPostgresRepositoryQueryError",
                operation: "createTrackedDelivery",
                cause,
              }) satisfies EmailDeliveryPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) => buildTrackedDeliveryRecord(row)),
      ),
    updateTrackedDelivery: (input: UpdateTrackedDeliveryInput) =>
      Schema.decodeUnknown(
        Schema.Struct({
          currentRecord: EmailDeliveryTrackingRecordSchema,
          nextRecord: EmailDeliveryTrackingRecordSchema,
        }),
      )(input).pipe(
        Effect.flatMap((update) =>
          Effect.tryPromise({
            try: () =>
              database.updateTrackedDelivery({
                currentRecord: buildTrackedDeliveryRow(update.currentRecord),
                nextRecord: buildTrackedDeliveryRow(update.nextRecord),
              }),
            catch: (cause) =>
              ({
                _tag: "EmailDeliveryPostgresRepositoryQueryError",
                operation: "updateTrackedDelivery",
                cause,
              }) satisfies EmailDeliveryPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildTrackedDeliveryRecord(row),
        ),
      ),
    findTrackedDelivery: (input: EmailDeliveryMessageReference) =>
      Schema.decodeUnknown(EmailDeliveryMessageReferenceSchema)(input).pipe(
        Effect.flatMap((reference) =>
          Effect.tryPromise({
            try: () => database.findTrackedDelivery(reference),
            catch: (cause) =>
              ({
                _tag: "EmailDeliveryPostgresRepositoryQueryError",
                operation: "findTrackedDelivery",
                cause,
              }) satisfies EmailDeliveryPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildTrackedDeliveryRecord(row),
        ),
      ),
    findRecipientSuppression: (input: EmailRecipientSuppressionLookup) =>
      Schema.decodeUnknown(EmailRecipientSuppressionLookupSchema)(input).pipe(
        Effect.flatMap((reference) =>
          Effect.tryPromise({
            try: () =>
              database.findRecipientSuppression(
                normalizeRecipient(reference.recipient),
              ),
            catch: (cause) =>
              ({
                _tag: "EmailDeliveryPostgresRepositoryQueryError",
                operation: "findRecipientSuppression",
                cause,
              }) satisfies EmailDeliveryPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildRecipientSuppressionRecord(row),
        ),
      ),
    upsertRecipientSuppression: (input: UpsertRecipientSuppressionInput) =>
      Schema.decodeUnknown(
        Schema.Struct({
          currentRecord: Schema.optional(EmailRecipientSuppressionRecordSchema),
          nextRecord: EmailRecipientSuppressionRecordSchema,
        }),
      )(input).pipe(
        Effect.flatMap((update) =>
          Effect.tryPromise({
            try: () =>
              database.upsertRecipientSuppression({
                ...(update.currentRecord !== undefined
                  ? {
                      currentRecord: buildRecipientSuppressionRow(
                        update.currentRecord,
                      ),
                    }
                  : {}),
                nextRecord: buildRecipientSuppressionRow(update.nextRecord),
              }),
            catch: (cause) =>
              ({
                _tag: "EmailDeliveryPostgresRepositoryQueryError",
                operation: "upsertRecipientSuppression",
                cause,
              }) satisfies EmailDeliveryPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) => buildRecipientSuppressionRecord(row)),
      ),
  });

export const makeEmailDeliveryPostgresRepositoryLayer = (
  database: EmailDeliveryPostgresQueryable,
) =>
  Layer.effect(
    EmailDeliveryPostgresRepository,
    makeEmailDeliveryPostgresRepository(database),
  );
