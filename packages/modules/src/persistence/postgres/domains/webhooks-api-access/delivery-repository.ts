import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  type WebhookOutboundDeliveryRecord,
  WebhookOutboundDeliveryRecordListSchema,
  WebhookOutboundDeliveryRecordSchema,
} from "@comvestec/contracts";
import { webhookOutboundDeliveriesTable } from "./schema";

const WebhookOutboundDeliveryLookupSchema = Schema.Struct({
  deliveryId: Schema.NonEmptyString,
});

const WebhookOutboundDeliveryScopeLookupSchema = Schema.Struct({
  scope: WebhookOutboundDeliveryRecordSchema.fields.scope,
  scopeId: Schema.NonEmptyString,
});

const UpdateWebhookOutboundDeliveryInputSchema = Schema.Struct({
  record: WebhookOutboundDeliveryRecordSchema,
  expectedCurrentRecord: WebhookOutboundDeliveryRecordSchema,
  touchSubscriptionLastDeliveryAt: Schema.optional(Schema.NonEmptyString),
});

type WebhookOutboundDeliveryRow =
  typeof webhookOutboundDeliveriesTable.$inferSelect;

type UpdateWebhookOutboundDeliveryInput = Schema.Schema.Type<
  typeof UpdateWebhookOutboundDeliveryInputSchema
>;

export type WebhookOutboundDeliveryAlreadyExistsError = {
  readonly _tag: "WebhookOutboundDeliveryAlreadyExistsError";
  readonly deliveryId: string;
};

export type WebhookOutboundDeliveryMutationConflictError = {
  readonly _tag: "WebhookOutboundDeliveryMutationConflictError";
  readonly deliveryId: string;
};

export type WebhookOutboundDeliveryPostgresQueryable = {
  readonly createWebhookOutboundDelivery: (
    record: typeof webhookOutboundDeliveriesTable.$inferInsert,
  ) => Promise<WebhookOutboundDeliveryRow>;
  readonly getWebhookOutboundDelivery: (
    deliveryId: string,
  ) => Promise<WebhookOutboundDeliveryRow | undefined>;
  readonly listWebhookOutboundDeliveriesByScope: (
    scope: WebhookOutboundDeliveryRecord["scope"],
    scopeId: string,
  ) => Promise<readonly WebhookOutboundDeliveryRow[]>;
  readonly updateWebhookOutboundDelivery: (input: {
    readonly record: typeof webhookOutboundDeliveriesTable.$inferInsert;
    readonly expectedCurrentRecord: WebhookOutboundDeliveryRecord;
    readonly touchSubscriptionLastDeliveryAt?: Date;
  }) => Promise<WebhookOutboundDeliveryRow | undefined>;
};

export type WebhookOutboundDeliveryPostgresRepositoryQueryError = {
  readonly _tag: "WebhookOutboundDeliveryPostgresRepositoryQueryError";
  readonly operation:
    | "createWebhookOutboundDelivery"
    | "getWebhookOutboundDelivery"
    | "listWebhookOutboundDeliveries"
    | "updateWebhookOutboundDelivery";
  readonly cause: unknown;
};

export type WebhookOutboundDeliveryPostgresRepositoryError =
  | ParseResult.ParseError
  | WebhookOutboundDeliveryAlreadyExistsError
  | WebhookOutboundDeliveryMutationConflictError
  | WebhookOutboundDeliveryPostgresRepositoryQueryError;

const hasPostgresErrorCode = (cause: unknown, code: string): boolean => {
  if (typeof cause !== "object" || cause === null) {
    return false;
  }

  if ("code" in cause && cause.code === code) {
    return true;
  }

  return "cause" in cause ? hasPostgresErrorCode(cause.cause, code) : false;
};

const parseTimestamp = (value: string | undefined) =>
  value === undefined ? null : new Date(value);

const toIsoString = (value: Date | string | null | undefined) =>
  value == null
    ? undefined
    : value instanceof Date
      ? value.toISOString()
      : value;

const buildWebhookOutboundDeliveryRecord = (row: WebhookOutboundDeliveryRow) =>
  Schema.decodeUnknown(WebhookOutboundDeliveryRecordSchema)({
    deliveryId: row.deliveryId,
    subscriptionId: row.subscriptionId,
    scope: row.scope,
    scopeId: row.scopeId,
    eventType: row.eventType,
    payload: row.payload,
    status: row.status,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    ...(toIsoString(row.nextAttemptAt) !== undefined
      ? { nextAttemptAt: toIsoString(row.nextAttemptAt) }
      : {}),
    ...(toIsoString(row.deliveredAt) !== undefined
      ? { deliveredAt: toIsoString(row.deliveredAt) }
      : {}),
    ...(toIsoString(row.exhaustedAt) !== undefined
      ? { exhaustedAt: toIsoString(row.exhaustedAt) }
      : {}),
    ...(row.lastError != null ? { lastError: row.lastError } : {}),
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  });

const buildInsertRow = (record: WebhookOutboundDeliveryRecord) => ({
  deliveryId: record.deliveryId,
  subscriptionId: record.subscriptionId,
  scope: record.scope,
  scopeId: record.scopeId,
  eventType: record.eventType,
  payload: record.payload,
  status: record.status,
  attemptCount: record.attemptCount,
  maxAttempts: record.maxAttempts,
  nextAttemptAt: parseTimestamp(record.nextAttemptAt),
  deliveredAt: parseTimestamp(record.deliveredAt),
  exhaustedAt: parseTimestamp(record.exhaustedAt),
  lastError: record.lastError ?? null,
  createdAt: new Date(record.createdAt),
  updatedAt: new Date(record.updatedAt),
});

export type WebhookOutboundDeliveryPostgresRepositoryService = {
  readonly createWebhookOutboundDelivery: (
    input: WebhookOutboundDeliveryRecord,
  ) => Effect.Effect<
    WebhookOutboundDeliveryRecord,
    WebhookOutboundDeliveryPostgresRepositoryError
  >;
  readonly getWebhookOutboundDelivery: (input: {
    readonly deliveryId: string;
  }) => Effect.Effect<
    WebhookOutboundDeliveryRecord | undefined,
    WebhookOutboundDeliveryPostgresRepositoryError
  >;
  readonly listWebhookOutboundDeliveries: (input: {
    readonly scope: WebhookOutboundDeliveryRecord["scope"];
    readonly scopeId: string;
  }) => Effect.Effect<
    readonly WebhookOutboundDeliveryRecord[],
    WebhookOutboundDeliveryPostgresRepositoryError
  >;
  readonly updateWebhookOutboundDelivery: (
    input: UpdateWebhookOutboundDeliveryInput,
  ) => Effect.Effect<
    WebhookOutboundDeliveryRecord,
    WebhookOutboundDeliveryPostgresRepositoryError
  >;
};

export class WebhookOutboundDeliveryPostgresRepository extends Context.Tag(
  "WebhookOutboundDeliveryPostgresRepository",
)<
  WebhookOutboundDeliveryPostgresRepository,
  WebhookOutboundDeliveryPostgresRepositoryService
>() {}

export const makeWebhookOutboundDeliveryPostgresRepository = (
  database: WebhookOutboundDeliveryPostgresQueryable,
) =>
  Effect.succeed<WebhookOutboundDeliveryPostgresRepositoryService>({
    createWebhookOutboundDelivery: (input: WebhookOutboundDeliveryRecord) =>
      Schema.decodeUnknown(WebhookOutboundDeliveryRecordSchema)(input).pipe(
        Effect.flatMap((record) =>
          Effect.tryPromise({
            try: () =>
              database.createWebhookOutboundDelivery(buildInsertRow(record)),
            catch: (cause) =>
              hasPostgresErrorCode(cause, "23505")
                ? ({
                    _tag: "WebhookOutboundDeliveryAlreadyExistsError",
                    deliveryId: record.deliveryId,
                  } satisfies WebhookOutboundDeliveryAlreadyExistsError)
                : ({
                    _tag: "WebhookOutboundDeliveryPostgresRepositoryQueryError",
                    operation: "createWebhookOutboundDelivery",
                    cause,
                  } satisfies WebhookOutboundDeliveryPostgresRepositoryQueryError),
          }),
        ),
        Effect.flatMap((row) => buildWebhookOutboundDeliveryRecord(row)),
      ),
    getWebhookOutboundDelivery: (input) =>
      Schema.decodeUnknown(WebhookOutboundDeliveryLookupSchema)(input).pipe(
        Effect.flatMap((request) =>
          Effect.tryPromise({
            try: () => database.getWebhookOutboundDelivery(request.deliveryId),
            catch: (cause) =>
              ({
                _tag: "WebhookOutboundDeliveryPostgresRepositoryQueryError",
                operation: "getWebhookOutboundDelivery",
                cause,
              }) satisfies WebhookOutboundDeliveryPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildWebhookOutboundDeliveryRecord(row),
        ),
      ),
    listWebhookOutboundDeliveries: (input) =>
      Schema.decodeUnknown(WebhookOutboundDeliveryScopeLookupSchema)(
        input,
      ).pipe(
        Effect.flatMap((request) =>
          Effect.tryPromise({
            try: () =>
              database.listWebhookOutboundDeliveriesByScope(
                request.scope,
                request.scopeId,
              ),
            catch: (cause) =>
              ({
                _tag: "WebhookOutboundDeliveryPostgresRepositoryQueryError",
                operation: "listWebhookOutboundDeliveries",
                cause,
              }) satisfies WebhookOutboundDeliveryPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((rows) =>
          Effect.forEach(rows, (row) =>
            buildWebhookOutboundDeliveryRecord(row),
          ),
        ),
        Effect.flatMap((records) =>
          Schema.decodeUnknown(WebhookOutboundDeliveryRecordListSchema)(
            records,
          ),
        ),
      ),
    updateWebhookOutboundDelivery: (
      input: UpdateWebhookOutboundDeliveryInput,
    ) =>
      Schema.decodeUnknown(UpdateWebhookOutboundDeliveryInputSchema)(
        input,
      ).pipe(
        Effect.flatMap((request) =>
          Effect.tryPromise({
            try: () =>
              database.updateWebhookOutboundDelivery({
                record: buildInsertRow(request.record),
                expectedCurrentRecord: request.expectedCurrentRecord,
                ...(request.touchSubscriptionLastDeliveryAt === undefined
                  ? {}
                  : {
                      touchSubscriptionLastDeliveryAt: new Date(
                        request.touchSubscriptionLastDeliveryAt,
                      ),
                    }),
              }),
            catch: (cause) =>
              ({
                _tag: "WebhookOutboundDeliveryPostgresRepositoryQueryError",
                operation: "updateWebhookOutboundDelivery",
                cause,
              }) satisfies WebhookOutboundDeliveryPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap(
          (
            row,
          ): Effect.Effect<
            WebhookOutboundDeliveryRecord,
            | ParseResult.ParseError
            | WebhookOutboundDeliveryMutationConflictError
          > =>
            row === undefined
              ? Effect.fail({
                  _tag: "WebhookOutboundDeliveryMutationConflictError",
                  deliveryId: input.record.deliveryId,
                } satisfies WebhookOutboundDeliveryMutationConflictError)
              : buildWebhookOutboundDeliveryRecord(row),
        ),
      ),
  });

export const makeWebhookOutboundDeliveryPostgresRepositoryLayer = (
  database: WebhookOutboundDeliveryPostgresQueryable,
) =>
  Layer.effect(
    WebhookOutboundDeliveryPostgresRepository,
    makeWebhookOutboundDeliveryPostgresRepository(database),
  );
