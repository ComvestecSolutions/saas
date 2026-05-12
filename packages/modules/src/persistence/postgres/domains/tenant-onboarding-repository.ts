import { and, eq, inArray } from "drizzle-orm";
import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  onboardingStepStatus,
  type TenantOnboardingReviewRun,
  TenantOnboardingReviewRunSchema,
  type TenantOnboardingRunStatus,
  tenantOnboardingRunStatus,
  TenantOnboardingRunStatusSchema,
} from "@comvestec/contracts";
import { TenantOnboardingPlanSchema } from "../../../domains/tenant-management";
import type { OnboardingStep } from "../../../domains/tenant-management";
import type { PostgresDatabase } from "../database";
import {
  tenantOnboardingRunsTable,
  tenantOnboardingStepsTable,
} from "./tenant-onboarding";

export { tenantOnboardingRunStatus, TenantOnboardingRunStatusSchema };
export type { TenantOnboardingRunStatus };

const TenantOnboardingRunMetadataSchema = Schema.Record({
  key: Schema.NonEmptyString,
  value: Schema.Any,
});

export const PersistTenantOnboardingRunSchema = Schema.Struct({
  runId: Schema.NonEmptyString,
  triggeredBy: Schema.NonEmptyString,
  correlationId: Schema.optional(Schema.NonEmptyString),
  status: TenantOnboardingRunStatusSchema,
  currentStepId: Schema.optional(Schema.NonEmptyString),
  plan: TenantOnboardingPlanSchema,
  metadata: Schema.optional(TenantOnboardingRunMetadataSchema),
  startedAt: Schema.optional(Schema.NonEmptyString),
  completedAt: Schema.optional(Schema.NonEmptyString),
});

export type PersistTenantOnboardingRun = Schema.Schema.Type<
  typeof PersistTenantOnboardingRunSchema
>;

export const TenantOnboardingPersistenceProjectionSchema = Schema.Struct({
  runId: Schema.NonEmptyString,
  triggeredBy: Schema.NonEmptyString,
  correlationId: Schema.optional(Schema.NonEmptyString),
  status: TenantOnboardingRunStatusSchema,
  currentStepId: Schema.optional(Schema.NonEmptyString),
  plan: TenantOnboardingPlanSchema,
  metadata: TenantOnboardingRunMetadataSchema,
  startedAt: Schema.optional(Schema.NonEmptyString),
  completedAt: Schema.optional(Schema.NonEmptyString),
});

export type TenantOnboardingPersistenceProjection = Schema.Schema.Type<
  typeof TenantOnboardingPersistenceProjectionSchema
>;

export type TenantOnboardingRunInsert =
  typeof tenantOnboardingRunsTable.$inferInsert;

export type TenantOnboardingStepInsert =
  typeof tenantOnboardingStepsTable.$inferInsert;

export type TenantOnboardingPostgresUpsertSet = {
  readonly run: TenantOnboardingRunInsert;
  readonly steps: ReadonlyArray<TenantOnboardingStepInsert>;
};

export type TenantOnboardingPostgresRepositoryPersistenceError = {
  readonly _tag: "TenantOnboardingPostgresRepositoryPersistenceError";
  readonly operation: "persistOnboardingRun";
  readonly cause: unknown;
};

export type TenantOnboardingPostgresRepositoryQueryError = {
  readonly _tag: "TenantOnboardingPostgresRepositoryQueryError";
  readonly operation: "getOnboardingRunByTenant";
  readonly cause: unknown;
};

export type TenantOnboardingPostgresRepositoryError =
  | ParseResult.ParseError
  | TenantOnboardingPostgresRepositoryPersistenceError
  | TenantOnboardingPostgresRepositoryQueryError;

const tenantOnboardingReviewHistoryLimit = 20;

const tenantOnboardingStepReviewSortOrder = new Map(
  [
    "tenant-profile",
    "team-invites",
    "security-baseline",
    "branding",
    "billing",
  ].map((stepId, index) => [stepId, index] as const),
);

const parseTimestamp = (value: string | undefined) =>
  value === undefined ? undefined : new Date(value);

const decodePersistTenantOnboardingRun = Schema.decodeUnknown(
  PersistTenantOnboardingRunSchema,
);

const decodeTenantOnboardingPersistenceProjection = Schema.decodeUnknown(
  TenantOnboardingPersistenceProjectionSchema,
);

const buildTenantOnboardingStepInsert = (runId: string, step: OnboardingStep) =>
  ({
    runId,
    stepId: step.stepId,
    label: step.label,
    ...(step.requiredModuleId !== undefined
      ? { requiredModuleId: step.requiredModuleId }
      : {}),
    status: step.status,
    retryCount: 0,
    ...(step.status === onboardingStepStatus.completed
      ? { completedAt: new Date() }
      : {}),
    metadata: {},
  }) satisfies TenantOnboardingStepInsert;

export const buildTenantOnboardingPostgresUpsertSet = (
  input: PersistTenantOnboardingRun,
) =>
  decodePersistTenantOnboardingRun(input).pipe(
    Effect.map(
      (persistedRun): TenantOnboardingPostgresUpsertSet => ({
        run: {
          runId: persistedRun.runId,
          tenantScope: persistedRun.plan.tenantScope,
          tenantScopeId: persistedRun.plan.tenantScopeId,
          triggeredBy: persistedRun.triggeredBy,
          status: persistedRun.status,
          ...(persistedRun.currentStepId !== undefined
            ? { currentStepId: persistedRun.currentStepId }
            : {}),
          ...(persistedRun.correlationId !== undefined
            ? { correlationId: persistedRun.correlationId }
            : {}),
          metadata: persistedRun.metadata ?? {},
          ...(persistedRun.startedAt !== undefined
            ? { startedAt: parseTimestamp(persistedRun.startedAt) }
            : {}),
          ...(persistedRun.completedAt !== undefined
            ? { completedAt: parseTimestamp(persistedRun.completedAt) }
            : {}),
        },
        steps: persistedRun.plan.steps.map((step) =>
          buildTenantOnboardingStepInsert(persistedRun.runId, step),
        ),
      }),
    ),
  );

const normalizeTenantOnboardingProjection = (
  input: PersistTenantOnboardingRun,
) =>
  decodeTenantOnboardingPersistenceProjection({
    ...input,
    metadata: input.metadata ?? {},
  });

const decodeTenantOnboardingReviewRun = Schema.decodeUnknown(
  TenantOnboardingReviewRunSchema,
);

const buildTenantOnboardingReviewStep = (step: {
  readonly stepId: string;
  readonly label: string;
  readonly status: string;
  readonly requiredModuleId: string | null;
  readonly retryCount: number;
}) => ({
  stepId: step.stepId,
  label: step.label,
  status: step.status,
  ...(step.requiredModuleId === null
    ? {}
    : { requiredModuleId: step.requiredModuleId }),
  retryCount: step.retryCount,
});

const sortTenantOnboardingReviewSteps = (
  steps: Array<ReturnType<typeof buildTenantOnboardingReviewStep>>,
) =>
  steps.sort((left, right) => {
    const leftOrder = tenantOnboardingStepReviewSortOrder.get(left.stepId);
    const rightOrder = tenantOnboardingStepReviewSortOrder.get(right.stepId);

    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder;
    }

    if (leftOrder !== undefined) {
      return -1;
    }

    if (rightOrder !== undefined) {
      return 1;
    }

    return left.stepId.localeCompare(right.stepId);
  });

const buildTenantOnboardingReviewRun = (input: {
  readonly run:
    | {
        readonly runId: string;
        readonly tenantScope: string;
        readonly tenantScopeId: string;
        readonly triggeredBy: string;
        readonly correlationId: string | null;
        readonly status: string;
        readonly currentStepId: string | null;
        readonly startedAt: Date;
        readonly completedAt: Date | null | undefined;
      }
    | undefined;
  readonly steps: ReadonlyArray<{
    readonly runId: string;
    readonly stepId: string;
    readonly label: string;
    readonly status: string;
    readonly requiredModuleId: string | null;
    readonly retryCount: number;
  }>;
}) => {
  if (input.run === undefined) {
    return Effect.succeed(undefined);
  }

  const stepsByRunId = new Map<
    string,
    Array<ReturnType<typeof buildTenantOnboardingReviewStep>>
  >();

  for (const step of input.steps) {
    const existingSteps = stepsByRunId.get(step.runId);
    const reviewStep = buildTenantOnboardingReviewStep(step);

    if (existingSteps === undefined) {
      stepsByRunId.set(step.runId, [reviewStep]);
      continue;
    }

    existingSteps.push(reviewStep);
  }

  for (const reviewSteps of stepsByRunId.values()) {
    sortTenantOnboardingReviewSteps(reviewSteps);
  }

  const completedAt =
    input.run.completedAt == null
      ? undefined
      : input.run.completedAt.toISOString();

  return decodeTenantOnboardingReviewRun({
    runId: input.run.runId,
    triggeredBy: input.run.triggeredBy,
    ...(input.run.correlationId === null
      ? {}
      : { correlationId: input.run.correlationId }),
    status: input.run.status,
    ...(input.run.currentStepId === null
      ? {}
      : { currentStepId: input.run.currentStepId }),
    startedAt: input.run.startedAt.toISOString(),
    ...(completedAt === undefined ? {} : { completedAt }),
    steps: stepsByRunId.get(input.run.runId) ?? [],
  });
};

export type TenantOnboardingPostgresRepositoryService = {
  readonly persistOnboardingRun: (
    input: PersistTenantOnboardingRun,
  ) => Effect.Effect<
    TenantOnboardingPersistenceProjection,
    TenantOnboardingPostgresRepositoryError
  >;
  readonly getOnboardingRunByTenant: (input: {
    readonly tenantScope: PersistTenantOnboardingRun["plan"]["tenantScope"];
    readonly tenantScopeId: string;
  }) => Effect.Effect<
    TenantOnboardingReviewRun | undefined,
    TenantOnboardingPostgresRepositoryError
  >;
};

export class TenantOnboardingPostgresRepository extends Context.Tag(
  "TenantOnboardingPostgresRepository",
)<
  TenantOnboardingPostgresRepository,
  TenantOnboardingPostgresRepositoryService
>() {}

export const makeTenantOnboardingPostgresRepository = (
  database: PostgresDatabase,
) =>
  Effect.succeed<TenantOnboardingPostgresRepositoryService>({
    persistOnboardingRun: (input: PersistTenantOnboardingRun) =>
      decodePersistTenantOnboardingRun(input).pipe(
        Effect.flatMap((persistedRun) =>
          buildTenantOnboardingPostgresUpsertSet(persistedRun)
            .pipe(
              Effect.flatMap((upsertSet) =>
                Effect.tryPromise({
                  try: () =>
                    database.transaction(async (tx) => {
                      await tx
                        .insert(tenantOnboardingRunsTable)
                        .values(upsertSet.run)
                        .onConflictDoUpdate({
                          target: [tenantOnboardingRunsTable.runId],
                          set: {
                            tenantScope: upsertSet.run.tenantScope,
                            tenantScopeId: upsertSet.run.tenantScopeId,
                            triggeredBy: upsertSet.run.triggeredBy,
                            status: upsertSet.run.status,
                            currentStepId: upsertSet.run.currentStepId,
                            correlationId: upsertSet.run.correlationId,
                            metadata: upsertSet.run.metadata,
                            startedAt: upsertSet.run.startedAt,
                            completedAt: upsertSet.run.completedAt,
                          },
                        })
                        .execute();

                      for (const step of upsertSet.steps) {
                        await tx
                          .insert(tenantOnboardingStepsTable)
                          .values(step)
                          .onConflictDoUpdate({
                            target: [
                              tenantOnboardingStepsTable.runId,
                              tenantOnboardingStepsTable.stepId,
                            ],
                            set: {
                              label: step.label,
                              requiredModuleId: step.requiredModuleId,
                              status: step.status,
                              retryCount: step.retryCount,
                              lastAttemptedAt: step.lastAttemptedAt,
                              completedAt: step.completedAt,
                              metadata: step.metadata,
                            },
                          })
                          .execute();
                      }
                    }),
                  catch: (cause) =>
                    ({
                      _tag: "TenantOnboardingPostgresRepositoryPersistenceError",
                      operation: "persistOnboardingRun",
                      cause,
                    }) satisfies TenantOnboardingPostgresRepositoryPersistenceError,
                }),
              ),
            )
            .pipe(
              Effect.flatMap(() =>
                normalizeTenantOnboardingProjection(persistedRun),
              ),
            ),
        ),
      ),
    getOnboardingRunByTenant: (input) =>
      Effect.tryPromise({
        try: async () => {
          const runs = await database
            .select()
            .from(tenantOnboardingRunsTable)
            .where(
              and(
                eq(tenantOnboardingRunsTable.tenantScope, input.tenantScope),
                eq(
                  tenantOnboardingRunsTable.tenantScopeId,
                  input.tenantScopeId,
                ),
              ),
            );

          const currentRun = runs
            .filter(
              (run) =>
                run.tenantScope === input.tenantScope &&
                run.tenantScopeId === input.tenantScopeId,
            )
            .sort(
              (left, right) =>
                right.startedAt.getTime() - left.startedAt.getTime(),
            )
            .slice(0, tenantOnboardingReviewHistoryLimit)
            .at(0);

          if (currentRun === undefined) {
            return {
              run: undefined,
              steps: [] as const,
            };
          }

          const steps = await database
            .select()
            .from(tenantOnboardingStepsTable)
            .where(
              inArray(tenantOnboardingStepsTable.runId, [currentRun.runId]),
            );

          return {
            run: currentRun,
            steps: steps.filter((step) => step.runId === currentRun.runId),
          };
        },
        catch: (cause) =>
          ({
            _tag: "TenantOnboardingPostgresRepositoryQueryError",
            operation: "getOnboardingRunByTenant",
            cause,
          }) satisfies TenantOnboardingPostgresRepositoryQueryError,
      }).pipe(Effect.flatMap((rows) => buildTenantOnboardingReviewRun(rows))),
  });

export const makeTenantOnboardingPostgresRepositoryLayer = (
  database: PostgresDatabase,
) =>
  Layer.effect(
    TenantOnboardingPostgresRepository,
    makeTenantOnboardingPostgresRepository(database),
  );
