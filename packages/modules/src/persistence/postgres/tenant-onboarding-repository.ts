import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import { onboardingStepStatus } from "@comvestec/contracts";
import {
  OnboardingStepSchema,
  TenantOnboardingPlanSchema,
} from "../../domains/tenant-management";
import type {
  OnboardingStep,
  TenantOnboardingPlan,
} from "../../domains/tenant-management";
import type { PostgresDatabase } from "./database";
import {
  tenantOnboardingRunsTable,
  tenantOnboardingStepsTable,
} from "./tenant-onboarding";

const TenantOnboardingRunStatusConstantSchema = Schema.Struct({
  pending: Schema.Literal("pending"),
  inProgress: Schema.Literal("in-progress"),
  completed: Schema.Literal("completed"),
  failed: Schema.Literal("failed"),
});

export const tenantOnboardingRunStatus = Schema.validateSync(
  TenantOnboardingRunStatusConstantSchema,
)({
  pending: "pending",
  inProgress: "in-progress",
  completed: "completed",
  failed: "failed",
} satisfies Schema.Schema.Type<typeof TenantOnboardingRunStatusConstantSchema>);

export const tenantOnboardingRunStatuses = [
  tenantOnboardingRunStatus.pending,
  tenantOnboardingRunStatus.inProgress,
  tenantOnboardingRunStatus.completed,
  tenantOnboardingRunStatus.failed,
] as const;

export const TenantOnboardingRunStatusSchema = Schema.Literal(
  ...tenantOnboardingRunStatuses,
);

const TenantOnboardingRunMetadataSchema = Schema.Record({
  key: Schema.NonEmptyString,
  value: Schema.Any,
});

export type TenantOnboardingRunStatus = Schema.Schema.Type<
  typeof TenantOnboardingRunStatusSchema
>;

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

export type TenantOnboardingPostgresRepositoryError =
  | ParseResult.ParseError
  | TenantOnboardingPostgresRepositoryPersistenceError;

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

export type TenantOnboardingPostgresRepositoryService = {
  readonly persistOnboardingRun: (
    input: PersistTenantOnboardingRun,
  ) => Effect.Effect<
    TenantOnboardingPersistenceProjection,
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
  });

export const makeTenantOnboardingPostgresRepositoryLayer = (
  database: PostgresDatabase,
) =>
  Layer.effect(
    TenantOnboardingPostgresRepository,
    makeTenantOnboardingPostgresRepository(database),
  );
