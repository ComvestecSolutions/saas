import { Effect, Schema } from "effect";
import {
  actorType,
  BillingPlanCreateResultSchema,
  platformScope,
  PublicBillingPlanCatalogSchema,
} from "@comvestec/contracts";
import {
  adminBillingApiPath,
  subscriberJourneySessionHeaderName,
  subscriberJourneyApiPath,
} from "@comvestec/platform";
import {
  persistSyntheticRequestContextSession,
  printToolingScriptError,
  requestJson,
  type ToolingScriptConfigurationError,
} from "./common";
import {
  describePlanMismatch,
  findDuplicatePlanKeys,
  seedPlans,
} from "./polar-plan-catalog";

const SubscriberJourneySeedEnvironmentSchema = Schema.Struct({
  SUBSCRIBER_JOURNEY_API_PORT: Schema.NonEmptyString,
  VALKEY_URL: Schema.NonEmptyString,
});

const SubscriberJourneyPlanListResponseSchema = Schema.Struct({
  plans: PublicBillingPlanCatalogSchema,
});

type SubscriberJourneySeedEnvironment = Schema.Schema.Type<
  typeof SubscriberJourneySeedEnvironmentSchema
>;

const decodeSeedEnvironment = Schema.decodeUnknown(
  SubscriberJourneySeedEnvironmentSchema,
);

const decodePlanListResponse = Schema.decodeUnknown(
  SubscriberJourneyPlanListResponseSchema,
);

const decodeBillingPlanCreateResult = Schema.decodeUnknown(
  BillingPlanCreateResultSchema,
);

const toApiUrl = (port: number, pathname: string) =>
  new URL(pathname, `http://127.0.0.1:${port}`).toString();

const resolvePort = (value: string) =>
  Effect.try({
    try: () => {
      const port = Number.parseInt(value, 10);

      if (!Number.isInteger(port) || port <= 0) {
        throw new Error(
          "SUBSCRIBER_JOURNEY_API_PORT must be a positive integer.",
        );
      }

      return port;
    },
    catch: () =>
      ({
        _tag: "ToolingScriptConfigurationError",
        key: "SUBSCRIBER_JOURNEY_API_PORT",
        message: "SUBSCRIBER_JOURNEY_API_PORT must be a positive integer.",
      }) satisfies ToolingScriptConfigurationError,
  });

const buildDuplicatePlanKeyError = (
  duplicatePlanKeys: readonly string[],
): ToolingScriptConfigurationError => ({
  _tag: "ToolingScriptConfigurationError",
  key: duplicatePlanKeys[0] ?? "planKey",
  message: `Polar public catalog already contains duplicate managed plan keys: ${duplicatePlanKeys.join(", ")}. Remove duplicate products before rerunning the seed.`,
});

const persistPlatformOperatorSession = (
  environment: SubscriberJourneySeedEnvironment,
  sessionId: string,
  correlationId: string,
) =>
  persistSyntheticRequestContextSession({
    valkeyUrl: environment.VALKEY_URL,
    sessionId,
    requestContext: {
      actorType: actorType.platformOperator,
      actorId: "usr_platform_operator_seed",
      sessionId,
      correlationId,
      reason:
        "Seed managed Polar billing plans for live subscriber journey smoke.",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    },
  });

const main = Effect.gen(function* () {
  const environment = yield* decodeSeedEnvironment(Bun.env);
  const port = yield* resolvePort(environment.SUBSCRIBER_JOURNEY_API_PORT);
  const correlationId = `corr_seed_polar_${Date.now()}`;
  const sessionId = `sess_seed_polar_${Date.now()}`;

  yield* persistPlatformOperatorSession(environment, sessionId, correlationId);

  const catalogResponse = yield* requestJson({
    operation: "subscriberJourney.listPublicPlans",
    url: toApiUrl(port, subscriberJourneyApiPath.listPublicPlans),
    decode: decodePlanListResponse,
  });

  const duplicatePlanKeys = findDuplicatePlanKeys(catalogResponse.plans);

  if (duplicatePlanKeys.length > 0) {
    return yield* Effect.fail(buildDuplicatePlanKeyError(duplicatePlanKeys));
  }

  const publicPlansByKey = new Map(
    catalogResponse.plans.map((plan) => [plan.planKey, plan]),
  );

  for (const seedPlan of seedPlans) {
    const existingPlan = publicPlansByKey.get(seedPlan.planKey);

    if (existingPlan === undefined) {
      continue;
    }

    const mismatch = describePlanMismatch(existingPlan, seedPlan);

    if (mismatch !== undefined) {
      return yield* Effect.fail({
        _tag: "ToolingScriptConfigurationError",
        key: seedPlan.planKey,
        message: `Polar already has a public ${seedPlan.planKey} plan, but it does not match the current seed definition: ${mismatch}.`,
      } satisfies ToolingScriptConfigurationError);
    }
  }

  const missingPlans = seedPlans.filter(
    (plan) => !publicPlansByKey.has(plan.planKey),
  );

  if (missingPlans.length === 0) {
    console.log(
      "Polar public catalog already contains the expected managed plans.",
    );

    for (const plan of seedPlans) {
      console.log(`- ${plan.planKey}: already present`);
    }

    return;
  }

  console.log(
    "Seeding missing Polar public plans through the backend admin billing route...",
  );

  for (const plan of missingPlans) {
    const result = yield* requestJson({
      operation: `adminBilling.createManagedPlan:${plan.planKey}`,
      url: toApiUrl(port, adminBillingApiPath.createManagedPlan),
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          [subscriberJourneySessionHeaderName]: sessionId,
        },
        body: JSON.stringify({
          plan,
        }),
      },
      decode: decodeBillingPlanCreateResult,
    });

    const createMismatch = describePlanMismatch(result.plan, plan);

    if (createMismatch !== undefined) {
      return yield* Effect.fail({
        _tag: "ToolingScriptConfigurationError",
        key: plan.planKey,
        message: `Backend create returned a ${plan.planKey} plan that does not match the current seed definition: ${createMismatch}.`,
      } satisfies ToolingScriptConfigurationError);
    }

    console.log(
      `- created ${result.plan.planKey} (${result.plan.planId}) at ${result.plan.prices[0]?.amountMinor ?? plan.price.amountMinor} ${result.plan.prices[0]?.currency ?? plan.price.currency}/${result.plan.prices[0]?.interval ?? plan.price.interval}`,
    );
  }

  const seededCatalog = yield* requestJson({
    operation: "subscriberJourney.listPublicPlans.postSeed",
    url: toApiUrl(port, subscriberJourneyApiPath.listPublicPlans),
    decode: decodePlanListResponse,
  });

  const duplicateSeededPlanKeys = findDuplicatePlanKeys(seededCatalog.plans);

  if (duplicateSeededPlanKeys.length > 0) {
    return yield* Effect.fail(
      buildDuplicatePlanKeyError(duplicateSeededPlanKeys),
    );
  }

  console.log("Polar public catalog ready for live subscriber journey smoke:");

  for (const plan of seededCatalog.plans) {
    console.log(
      `- ${plan.planKey}: ${plan.displayName} (${plan.prices[0]?.amountMinor ?? "n/a"} ${plan.prices[0]?.currency ?? ""}/${plan.prices[0]?.interval ?? "n/a"})`,
    );
  }
});

try {
  await Effect.runPromise(main);
} catch (error) {
  printToolingScriptError(error);
  process.exit(1);
}
