import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  type WebhookSubscriptionListRequest,
  WebhookSubscriptionListRequestSchema,
  type WebhookSubscriptionRecord,
  WebhookSubscriptionRecordListSchema,
  WebhookSubscriptionRecordSchema,
} from "@comvestec/contracts";
import { webhookSubscriptionsTable } from "./schema";

type WebhookSubscriptionRow = typeof webhookSubscriptionsTable.$inferSelect;

export type WebhookSubscriptionAlreadyExistsError = {
  readonly _tag: "WebhookSubscriptionAlreadyExistsError";
  readonly scope: WebhookSubscriptionRecord["scope"];
  readonly scopeId: string;
  readonly url: string;
};

export type WebhookSubscriptionPostgresQueryable = {
  readonly createWebhookSubscription: (
    record: typeof webhookSubscriptionsTable.$inferInsert,
  ) => Promise<WebhookSubscriptionRow>;
  readonly listWebhookSubscriptionsByScope: (
    scope: WebhookSubscriptionRecord["scope"],
    scopeId: string,
  ) => Promise<readonly WebhookSubscriptionRow[]>;
};

export type WebhookSubscriptionPostgresRepositoryQueryError = {
  readonly _tag: "WebhookSubscriptionPostgresRepositoryQueryError";
  readonly operation: "createWebhookSubscription" | "listWebhookSubscriptions";
  readonly cause: unknown;
};

export type WebhookSubscriptionPostgresRepositoryError =
  | ParseResult.ParseError
  | WebhookSubscriptionAlreadyExistsError
  | WebhookSubscriptionPostgresRepositoryQueryError;

const hasPostgresErrorCode = (cause: unknown, code: string): boolean => {
  if (typeof cause !== "object" || cause === null) {
    return false;
  }

  if ("code" in cause && cause.code === code) {
    return true;
  }

  return "cause" in cause ? hasPostgresErrorCode(cause.cause, code) : false;
};

const toIsoString = (value: Date | string | null | undefined) =>
  value == null
    ? undefined
    : value instanceof Date
      ? value.toISOString()
      : value;

const decodeWebhookSubscriptionRecord = Schema.decodeUnknown(
  WebhookSubscriptionRecordSchema,
);

const buildWebhookSubscriptionRecord = (row: WebhookSubscriptionRow) =>
  decodeWebhookSubscriptionRecord({
    subscriptionId: row.subscriptionId,
    scope: row.scope,
    scopeId: row.scopeId,
    url: row.url,
    events: row.events,
    status: row.status,
    ...(toIsoString(row.lastDeliveryAt) !== undefined
      ? { lastDeliveryAt: toIsoString(row.lastDeliveryAt) }
      : {}),
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  });

export type WebhookSubscriptionPostgresRepositoryService = {
  readonly createWebhookSubscription: (
    input: WebhookSubscriptionRecord,
  ) => Effect.Effect<
    WebhookSubscriptionRecord,
    WebhookSubscriptionPostgresRepositoryError
  >;
  readonly listWebhookSubscriptions: (
    input: WebhookSubscriptionListRequest,
  ) => Effect.Effect<
    readonly WebhookSubscriptionRecord[],
    WebhookSubscriptionPostgresRepositoryError
  >;
};

export class WebhookSubscriptionPostgresRepository extends Context.Tag(
  "WebhookSubscriptionPostgresRepository",
)<
  WebhookSubscriptionPostgresRepository,
  WebhookSubscriptionPostgresRepositoryService
>() {}

export const makeWebhookSubscriptionPostgresRepository = (
  database: WebhookSubscriptionPostgresQueryable,
) =>
  Effect.succeed<WebhookSubscriptionPostgresRepositoryService>({
    createWebhookSubscription: (
      input: WebhookSubscriptionRecord,
    ): Effect.Effect<
      WebhookSubscriptionRecord,
      WebhookSubscriptionPostgresRepositoryError
    > =>
      Schema.decodeUnknown(WebhookSubscriptionRecordSchema)(input).pipe(
        Effect.flatMap((record) =>
          Effect.tryPromise({
            try: () =>
              database.createWebhookSubscription({
                subscriptionId: record.subscriptionId,
                scope: record.scope,
                scopeId: record.scopeId,
                url: record.url,
                events: record.events,
                status: record.status,
                lastDeliveryAt:
                  record.lastDeliveryAt === undefined
                    ? null
                    : new Date(record.lastDeliveryAt),
                createdAt: new Date(record.createdAt),
                updatedAt: new Date(record.updatedAt),
              }),
            catch: (cause) =>
              hasPostgresErrorCode(cause, "23505")
                ? ({
                    _tag: "WebhookSubscriptionAlreadyExistsError",
                    scope: record.scope,
                    scopeId: record.scopeId,
                    url: record.url,
                  } satisfies WebhookSubscriptionAlreadyExistsError)
                : ({
                    _tag: "WebhookSubscriptionPostgresRepositoryQueryError",
                    operation: "createWebhookSubscription",
                    cause,
                  } satisfies WebhookSubscriptionPostgresRepositoryQueryError),
          }),
        ),
        Effect.flatMap((row) => buildWebhookSubscriptionRecord(row)),
      ),
    listWebhookSubscriptions: (
      input: WebhookSubscriptionListRequest,
    ): Effect.Effect<
      readonly WebhookSubscriptionRecord[],
      WebhookSubscriptionPostgresRepositoryError
    > =>
      Schema.decodeUnknown(WebhookSubscriptionListRequestSchema)(input).pipe(
        Effect.flatMap((request) =>
          Effect.tryPromise({
            try: () =>
              database.listWebhookSubscriptionsByScope(
                request.scope,
                request.scopeId,
              ),
            catch: (cause) =>
              ({
                _tag: "WebhookSubscriptionPostgresRepositoryQueryError",
                operation: "listWebhookSubscriptions",
                cause,
              }) satisfies WebhookSubscriptionPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((rows) =>
          Effect.forEach(rows, (row) => buildWebhookSubscriptionRecord(row)),
        ),
        Effect.flatMap((records) =>
          Schema.decodeUnknown(WebhookSubscriptionRecordListSchema)(records),
        ),
      ),
  });

export const makeWebhookSubscriptionPostgresRepositoryLayer = (
  database: WebhookSubscriptionPostgresQueryable,
) =>
  Layer.effect(
    WebhookSubscriptionPostgresRepository,
    makeWebhookSubscriptionPostgresRepository(database),
  );
