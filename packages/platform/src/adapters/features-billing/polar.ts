import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  billingAndMeteringFeatureFlag,
  billingEnforcementMode,
  billingMeteringMode,
  BillingCheckoutSessionInputSchema,
  BillingCheckoutSessionSchema,
  BillingPlanSchema,
  billingSubscriptionStatus,
  billingWebhookEventType,
  billingWebhookReconciliationAction,
  BillingProviderWebhookInputSchema,
  BillingWebhookReconciliationSchema,
  identitySessionFeatureFlag,
  platformModuleId,
  PublicBillingPlanCatalogSchema,
  tenantManagementFeatureFlag,
  usageQuotaPeriod,
} from "@comvestec/contracts";
import type {
  BillingCheckoutSession,
  BillingPlan,
  BillingSubscriptionStatus,
  BillingWebhookEventType,
  BillingWebhookReconciliation,
  PublicBillingPlanCatalog,
} from "@comvestec/contracts";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const PolarAdapterOptionsSchema = Schema.Struct({
  apiKey: Schema.NonEmptyString,
  apiUrl: Schema.NonEmptyString,
  plans: Schema.optional(Schema.Array(BillingPlanSchema)),
  checkoutSessionTtlMinutes: Schema.optional(Schema.Number),
});

const DefaultPolarPlansSchema = Schema.Array(BillingPlanSchema);

const defaultPolarPlans = Schema.validateSync(DefaultPolarPlansSchema)([
  {
    planId: "plan_starter",
    planKey: "starter",
    displayName: "Starter",
    description: "Monthly or yearly access with non-metered core modules.",
    active: true,
    prices: [
      {
        priceId: "price_starter_month",
        interval: "month",
        currency: "USD",
        amountMinor: 1900,
        active: true,
        providerPriceId: "polar_price_starter_month",
      },
      {
        priceId: "price_starter_year",
        interval: "year",
        currency: "USD",
        amountMinor: 19000,
        active: true,
        providerPriceId: "polar_price_starter_year",
      },
    ],
    entitlements: [
      {
        moduleId: platformModuleId.tenantManagement,
        featureKey: tenantManagementFeatureFlag.enabled,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.identitySession,
        featureKey: identitySessionFeatureFlag.enabled,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.billingAndMetering,
        featureKey: billingAndMeteringFeatureFlag.apiRequests,
        included: true,
        meteringMode: billingMeteringMode.rateLimit,
        meterKey: billingAndMeteringFeatureFlag.apiRequests,
        unit: "request",
        quotaLimit: 60,
        quotaPeriod: usageQuotaPeriod.minute,
        enforcementMode: billingEnforcementMode.rateLimit,
      },
    ],
  },
] satisfies readonly BillingPlan[]);

export type PolarPlanNotFoundError = {
  readonly _tag: "PolarPlanNotFoundError";
  readonly planId: string;
};

export type PolarPriceNotFoundError = {
  readonly _tag: "PolarPriceNotFoundError";
  readonly planId: string;
  readonly priceId: string;
};

export type PolarWebhookSignatureError = {
  readonly _tag: "PolarWebhookSignatureError";
  readonly deliveryId: string;
};

const PolarHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.polar,
);

export type PolarHealthcheck = Schema.Schema.Type<
  typeof PolarHealthcheckSchema
>;

export type PolarAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.polar;
  readonly apiUrl: string;
  readonly healthcheck: Effect.Effect<PolarHealthcheck>;
  readonly listPlans: Effect.Effect<PublicBillingPlanCatalog>;
  readonly createCheckoutSession: (
    input: unknown,
  ) => Effect.Effect<
    BillingCheckoutSession,
    ParseResult.ParseError | PolarPlanNotFoundError | PolarPriceNotFoundError
  >;
  readonly reconcileWebhookEvent: (
    input: unknown,
  ) => Effect.Effect<
    BillingWebhookReconciliation,
    | ParseResult.ParseError
    | PolarWebhookSignatureError
    | PolarPlanNotFoundError
    | PolarPriceNotFoundError
  >;
};

export class PolarAdapter extends Context.Tag("PolarAdapter")<
  PolarAdapter,
  PolarAdapterService
>() {}

export const makePolarAdapter = (input: unknown) =>
  Schema.decodeUnknown(PolarAdapterOptionsSchema)(input).pipe(
    Effect.map((options): PolarAdapterService => {
      const plans = options.plans ?? defaultPolarPlans;
      const findActivePlan = (planId: string) =>
        plans.find(
          (candidate) => candidate.planId === planId && candidate.active,
        );
      const findActivePrice = (plan: BillingPlan, priceId: string) =>
        plan.prices.find(
          (candidate) => candidate.priceId === priceId && candidate.active,
        );
      const toSubscriptionStatus = (
        eventType: BillingWebhookEventType,
      ): BillingSubscriptionStatus => {
        switch (eventType) {
          case billingWebhookEventType.checkoutCompleted:
          case billingWebhookEventType.subscriptionRenewed:
          case billingWebhookEventType.entitlementUpdated:
            return billingSubscriptionStatus.active;
          case billingWebhookEventType.subscriptionCanceled:
            return billingSubscriptionStatus.canceled;
          case billingWebhookEventType.paymentFailed:
            return billingSubscriptionStatus.pastDue;
        }
      };
      const publicPlanCatalog = Schema.validateSync(
        PublicBillingPlanCatalogSchema,
      )(
        plans
          .filter((plan) => plan.active)
          .map((plan) => ({
            planId: plan.planId,
            planKey: plan.planKey,
            displayName: plan.displayName,
            description: plan.description,
            active: plan.active,
            prices: plan.prices.filter((price) => price.active),
          })),
      );

      const createCheckoutSession: PolarAdapterService["createCheckoutSession"] =
        (checkoutInput: unknown) =>
          Schema.decodeUnknown(BillingCheckoutSessionInputSchema)(
            checkoutInput,
          ).pipe(
            Effect.flatMap(
              (
                decodedInput,
              ): Effect.Effect<
                BillingCheckoutSession,
                | ParseResult.ParseError
                | PolarPlanNotFoundError
                | PolarPriceNotFoundError
              > => {
                const plan = findActivePlan(decodedInput.planId);

                if (plan === undefined) {
                  return Effect.fail({
                    _tag: "PolarPlanNotFoundError",
                    planId: decodedInput.planId,
                  } satisfies PolarPlanNotFoundError);
                }

                const price = findActivePrice(plan, decodedInput.priceId);

                if (price === undefined) {
                  return Effect.fail({
                    _tag: "PolarPriceNotFoundError",
                    planId: plan.planId,
                    priceId: decodedInput.priceId,
                  } satisfies PolarPriceNotFoundError);
                }

                const checkoutSessionId = [
                  platformAdapterServiceName.polar,
                  decodedInput.tenantScopeId,
                  plan.planKey,
                  price.priceId,
                ].join(":");

                return Schema.decodeUnknown(BillingCheckoutSessionSchema)({
                  checkoutSessionId,
                  checkoutUrl:
                    `${options.apiUrl}/checkout/${encodeURIComponent(checkoutSessionId)}` +
                    `?success_url=${encodeURIComponent(decodedInput.successUrl)}` +
                    `&cancel_url=${encodeURIComponent(decodedInput.cancelUrl)}`,
                  planId: plan.planId,
                  priceId: price.priceId,
                  interval: price.interval,
                  provider: platformAdapterServiceName.polar,
                  expiresAt: new Date(
                    Date.now() +
                      (options.checkoutSessionTtlMinutes ?? 30) * 60_000,
                  ).toISOString(),
                });
              },
            ),
          );

      const reconcileWebhookEvent: PolarAdapterService["reconcileWebhookEvent"] =
        (webhookInput: unknown) =>
          Effect.gen(function* () {
            const decodedInput = yield* Schema.decodeUnknown(
              BillingProviderWebhookInputSchema,
            )(webhookInput);

            if (!decodedInput.verifiedSignature) {
              yield* Effect.fail({
                _tag: "PolarWebhookSignatureError",
                deliveryId: decodedInput.deliveryId,
              } satisfies PolarWebhookSignatureError);
            }

            const plan = yield* Effect.fromNullable(
              findActivePlan(decodedInput.planId),
            ).pipe(
              Effect.mapError(
                () =>
                  ({
                    _tag: "PolarPlanNotFoundError",
                    planId: decodedInput.planId,
                  }) satisfies PolarPlanNotFoundError,
              ),
            );

            const price = yield* Effect.fromNullable(
              findActivePrice(plan, decodedInput.priceId),
            ).pipe(
              Effect.mapError(
                () =>
                  ({
                    _tag: "PolarPriceNotFoundError",
                    planId: plan.planId,
                    priceId: decodedInput.priceId,
                  }) satisfies PolarPriceNotFoundError,
              ),
            );

            const status = toSubscriptionStatus(decodedInput.eventType);
            const action =
              decodedInput.eventType ===
              billingWebhookEventType.checkoutCompleted
                ? billingWebhookReconciliationAction.activate
                : decodedInput.eventType ===
                    billingWebhookEventType.subscriptionRenewed
                  ? billingWebhookReconciliationAction.renew
                  : decodedInput.eventType ===
                      billingWebhookEventType.subscriptionCanceled
                    ? billingWebhookReconciliationAction.deactivate
                    : decodedInput.eventType ===
                        billingWebhookEventType.paymentFailed
                      ? billingWebhookReconciliationAction.flagPastDue
                      : billingWebhookReconciliationAction.sync;

            return yield* Schema.decodeUnknown(
              BillingWebhookReconciliationSchema,
            )({
              action,
              event: {
                provider: decodedInput.provider,
                deliveryId: decodedInput.deliveryId,
                eventId: decodedInput.eventId,
                eventType: decodedInput.eventType,
                occurredAt: decodedInput.occurredAt,
                subscriptionId: decodedInput.subscriptionId,
                tenantScope: decodedInput.tenantScope,
                tenantScopeId: decodedInput.tenantScopeId,
                planId: decodedInput.planId,
                priceId: decodedInput.priceId,
                customerId: decodedInput.customerId,
              },
              subscription: {
                subscriptionId: decodedInput.subscriptionId,
                planId: plan.planId,
                priceId: price.priceId,
                status,
                interval: price.interval,
                currentPeriodEnd: decodedInput.currentPeriodEnd,
                cancelAt: decodedInput.cancelAt,
                entitlements: plan.entitlements,
              },
              entitlementsActive: status === billingSubscriptionStatus.active,
            });
          });

      return {
        serviceName: platformAdapterServiceName.polar,
        apiUrl: options.apiUrl,
        healthcheck: Effect.succeed({
          healthy: true,
          service: platformAdapterServiceName.polar,
        }),
        listPlans: Effect.succeed(publicPlanCatalog),
        createCheckoutSession,
        reconcileWebhookEvent,
      };
    }),
  );

export const makePolarAdapterLayer = (options: unknown) =>
  Layer.effect(PolarAdapter, makePolarAdapter(options));
