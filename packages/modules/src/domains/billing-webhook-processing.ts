import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  BillingSubscriptionStatusSchema,
  BillingWebhookReconciliationSchema,
  BillingWebhookReconciliationActionSchema,
  PlatformScopeSchema,
  type BillingProviderWebhookInput,
} from "@comvestec/contracts";
import type {
  PolarAdapterRequestError,
  PolarCatalogMetadataError,
  PolarPlanNotFoundError,
  PolarPriceNotFoundError,
  PolarWebhookSignatureError,
} from "@comvestec/platform";
import { PolarAdapter } from "@comvestec/platform";
import {
  BillingCustomerAccountRecordSchema,
  BillingMeteringModule,
  BillingWebhookPersistenceProjectionSchema,
} from "./billing-metering";
import {
  BillingWebhookPostgresRepository,
  type BillingWebhookPostgresRepositoryError,
} from "../persistence";

export const BillingWebhookProcessingResultSchema = Schema.Struct({
  reconciliation: BillingWebhookReconciliationSchema,
  projection: BillingWebhookPersistenceProjectionSchema,
});

export type BillingWebhookProcessingResult = Schema.Schema.Type<
  typeof BillingWebhookProcessingResultSchema
>;

const BillingCustomerAccountResolutionInputSchema = Schema.Struct({
  provider: Schema.NonEmptyString,
  customerId: Schema.NonEmptyString,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  subscriptionId: Schema.NonEmptyString,
  subscriptionStatus: BillingSubscriptionStatusSchema,
  action: BillingWebhookReconciliationActionSchema,
});

type BillingCustomerAccountResolutionInput = Schema.Schema.Type<
  typeof BillingCustomerAccountResolutionInputSchema
>;

export type BillingCustomerAccountResolutionError = {
  readonly _tag: "BillingCustomerAccountResolutionError";
  readonly operation: "resolveCustomerAccount";
  readonly cause: unknown;
};

export type BillingCustomerAccountResolverApi = {
  readonly resolveCustomerAccount: (
    input: BillingCustomerAccountResolutionInput,
  ) => Effect.Effect<
    Schema.Schema.Type<typeof BillingCustomerAccountRecordSchema> | undefined,
    ParseResult.ParseError | BillingCustomerAccountResolutionError
  >;
};

export class BillingCustomerAccountResolver extends Context.Tag(
  "BillingCustomerAccountResolver",
)<BillingCustomerAccountResolver, BillingCustomerAccountResolverApi>() {}

export type BillingWebhookProcessingError =
  | ParseResult.ParseError
  | BillingCustomerAccountResolutionError
  | PolarAdapterRequestError
  | PolarCatalogMetadataError
  | PolarWebhookSignatureError
  | PolarPlanNotFoundError
  | PolarPriceNotFoundError
  | BillingWebhookPostgresRepositoryError;

export type BillingWebhookServiceApi = {
  readonly processPolarWebhook: (
    input: BillingProviderWebhookInput,
  ) => Effect.Effect<
    BillingWebhookProcessingResult,
    BillingWebhookProcessingError
  >;
};

export class BillingWebhookService extends Context.Tag("BillingWebhookService")<
  BillingWebhookService,
  BillingWebhookServiceApi
>() {}

export const makeBillingWebhookService = () =>
  Effect.gen(function* () {
    const polar = yield* PolarAdapter;
    const billingMetering = yield* BillingMeteringModule;
    const repository = yield* BillingWebhookPostgresRepository;
    const customerAccountResolver = yield* BillingCustomerAccountResolver;

    return {
      processPolarWebhook: (input: BillingProviderWebhookInput) =>
        Effect.gen(function* () {
          const reconciliation = yield* polar.reconcileWebhookEvent(input);
          const projection =
            yield* billingMetering.buildWebhookPersistenceProjection(
              reconciliation,
            );
          const customerAccount =
            reconciliation.event.customerId === undefined
              ? undefined
              : yield* customerAccountResolver.resolveCustomerAccount({
                  provider: reconciliation.event.provider,
                  customerId: reconciliation.event.customerId,
                  scope: reconciliation.event.tenantScope,
                  scopeId: reconciliation.event.tenantScopeId,
                  subscriptionId: reconciliation.subscription.subscriptionId,
                  subscriptionStatus: reconciliation.subscription.status,
                  action: reconciliation.action,
                });
          const resolvedProjection = yield* Schema.decodeUnknown(
            BillingWebhookPersistenceProjectionSchema,
          )({
            ...projection,
            ...(customerAccount !== undefined ? { customerAccount } : {}),
          });
          const persistedProjection =
            yield* repository.persistWebhookProjection(resolvedProjection);

          return yield* Schema.decodeUnknown(
            BillingWebhookProcessingResultSchema,
          )({
            reconciliation,
            projection: persistedProjection,
          });
        }),
    } satisfies BillingWebhookServiceApi;
  });

export const BillingWebhookServiceLive = Layer.effect(
  BillingWebhookService,
  makeBillingWebhookService(),
);
