import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  PlatformAdapterServiceNameSchema,
  type PlatformAdapterServiceName,
} from "@comvestec/platform";
import {
  BillingWebhookReceiptRecordSchema,
  type BillingWebhookReceiptRecord,
} from "../../../domains/billing-metering";
import { webhookReceiptsTable } from "./billing";

export const BillingWebhookReceiptLookupSchema = Schema.Struct({
  provider: PlatformAdapterServiceNameSchema,
  deliveryId: Schema.NonEmptyString,
});

export type BillingWebhookReceiptLookup = Schema.Schema.Type<
  typeof BillingWebhookReceiptLookupSchema
>;

type BillingWebhookReceiptRow = typeof webhookReceiptsTable.$inferSelect;

export type BillingWebhookReplayPostgresQueryable = {
  readonly getWebhookReceiptByProviderAndDeliveryId: (
    provider: PlatformAdapterServiceName,
    deliveryId: string,
  ) => Promise<BillingWebhookReceiptRow | undefined>;
};

export type BillingWebhookReceiptNotFoundError = {
  readonly _tag: "BillingWebhookReceiptNotFoundError";
  readonly provider: BillingWebhookReceiptRecord["provider"];
  readonly deliveryId: BillingWebhookReceiptRecord["deliveryId"];
};

export type BillingWebhookReplayPostgresRepositoryQueryError = {
  readonly _tag: "BillingWebhookReplayPostgresRepositoryQueryError";
  readonly operation: "getWebhookReceipt";
  readonly cause: unknown;
};

export type BillingWebhookReplayPostgresRepositoryError =
  | ParseResult.ParseError
  | BillingWebhookReceiptNotFoundError
  | BillingWebhookReplayPostgresRepositoryQueryError;

const toIsoString = (value: Date | string | null | undefined) =>
  value == null
    ? undefined
    : value instanceof Date
      ? value.toISOString()
      : value;

const decodeBillingWebhookReceiptRecord = Schema.decodeUnknown(
  BillingWebhookReceiptRecordSchema,
);

const buildBillingWebhookReceiptRecord = (row: BillingWebhookReceiptRow) =>
  decodeBillingWebhookReceiptRecord({
    receiptId: row.receiptId,
    provider: row.provider,
    deliveryId: row.deliveryId,
    eventType: row.eventType,
    processingState: row.processingState,
    verifiedSignature: row.verifiedSignature,
    scope: row.scope,
    scopeId: row.scopeId,
    payload: row.payload,
    receivedAt: toIsoString(row.receivedAt) ?? new Date().toISOString(),
    processedAt:
      toIsoString(row.processedAt) ??
      toIsoString(row.receivedAt) ??
      new Date().toISOString(),
  });

export type BillingWebhookReplayPostgresRepositoryService = {
  readonly getWebhookReceipt: (
    input: BillingWebhookReceiptLookup,
  ) => Effect.Effect<
    BillingWebhookReceiptRecord,
    BillingWebhookReplayPostgresRepositoryError
  >;
};

export class BillingWebhookReplayPostgresRepository extends Context.Tag(
  "BillingWebhookReplayPostgresRepository",
)<
  BillingWebhookReplayPostgresRepository,
  BillingWebhookReplayPostgresRepositoryService
>() {}

export const makeBillingWebhookReplayPostgresRepository = (
  database: BillingWebhookReplayPostgresQueryable,
) =>
  Effect.succeed<BillingWebhookReplayPostgresRepositoryService>({
    getWebhookReceipt: (input: BillingWebhookReceiptLookup) =>
      Effect.gen(function* () {
        const request = yield* Schema.decodeUnknown(
          BillingWebhookReceiptLookupSchema,
        )(input);
        const row = yield* Effect.tryPromise({
          try: () =>
            database.getWebhookReceiptByProviderAndDeliveryId(
              request.provider,
              request.deliveryId,
            ),
          catch: (cause) =>
            ({
              _tag: "BillingWebhookReplayPostgresRepositoryQueryError",
              operation: "getWebhookReceipt",
              cause,
            }) satisfies BillingWebhookReplayPostgresRepositoryQueryError,
        });

        if (row === undefined) {
          return yield* Effect.fail({
            _tag: "BillingWebhookReceiptNotFoundError",
            provider: request.provider,
            deliveryId: request.deliveryId,
          } satisfies BillingWebhookReceiptNotFoundError);
        }

        return yield* buildBillingWebhookReceiptRecord(row);
      }),
  });

export const makeBillingWebhookReplayPostgresRepositoryLayer = (
  database: BillingWebhookReplayPostgresQueryable,
) =>
  Layer.effect(
    BillingWebhookReplayPostgresRepository,
    makeBillingWebhookReplayPostgresRepository(database),
  );
