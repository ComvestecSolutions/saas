import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  PlatformModuleIdSchema,
  PlatformScopeSchema,
  RequestContextSchema,
  UsageQuotaPeriodSchema,
} from "@comvestec/contracts";

export const UsageQuotaSchema = Schema.Struct({
  featureKey: Schema.NonEmptyString,
  limit: Schema.Number,
  period: UsageQuotaPeriodSchema,
  hardLimit: Schema.Boolean,
});

export type UsageQuota = Schema.Schema.Type<typeof UsageQuotaSchema>;

export const UsageMeterEventSchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  featureKey: Schema.NonEmptyString,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  quantity: Schema.Number,
  unit: Schema.NonEmptyString,
  capturedAt: Schema.NonEmptyString,
});

export type UsageMeterEvent = Schema.Schema.Type<typeof UsageMeterEventSchema>;

const UsageQuotaCheckInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  quota: UsageQuotaSchema,
  consumed: Schema.Number,
  event: UsageMeterEventSchema,
});

export const UsageQuotaDecisionSchema = Schema.Struct({
  allowed: Schema.Boolean,
  remaining: Schema.Number,
  exceededBy: Schema.Number,
  reason: Schema.NonEmptyString,
});

export type UsageQuotaDecision = Schema.Schema.Type<
  typeof UsageQuotaDecisionSchema
>;

export const InternalCostSampleSchema = Schema.Struct({
  resource: Schema.NonEmptyString,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  quantity: Schema.Number,
  unitCost: Schema.Number,
});

export const InternalCostAllocationSchema = Schema.Struct({
  resource: Schema.NonEmptyString,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  quantity: Schema.Number,
  unitCost: Schema.Number,
  totalCost: Schema.Number,
});

export type InternalCostAllocation = Schema.Schema.Type<
  typeof InternalCostAllocationSchema
>;

export type BillingMeteringModuleService = {
  readonly evaluateQuota: (
    input: unknown,
  ) => Effect.Effect<UsageQuotaDecision, ParseResult.ParseError>;
  readonly allocateInternalCosts: (
    samples: readonly Schema.Schema.Type<typeof InternalCostSampleSchema>[],
  ) => Effect.Effect<readonly InternalCostAllocation[], ParseResult.ParseError>;
};

export class BillingMeteringModule extends Context.Tag("BillingMeteringModule")<
  BillingMeteringModule,
  BillingMeteringModuleService
>() {}

export const makeBillingMeteringModule = () =>
  Effect.succeed<BillingMeteringModuleService>({
    evaluateQuota: (input: unknown) =>
      Schema.decodeUnknown(UsageQuotaCheckInputSchema)(input).pipe(
        Effect.flatMap((request) => {
          const nextConsumed = request.consumed + request.event.quantity;
          const remaining = Math.max(request.quota.limit - nextConsumed, 0);
          const exceededBy = Math.max(nextConsumed - request.quota.limit, 0);

          return Schema.decodeUnknown(UsageQuotaDecisionSchema)({
            allowed: exceededBy === 0 || !request.quota.hardLimit,
            remaining,
            exceededBy,
            reason:
              exceededBy === 0
                ? "Quota available."
                : request.quota.hardLimit
                  ? "Quota exhausted and hard limit enforcement blocks the request."
                  : "Quota exhausted but soft enforcement allows observation-only mode.",
          });
        }),
      ),
    allocateInternalCosts: (samples) =>
      Effect.forEach(samples, (sample) =>
        Schema.decodeUnknown(InternalCostAllocationSchema)({
          resource: sample.resource,
          scope: sample.scope,
          scopeId: sample.scopeId,
          quantity: sample.quantity,
          unitCost: sample.unitCost,
          totalCost: sample.quantity * sample.unitCost,
        }),
      ),
  });

export const BillingMeteringModuleLive = Layer.effect(
  BillingMeteringModule,
  makeBillingMeteringModule(),
);
