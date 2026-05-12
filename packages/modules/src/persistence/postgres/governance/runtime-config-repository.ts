import { and, eq, sql } from "drizzle-orm";
import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  type ConfigOverride,
  DeclaredRuntimeGovernedKeySchema,
  PersistedConfigSourceSchema,
  PlatformModuleIdSchema,
  PlatformScopeSchema,
  RuntimeChangeProposalActionSchema,
  type PlatformModuleId,
  runtimeChangeProposalAction,
} from "@comvestec/contracts";
import type { PostgresDatabase } from "../database";
import {
  runtimeConfigOverrideProposalsTable,
  runtimeConfigOverridesTable,
  runtimeConfigSyncArtifactsTable,
} from "./runtime-config";

type RuntimeConfigOverrideRow = typeof runtimeConfigOverridesTable.$inferSelect;
type RuntimeConfigOverrideProposalRow =
  typeof runtimeConfigOverrideProposalsTable.$inferSelect;
type RuntimeConfigSyncArtifactRow =
  typeof runtimeConfigSyncArtifactsTable.$inferSelect;

const RuntimeConfigSyncArtifactStatusConstantSchema = Schema.Struct({
  pending: Schema.Literal("pending"),
  approved: Schema.Literal("approved"),
  applied: Schema.Literal("applied"),
  rejected: Schema.Literal("rejected"),
});

export const runtimeConfigSyncArtifactStatus = Schema.validateSync(
  RuntimeConfigSyncArtifactStatusConstantSchema,
)({
  pending: "pending",
  approved: "approved",
  applied: "applied",
  rejected: "rejected",
} satisfies Schema.Schema.Type<
  typeof RuntimeConfigSyncArtifactStatusConstantSchema
>);

export const RuntimeConfigSyncArtifactStatusSchema = Schema.Literal(
  runtimeConfigSyncArtifactStatus.pending,
  runtimeConfigSyncArtifactStatus.approved,
  runtimeConfigSyncArtifactStatus.applied,
  runtimeConfigSyncArtifactStatus.rejected,
);

export type RuntimeConfigSyncArtifactStatus = Schema.Schema.Type<
  typeof RuntimeConfigSyncArtifactStatusSchema
>;

const RuntimeConfigProposalDecisionStatusConstantSchema = Schema.Struct({
  approved: Schema.Literal(runtimeConfigSyncArtifactStatus.approved),
  rejected: Schema.Literal(runtimeConfigSyncArtifactStatus.rejected),
});

export const runtimeConfigProposalDecisionStatus = Schema.validateSync(
  RuntimeConfigProposalDecisionStatusConstantSchema,
)({
  approved: runtimeConfigSyncArtifactStatus.approved,
  rejected: runtimeConfigSyncArtifactStatus.rejected,
} satisfies Schema.Schema.Type<
  typeof RuntimeConfigProposalDecisionStatusConstantSchema
>);

export const RuntimeConfigProposalDecisionStatusSchema = Schema.Literal(
  runtimeConfigProposalDecisionStatus.approved,
  runtimeConfigProposalDecisionStatus.rejected,
);

export type RuntimeConfigProposalDecisionStatus = Schema.Schema.Type<
  typeof RuntimeConfigProposalDecisionStatusSchema
>;

export const RuntimeConfigOverrideRecordSchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  key: DeclaredRuntimeGovernedKeySchema,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  value: Schema.Unknown,
  source: PersistedConfigSourceSchema,
  changedBy: Schema.NonEmptyString,
  changedAt: Schema.NonEmptyString,
  approvalReason: Schema.optional(Schema.NonEmptyString),
});

export type RuntimeConfigOverrideRecord = Schema.Schema.Type<
  typeof RuntimeConfigOverrideRecordSchema
>;

export const RuntimeConfigOverrideProposalRecordSchema = Schema.Struct({
  proposalId: Schema.NonEmptyString,
  moduleId: PlatformModuleIdSchema,
  key: DeclaredRuntimeGovernedKeySchema,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  value: Schema.Unknown,
  source: PersistedConfigSourceSchema,
  changedBy: Schema.NonEmptyString,
  changedAt: Schema.NonEmptyString,
  approvalReason: Schema.NonEmptyString,
  status: RuntimeConfigSyncArtifactStatusSchema,
  decidedBy: Schema.optional(Schema.NonEmptyString),
  decisionReason: Schema.optional(Schema.NonEmptyString),
  decidedAt: Schema.optional(Schema.NonEmptyString),
});

export type RuntimeConfigOverrideProposalRecord = Schema.Schema.Type<
  typeof RuntimeConfigOverrideProposalRecordSchema
>;

export const RuntimeConfigOverrideProposalSubmitRecordSchema = Schema.Struct({
  proposalId: Schema.NonEmptyString,
  moduleId: PlatformModuleIdSchema,
  key: DeclaredRuntimeGovernedKeySchema,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  value: Schema.Unknown,
  source: PersistedConfigSourceSchema,
  changedBy: Schema.NonEmptyString,
  changedAt: Schema.NonEmptyString,
  approvalReason: Schema.NonEmptyString,
});

export type RuntimeConfigOverrideProposalSubmitRecord = Schema.Schema.Type<
  typeof RuntimeConfigOverrideProposalSubmitRecordSchema
>;

export const RuntimeConfigSyncArtifactRecordSchema = Schema.Struct({
  proposalId: Schema.NonEmptyString,
  moduleId: PlatformModuleIdSchema,
  key: DeclaredRuntimeGovernedKeySchema,
  action: RuntimeChangeProposalActionSchema,
  artifactPath: Schema.NonEmptyString,
  runtimeValue: Schema.optional(Schema.Unknown),
  codeValue: Schema.optional(Schema.Unknown),
  status: RuntimeConfigSyncArtifactStatusSchema,
  generatedAt: Schema.NonEmptyString,
  decidedBy: Schema.optional(Schema.NonEmptyString),
  decisionReason: Schema.optional(Schema.NonEmptyString),
  decidedAt: Schema.optional(Schema.NonEmptyString),
});

export type RuntimeConfigSyncArtifactRecord = Schema.Schema.Type<
  typeof RuntimeConfigSyncArtifactRecordSchema
>;

export const RuntimeConfigSyncArtifactReviewRecordSchema = Schema.Struct({
  proposalId: Schema.NonEmptyString,
  status: RuntimeConfigProposalDecisionStatusSchema,
  decidedBy: Schema.NonEmptyString,
  decisionReason: Schema.NonEmptyString,
  decidedAt: Schema.NonEmptyString,
});

export type RuntimeConfigSyncArtifactReviewRecord = Schema.Schema.Type<
  typeof RuntimeConfigSyncArtifactReviewRecordSchema
>;

export type RuntimeConfigSyncArtifactNotFoundError = {
  readonly _tag: "RuntimeConfigSyncArtifactNotFoundError";
  readonly proposalId: string;
};

export type RuntimeConfigSyncArtifactReviewConflictError = {
  readonly _tag: "RuntimeConfigSyncArtifactReviewConflictError";
  readonly proposalId: string;
  readonly status: RuntimeConfigSyncArtifactStatus;
};

export type RuntimeConfigOverrideProposalNotFoundError = {
  readonly _tag: "RuntimeConfigOverrideProposalNotFoundError";
  readonly proposalId: string;
};

export type RuntimeConfigPostgresQueryable = {
  readonly listOverridesByModule: (
    moduleId: PlatformModuleId,
  ) => Promise<readonly RuntimeConfigOverrideRow[]>;
  readonly listOverrideProposalsByModule: (
    moduleId: PlatformModuleId,
  ) => Promise<readonly RuntimeConfigOverrideProposalRow[]>;
  readonly listSyncArtifactsByModule: (
    moduleId: PlatformModuleId,
  ) => Promise<readonly RuntimeConfigSyncArtifactRow[]>;
};

export type RuntimeConfigPostgresDatabase = PostgresDatabase &
  RuntimeConfigPostgresQueryable;

export type RuntimeConfigPostgresRepositoryPersistenceError = {
  readonly _tag: "RuntimeConfigPostgresRepositoryPersistenceError";
  readonly operation:
    | "listOverridesByModule"
    | "listOverrideProposalsByModule"
    | "submitOverrideProposal"
    | "upsertOverride"
    | "reviewSyncArtifact"
    | "listSyncArtifactsByModule"
    | "persistSyncArtifacts";
  readonly cause: unknown;
};

export type RuntimeConfigPostgresRepositoryError =
  | ParseResult.ParseError
  | RuntimeConfigPostgresRepositoryPersistenceError
  | RuntimeConfigOverrideProposalNotFoundError
  | RuntimeConfigSyncArtifactReviewConflictError
  | RuntimeConfigSyncArtifactNotFoundError;

export type RuntimeConfigPostgresRepositoryService = {
  readonly listOverridesByModule: (
    moduleId: PlatformModuleId,
  ) => Effect.Effect<
    readonly RuntimeConfigOverrideRecord[],
    RuntimeConfigPostgresRepositoryError
  >;
  readonly listOverrideProposalsByModule: (
    moduleId: PlatformModuleId,
  ) => Effect.Effect<
    readonly RuntimeConfigOverrideProposalRecord[],
    RuntimeConfigPostgresRepositoryError
  >;
  readonly upsertOverride: (
    input: RuntimeConfigOverrideRecord,
  ) => Effect.Effect<
    RuntimeConfigOverrideRecord,
    RuntimeConfigPostgresRepositoryError
  >;
  readonly submitOverrideProposal: (
    input: RuntimeConfigOverrideProposalSubmitRecord,
  ) => Effect.Effect<
    RuntimeConfigOverrideProposalRecord,
    RuntimeConfigPostgresRepositoryError
  >;
  readonly reviewSyncArtifact: (
    input: RuntimeConfigSyncArtifactReviewRecord,
  ) => Effect.Effect<
    RuntimeConfigSyncArtifactRecord,
    RuntimeConfigPostgresRepositoryError
  >;
  readonly listSyncArtifactsByModule: (
    moduleId: PlatformModuleId,
  ) => Effect.Effect<
    readonly RuntimeConfigSyncArtifactRecord[],
    RuntimeConfigPostgresRepositoryError
  >;
  readonly persistSyncArtifacts: (
    input: readonly RuntimeConfigSyncArtifactRecord[],
  ) => Effect.Effect<
    readonly RuntimeConfigSyncArtifactRecord[],
    RuntimeConfigPostgresRepositoryError
  >;
};

export class RuntimeConfigPostgresRepository extends Context.Tag(
  "RuntimeConfigPostgresRepository",
)<RuntimeConfigPostgresRepository, RuntimeConfigPostgresRepositoryService>() {}

const decodeRuntimeConfigOverrideRecord = Schema.decodeUnknown(
  RuntimeConfigOverrideRecordSchema,
);

const decodeRuntimeConfigOverrideProposalRecord = Schema.decodeUnknown(
  RuntimeConfigOverrideProposalRecordSchema,
);

const decodeRuntimeConfigOverrideProposalSubmitRecord = Schema.decodeUnknown(
  RuntimeConfigOverrideProposalSubmitRecordSchema,
);

const decodeRuntimeConfigSyncArtifactRecord = Schema.decodeUnknown(
  RuntimeConfigSyncArtifactRecordSchema,
);

const decodeRuntimeConfigSyncArtifactReviewRecord = Schema.decodeUnknown(
  RuntimeConfigSyncArtifactReviewRecordSchema,
);

const toIsoString = (value: Date | string | null | undefined) =>
  value == null
    ? undefined
    : value instanceof Date
      ? value.toISOString()
      : value;

const parseTimestamp = (value: string) => new Date(value);

const buildOverrideId = (override: ConfigOverride) =>
  `${override.moduleId}:${override.key}:${override.scope}:${override.scopeId}`;

const buildRuntimeConfigOverrideRecord = (row: RuntimeConfigOverrideRow) =>
  decodeRuntimeConfigOverrideRecord({
    moduleId: row.moduleId,
    key: row.key,
    scope: row.scope,
    scopeId: row.scopeId,
    value: row.value,
    source: row.source,
    changedBy: row.changedBy,
    changedAt: toIsoString(row.changedAt) ?? new Date().toISOString(),
    ...(row.approvalReason != null
      ? { approvalReason: row.approvalReason }
      : {}),
  });

const buildRuntimeConfigOverrideProposalRecord = (
  row: RuntimeConfigOverrideProposalRow,
) =>
  decodeRuntimeConfigOverrideProposalRecord({
    proposalId: row.proposalId,
    moduleId: row.moduleId,
    key: row.key,
    scope: row.scope,
    scopeId: row.scopeId,
    value: row.value,
    source: row.source,
    changedBy: row.changedBy,
    changedAt: toIsoString(row.changedAt) ?? new Date().toISOString(),
    approvalReason: row.approvalReason,
    status: row.status,
    ...(row.decidedBy != null ? { decidedBy: row.decidedBy } : {}),
    ...(row.decisionReason != null
      ? { decisionReason: row.decisionReason }
      : {}),
    ...(toIsoString(row.decidedAt) !== undefined
      ? { decidedAt: toIsoString(row.decidedAt) }
      : {}),
  });

const buildRuntimeConfigSyncArtifactRecord = (
  row: RuntimeConfigSyncArtifactRow,
) =>
  decodeRuntimeConfigSyncArtifactRecord({
    proposalId: row.proposalId,
    moduleId: row.moduleId,
    key: row.key,
    action: row.action,
    artifactPath: row.artifactPath,
    ...(row.runtimeValue != null ? { runtimeValue: row.runtimeValue } : {}),
    ...(row.codeValue != null ? { codeValue: row.codeValue } : {}),
    status: row.status,
    generatedAt: toIsoString(row.generatedAt) ?? new Date().toISOString(),
    ...(row.decidedBy != null ? { decidedBy: row.decidedBy } : {}),
    ...(row.decisionReason != null
      ? { decisionReason: row.decisionReason }
      : {}),
    ...(toIsoString(row.decidedAt) !== undefined
      ? { decidedAt: toIsoString(row.decidedAt) }
      : {}),
  });

const buildArtifactChangedSql = (artifact: RuntimeConfigSyncArtifactRecord) =>
  sql`(
    ${runtimeConfigSyncArtifactsTable.action} IS DISTINCT FROM ${artifact.action}
    OR ${runtimeConfigSyncArtifactsTable.artifactPath} IS DISTINCT FROM ${artifact.artifactPath}
    OR ${runtimeConfigSyncArtifactsTable.runtimeValue} IS DISTINCT FROM ${artifact.runtimeValue ?? null}
    OR ${runtimeConfigSyncArtifactsTable.codeValue} IS DISTINCT FROM ${artifact.codeValue ?? null}
  )`;

const artifactPayloadChanged = (
  current: RuntimeConfigSyncArtifactRecord,
  next: RuntimeConfigSyncArtifactRecord,
) =>
  current.action !== next.action ||
  current.artifactPath !== next.artifactPath ||
  JSON.stringify(current.runtimeValue ?? null) !==
    JSON.stringify(next.runtimeValue ?? null) ||
  JSON.stringify(current.codeValue ?? null) !==
    JSON.stringify(next.codeValue ?? null);

const artifactRepresentsResolvedUpdate = (
  artifact: RuntimeConfigSyncArtifactRecord,
) =>
  artifact.action === runtimeChangeProposalAction.update &&
  artifact.runtimeValue !== undefined &&
  artifact.codeValue !== undefined &&
  JSON.stringify(artifact.runtimeValue) === JSON.stringify(artifact.codeValue);

const isApprovedToAppliedTransition = (
  current: RuntimeConfigSyncArtifactRecord,
  next: RuntimeConfigSyncArtifactRecord,
) =>
  current.status === runtimeConfigSyncArtifactStatus.approved &&
  artifactRepresentsResolvedUpdate(next);

const applyExistingDecisionMetadata = (
  artifact: RuntimeConfigSyncArtifactRecord,
  existingArtifact: RuntimeConfigSyncArtifactRecord,
): RuntimeConfigSyncArtifactRecord => ({
  ...artifact,
  ...(existingArtifact.decidedBy !== undefined
    ? { decidedBy: existingArtifact.decidedBy }
    : {}),
  ...(existingArtifact.decisionReason !== undefined
    ? { decisionReason: existingArtifact.decisionReason }
    : {}),
  ...(existingArtifact.decidedAt !== undefined
    ? { decidedAt: existingArtifact.decidedAt }
    : {}),
});

const mergePersistedArtifact = (
  existingArtifact: RuntimeConfigSyncArtifactRecord | undefined,
  artifact: RuntimeConfigSyncArtifactRecord,
): RuntimeConfigSyncArtifactRecord => {
  if (existingArtifact === undefined) {
    return artifact;
  }

  if (artifactPayloadChanged(existingArtifact, artifact)) {
    return isApprovedToAppliedTransition(existingArtifact, artifact)
      ? applyExistingDecisionMetadata(
          {
            ...artifact,
            status: runtimeConfigSyncArtifactStatus.applied,
          },
          existingArtifact,
        )
      : artifact;
  }

  return applyExistingDecisionMetadata(
    {
      ...artifact,
      status: existingArtifact.status,
    },
    existingArtifact,
  );
};

const buildApprovedToAppliedTransitionSql = (
  artifact: RuntimeConfigSyncArtifactRecord,
) =>
  sql`(
    ${buildArtifactChangedSql(artifact)}
    AND ${runtimeConfigSyncArtifactsTable.status} = ${runtimeConfigSyncArtifactStatus.approved}
    AND ${artifact.action} = ${runtimeChangeProposalAction.update}
    AND ${artifact.runtimeValue ?? null} IS NOT DISTINCT FROM ${artifact.codeValue ?? null}
  )`;

export const makeRuntimeConfigPostgresRepository = (
  database: RuntimeConfigPostgresDatabase,
) =>
  Effect.succeed<RuntimeConfigPostgresRepositoryService>({
    listOverridesByModule: (moduleId: PlatformModuleId) =>
      Effect.gen(function* () {
        const rows = yield* Effect.tryPromise({
          try: () => database.listOverridesByModule(moduleId),
          catch: (cause) =>
            ({
              _tag: "RuntimeConfigPostgresRepositoryPersistenceError",
              operation: "listOverridesByModule",
              cause,
            }) satisfies RuntimeConfigPostgresRepositoryPersistenceError,
        });

        return yield* Effect.forEach(rows, buildRuntimeConfigOverrideRecord);
      }),

    listOverrideProposalsByModule: (moduleId: PlatformModuleId) =>
      Effect.gen(function* () {
        const rows = yield* Effect.tryPromise({
          try: () => database.listOverrideProposalsByModule(moduleId),
          catch: (cause) =>
            ({
              _tag: "RuntimeConfigPostgresRepositoryPersistenceError",
              operation: "listOverrideProposalsByModule",
              cause,
            }) satisfies RuntimeConfigPostgresRepositoryPersistenceError,
        });

        return yield* Effect.forEach(
          rows,
          buildRuntimeConfigOverrideProposalRecord,
        );
      }),

    upsertOverride: (input: RuntimeConfigOverrideRecord) =>
      decodeRuntimeConfigOverrideRecord(input).pipe(
        Effect.flatMap((override) =>
          Effect.tryPromise({
            try: () =>
              database
                .insert(runtimeConfigOverridesTable)
                .values({
                  overrideId: buildOverrideId(override),
                  moduleId: override.moduleId,
                  key: override.key,
                  scope: override.scope,
                  scopeId: override.scopeId,
                  value: override.value,
                  source: override.source,
                  changedBy: override.changedBy,
                  approvalReason: override.approvalReason ?? null,
                  changedAt: parseTimestamp(override.changedAt),
                })
                .onConflictDoUpdate({
                  target: [
                    runtimeConfigOverridesTable.moduleId,
                    runtimeConfigOverridesTable.key,
                    runtimeConfigOverridesTable.scope,
                    runtimeConfigOverridesTable.scopeId,
                  ],
                  set: {
                    value: override.value,
                    source: override.source,
                    changedBy: override.changedBy,
                    approvalReason: override.approvalReason ?? null,
                    changedAt: parseTimestamp(override.changedAt),
                  },
                })
                .execute()
                .then(() => override),
            catch: (cause) =>
              ({
                _tag: "RuntimeConfigPostgresRepositoryPersistenceError",
                operation: "upsertOverride",
                cause,
              }) satisfies RuntimeConfigPostgresRepositoryPersistenceError,
          }),
        ),
      ),

    submitOverrideProposal: (
      input: RuntimeConfigOverrideProposalSubmitRecord,
    ) =>
      decodeRuntimeConfigOverrideProposalSubmitRecord(input).pipe(
        Effect.flatMap((proposal) =>
          Effect.tryPromise({
            try: () =>
              database
                .insert(runtimeConfigOverrideProposalsTable)
                .values({
                  proposalId: proposal.proposalId,
                  moduleId: proposal.moduleId,
                  key: proposal.key,
                  scope: proposal.scope,
                  scopeId: proposal.scopeId,
                  value: proposal.value,
                  source: proposal.source,
                  changedBy: proposal.changedBy,
                  changedAt: parseTimestamp(proposal.changedAt),
                  approvalReason: proposal.approvalReason,
                  status: runtimeConfigSyncArtifactStatus.pending,
                })
                .onConflictDoUpdate({
                  target: [runtimeConfigOverrideProposalsTable.proposalId],
                  set: {
                    moduleId: proposal.moduleId,
                    key: proposal.key,
                    scope: proposal.scope,
                    scopeId: proposal.scopeId,
                    value: proposal.value,
                    source: proposal.source,
                    changedBy: proposal.changedBy,
                    changedAt: parseTimestamp(proposal.changedAt),
                    approvalReason: proposal.approvalReason,
                    status: runtimeConfigSyncArtifactStatus.pending,
                    decidedBy: null,
                    decisionReason: null,
                    decidedAt: null,
                  },
                })
                .execute()
                .then(() => ({
                  ...proposal,
                  status: runtimeConfigSyncArtifactStatus.pending,
                })),
            catch: (cause) =>
              ({
                _tag: "RuntimeConfigPostgresRepositoryPersistenceError",
                operation: "submitOverrideProposal",
                cause,
              }) satisfies RuntimeConfigPostgresRepositoryPersistenceError,
          }).pipe(Effect.flatMap(decodeRuntimeConfigOverrideProposalRecord)),
        ),
      ),

    reviewSyncArtifact: (input: RuntimeConfigSyncArtifactReviewRecord) =>
      decodeRuntimeConfigSyncArtifactReviewRecord(input).pipe(
        Effect.flatMap((review) =>
          Effect.tryPromise({
            try: async () => {
              const rows = await database
                .update(runtimeConfigSyncArtifactsTable)
                .set({
                  status: review.status,
                  decidedBy: review.decidedBy,
                  decisionReason: review.decisionReason,
                  decidedAt: parseTimestamp(review.decidedAt),
                })
                .where(
                  and(
                    eq(
                      runtimeConfigSyncArtifactsTable.proposalId,
                      review.proposalId,
                    ),
                    eq(
                      runtimeConfigSyncArtifactsTable.status,
                      runtimeConfigSyncArtifactStatus.pending,
                    ),
                  ),
                )
                .returning();

              const row = rows[0];

              if (row === undefined) {
                const currentRows = await database
                  .select()
                  .from(runtimeConfigSyncArtifactsTable)
                  .where(
                    eq(
                      runtimeConfigSyncArtifactsTable.proposalId,
                      review.proposalId,
                    ),
                  );

                const currentRow = currentRows[0];

                if (currentRow !== undefined) {
                  throw {
                    _tag: "RuntimeConfigSyncArtifactReviewConflictError",
                    proposalId: review.proposalId,
                    status:
                      currentRow.status as RuntimeConfigSyncArtifactStatus,
                  } satisfies RuntimeConfigSyncArtifactReviewConflictError;
                }

                throw {
                  _tag: "RuntimeConfigSyncArtifactNotFoundError",
                  proposalId: review.proposalId,
                } satisfies RuntimeConfigSyncArtifactNotFoundError;
              }

              return row;
            },
            catch: (cause) => {
              if (
                typeof cause === "object" &&
                cause !== null &&
                "_tag" in cause &&
                cause._tag === "RuntimeConfigSyncArtifactReviewConflictError"
              ) {
                return cause as RuntimeConfigSyncArtifactReviewConflictError;
              }

              if (
                typeof cause === "object" &&
                cause !== null &&
                "_tag" in cause &&
                cause._tag === "RuntimeConfigSyncArtifactNotFoundError"
              ) {
                return cause as RuntimeConfigSyncArtifactNotFoundError;
              }

              return {
                _tag: "RuntimeConfigPostgresRepositoryPersistenceError",
                operation: "reviewSyncArtifact",
                cause,
              } satisfies RuntimeConfigPostgresRepositoryPersistenceError;
            },
          }).pipe(Effect.flatMap(buildRuntimeConfigSyncArtifactRecord)),
        ),
      ),

    listSyncArtifactsByModule: (moduleId: PlatformModuleId) =>
      Effect.gen(function* () {
        const rows = yield* Effect.tryPromise({
          try: () => database.listSyncArtifactsByModule(moduleId),
          catch: (cause) =>
            ({
              _tag: "RuntimeConfigPostgresRepositoryPersistenceError",
              operation: "listSyncArtifactsByModule",
              cause,
            }) satisfies RuntimeConfigPostgresRepositoryPersistenceError,
        });

        return yield* Effect.forEach(
          rows,
          buildRuntimeConfigSyncArtifactRecord,
        );
      }),

    persistSyncArtifacts: (input: readonly RuntimeConfigSyncArtifactRecord[]) =>
      Effect.forEach(input, (artifact) =>
        decodeRuntimeConfigSyncArtifactRecord(artifact),
      ).pipe(
        Effect.flatMap((artifacts) =>
          Effect.gen(function* () {
            const existingArtifactsByProposalId = new Map<
              string,
              RuntimeConfigSyncArtifactRecord
            >();
            const moduleIds = [
              ...new Set(artifacts.map((artifact) => artifact.moduleId)),
            ];

            for (const moduleId of moduleIds) {
              const rows = yield* Effect.tryPromise({
                try: () => database.listSyncArtifactsByModule(moduleId),
                catch: (cause) =>
                  ({
                    _tag: "RuntimeConfigPostgresRepositoryPersistenceError",
                    operation: "persistSyncArtifacts",
                    cause,
                  }) satisfies RuntimeConfigPostgresRepositoryPersistenceError,
              });
              const existingArtifacts = yield* Effect.forEach(
                rows,
                buildRuntimeConfigSyncArtifactRecord,
              );

              for (const existingArtifact of existingArtifacts) {
                existingArtifactsByProposalId.set(
                  existingArtifact.proposalId,
                  existingArtifact,
                );
              }
            }

            yield* Effect.tryPromise({
              try: async () => {
                await database.transaction(async (tx) => {
                  for (const artifact of artifacts) {
                    await tx
                      .insert(runtimeConfigSyncArtifactsTable)
                      .values({
                        proposalId: artifact.proposalId,
                        moduleId: artifact.moduleId,
                        key: artifact.key,
                        action: artifact.action,
                        artifactPath: artifact.artifactPath,
                        runtimeValue: artifact.runtimeValue ?? null,
                        codeValue: artifact.codeValue ?? null,
                        status: artifact.status,
                        generatedAt: parseTimestamp(artifact.generatedAt),
                      })
                      .onConflictDoUpdate({
                        target: [runtimeConfigSyncArtifactsTable.proposalId],
                        set: {
                          action: artifact.action,
                          artifactPath: artifact.artifactPath,
                          runtimeValue: artifact.runtimeValue ?? null,
                          codeValue: artifact.codeValue ?? null,
                          status: sql`CASE
                            WHEN ${buildApprovedToAppliedTransitionSql(artifact)} THEN ${runtimeConfigSyncArtifactStatus.applied}
                            WHEN ${buildArtifactChangedSql(artifact)} THEN ${artifact.status}
                            ELSE ${runtimeConfigSyncArtifactsTable.status}
                          END`,
                          generatedAt: parseTimestamp(artifact.generatedAt),
                          decidedBy: sql`CASE
                            WHEN ${buildApprovedToAppliedTransitionSql(artifact)} THEN ${runtimeConfigSyncArtifactsTable.decidedBy}
                            WHEN ${buildArtifactChangedSql(artifact)} THEN NULL
                            ELSE ${runtimeConfigSyncArtifactsTable.decidedBy}
                          END`,
                          decisionReason: sql`CASE
                            WHEN ${buildApprovedToAppliedTransitionSql(artifact)} THEN ${runtimeConfigSyncArtifactsTable.decisionReason}
                            WHEN ${buildArtifactChangedSql(artifact)} THEN NULL
                            ELSE ${runtimeConfigSyncArtifactsTable.decisionReason}
                          END`,
                          decidedAt: sql`CASE
                            WHEN ${buildApprovedToAppliedTransitionSql(artifact)} THEN ${runtimeConfigSyncArtifactsTable.decidedAt}
                            WHEN ${buildArtifactChangedSql(artifact)} THEN NULL
                            ELSE ${runtimeConfigSyncArtifactsTable.decidedAt}
                          END`,
                        },
                      })
                      .execute();
                  }
                });
              },
              catch: (cause) =>
                ({
                  _tag: "RuntimeConfigPostgresRepositoryPersistenceError",
                  operation: "persistSyncArtifacts",
                  cause,
                }) satisfies RuntimeConfigPostgresRepositoryPersistenceError,
            });

            const persistedArtifactsByProposalId = new Map<
              string,
              RuntimeConfigSyncArtifactRecord
            >();

            for (const moduleId of moduleIds) {
              const rows = yield* Effect.tryPromise({
                try: () => database.listSyncArtifactsByModule(moduleId),
                catch: (cause) =>
                  ({
                    _tag: "RuntimeConfigPostgresRepositoryPersistenceError",
                    operation: "persistSyncArtifacts",
                    cause,
                  }) satisfies RuntimeConfigPostgresRepositoryPersistenceError,
              });
              const persistedArtifacts = yield* Effect.forEach(
                rows,
                buildRuntimeConfigSyncArtifactRecord,
              );

              for (const persistedArtifact of persistedArtifacts) {
                persistedArtifactsByProposalId.set(
                  persistedArtifact.proposalId,
                  persistedArtifact,
                );
              }
            }

            return artifacts.map(
              (artifact) =>
                persistedArtifactsByProposalId.get(artifact.proposalId) ??
                mergePersistedArtifact(
                  existingArtifactsByProposalId.get(artifact.proposalId),
                  artifact,
                ),
            );
          }),
        ),
      ),
  });

export const makeRuntimeConfigPostgresRepositoryLayer = (
  database: RuntimeConfigPostgresDatabase,
) =>
  Layer.effect(
    RuntimeConfigPostgresRepository,
    makeRuntimeConfigPostgresRepository(database),
  );
