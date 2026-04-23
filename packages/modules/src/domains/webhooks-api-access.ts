import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  BillingProviderWebhookInputSchema,
  type BillingProviderWebhookInput,
} from "@comvestec/contracts";
import {
  BillingWebhookReplayPostgresRepository,
  BillingWebhookReceiptLookupSchema,
  type BillingWebhookReceiptLookup,
  type BillingWebhookReplayPostgresRepositoryError,
} from "../persistence";
import {
  BillingWebhookService,
  type BillingWebhookProcessingError,
  type BillingWebhookProcessingResult,
} from "./billing-webhook-processing";

const decodeBillingProviderWebhookInput = Schema.decodeUnknown(
  BillingProviderWebhookInputSchema,
);

export type WebhooksApiAccessModuleError =
  | ParseResult.ParseError
  | BillingWebhookProcessingError
  | BillingWebhookReplayPostgresRepositoryError;

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
};

export class WebhooksApiAccessModule extends Context.Tag(
  "WebhooksApiAccessModule",
)<WebhooksApiAccessModule, WebhooksApiAccessModuleService>() {}

export const makeWebhooksApiAccessModule = () =>
  Effect.gen(function* () {
    const billingWebhook = yield* BillingWebhookService;
    const replayRepository = yield* BillingWebhookReplayPostgresRepository;

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
    } satisfies WebhooksApiAccessModuleService;
  });

export const WebhooksApiAccessModuleLive = Layer.effect(
  WebhooksApiAccessModule,
  makeWebhooksApiAccessModule(),
);
