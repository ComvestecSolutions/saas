import { Effect, Schema } from "effect";
import { env as processEnvironment, exit as exitProcess } from "node:process";
import type { BillingPlan } from "@comvestec/contracts";
import { makePolarAdapter } from "@comvestec/platform";
import {
  printToolingScriptError,
  type ToolingScriptConfigurationError,
} from "./common";
import {
  describePlanMismatch,
  findDuplicatePlanKeys,
  seedPlans,
} from "./polar-plan-catalog";

const SubscriberJourneyRepairEnvironmentSchema = Schema.Struct({
  POLAR_ACCESS_TOKEN: Schema.NonEmptyString,
  POLAR_API_URL: Schema.NonEmptyString,
});

type SubscriberJourneyRepairEnvironment = Schema.Schema.Type<
  typeof SubscriberJourneyRepairEnvironmentSchema
>;

const decodeRepairEnvironment = Schema.decodeUnknown(
  SubscriberJourneyRepairEnvironmentSchema,
);

const buildDuplicatePlanKeyError = (
  duplicatePlanKeys: readonly string[],
): ToolingScriptConfigurationError => ({
  _tag: "ToolingScriptConfigurationError",
  key: duplicatePlanKeys[0] ?? "planKey",
  message: `Polar public catalog still contains duplicate managed plan keys: ${duplicatePlanKeys.join(", ")}.`,
});

const buildPlanMismatchError = (
  planKey: string,
  mismatch: string,
): ToolingScriptConfigurationError => ({
  _tag: "ToolingScriptConfigurationError",
  key: planKey,
  message: `Polar managed plan ${planKey} does not match the expected definition after repair: ${mismatch}.`,
});

const buildMissingPlanError = (
  missingPlanKeys: readonly string[],
): ToolingScriptConfigurationError => ({
  _tag: "ToolingScriptConfigurationError",
  key: missingPlanKeys[0] ?? "planKey",
  message: `Polar public catalog is still missing canonical managed plans: ${missingPlanKeys.join(", ")}.`,
});

const partitionPublicPlans = (plans: readonly BillingPlan[]) => {
  const plansByKey = new Map<string, BillingPlan[]>();

  for (const plan of plans) {
    const currentPlans = plansByKey.get(plan.planKey) ?? [];
    currentPlans.push(plan);
    plansByKey.set(plan.planKey, currentPlans);
  }

  const canonicalPlansByKey = new Map<string, BillingPlan>();
  const duplicatePlans: BillingPlan[] = [];

  for (const [planKey, matchingPlans] of plansByKey) {
    canonicalPlansByKey.set(planKey, matchingPlans[0]!);
    duplicatePlans.push(...matchingPlans.slice(1));
  }

  return {
    canonicalPlansByKey,
    duplicatePlans,
  };
};

const printCatalog = (plans: readonly BillingPlan[]) => {
  const sortedPlans = [...plans].sort((left, right) =>
    left.planKey.localeCompare(right.planKey),
  );

  console.log("Current Polar public catalog:");

  for (const plan of sortedPlans) {
    const primaryPrice = plan.prices.find((price) => price.active);

    console.log(
      `- ${plan.planKey}: ${plan.planId} (${primaryPrice?.amountMinor ?? "n/a"} ${primaryPrice?.currency ?? ""}/${primaryPrice?.interval ?? "n/a"})`,
    );
  }
};

const main = Effect.gen(function* () {
  const environment: SubscriberJourneyRepairEnvironment =
    yield* decodeRepairEnvironment(processEnvironment);
  const polar = yield* makePolarAdapter({
    apiKey: environment.POLAR_ACCESS_TOKEN,
    apiUrl: environment.POLAR_API_URL,
  });

  const currentCatalog = yield* polar.listPlans;
  const duplicatePlanKeys = findDuplicatePlanKeys(currentCatalog);

  if (duplicatePlanKeys.length === 0) {
    console.log(
      "No duplicate public Polar managed plans found. Ensuring canonical plans exist...",
    );
  } else {
    console.log(
      `Repairing duplicate Polar public plans for keys: ${duplicatePlanKeys.join(", ")}`,
    );
  }

  const { canonicalPlansByKey, duplicatePlans } =
    partitionPublicPlans(currentCatalog);
  const missingPlans = seedPlans.filter(
    (plan) => !canonicalPlansByKey.has(plan.planKey),
  );
  const reusableDuplicatePlans = [...duplicatePlans];

  for (const missingPlan of missingPlans) {
    const duplicatePlan = reusableDuplicatePlans.shift();

    if (duplicatePlan === undefined) {
      break;
    }

    const updatedPlan = yield* polar.updateManagedBillingPlan(
      duplicatePlan.planId,
      missingPlan,
    );
    const mismatch = describePlanMismatch(updatedPlan.plan, missingPlan);

    if (mismatch !== undefined) {
      return yield* Effect.fail(
        buildPlanMismatchError(missingPlan.planKey, mismatch),
      );
    }

    console.log(
      `- repurposed duplicate ${duplicatePlan.planKey} (${duplicatePlan.planId}) into ${updatedPlan.plan.planKey} (${updatedPlan.plan.planId})`,
    );
  }

  for (const duplicatePlan of reusableDuplicatePlans) {
    const archivedPlan = yield* polar.archiveManagedBillingPlan(
      duplicatePlan.planId,
    );

    console.log(
      `- archived duplicate ${archivedPlan.plan.planKey} (${archivedPlan.plan.planId})`,
    );
  }

  const repairedCatalog = yield* polar.listPlans;
  const duplicateKeysAfterRepair = findDuplicatePlanKeys(repairedCatalog);

  if (duplicateKeysAfterRepair.length > 0) {
    return yield* Effect.fail(
      buildDuplicatePlanKeyError(duplicateKeysAfterRepair),
    );
  }

  const repairedPlanKeys = new Set(repairedCatalog.map((plan) => plan.planKey));
  const missingPlansAfterRepair = seedPlans.filter(
    (plan) => !repairedPlanKeys.has(plan.planKey),
  );

  for (const missingPlan of missingPlansAfterRepair) {
    const createdPlan = yield* polar.createManagedBillingPlan(missingPlan);
    const mismatch = describePlanMismatch(createdPlan.plan, missingPlan);

    if (mismatch !== undefined) {
      return yield* Effect.fail(
        buildPlanMismatchError(missingPlan.planKey, mismatch),
      );
    }

    console.log(
      `- created missing ${createdPlan.plan.planKey} (${createdPlan.plan.planId})`,
    );
  }

  const finalCatalog = yield* polar.listPlans;
  const finalDuplicatePlanKeys = findDuplicatePlanKeys(finalCatalog);

  if (finalDuplicatePlanKeys.length > 0) {
    return yield* Effect.fail(
      buildDuplicatePlanKeyError(finalDuplicatePlanKeys),
    );
  }

  const finalPlanKeys = new Set(finalCatalog.map((plan) => plan.planKey));
  const finalMissingPlans = seedPlans
    .map((plan) => plan.planKey)
    .filter((planKey) => !finalPlanKeys.has(planKey));

  if (finalMissingPlans.length > 0) {
    return yield* Effect.fail(buildMissingPlanError(finalMissingPlans));
  }

  printCatalog(finalCatalog);
});

try {
  await Effect.runPromise(main);
} catch (error) {
  printToolingScriptError(error);
  exitProcess(1);
}
