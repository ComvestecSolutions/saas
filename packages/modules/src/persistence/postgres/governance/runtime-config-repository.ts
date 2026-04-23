import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  type ConfigOverride,
  DeclaredRuntimeGovernedKeySchema,
  PersistedConfigSourceSchema,
  PlatformModuleIdSchema,
  PlatformScopeSchema,
  RuntimeChangeProposalActionSchema,
  type PlatformModuleId,
} from "@comvestec/contracts";
import type { PostgresDatabase } from "../database";
import {
  runtimeConfigOverridesTable,
  runtimeConfigSyncArtifactsTable,
} from "./runtime-config";

type RuntimeConfigOverrideRow = typeof runtimeConfigOverridesTable.$inferSelect;
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
});

export type RuntimeConfigSyncArtifactRecord = Schema.Schema.Type<
  typeof RuntimeConfigSyncArtifactRecordSchema
>;

export type RuntimeConfigPostgresQueryable = {
  readonly listOverridesByModule: (
    moduleId: PlatformModuleId,
  ) => Promise<readonly RuntimeConfigOverrideRow[]>;
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
    | "upsertOverride"
    | "listSyncArtifactsByModule"
    | "persistSyncArtifacts";
  readonly cause: unknown;
};

export type RuntimeConfigPostgresRepositoryError =
  | ParseResult.ParseError
  | RuntimeConfigPostgresRepositoryPersistenceError;

export type RuntimeConfigPostgresRepositoryService = {
  readonly listOverridesByModule: (
    moduleId: PlatformModuleId,
  ) => Effect.Effect<
    readonly RuntimeConfigOverrideRecord[],
    RuntimeConfigPostgresRepositoryError
  >;
  readonly upsertOverride: (
    input: RuntimeConfigOverrideRecord,
  ) => Effect.Effect<
    RuntimeConfigOverrideRecord,
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

const decodeRuntimeConfigSyncArtifactRecord = Schema.decodeUnknown(
  RuntimeConfigSyncArtifactRecordSchema,
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
  });

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
          Effect.tryPromise({
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
                        status: artifact.status,
                        generatedAt: parseTimestamp(artifact.generatedAt),
                      },
                    })
                    .execute();
                }
              });

              return artifacts;
            },
            catch: (cause) =>
              ({
                _tag: "RuntimeConfigPostgresRepositoryPersistenceError",
                operation: "persistSyncArtifacts",
                cause,
              }) satisfies RuntimeConfigPostgresRepositoryPersistenceError,
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
