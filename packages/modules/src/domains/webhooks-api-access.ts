import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  BillingProviderWebhookInputSchema,
  type BillingProviderWebhookInput,
  type CreateWebhookApiKeyInput,
  CreateWebhookApiKeyInputSchema,
  type CreateWebhookSubscriptionInput,
  CreateWebhookSubscriptionInputSchema,
  IsoTimestampSchema,
  type WebhookOutboundDeliveryRecord,
  WebhookOutboundDeliveryRecordSchema,
  type WebhookApiKeyListRequest,
  WebhookApiKeyListRequestSchema,
  type WebhookApiKeyLookup,
  WebhookApiKeyLookupSchema,
  type WebhookApiKeyRecord,
  WebhookApiKeyRecordSchema,
  type WebhookApiKeySecret,
  webhookApiKeyStatus,
  webhookOutboundDeliveryStatus,
  type WebhookSubscriptionLookup,
  WebhookSubscriptionLookupSchema,
  type WebhookSubscriptionListRequest,
  WebhookSubscriptionListRequestSchema,
  type WebhookSubscriptionRecord,
  webhookSubscriptionStatus,
} from "@comvestec/contracts";
import {
  BillingWebhookReplayPostgresRepository,
  BillingWebhookReceiptLookupSchema,
  type BillingWebhookReceiptLookup,
  type WebhookOutboundDeliveryMutationConflictError,
  type WebhookOutboundDeliveryPostgresRepositoryError,
  WebhookOutboundDeliveryPostgresRepository,
  type WebhookApiKeyPostgresRepositoryError,
  WebhookApiKeyPostgresRepository,
  type BillingWebhookReplayPostgresRepositoryError,
  type WebhookSubscriptionPostgresRepositoryError,
  WebhookSubscriptionPostgresRepository,
} from "../persistence";
import {
  BillingWebhookService,
  type BillingWebhookProcessingError,
  type BillingWebhookProcessingResult,
} from "./billing-webhook-processing";

const decodeBillingProviderWebhookInput = Schema.decodeUnknown(
  BillingProviderWebhookInputSchema,
);

const encodeBytesAsHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const createWebhookApiKeySecret = () =>
  `wkai_${encodeBytesAsHex(crypto.getRandomValues(new Uint8Array(32)))}`;

const buildWebhookApiKeyPrefix = (secret: string) => secret.slice(0, 18);

const hashWebhookApiKeySecret = (secret: string) =>
  Effect.tryPromise({
    try: async () => {
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)),
      );

      return encodeBytesAsHex(digest);
    },
    catch: (cause) => cause,
  }).pipe(Effect.orDie);

export type WebhooksApiAccessModuleError =
  | ParseResult.ParseError
  | BillingWebhookProcessingError
  | BillingWebhookReplayPostgresRepositoryError
  | WebhookOutboundDeliveryMutationConflictError
  | WebhookOutboundDeliveryPostgresRepositoryError
  | WebhookApiKeyPostgresRepositoryError
  | WebhookSubscriptionNotFoundError
  | WebhookOutboundDeliveryNotFoundError
  | WebhookSubscriptionPostgresRepositoryError;

export type IssuedWebhookApiKeySecret = {
  readonly record: WebhookApiKeyRecord;
  readonly secret: WebhookApiKeySecret;
};

export type RotatedWebhookApiKeySecret = IssuedWebhookApiKeySecret & {
  readonly previousRecord: WebhookApiKeyRecord;
};

const RevokeWebhookApiKeyInputSchema = Schema.Struct({
  scope: WebhookApiKeyLookupSchema.fields.scope,
  scopeId: WebhookApiKeyLookupSchema.fields.scopeId,
  apiKeyId: WebhookApiKeyLookupSchema.fields.apiKeyId,
  expectedCurrentRecord: Schema.optional(WebhookApiKeyRecordSchema),
});

type RevokeWebhookApiKeyInput = Schema.Schema.Type<
  typeof RevokeWebhookApiKeyInputSchema
>;

const RestoreWebhookApiKeyInputSchema = Schema.Struct({
  record: WebhookApiKeyRecordSchema,
  expectedCurrentRecord: WebhookApiKeyRecordSchema,
});

type RestoreWebhookApiKeyInput = Schema.Schema.Type<
  typeof RestoreWebhookApiKeyInputSchema
>;

const PositiveWebhookDeliveryAttemptCountSchema = Schema.Number.pipe(
  Schema.filter((value) => Number.isInteger(value) && value > 0),
);

const CreateWebhookOutboundDeliveryInputSchema = Schema.Struct({
  scope: WebhookSubscriptionLookupSchema.fields.scope,
  scopeId: WebhookSubscriptionLookupSchema.fields.scopeId,
  subscriptionId: WebhookSubscriptionLookupSchema.fields.subscriptionId,
  eventType: Schema.NonEmptyString,
  payload: Schema.NonEmptyString,
  maxAttempts: PositiveWebhookDeliveryAttemptCountSchema,
  scheduledAt: Schema.optional(IsoTimestampSchema),
});

type CreateWebhookOutboundDeliveryInput = Schema.Schema.Type<
  typeof CreateWebhookOutboundDeliveryInputSchema
>;

const GetWebhookOutboundDeliveryInputSchema = Schema.Struct({
  deliveryId: Schema.NonEmptyString,
});

type GetWebhookOutboundDeliveryInput = Schema.Schema.Type<
  typeof GetWebhookOutboundDeliveryInputSchema
>;

const UpdateWebhookOutboundDeliveryInputSchema = Schema.Struct({
  record: WebhookOutboundDeliveryRecordSchema,
  expectedCurrentRecord: WebhookOutboundDeliveryRecordSchema,
  touchSubscriptionLastDeliveryAt: Schema.optional(IsoTimestampSchema),
});

type UpdateWebhookOutboundDeliveryInput = Schema.Schema.Type<
  typeof UpdateWebhookOutboundDeliveryInputSchema
>;

export type WebhookSubscriptionNotFoundError = {
  readonly _tag: "WebhookSubscriptionNotFoundError";
  readonly scope: WebhookSubscriptionRecord["scope"];
  readonly scopeId: string;
  readonly subscriptionId: string;
};

export type WebhookOutboundDeliveryNotFoundError = {
  readonly _tag: "WebhookOutboundDeliveryNotFoundError";
  readonly deliveryId: string;
};

export type WebhooksApiAccessModuleService = {
  readonly processVerifiedProviderWebhook: (
    input: BillingProviderWebhookInput,
  ) => Effect.Effect<
    BillingWebhookProcessingResult,
    BillingWebhookProcessingError
  >;
  readonly replayProviderWebhook: (
    input: BillingWebhookReceiptLookup,
  ) => Effect.Effect<
    BillingWebhookProcessingResult,
    WebhooksApiAccessModuleError
  >;
  readonly createWebhookSubscription: (
    input: CreateWebhookSubscriptionInput,
  ) => Effect.Effect<WebhookSubscriptionRecord, WebhooksApiAccessModuleError>;
  readonly listWebhookSubscriptions: (
    input: WebhookSubscriptionListRequest,
  ) => Effect.Effect<
    readonly WebhookSubscriptionRecord[],
    WebhooksApiAccessModuleError
  >;
  readonly getWebhookSubscription: (
    input: WebhookSubscriptionLookup,
  ) => Effect.Effect<WebhookSubscriptionRecord, WebhooksApiAccessModuleError>;
  readonly createWebhookOutboundDelivery: (
    input: CreateWebhookOutboundDeliveryInput,
  ) => Effect.Effect<
    WebhookOutboundDeliveryRecord,
    WebhooksApiAccessModuleError
  >;
  readonly getWebhookOutboundDelivery: (
    input: GetWebhookOutboundDeliveryInput,
  ) => Effect.Effect<
    WebhookOutboundDeliveryRecord,
    WebhooksApiAccessModuleError
  >;
  readonly updateWebhookOutboundDelivery: (
    input: UpdateWebhookOutboundDeliveryInput,
  ) => Effect.Effect<
    WebhookOutboundDeliveryRecord,
    WebhooksApiAccessModuleError
  >;
  readonly createWebhookApiKey: (
    input: CreateWebhookApiKeyInput,
  ) => Effect.Effect<IssuedWebhookApiKeySecret, WebhooksApiAccessModuleError>;
  readonly listWebhookApiKeys: (
    input: WebhookApiKeyListRequest,
  ) => Effect.Effect<
    readonly WebhookApiKeyRecord[],
    WebhooksApiAccessModuleError
  >;
  readonly rotateWebhookApiKey: (
    input: WebhookApiKeyLookup,
  ) => Effect.Effect<RotatedWebhookApiKeySecret, WebhooksApiAccessModuleError>;
  readonly revokeWebhookApiKey: (
    input: RevokeWebhookApiKeyInput,
  ) => Effect.Effect<WebhookApiKeyRecord, WebhooksApiAccessModuleError>;
  readonly restoreWebhookApiKey: (
    input: RestoreWebhookApiKeyInput,
  ) => Effect.Effect<WebhookApiKeyRecord, WebhooksApiAccessModuleError>;
};

export class WebhooksApiAccessModule extends Context.Tag(
  "WebhooksApiAccessModule",
)<WebhooksApiAccessModule, WebhooksApiAccessModuleService>() {}

export const makeWebhooksApiAccessModule = () =>
  Effect.gen(function* () {
    const billingWebhook = yield* BillingWebhookService;
    const replayRepository = yield* BillingWebhookReplayPostgresRepository;
    const webhookOutboundDeliveries =
      yield* WebhookOutboundDeliveryPostgresRepository;
    const webhookApiKeys = yield* WebhookApiKeyPostgresRepository;
    const webhookSubscriptions = yield* WebhookSubscriptionPostgresRepository;

    return {
      processVerifiedProviderWebhook: billingWebhook.processPolarWebhook,
      replayProviderWebhook: (input: BillingWebhookReceiptLookup) =>
        Schema.decodeUnknown(BillingWebhookReceiptLookupSchema)(input).pipe(
          Effect.flatMap((request) =>
            replayRepository.getWebhookReceipt(request),
          ),
          Effect.flatMap((receipt) =>
            decodeBillingProviderWebhookInput({
              provider: receipt.provider,
              deliveryId: receipt.deliveryId,
              eventId: receipt.payload.eventId,
              eventType: receipt.eventType,
              occurredAt: receipt.payload.occurredAt,
              verifiedSignature: receipt.verifiedSignature,
              subscriptionId: receipt.payload.subscriptionId,
              tenantScope: receipt.scope,
              tenantScopeId: receipt.scopeId,
              planId: receipt.payload.planId,
              priceId: receipt.payload.priceId,
              ...(receipt.payload.customerId !== undefined
                ? { customerId: receipt.payload.customerId }
                : {}),
              ...(receipt.payload.currentPeriodEnd !== undefined
                ? { currentPeriodEnd: receipt.payload.currentPeriodEnd }
                : {}),
              ...(receipt.payload.cancelAt !== undefined
                ? { cancelAt: receipt.payload.cancelAt }
                : {}),
            }),
          ),
          Effect.flatMap((normalizedInput) =>
            billingWebhook.processPolarWebhook(normalizedInput),
          ),
        ),
      createWebhookSubscription: (
        input: CreateWebhookSubscriptionInput,
      ): Effect.Effect<
        WebhookSubscriptionRecord,
        WebhooksApiAccessModuleError
      > =>
        Schema.decodeUnknown(CreateWebhookSubscriptionInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            webhookSubscriptions.createWebhookSubscription({
              subscriptionId: [
                "webhook-subscription",
                request.scope,
                request.scopeId,
                crypto.randomUUID(),
              ].join(":"),
              scope: request.scope,
              scopeId: request.scopeId,
              url: request.url,
              events: request.events,
              status: webhookSubscriptionStatus.active,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }),
          ),
        ),
      listWebhookSubscriptions: (
        input: WebhookSubscriptionListRequest,
      ): Effect.Effect<
        readonly WebhookSubscriptionRecord[],
        WebhooksApiAccessModuleError
      > =>
        Schema.decodeUnknown(WebhookSubscriptionListRequestSchema)(input).pipe(
          Effect.flatMap((request) =>
            webhookSubscriptions.listWebhookSubscriptions(request),
          ),
        ),
      getWebhookSubscription: (
        input: WebhookSubscriptionLookup,
      ): Effect.Effect<
        WebhookSubscriptionRecord,
        WebhooksApiAccessModuleError
      > =>
        Schema.decodeUnknown(WebhookSubscriptionLookupSchema)(input).pipe(
          Effect.flatMap((request) =>
            webhookSubscriptions
              .listWebhookSubscriptions({
                scope: request.scope,
                scopeId: request.scopeId,
              })
              .pipe(
                Effect.flatMap((records) =>
                  Effect.fromNullable(
                    records.find(
                      (record) =>
                        record.subscriptionId === request.subscriptionId,
                    ),
                  ).pipe(
                    Effect.orElseFail(
                      (): WebhookSubscriptionNotFoundError => ({
                        _tag: "WebhookSubscriptionNotFoundError",
                        scope: request.scope,
                        scopeId: request.scopeId,
                        subscriptionId: request.subscriptionId,
                      }),
                    ),
                  ),
                ),
              ),
          ),
        ),
      createWebhookOutboundDelivery: (
        input: CreateWebhookOutboundDeliveryInput,
      ): Effect.Effect<
        WebhookOutboundDeliveryRecord,
        WebhooksApiAccessModuleError
      > =>
        Schema.decodeUnknown(CreateWebhookOutboundDeliveryInputSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const now = new Date().toISOString();

              return yield* webhookOutboundDeliveries.createWebhookOutboundDelivery(
                {
                  deliveryId: [
                    "webhook-outbound-delivery",
                    request.scope,
                    request.scopeId,
                    crypto.randomUUID(),
                  ].join(":"),
                  subscriptionId: request.subscriptionId,
                  scope: request.scope,
                  scopeId: request.scopeId,
                  eventType: request.eventType,
                  payload: request.payload,
                  status: webhookOutboundDeliveryStatus.pending,
                  attemptCount: 0,
                  maxAttempts: request.maxAttempts,
                  nextAttemptAt: request.scheduledAt ?? now,
                  createdAt: now,
                  updatedAt: now,
                },
              );
            }),
          ),
        ),
      getWebhookOutboundDelivery: (
        input: GetWebhookOutboundDeliveryInput,
      ): Effect.Effect<
        WebhookOutboundDeliveryRecord,
        WebhooksApiAccessModuleError
      > =>
        Schema.decodeUnknown(GetWebhookOutboundDeliveryInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            webhookOutboundDeliveries.getWebhookOutboundDelivery(request),
          ),
          Effect.flatMap((record) =>
            record === undefined
              ? Effect.fail({
                  _tag: "WebhookOutboundDeliveryNotFoundError",
                  deliveryId: input.deliveryId,
                } satisfies WebhookOutboundDeliveryNotFoundError)
              : Effect.succeed(record),
          ),
        ),
      updateWebhookOutboundDelivery: (
        input: UpdateWebhookOutboundDeliveryInput,
      ): Effect.Effect<
        WebhookOutboundDeliveryRecord,
        WebhooksApiAccessModuleError
      > =>
        Schema.decodeUnknown(UpdateWebhookOutboundDeliveryInputSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            webhookOutboundDeliveries.updateWebhookOutboundDelivery(request),
          ),
        ),
      createWebhookApiKey: (
        input: CreateWebhookApiKeyInput,
      ): Effect.Effect<
        IssuedWebhookApiKeySecret,
        WebhooksApiAccessModuleError
      > =>
        Schema.decodeUnknown(CreateWebhookApiKeyInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const secret = createWebhookApiKeySecret();
              const createdAt = new Date().toISOString();
              const record = yield* webhookApiKeys.createWebhookApiKey({
                apiKeyId: [
                  "webhook-api-key",
                  request.scope,
                  request.scopeId,
                  crypto.randomUUID(),
                ].join(":"),
                scope: request.scope,
                scopeId: request.scopeId,
                label: request.label,
                secretHash: yield* hashWebhookApiKeySecret(secret),
                prefix: buildWebhookApiKeyPrefix(secret),
                status: webhookApiKeyStatus.active,
                createdAt,
                updatedAt: createdAt,
              });

              return { record, secret } satisfies IssuedWebhookApiKeySecret;
            }),
          ),
        ),
      listWebhookApiKeys: (
        input: WebhookApiKeyListRequest,
      ): Effect.Effect<
        readonly WebhookApiKeyRecord[],
        WebhooksApiAccessModuleError
      > =>
        Schema.decodeUnknown(WebhookApiKeyListRequestSchema)(input).pipe(
          Effect.flatMap((request) =>
            webhookApiKeys.listWebhookApiKeys(request),
          ),
        ),
      rotateWebhookApiKey: (
        input: WebhookApiKeyLookup,
      ): Effect.Effect<
        RotatedWebhookApiKeySecret,
        WebhooksApiAccessModuleError
      > =>
        Schema.decodeUnknown(WebhookApiKeyLookupSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const secret = createWebhookApiKeySecret();
              const rotatedAt = new Date().toISOString();
              const result = yield* webhookApiKeys.rotateWebhookApiKey({
                scope: request.scope,
                scopeId: request.scopeId,
                apiKeyId: request.apiKeyId,
                secretHash: yield* hashWebhookApiKeySecret(secret),
                prefix: buildWebhookApiKeyPrefix(secret),
                rotatedAt,
                updatedAt: rotatedAt,
              });

              return {
                previousRecord: result.previousRecord,
                record: result.record,
                secret,
              } satisfies RotatedWebhookApiKeySecret;
            }),
          ),
        ),
      revokeWebhookApiKey: (
        input: RevokeWebhookApiKeyInput,
      ): Effect.Effect<WebhookApiKeyRecord, WebhooksApiAccessModuleError> =>
        Schema.decodeUnknown(RevokeWebhookApiKeyInputSchema)(input).pipe(
          Effect.flatMap((request) => {
            const revokedAt = new Date().toISOString();

            return webhookApiKeys.revokeWebhookApiKey({
              scope: request.scope,
              scopeId: request.scopeId,
              apiKeyId: request.apiKeyId,
              revokedAt,
              updatedAt: revokedAt,
              ...(request.expectedCurrentRecord === undefined
                ? {}
                : {
                    expectedCurrentRecord: request.expectedCurrentRecord,
                  }),
            });
          }),
        ),
      restoreWebhookApiKey: (
        input: RestoreWebhookApiKeyInput,
      ): Effect.Effect<WebhookApiKeyRecord, WebhooksApiAccessModuleError> =>
        Schema.decodeUnknown(RestoreWebhookApiKeyInputSchema)(input).pipe(
          Effect.flatMap((restoreInput) =>
            webhookApiKeys.restoreWebhookApiKey(restoreInput),
          ),
        ),
    } satisfies WebhooksApiAccessModuleService;
  });

export const WebhooksApiAccessModuleLive = Layer.effect(
  WebhooksApiAccessModule,
  makeWebhooksApiAccessModule(),
);
