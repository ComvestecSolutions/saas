import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import { BillingWebhookReconciliationSchema } from "@comvestec/contracts";
import type {
  PolarPlanNotFoundError,
  PolarPriceNotFoundError,
  PolarWebhookSignatureError,
} from "@comvestec/platform";
import { PolarAdapter } from "@comvestec/platform";
import {
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

export type BillingWebhookProcessingError =
  | ParseResult.ParseError
  | PolarWebhookSignatureError
  | PolarPlanNotFoundError
  | PolarPriceNotFoundError
  | BillingWebhookPostgresRepositoryError;

export type BillingWebhookServiceApi = {
  readonly processPolarWebhook: (
    input: unknown,
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

    return {
      processPolarWebhook: (input: unknown) =>
        Effect.gen(function* () {
          const reconciliation = yield* polar.reconcileWebhookEvent(input);
          const projection =
            yield* billingMetering.buildWebhookPersistenceProjection(
              reconciliation,
            );
          const persistedProjection =
            yield* repository.persistWebhookProjection(projection);

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
