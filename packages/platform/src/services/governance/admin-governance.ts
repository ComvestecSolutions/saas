import { desc, eq } from "drizzle-orm";
import { Effect, ParseResult, Schema } from "effect";
import { findModuleManifest } from "@comvestec/config";
import {
  actorType,
  AuditActionSchema,
  DeclaredRuntimeGovernedKeySchema,
  fieldSecurityAuditAction,
  type AuditEvent,
  PersistedConfigSourceSchema,
  type PlatformModuleId,
  PlatformModuleIdSchema,
  platformModuleId,
  PlatformScopeSchema,
  type ProjectionDescriptor,
  projectionProfile,
  type RequestContext,
  RequestContextSchema,
  RuntimeChangeProposalActionSchema,
  runtimeConfigAuditAction,
  runtimeResolutionSource,
} from "@comvestec/contracts";
import {
  makeFieldSecurityModule,
  type FieldSecurityModuleService,
} from "../../../../modules/src/access";
import {
  type AuditLogModuleService,
  makeAuditLogModule,
  RuntimeConfigModule,
  type RuntimeConfigModulePersistenceError,
  makeRuntimeConfigModule,
} from "../../../../modules/src/governance";
import {
  auditLogEventsTable,
  AuditLogPostgresRepository,
  type AuditLogPostgresQueryable,
  type AuditLogPostgresRepositoryError,
  makeAuditLogPostgresRepository,
  makeRuntimeConfigPostgresRepository,
  RuntimeConfigOverrideRecordSchema,
  RuntimeConfigSyncArtifactStatusSchema,
  runtimeConfigOverridesTable,
  runtimeConfigSyncArtifactsTable,
  type RuntimeConfigOverrideRecord,
  type RuntimeConfigPostgresQueryable,
  type RuntimeConfigSyncArtifactRecord,
} from "../../../../modules/src/persistence/postgres/governance";
import {
  makePostgresAdapter,
  makeValkeyAdapter,
  type PostgresAdapterConnectionError,
  ValkeyAdapter,
  type ValkeyAdapterOperationError,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";

export const AdminGovernanceRuntimeOptionsSchema = Schema.Struct({
  postgresUrl: Schema.NonEmptyString,
  valkeyUrl: Schema.NonEmptyString,
});

export type AdminGovernanceRuntimeOptions = Schema.Schema.Type<
  typeof AdminGovernanceRuntimeOptionsSchema
>;

const AdminGovernanceProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  VALKEY_URL: Schema.NonEmptyString,
});

const AdminGovernanceSessionLookupSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
});

export type AdminGovernanceSessionLookup = Schema.Schema.Type<
  typeof AdminGovernanceSessionLookupSchema
>;

export const AdminGovernanceListByModuleRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  moduleId: PlatformModuleIdSchema,
});

export const AdminGovernanceReadBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  moduleId: PlatformModuleIdSchema,
});

export type AdminGovernanceReadBySessionRequest = Schema.Schema.Type<
  typeof AdminGovernanceReadBySessionRequestSchema
>;

export const AdminGovernanceRuntimeConfigOverrideViewSchema = Schema.Struct({
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

export type AdminGovernanceRuntimeConfigOverrideView = Schema.Schema.Type<
  typeof AdminGovernanceRuntimeConfigOverrideViewSchema
>;

export const AdminGovernanceRuntimeConfigOverrideViewListSchema = Schema.Array(
  AdminGovernanceRuntimeConfigOverrideViewSchema,
);

export const AdminGovernanceRuntimeConfigProposalViewSchema = Schema.Struct({
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

export type AdminGovernanceRuntimeConfigProposalView = Schema.Schema.Type<
  typeof AdminGovernanceRuntimeConfigProposalViewSchema
>;

export const AdminGovernanceRuntimeConfigProposalViewListSchema = Schema.Array(
  AdminGovernanceRuntimeConfigProposalViewSchema,
);

export const AdminGovernanceAuditEventViewSchema = Schema.Struct({
  eventId: Schema.NonEmptyString,
  timestamp: Schema.NonEmptyString,
  actorId: Schema.NonEmptyString,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  moduleId: PlatformModuleIdSchema,
  action: AuditActionSchema,
  target: Schema.NonEmptyString,
  reason: Schema.optional(Schema.NonEmptyString),
  correlationId: Schema.optional(Schema.NonEmptyString),
});

export type AdminGovernanceAuditEventView = Schema.Schema.Type<
  typeof AdminGovernanceAuditEventViewSchema
>;

export const AdminGovernanceAuditEventViewListSchema = Schema.Array(
  AdminGovernanceAuditEventViewSchema,
);

const RuntimeConfigRenameMapSchema = Schema.Record({
  key: DeclaredRuntimeGovernedKeySchema,
  value: DeclaredRuntimeGovernedKeySchema,
});

export const PersistRuntimeConfigProposalsRequestSchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  renameMap: RuntimeConfigRenameMapSchema,
});

export const UpsertRuntimeConfigOverrideRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  moduleId: PlatformModuleIdSchema,
  key: DeclaredRuntimeGovernedKeySchema,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  value: Schema.Unknown,
  approvalReason: Schema.NonEmptyString,
});

export type AdminGovernanceListByModuleRequest = Schema.Schema.Type<
  typeof AdminGovernanceListByModuleRequestSchema
>;

export type PersistRuntimeConfigProposalsRequest = Schema.Schema.Type<
  typeof PersistRuntimeConfigProposalsRequestSchema
>;

export type UpsertRuntimeConfigOverrideRequest = Schema.Schema.Type<
  typeof UpsertRuntimeConfigOverrideRequestSchema
>;

export type AdminGovernanceProjectionConfigurationError = {
  readonly _tag: "AdminGovernanceProjectionConfigurationError";
  readonly moduleId: PlatformModuleId;
  readonly profile: string;
  readonly reason: string;
};

export type AdminGovernanceProjectedRecordParseError = {
  readonly _tag: "AdminGovernanceProjectedRecordParseError";
  readonly recordType:
    | "runtimeConfigOverride"
    | "runtimeConfigProposal"
    | "auditEvent";
  readonly cause: ParseResult.ParseError;
};

export type AdminGovernanceUnauthenticatedActorError = {
  readonly _tag: "AdminGovernanceUnauthenticatedActorError";
};

export type AdminGovernanceRequestContextNotFoundError = {
  readonly _tag: "AdminGovernanceRequestContextNotFoundError";
  readonly sessionId: AdminGovernanceSessionLookup["sessionId"];
};

export type AdminGovernanceRequestContextMalformedError = {
  readonly _tag: "AdminGovernanceRequestContextMalformedError";
  readonly sessionId: AdminGovernanceSessionLookup["sessionId"];
};

export type AdminGovernanceReadUnauthenticatedActorError = {
  readonly _tag: "AdminGovernanceReadUnauthenticatedActorError";
};

export type AdminGovernanceReadAccessDeniedError = {
  readonly _tag: "AdminGovernanceReadAccessDeniedError";
  readonly actorType: RequestContext["actorType"];
};

export type AdminGovernanceServiceError =
  | ParseResult.ParseError
  | RuntimeConfigModulePersistenceError
  | AuditLogPostgresRepositoryError
  | PostgresAdapterConnectionError
  | ValkeyAdapterOperationError
  | AdminGovernanceProjectionConfigurationError
  | AdminGovernanceProjectedRecordParseError
  | AdminGovernanceRequestContextNotFoundError
  | AdminGovernanceRequestContextMalformedError
  | AdminGovernanceReadUnauthenticatedActorError
  | AdminGovernanceReadAccessDeniedError
  | AdminGovernanceUnauthenticatedActorError;

export type AdminGovernanceService = {
  readonly resolveRequestContext: (
    input: AdminGovernanceSessionLookup,
  ) => Effect.Effect<
    Schema.Schema.Type<typeof RequestContextSchema>,
    | ParseResult.ParseError
    | ValkeyAdapterOperationError
    | AdminGovernanceRequestContextMalformedError
    | AdminGovernanceRequestContextNotFoundError
  >;
  readonly listRuntimeConfigOverrides: (
    input: AdminGovernanceListByModuleRequest,
  ) => Effect.Effect<
    readonly AdminGovernanceRuntimeConfigOverrideView[],
    AdminGovernanceServiceError
  >;
  readonly upsertRuntimeConfigOverride: (
    input: UpsertRuntimeConfigOverrideRequest,
  ) => Effect.Effect<
    {
      readonly override: RuntimeConfigOverrideRecord;
      readonly auditEvent: AuditEvent;
    },
    AdminGovernanceServiceError
  >;
  readonly persistRuntimeConfigProposals: (
    input: PersistRuntimeConfigProposalsRequest,
  ) => Effect.Effect<
    readonly RuntimeConfigSyncArtifactRecord[],
    RuntimeConfigModulePersistenceError | ParseResult.ParseError
  >;
  readonly listRuntimeConfigProposals: (
    input: AdminGovernanceListByModuleRequest,
  ) => Effect.Effect<
    readonly AdminGovernanceRuntimeConfigProposalView[],
    AdminGovernanceServiceError
  >;
  readonly queryAuditEventsByModule: (
    input: AdminGovernanceListByModuleRequest,
  ) => Effect.Effect<
    readonly AdminGovernanceAuditEventView[],
    AdminGovernanceServiceError
  >;
};

const buildRuntimeConfigOverrideTarget = (
  override: Pick<
    RuntimeConfigOverrideRecord,
    "moduleId" | "key" | "scope" | "scopeId"
  >,
) =>
  `${override.moduleId}:${override.key}:${override.scope}:${override.scopeId}`;

const requireAuthenticatedActorId = (
  requestContext: UpsertRuntimeConfigOverrideRequest["requestContext"],
) =>
  Effect.fromNullable(requestContext.actorId).pipe(
    Effect.mapError(
      (): AdminGovernanceUnauthenticatedActorError => ({
        _tag: "AdminGovernanceUnauthenticatedActorError",
      }),
    ),
  );

const buildStoredRuntimeConfigOverride = (
  request: UpsertRuntimeConfigOverrideRequest,
  actorId: string,
) =>
  Schema.decodeUnknown(RuntimeConfigOverrideRecordSchema)({
    moduleId: request.moduleId,
    key: request.key,
    scope: request.scope,
    scopeId: request.scopeId,
    value: request.value,
    source: runtimeResolutionSource.runtimeOverride,
    changedBy: actorId,
    changedAt: new Date().toISOString(),
    approvalReason: request.approvalReason,
  });

const resolveAdminGovernanceRequestContext = (
  valkey: ValkeyAdapter["Type"],
  input: AdminGovernanceSessionLookup,
) =>
  Schema.decodeUnknown(AdminGovernanceSessionLookupSchema)(input).pipe(
    Effect.flatMap((request) =>
      valkey.readSession(request).pipe(
        Effect.mapError((error) =>
          error._tag === "ParseError"
            ? ({
                _tag: "AdminGovernanceRequestContextMalformedError",
                sessionId: request.sessionId,
              } satisfies AdminGovernanceRequestContextMalformedError)
            : error,
        ),
        Effect.flatMap((sessionEntry) =>
          sessionEntry === undefined
            ? Effect.fail({
                _tag: "AdminGovernanceRequestContextNotFoundError",
                sessionId: request.sessionId,
              } satisfies AdminGovernanceRequestContextNotFoundError)
            : Effect.succeed(sessionEntry.requestContext),
        ),
      ),
    ),
  );

const ensureAdminGovernanceReadAccess = (
  requestContext: RequestContext,
): Effect.Effect<
  RequestContext,
  | AdminGovernanceReadUnauthenticatedActorError
  | AdminGovernanceReadAccessDeniedError
> => {
  if (requestContext.actorId === undefined) {
    return Effect.fail({
      _tag: "AdminGovernanceReadUnauthenticatedActorError",
    } satisfies AdminGovernanceReadUnauthenticatedActorError);
  }

  return requestContext.actorType === actorType.platformOperator ||
    requestContext.actorType === actorType.supportOperator
    ? Effect.succeed(requestContext)
    : Effect.fail({
        _tag: "AdminGovernanceReadAccessDeniedError",
        actorType: requestContext.actorType,
      } satisfies AdminGovernanceReadAccessDeniedError);
};

type AdminGovernanceFieldSecurity = FieldSecurityModuleService;

const hasProjectedFieldValue = (
  record: Record<string, unknown>,
  fieldPath: string,
) =>
  fieldPath
    .split(".")
    .reduce<unknown>(
      (value, segment) =>
        value !== null && typeof value === "object" && segment in value
          ? (value as Record<string, unknown>)[segment]
          : undefined,
      record,
    ) !== undefined;

const decodeAdminGovernanceRuntimeConfigOverrideView = Schema.decodeUnknown(
  AdminGovernanceRuntimeConfigOverrideViewSchema,
);

const decodeAdminGovernanceRuntimeConfigProposalView = Schema.decodeUnknown(
  AdminGovernanceRuntimeConfigProposalViewSchema,
);

const decodeAdminGovernanceAuditEventView = Schema.decodeUnknown(
  AdminGovernanceAuditEventViewSchema,
);

const resolveAdminGovernanceProjection = (
  moduleId: PlatformModuleId,
): Effect.Effect<
  ProjectionDescriptor,
  AdminGovernanceProjectionConfigurationError
> =>
  Effect.fromNullable(
    findModuleManifest(moduleId)?.projectionProfiles.find(
      (projection) => projection.profile === projectionProfile.admin,
    ),
  ).pipe(
    Effect.orElseFail(
      (): AdminGovernanceProjectionConfigurationError => ({
        _tag: "AdminGovernanceProjectionConfigurationError",
        moduleId,
        profile: projectionProfile.admin,
        reason:
          "The admin projection must be declared before governance reads can be projected.",
      }),
    ),
  );

const mapProjectedRecordParseError =
  (recordType: AdminGovernanceProjectedRecordParseError["recordType"]) =>
  (
    cause: ParseResult.ParseError,
  ): AdminGovernanceProjectedRecordParseError => ({
    _tag: "AdminGovernanceProjectedRecordParseError",
    recordType,
    cause,
  });

const collectAuditedFields = <A>(
  records: readonly { auditedFields: readonly string[]; record: A }[],
) => [...new Set(records.flatMap((record) => record.auditedFields))];

const appendSensitiveReadAudit = (
  auditLog: AuditLogModuleService,
  input: {
    readonly requestContext: AdminGovernanceListByModuleRequest["requestContext"];
    readonly target: string;
    readonly reason: string;
    readonly auditedFields: readonly string[];
  },
) =>
  input.auditedFields.length === 0
    ? Effect.succeed(undefined)
    : auditLog
        .append({
          requestContext: input.requestContext,
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: input.target,
          reason: input.reason,
        })
        .pipe(Effect.map(() => undefined));

type ProjectedAdminGovernanceRecord<A> = {
  readonly record: A;
  readonly auditedFields: readonly string[];
};

const applyProjectedAdminGovernanceRecord = <A>(input: {
  readonly fieldSecurity: AdminGovernanceFieldSecurity;
  readonly moduleId: PlatformModuleId;
  readonly requestContext: AdminGovernanceListByModuleRequest["requestContext"];
  readonly projection: ProjectionDescriptor;
  readonly record: unknown;
  readonly recordType: AdminGovernanceProjectedRecordParseError["recordType"];
  readonly decode: (value: unknown) => Effect.Effect<A, ParseResult.ParseError>;
}): Effect.Effect<
  ProjectedAdminGovernanceRecord<A>,
  ParseResult.ParseError | AdminGovernanceProjectedRecordParseError
> =>
  input.fieldSecurity
    .applyProjection({
      moduleId: input.moduleId,
      requestContext: input.requestContext,
      projection: input.projection,
      record: input.record,
    })
    .pipe(
      Effect.flatMap((result) => {
        const projectedRecord =
          typeof result.projectedRecord === "object" &&
          result.projectedRecord !== null &&
          !Array.isArray(result.projectedRecord)
            ? (result.projectedRecord as Record<string, unknown>)
            : {};

        return input.decode(result.projectedRecord).pipe(
          Effect.mapError(mapProjectedRecordParseError(input.recordType)),
          Effect.map((record) => ({
            record,
            auditedFields: result.auditedFields.filter(
              (field) =>
                hasProjectedFieldValue(projectedRecord, field) &&
                !result.redactedFields.includes(field),
            ),
          })),
        );
      }),
    );

const projectAdminGovernanceRecords = <A>(input: {
  readonly fieldSecurity: AdminGovernanceFieldSecurity;
  readonly moduleId: PlatformModuleId;
  readonly requestContext: AdminGovernanceListByModuleRequest["requestContext"];
  readonly projection: ProjectionDescriptor;
  readonly records: readonly unknown[];
  readonly recordType: AdminGovernanceProjectedRecordParseError["recordType"];
  readonly decode: (value: unknown) => Effect.Effect<A, ParseResult.ParseError>;
}): Effect.Effect<
  readonly ProjectedAdminGovernanceRecord<A>[],
  ParseResult.ParseError | AdminGovernanceProjectedRecordParseError
> =>
  Effect.forEach(input.records, (record) =>
    applyProjectedAdminGovernanceRecord({
      fieldSecurity: input.fieldSecurity,
      moduleId: input.moduleId,
      requestContext: input.requestContext,
      projection: input.projection,
      record,
      recordType: input.recordType,
      decode: input.decode,
    }),
  );

const listProjectedRuntimeConfigOverrides = (input: {
  readonly runtimeConfig: RuntimeConfigModule["Type"];
  readonly auditLog: AuditLogModuleService;
  readonly fieldSecurity: AdminGovernanceFieldSecurity;
  readonly projection: ProjectionDescriptor;
  readonly request: AdminGovernanceListByModuleRequest;
}): Effect.Effect<
  readonly AdminGovernanceRuntimeConfigOverrideView[],
  AdminGovernanceServiceError
> =>
  input.runtimeConfig.listOverridesByModule(input.request.moduleId).pipe(
    Effect.flatMap((records) =>
      projectAdminGovernanceRecords({
        fieldSecurity: input.fieldSecurity,
        moduleId: platformModuleId.runtimeConfig,
        requestContext: input.request.requestContext,
        projection: input.projection,
        records,
        recordType: "runtimeConfigOverride",
        decode: decodeAdminGovernanceRuntimeConfigOverrideView,
      }),
    ),
    Effect.flatMap((projectedRecords) => {
      const auditedFields = collectAuditedFields(projectedRecords);

      return appendSensitiveReadAudit(input.auditLog, {
        requestContext: input.request.requestContext,
        target: `${platformModuleId.runtimeConfig}:${input.request.moduleId}:overrides:${auditedFields.join(",")}`,
        reason: `Inspect projected runtime-config overrides for ${input.request.moduleId}.`,
        auditedFields,
      }).pipe(
        Effect.map(() => projectedRecords.map((record) => record.record)),
      );
    }),
  );

const listProjectedRuntimeConfigProposals = (input: {
  readonly runtimeConfig: RuntimeConfigModule["Type"];
  readonly auditLog: AuditLogModuleService;
  readonly fieldSecurity: AdminGovernanceFieldSecurity;
  readonly projection: ProjectionDescriptor;
  readonly request: AdminGovernanceListByModuleRequest;
}): Effect.Effect<
  readonly AdminGovernanceRuntimeConfigProposalView[],
  AdminGovernanceServiceError
> =>
  input.runtimeConfig.listChangeProposalsByModule(input.request.moduleId).pipe(
    Effect.flatMap((records) =>
      projectAdminGovernanceRecords({
        fieldSecurity: input.fieldSecurity,
        moduleId: platformModuleId.runtimeConfig,
        requestContext: input.request.requestContext,
        projection: input.projection,
        records,
        recordType: "runtimeConfigProposal",
        decode: decodeAdminGovernanceRuntimeConfigProposalView,
      }),
    ),
    Effect.flatMap((projectedRecords) => {
      const auditedFields = collectAuditedFields(projectedRecords);

      return appendSensitiveReadAudit(input.auditLog, {
        requestContext: input.request.requestContext,
        target: `${platformModuleId.runtimeConfig}:${input.request.moduleId}:proposals:${auditedFields.join(",")}`,
        reason: `Inspect projected runtime-config proposals for ${input.request.moduleId}.`,
        auditedFields,
      }).pipe(
        Effect.map(() => projectedRecords.map((record) => record.record)),
      );
    }),
  );

const listProjectedAuditEvents = (input: {
  readonly auditLog: AuditLogModuleService;
  readonly fieldSecurity: AdminGovernanceFieldSecurity;
  readonly projection: ProjectionDescriptor;
  readonly request: AdminGovernanceListByModuleRequest;
}): Effect.Effect<
  readonly AdminGovernanceAuditEventView[],
  AdminGovernanceServiceError
> =>
  input.auditLog.queryByModule(input.request.moduleId).pipe(
    Effect.flatMap((records) =>
      projectAdminGovernanceRecords({
        fieldSecurity: input.fieldSecurity,
        moduleId: platformModuleId.auditLog,
        requestContext: input.request.requestContext,
        projection: input.projection,
        records,
        recordType: "auditEvent",
        decode: decodeAdminGovernanceAuditEventView,
      }),
    ),
    Effect.flatMap((projectedRecords) => {
      const auditedFields = collectAuditedFields(projectedRecords);

      return appendSensitiveReadAudit(input.auditLog, {
        requestContext: input.request.requestContext,
        target: `${platformModuleId.auditLog}:${input.request.moduleId}:events:${auditedFields.join(",")}`,
        reason: `Inspect projected audit-log events for ${input.request.moduleId}.`,
        auditedFields,
      }).pipe(
        Effect.map(() => projectedRecords.map((record) => record.record)),
      );
    }),
  );

const upsertRuntimeConfigOverride = (
  runtimeConfig: RuntimeConfigModule["Type"],
  auditLog: AuditLogModuleService,
  input: UpsertRuntimeConfigOverrideRequest,
): Effect.Effect<
  {
    readonly override: RuntimeConfigOverrideRecord;
    readonly auditEvent: AuditEvent;
  },
  AdminGovernanceServiceError
> =>
  Schema.decodeUnknown(UpsertRuntimeConfigOverrideRequestSchema)(input).pipe(
    Effect.flatMap((request) =>
      requireAuthenticatedActorId(request.requestContext).pipe(
        Effect.flatMap((actorId) =>
          buildStoredRuntimeConfigOverride(request, actorId).pipe(
            Effect.flatMap((override) =>
              runtimeConfig.upsertOverride(override),
            ),
            Effect.flatMap((storedOverride) =>
              auditLog
                .append({
                  requestContext: {
                    ...request.requestContext,
                    reason: request.approvalReason,
                  },
                  moduleId: request.moduleId,
                  action: runtimeConfigAuditAction.overrideChanged,
                  target: buildRuntimeConfigOverrideTarget(storedOverride),
                  reason: request.approvalReason,
                })
                .pipe(
                  Effect.map((auditEvent) => ({
                    override: storedOverride,
                    auditEvent,
                  })),
                ),
            ),
          ),
        ),
      ),
    ),
  );

export const makeAdminGovernanceService = () =>
  Effect.gen(function* () {
    const runtimeConfig = yield* RuntimeConfigModule;
    const auditLog = yield* AuditLogPostgresRepository.pipe(
      Effect.flatMap(makeAuditLogModule),
    );
    const fieldSecurity = yield* makeFieldSecurityModule();
    const valkey = yield* ValkeyAdapter;
    const runtimeConfigAdminProjection =
      yield* resolveAdminGovernanceProjection(platformModuleId.runtimeConfig);
    const auditLogAdminProjection = yield* resolveAdminGovernanceProjection(
      platformModuleId.auditLog,
    );

    return {
      resolveRequestContext: (input: AdminGovernanceSessionLookup) =>
        resolveAdminGovernanceRequestContext(valkey, input),
      listRuntimeConfigOverrides: (input: AdminGovernanceListByModuleRequest) =>
        Schema.decodeUnknown(AdminGovernanceListByModuleRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            ensureAdminGovernanceReadAccess(request.requestContext).pipe(
              Effect.flatMap(() =>
                listProjectedRuntimeConfigOverrides({
                  runtimeConfig,
                  auditLog,
                  fieldSecurity,
                  projection: runtimeConfigAdminProjection,
                  request,
                }),
              ),
            ),
          ),
        ),
      upsertRuntimeConfigOverride: (
        input: UpsertRuntimeConfigOverrideRequest,
      ): Effect.Effect<
        {
          readonly override: RuntimeConfigOverrideRecord;
          readonly auditEvent: AuditEvent;
        },
        AdminGovernanceServiceError
      > => upsertRuntimeConfigOverride(runtimeConfig, auditLog, input),
      persistRuntimeConfigProposals: (
        input: PersistRuntimeConfigProposalsRequest,
      ): Effect.Effect<
        readonly RuntimeConfigSyncArtifactRecord[],
        RuntimeConfigModulePersistenceError | ParseResult.ParseError
      > =>
        Schema.decodeUnknown(PersistRuntimeConfigProposalsRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            runtimeConfig.persistChangeProposals(request),
          ),
        ),
      listRuntimeConfigProposals: (input: AdminGovernanceListByModuleRequest) =>
        Schema.decodeUnknown(AdminGovernanceListByModuleRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            ensureAdminGovernanceReadAccess(request.requestContext).pipe(
              Effect.flatMap(() =>
                listProjectedRuntimeConfigProposals({
                  runtimeConfig,
                  auditLog,
                  fieldSecurity,
                  projection: runtimeConfigAdminProjection,
                  request,
                }),
              ),
            ),
          ),
        ),
      queryAuditEventsByModule: (input: AdminGovernanceListByModuleRequest) =>
        Schema.decodeUnknown(AdminGovernanceListByModuleRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            ensureAdminGovernanceReadAccess(request.requestContext).pipe(
              Effect.flatMap(() =>
                listProjectedAuditEvents({
                  auditLog,
                  fieldSecurity,
                  projection: auditLogAdminProjection,
                  request,
                }),
              ),
            ),
          ),
        ),
    } satisfies AdminGovernanceService;
  });

const makeAdminGovernanceRuntime = (options: AdminGovernanceRuntimeOptions) =>
  Effect.gen(function* () {
    const postgres = yield* makePostgresAdapter({
      connectionString: options.postgresUrl,
    });
    const valkey = yield* makeValkeyAdapter({
      url: options.valkeyUrl,
    });
    const writeDatabase = buildWriteDatabase(postgres.database);
    const runtimeConfigQueryable: RuntimeConfigPostgresQueryable = {
      listOverridesByModule: (moduleId) =>
        postgres.database
          .select()
          .from(runtimeConfigOverridesTable)
          .where(eq(runtimeConfigOverridesTable.moduleId, moduleId))
          .orderBy(desc(runtimeConfigOverridesTable.changedAt)),
      listSyncArtifactsByModule: (moduleId) =>
        postgres.database
          .select()
          .from(runtimeConfigSyncArtifactsTable)
          .where(eq(runtimeConfigSyncArtifactsTable.moduleId, moduleId))
          .orderBy(desc(runtimeConfigSyncArtifactsTable.generatedAt)),
    };
    const auditLogQueryable: AuditLogPostgresQueryable = {
      listEventsByModule: (moduleId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.moduleId, moduleId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
    };
    const runtimeConfigRepository = yield* makeRuntimeConfigPostgresRepository({
      ...writeDatabase,
      ...runtimeConfigQueryable,
    });
    const auditLogRepository = yield* makeAuditLogPostgresRepository({
      ...writeDatabase,
      ...auditLogQueryable,
    });
    const runtimeConfig = yield* makeRuntimeConfigModule(
      runtimeConfigRepository,
    );
    const service = yield* makeAdminGovernanceService().pipe(
      Effect.provideService(RuntimeConfigModule, runtimeConfig),
      Effect.provideService(AuditLogPostgresRepository, auditLogRepository),
      Effect.provideService(ValkeyAdapter, valkey),
    );

    return {
      service,
      close: Effect.all([
        Effect.ignore(postgres.close),
        Effect.ignore(valkey.close),
      ]),
    };
  });

const runAdminGovernanceWithResolvedOptions = <A, E>(
  options: AdminGovernanceRuntimeOptions,
  use: (service: AdminGovernanceService) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const runtime = yield* makeAdminGovernanceRuntime(options);

    return yield* use(runtime.service).pipe(
      Effect.ensuring(Effect.ignore(runtime.close)),
    );
  });

export const resolveAdminGovernanceRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  Schema.decodeUnknown(AdminGovernanceProcessEnvironmentSchema)(
    environment,
  ).pipe(
    Effect.map(
      (resolvedEnvironment): AdminGovernanceRuntimeOptions => ({
        postgresUrl: resolvedEnvironment.POSTGRES_URL,
        valkeyUrl: resolvedEnvironment.VALKEY_URL,
      }),
    ),
  );

export const runAdminGovernanceFromOptions = <A, E>(
  options: AdminGovernanceRuntimeOptions,
  use: (service: AdminGovernanceService) => Effect.Effect<A, E>,
) =>
  Schema.decodeUnknown(AdminGovernanceRuntimeOptionsSchema)(options).pipe(
    Effect.flatMap((resolvedOptions) =>
      runAdminGovernanceWithResolvedOptions(resolvedOptions, use),
    ),
  );

export const runAdminGovernanceFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: AdminGovernanceService) => Effect.Effect<A, E>,
) =>
  resolveAdminGovernanceRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((resolvedOptions) =>
      runAdminGovernanceWithResolvedOptions(resolvedOptions, use),
    ),
  );
