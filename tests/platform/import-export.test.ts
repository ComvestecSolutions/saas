import { Effect, Schema } from "effect";
import {
  actorType,
  dataClassification,
  importExportAuditAction,
  importExportJobFormat,
  importExportJobSource,
  permissionScope,
  platformModuleId,
  platformScope,
  retentionDataType,
  type RequestContext,
  runtimeResolutionSource,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
} from "@comvestec/contracts";
import {
  AuditLogModule,
  type AuditLogModuleService,
  type AuthorizationModuleService,
  FileStorageModule,
  type FileStorageModuleService,
  IdentitySessionModule,
  ImportExportModule,
  type ImportExportManagedFileSummaryWorkflowJobRecord,
  ImportExportManagedFileSummaryWorkflowJobRecordSchema,
  type ImportExportSupportCaseSummaryWorkflowJobRecord,
  ImportExportSupportCaseSummaryWorkflowJobRecordSchema,
  type ImportExportModuleService,
  RetentionLegalHoldModule,
  RuntimeConfigModule,
  SupportOperationsCasePostgresRepository,
  type SupportOperationsCasePostgresRepositoryService,
  buildImportExportManagedFileSummaryWorkflowJobId,
  buildImportExportSupportCaseSummaryWorkflowJobId,
  type IdentitySessionModuleService,
  type RetentionLegalHoldModuleService,
  type RuntimeConfigModuleService,
  type WorkflowJobsPostgresRepositoryServiceForRecord,
} from "@comvestec/modules";
import {
  type AuthenticatedConvexWorkflowClient,
  makeImportExportService as makeBaseImportExportService,
  platformBusinessEventName,
  type PlatformBusinessEventEmitter,
} from "@comvestec/platform";

const operatorRequestContext: RequestContext = {
  actorType: actorType.supportOperator,
  actorId: "usr_support_1",
  sessionId: "sess_support_1",
  correlationId: "corr_import_export_1",
  tenant: {
    scope: platformScope.organization,
    scopeId: "org_1",
    organizationId: "org_1",
  },
};

const unexpectedImportExportEffect = <A>() =>
  Effect.die(new Error("Unexpected import-export service dependency call."));

const createIdentitySessionModuleDouble = (
  requestContext = operatorRequestContext,
): IdentitySessionModuleService => ({
  startAuthentication: () => unexpectedImportExportEffect(),
  completeAuthentication: () => unexpectedImportExportEffect(),
  completePlatformOperatorAuthentication: () => unexpectedImportExportEffect(),
  invalidateSession: () => unexpectedImportExportEffect(),
  resolveRequestContext: () => Effect.succeed(requestContext),
});

const createRuntimeConfigModuleDouble = (
  enabled = true,
): RuntimeConfigModuleService => ({
  resolveConfigValue: () => unexpectedImportExportEffect(),
  resolveStoredConfigValue: () => unexpectedImportExportEffect(),
  resolveFeatureFlag: ({ moduleId, flag }) =>
    Effect.succeed({
      moduleId,
      key: flag.key,
      effectiveValue: enabled,
      source: runtimeResolutionSource.codeDefault,
      entitled: true,
    }),
  resolveStoredFeatureFlag: () => unexpectedImportExportEffect(),
  buildChangeProposals: () => unexpectedImportExportEffect(),
  listOverridesByModule: () => Effect.succeed([]),
  listChangeProposalsByModule: () => unexpectedImportExportEffect(),
  listOverrideProposalsByModule: () => unexpectedImportExportEffect(),
  upsertOverride: () => unexpectedImportExportEffect(),
  submitOverrideProposal: () => unexpectedImportExportEffect(),
  reviewChangeProposal: () => unexpectedImportExportEffect(),
  persistChangeProposals: () => unexpectedImportExportEffect(),
});

const createAuditLogModuleDouble = (
  overrides: Partial<AuditLogModuleService> = {},
) => {
  const calls: Array<Parameters<AuditLogModuleService["append"]>[0]> = [];

  const service: AuditLogModuleService = {
    append: (input) => {
      calls.push(input);

      return (
        overrides.append?.(input) ??
        Effect.succeed({
          eventId: `${input.moduleId}:${input.action}:${input.target}`,
          timestamp: "2026-05-07T12:00:00.000Z",
          actorId: input.requestContext.actorId ?? "anonymous",
          tenantScope: input.requestContext.tenant.scope,
          tenantScopeId: input.requestContext.tenant.scopeId,
          moduleId: input.moduleId,
          action: input.action,
          target: input.target,
          correlationId: input.requestContext.correlationId,
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
        })
      );
    },
    queryByModule: overrides.queryByModule ?? (() => Effect.succeed([])),
    queryByTarget: overrides.queryByTarget ?? (() => Effect.succeed([])),
    queryByActor: overrides.queryByActor ?? (() => Effect.succeed([])),
    queryByTenant: overrides.queryByTenant ?? (() => Effect.succeed([])),
    requirements: overrides.requirements ?? Effect.succeed([]),
  };

  return { calls, service };
};

const createAuditLogPersistenceError = () => ({
  _tag: "AuditLogPostgresRepositoryPersistenceError" as const,
  operation: "insertAuditEvent" as const,
  cause: new Error("Audit log persistence failed."),
});

const createFileStorageModuleDouble = (
  overrides: Partial<FileStorageModuleService>,
): FileStorageModuleService => ({
  requestManagedFileUploadUrl:
    overrides.requestManagedFileUploadUrl ??
    (() => unexpectedImportExportEffect()),
  registerManagedFile:
    overrides.registerManagedFile ?? (() => unexpectedImportExportEffect()),
  getManagedFileRecord:
    overrides.getManagedFileRecord ?? (() => unexpectedImportExportEffect()),
  listManagedFiles: overrides.listManagedFiles ?? (() => Effect.succeed([])),
  resolveManagedFileDownload:
    overrides.resolveManagedFileDownload ??
    (() => unexpectedImportExportEffect()),
  deleteManagedFile:
    overrides.deleteManagedFile ?? (() => unexpectedImportExportEffect()),
});

const createRetentionLegalHoldModuleDouble = (
  overrides: Partial<RetentionLegalHoldModuleService> = {},
): RetentionLegalHoldModuleService => ({
  upsertRetentionPolicy:
    overrides.upsertRetentionPolicy ?? (() => unexpectedImportExportEffect()),
  listRetentionPolicies:
    overrides.listRetentionPolicies ?? (() => unexpectedImportExportEffect()),
  placeRetentionLegalHold:
    overrides.placeRetentionLegalHold ?? (() => unexpectedImportExportEffect()),
  getRetentionLegalHoldRecord:
    overrides.getRetentionLegalHoldRecord ??
    (() => unexpectedImportExportEffect()),
  releaseRetentionLegalHold:
    overrides.releaseRetentionLegalHold ??
    (() => unexpectedImportExportEffect()),
  listRetentionLegalHolds:
    overrides.listRetentionLegalHolds ?? (() => unexpectedImportExportEffect()),
  checkRetentionGuard:
    overrides.checkRetentionGuard ??
    (() =>
      Effect.succeed({
        dataType: retentionDataType.fileObject,
        legalHoldActive: false,
        purgeBlocked: false,
      })),
});

const createImportExportModuleDouble = (
  overrides: Partial<ImportExportModuleService>,
): ImportExportModuleService => ({
  requestManagedFileSummaryExportRecord:
    overrides.requestManagedFileSummaryExportRecord ??
    (() => unexpectedImportExportEffect()),
  requestSupportCaseSummaryExportRecord:
    overrides.requestSupportCaseSummaryExportRecord ??
    (() => unexpectedImportExportEffect()),
  startImportExportJobRecord:
    overrides.startImportExportJobRecord ??
    (() => unexpectedImportExportEffect()),
  completeImportExportJobRecord:
    overrides.completeImportExportJobRecord ??
    (() => unexpectedImportExportEffect()),
  failImportExportJobRecord:
    overrides.failImportExportJobRecord ??
    (() => unexpectedImportExportEffect()),
  blockImportExportJobRecord:
    overrides.blockImportExportJobRecord ??
    (() => unexpectedImportExportEffect()),
  getImportExportJobRecord:
    overrides.getImportExportJobRecord ?? (() => Effect.succeed(undefined)),
});

const createWorkflowJobsRepositoryDouble = (
  overrides: Partial<
    WorkflowJobsPostgresRepositoryServiceForRecord<
      | ImportExportManagedFileSummaryWorkflowJobRecord
      | ImportExportSupportCaseSummaryWorkflowJobRecord
    >
  >,
): WorkflowJobsPostgresRepositoryServiceForRecord<
  | ImportExportManagedFileSummaryWorkflowJobRecord
  | ImportExportSupportCaseSummaryWorkflowJobRecord
> => ({
  persistWorkflowJob:
    overrides.persistWorkflowJob ?? (() => unexpectedImportExportEffect()),
  getWorkflowJob:
    overrides.getWorkflowJob ?? (() => unexpectedImportExportEffect()),
  claimScheduledWorkflowJob:
    overrides.claimScheduledWorkflowJob ??
    (() => unexpectedImportExportEffect()),
  restoreWorkflowJobIfUpdatedAtMatches:
    overrides.restoreWorkflowJobIfUpdatedAtMatches ??
    (() => unexpectedImportExportEffect()),
  cancelWorkflowJobIfUpdatedAtMatches:
    overrides.cancelWorkflowJobIfUpdatedAtMatches ??
    (() => unexpectedImportExportEffect()),
  listDueWorkflowJobs:
    overrides.listDueWorkflowJobs ?? (() => unexpectedImportExportEffect()),
  listRepairGapWorkflowJobs:
    overrides.listRepairGapWorkflowJobs ??
    (() => unexpectedImportExportEffect()),
});

const createConvexWorkflowClientDouble = (
  overrides: Partial<{
    scheduleImportExportManagedFileSummaryWorkflowJob: NonNullable<
      AuthenticatedConvexWorkflowClient["scheduleImportExportManagedFileSummaryWorkflowJob"]
    >;
    scheduleImportExportSupportCaseSummaryWorkflowJob: NonNullable<
      AuthenticatedConvexWorkflowClient["scheduleImportExportSupportCaseSummaryWorkflowJob"]
    >;
  }>,
) => ({
  scheduleImportExportManagedFileSummaryWorkflowJob:
    overrides.scheduleImportExportManagedFileSummaryWorkflowJob ??
    (() => unexpectedImportExportEffect()),
  scheduleImportExportSupportCaseSummaryWorkflowJob:
    overrides.scheduleImportExportSupportCaseSummaryWorkflowJob ??
    (() => unexpectedImportExportEffect()),
});

const createSupportOperationsCaseRepositoryDouble = (
  overrides: Partial<SupportOperationsCasePostgresRepositoryService> = {},
): SupportOperationsCasePostgresRepositoryService => ({
  upsertSupportCase:
    overrides.upsertSupportCase ?? (() => unexpectedImportExportEffect()),
  getSupportCase:
    overrides.getSupportCase ?? (() => unexpectedImportExportEffect()),
  listSupportCases: overrides.listSupportCases ?? (() => Effect.succeed([])),
});

const createAuthorizationCheck = (allowed = true) =>
  vi.fn(() =>
    Effect.succeed({
      allowed,
      cacheKey: `${platformModuleId.importExport}:admin`,
      reason: allowed ? "allowed" : "denied",
      auditRequired: false,
    }),
  );

const makeImportExportService = (options: {
  readonly authorization: Pick<AuthorizationModuleService, "check">;
  readonly workflowJobs?: WorkflowJobsPostgresRepositoryServiceForRecord<
    | ImportExportManagedFileSummaryWorkflowJobRecord
    | ImportExportSupportCaseSummaryWorkflowJobRecord
  >;
  readonly convexWorkflowClient?: {
    readonly scheduleImportExportManagedFileSummaryWorkflowJob: NonNullable<
      AuthenticatedConvexWorkflowClient["scheduleImportExportManagedFileSummaryWorkflowJob"]
    >;
    readonly scheduleImportExportSupportCaseSummaryWorkflowJob: NonNullable<
      AuthenticatedConvexWorkflowClient["scheduleImportExportSupportCaseSummaryWorkflowJob"]
    >;
  };
  readonly retentionLegalHold?: RetentionLegalHoldModuleService;
  readonly supportCaseRepository?: SupportOperationsCasePostgresRepositoryService;
  readonly fetchImplementation?: typeof fetch;
  readonly businessEventEmitter?: PlatformBusinessEventEmitter;
}) =>
  makeBaseImportExportService(options).pipe(
    Effect.provideService(
      RetentionLegalHoldModule,
      options.retentionLegalHold ?? createRetentionLegalHoldModuleDouble(),
    ),
    Effect.provideService(
      SupportOperationsCasePostgresRepository,
      options.supportCaseRepository ??
        createSupportOperationsCaseRepositoryDouble(),
    ),
  );

describe("platform import-export service", () => {
  it("schedules managed-file summary export workflow jobs for authorized operators", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const emitBusinessEvent = vi.fn(() => Effect.void);
    const persistedJobs: ImportExportManagedFileSummaryWorkflowJobRecord[] = [];
    const scheduleImportExportManagedFileSummaryWorkflowJob = vi.fn(() =>
      Effect.succeed({
        scheduledFunctionId: "import-export-dispatch-1",
        scheduledFunctionIds: [
          "import-export-dispatch-1",
          "import-export-dispatch-2",
        ],
        primaryScheduled: true,
        scheduledRecoveryAttemptCount: 1,
        expectedRecoveryAttemptCount: 1,
      }),
    );
    const jobId = buildImportExportManagedFileSummaryWorkflowJobId({
      trigger: workflowJobTrigger.operatorRequested,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      format: importExportJobFormat.json,
      key: operatorRequestContext.correlationId,
    });
    const importExport = await Effect.runPromise(
      makeImportExportService({
        authorization: { check: authorizationCheck },
        businessEventEmitter: emitBusinessEvent,
        workflowJobs: createWorkflowJobsRepositoryDouble({
          persistWorkflowJob: (record) => {
            persistedJobs.push(record);

            return Effect.succeed(record);
          },
        }),
        convexWorkflowClient: createConvexWorkflowClientDouble({
          scheduleImportExportManagedFileSummaryWorkflowJob,
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble({}),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          ImportExportModule,
          createImportExportModuleDouble({
            requestManagedFileSummaryExportRecord: (input) =>
              Effect.succeed({
                jobId: input.jobId,
                tenantScope: input.tenantScope,
                tenantScopeId: input.tenantScopeId,
                source:
                  input.format === importExportJobFormat.csv
                    ? importExportJobSource.managedFileSummaryCsv
                    : importExportJobSource.managedFileSummaryJson,
                format: input.format,
                status: workflowJobStatus.scheduled,
                createdAt: input.requestedAt,
              }),
            blockImportExportJobRecord: () => unexpectedImportExportEffect(),
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      importExport.requestManagedFileSummaryExport({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
      }),
    );

    expect(result).toEqual({
      jobId,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      source: importExportJobSource.managedFileSummaryJson,
      format: importExportJobFormat.json,
      status: workflowJobStatus.scheduled,
      createdAt: expect.any(String),
    });
    expect(
      scheduleImportExportManagedFileSummaryWorkflowJob,
    ).toHaveBeenCalledWith({
      jobId,
      scheduledAt: expect.any(String),
    });
    expect(persistedJobs).toHaveLength(2);
    expect(persistedJobs[0]).toMatchObject({
      jobId,
      sourceModuleId: platformModuleId.importExport,
      kind: workflowJobKind.importExportManagedFileSummary,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      payload: {
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
      },
    });
    expect(persistedJobs[1]?.payload.dispatch).toMatchObject({
      scheduledFunctionId: "import-export-dispatch-1",
    });
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.importExport,
        action: importExportAuditAction.exportRequested,
        target: `${platformModuleId.importExport}:${platformScope.organization}:org_1:${jobId}`,
      }),
    ]);
    expect(emitBusinessEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName:
          platformBusinessEventName.importExportManagedFileSummaryRequested,
        moduleId: platformModuleId.importExport,
        permissionScope: permissionScope.exportExecute,
        properties: expect.objectContaining({
          jobId,
          source: importExportJobSource.managedFileSummaryJson,
          format: importExportJobFormat.json,
        }),
      }),
    );
    expect(authorizationCheck).toHaveBeenCalledTimes(1);
  });

  it("schedules CSV managed-file summary export workflow jobs for authorized operators", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const persistedJobs: ImportExportManagedFileSummaryWorkflowJobRecord[] = [];
    const scheduleImportExportManagedFileSummaryWorkflowJob = vi.fn(() =>
      Effect.succeed({
        scheduledFunctionId: "import-export-dispatch-csv-1",
        scheduledFunctionIds: [
          "import-export-dispatch-csv-1",
          "import-export-dispatch-csv-2",
        ],
        primaryScheduled: true,
        scheduledRecoveryAttemptCount: 1,
        expectedRecoveryAttemptCount: 1,
      }),
    );
    const jobId = buildImportExportManagedFileSummaryWorkflowJobId({
      trigger: workflowJobTrigger.operatorRequested,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      format: importExportJobFormat.csv,
      key: operatorRequestContext.correlationId,
    });
    const importExport = await Effect.runPromise(
      makeImportExportService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          persistWorkflowJob: (record) => {
            persistedJobs.push(record);

            return Effect.succeed(record);
          },
        }),
        convexWorkflowClient: createConvexWorkflowClientDouble({
          scheduleImportExportManagedFileSummaryWorkflowJob,
        }),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble({}),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          ImportExportModule,
          createImportExportModuleDouble({
            requestManagedFileSummaryExportRecord: (input) =>
              Effect.succeed({
                jobId: input.jobId,
                tenantScope: input.tenantScope,
                tenantScopeId: input.tenantScopeId,
                source: importExportJobSource.managedFileSummaryCsv,
                format: input.format,
                status: workflowJobStatus.scheduled,
                createdAt: input.requestedAt,
              }),
            blockImportExportJobRecord: () => unexpectedImportExportEffect(),
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      importExport.requestManagedFileSummaryExport({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
        format: importExportJobFormat.csv,
      }),
    );

    expect(result).toEqual({
      jobId,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      source: importExportJobSource.managedFileSummaryCsv,
      format: importExportJobFormat.csv,
      status: workflowJobStatus.scheduled,
      createdAt: expect.any(String),
    });
    expect(
      scheduleImportExportManagedFileSummaryWorkflowJob,
    ).toHaveBeenCalledWith({
      jobId,
      scheduledAt: expect.any(String),
    });
    expect(persistedJobs[0]).toMatchObject({
      jobId,
      payload: {
        source: importExportJobSource.managedFileSummaryCsv,
        format: importExportJobFormat.csv,
      },
    });
  });

  it("schedules support-case summary export workflow jobs for authorized operators", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const emitBusinessEvent = vi.fn(() => Effect.void);
    const persistedJobs: ImportExportSupportCaseSummaryWorkflowJobRecord[] = [];
    const scheduleImportExportSupportCaseSummaryWorkflowJob = vi.fn(() =>
      Effect.succeed({
        scheduledFunctionId: "import-export-support-case-dispatch-1",
        scheduledFunctionIds: [
          "import-export-support-case-dispatch-1",
          "import-export-support-case-dispatch-2",
        ],
        primaryScheduled: true,
        scheduledRecoveryAttemptCount: 1,
        expectedRecoveryAttemptCount: 1,
      }),
    );
    const jobId = buildImportExportSupportCaseSummaryWorkflowJobId({
      trigger: workflowJobTrigger.operatorRequested,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      key: operatorRequestContext.correlationId,
    });
    const importExport = await Effect.runPromise(
      makeImportExportService({
        authorization: { check: authorizationCheck },
        businessEventEmitter: emitBusinessEvent,
        workflowJobs: createWorkflowJobsRepositoryDouble({
          persistWorkflowJob: (record) => {
            persistedJobs.push(
              record as ImportExportSupportCaseSummaryWorkflowJobRecord,
            );

            return Effect.succeed(record);
          },
        }),
        convexWorkflowClient: createConvexWorkflowClientDouble({
          scheduleImportExportManagedFileSummaryWorkflowJob: () =>
            unexpectedImportExportEffect(),
          scheduleImportExportSupportCaseSummaryWorkflowJob,
        }),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble({}),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          ImportExportModule,
          createImportExportModuleDouble({
            requestSupportCaseSummaryExportRecord: (input) =>
              Effect.succeed({
                jobId: input.jobId,
                tenantScope: input.tenantScope,
                tenantScopeId: input.tenantScopeId,
                source: importExportJobSource.supportCaseSummaryJson,
                format: importExportJobFormat.json,
                status: workflowJobStatus.scheduled,
                createdAt: input.requestedAt,
              }),
            blockImportExportJobRecord: () => unexpectedImportExportEffect(),
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      importExport.requestSupportCaseSummaryExport({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
      }),
    );

    expect(result).toEqual({
      jobId,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      source: importExportJobSource.supportCaseSummaryJson,
      format: importExportJobFormat.json,
      status: workflowJobStatus.scheduled,
      createdAt: expect.any(String),
    });
    expect(
      scheduleImportExportSupportCaseSummaryWorkflowJob,
    ).toHaveBeenCalledWith({
      jobId,
      scheduledAt: expect.any(String),
    });
    expect(persistedJobs[0]).toMatchObject({
      jobId,
      kind: workflowJobKind.importExportSupportCaseSummary,
      payload: {
        source: importExportJobSource.supportCaseSummaryJson,
        format: importExportJobFormat.json,
      },
    });
    expect(emitBusinessEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName:
          platformBusinessEventName.importExportSupportCaseSummaryRequested,
        moduleId: platformModuleId.importExport,
        permissionScope: permissionScope.exportExecute,
        properties: expect.objectContaining({
          jobId,
          source: importExportJobSource.supportCaseSummaryJson,
          format: importExportJobFormat.json,
        }),
      }),
    );
  });

  it("does not persist export records when request audit append fails", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const requestManagedFileSummaryExportRecord = vi.fn((input) =>
      Effect.succeed({
        jobId: input.jobId,
        tenantScope: input.tenantScope,
        tenantScopeId: input.tenantScopeId,
        source: importExportJobSource.managedFileSummaryJson,
        format: input.format,
        status: workflowJobStatus.scheduled,
        createdAt: input.requestedAt,
      }),
    );
    const persistWorkflowJob = vi.fn((record) => Effect.succeed(record));
    const scheduleImportExportManagedFileSummaryWorkflowJob = vi.fn(() =>
      Effect.succeed({
        scheduledFunctionId: "import-export-dispatch-audit-failure-1",
        scheduledFunctionIds: ["import-export-dispatch-audit-failure-1"],
        primaryScheduled: true,
        scheduledRecoveryAttemptCount: 1,
        expectedRecoveryAttemptCount: 1,
      }),
    );
    const { calls: auditCalls, service: auditLog } = createAuditLogModuleDouble(
      {
        append: () => Effect.fail(createAuditLogPersistenceError()),
      },
    );
    const importExport = await Effect.runPromise(
      makeImportExportService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          persistWorkflowJob,
        }),
        convexWorkflowClient: createConvexWorkflowClientDouble({
          scheduleImportExportManagedFileSummaryWorkflowJob,
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble({}),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          ImportExportModule,
          createImportExportModuleDouble({
            requestManagedFileSummaryExportRecord,
            blockImportExportJobRecord: () => unexpectedImportExportEffect(),
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        importExport.requestManagedFileSummaryExport({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    ).rejects.toThrowError(
      /AuditLogPostgresRepositoryPersistenceError.*insertAuditEvent/,
    );
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.importExport,
        action: importExportAuditAction.exportRequested,
      }),
    ]);
    expect(requestManagedFileSummaryExportRecord).not.toHaveBeenCalled();
    expect(persistWorkflowJob).not.toHaveBeenCalled();
    expect(
      scheduleImportExportManagedFileSummaryWorkflowJob,
    ).not.toHaveBeenCalled();
  });

  it("fails closed when managed-file summary export source files are under active legal hold", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const requestManagedFileSummaryExportRecord = vi.fn(() =>
      unexpectedImportExportEffect(),
    );
    const persistWorkflowJob = vi.fn(() => unexpectedImportExportEffect());
    const scheduleImportExportManagedFileSummaryWorkflowJob = vi.fn(() =>
      unexpectedImportExportEffect(),
    );
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const importExport = await Effect.runPromise(
      makeImportExportService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          persistWorkflowJob,
        }),
        convexWorkflowClient: createConvexWorkflowClientDouble({
          scheduleImportExportManagedFileSummaryWorkflowJob,
        }),
        retentionLegalHold: createRetentionLegalHoldModuleDouble({
          checkRetentionGuard: () =>
            Effect.succeed({
              dataType: retentionDataType.fileObject,
              legalHoldActive: true,
              purgeBlocked: true,
            }),
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble({
            listManagedFiles: () =>
              Effect.succeed([
                {
                  fileId: `${platformModuleId.fileStorage}:${platformScope.organization}:org_1:file_1`,
                  fileName: "invoice.pdf",
                  contentType: "application/pdf",
                  sizeBytes: 1024,
                },
              ]),
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          ImportExportModule,
          createImportExportModuleDouble({
            requestManagedFileSummaryExportRecord,
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        importExport.requestManagedFileSummaryExport({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "ImportExportManagedFileSummaryExportBlockedError",
        scope: platformScope.organization,
        scopeId: "org_1",
        format: importExportJobFormat.json,
        blockedTargetId: `${platformModuleId.fileStorage}:${platformScope.organization}:org_1:file_1`,
      },
    });
    expect(auditCalls).toEqual([]);
    expect(requestManagedFileSummaryExportRecord).not.toHaveBeenCalled();
    expect(persistWorkflowJob).not.toHaveBeenCalled();
    expect(
      scheduleImportExportManagedFileSummaryWorkflowJob,
    ).not.toHaveBeenCalled();
  });

  it("blocks managed-file summary workflow execution when a legal hold is placed after request acceptance", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const persistedJobs: ImportExportManagedFileSummaryWorkflowJobRecord[] = [];
    const startImportExportJobRecord = vi.fn(() =>
      Effect.succeed({
        jobId: "job_import_export_retention_blocked_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
        status: workflowJobStatus.running,
        startedAt: "2026-05-07T12:16:00.000Z",
        createdAt: "2026-05-07T12:15:00.000Z",
      }),
    );
    const completeImportExportJobRecord = vi.fn(() =>
      unexpectedImportExportEffect(),
    );
    const blockImportExportJobRecord = vi.fn(({ lastError, completedAt }) =>
      Effect.succeed({
        jobId: "job_import_export_retention_blocked_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
        status: workflowJobStatus.blocked,
        lastError,
        startedAt: "2026-05-07T12:16:00.000Z",
        completedAt,
        createdAt: "2026-05-07T12:15:00.000Z",
      }),
    );
    const requestManagedFileUploadUrl = vi.fn(() =>
      unexpectedImportExportEffect(),
    );
    const registerManagedFile = vi.fn(() => unexpectedImportExportEffect());
    const workflowJob = Schema.decodeUnknownSync(
      ImportExportManagedFileSummaryWorkflowJobRecordSchema,
    )({
      jobId: "job_import_export_retention_blocked_1",
      runtime: "convex",
      sourceModuleId: platformModuleId.importExport,
      kind: workflowJobKind.importExportManagedFileSummary,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      attempts: 0,
      scheduledAt: "2026-05-07T12:15:00.000Z",
      payload: {
        sourceModuleId: platformModuleId.importExport,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        requestContext: operatorRequestContext,
        actorId: operatorRequestContext.actorId,
        correlationId: operatorRequestContext.correlationId,
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
      },
      createdAt: "2026-05-07T12:15:00.000Z",
      updatedAt: "2026-05-07T12:15:00.000Z",
    });
    const importExport = await Effect.runPromise(
      makeImportExportService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          getWorkflowJob: () => Effect.succeed(workflowJob),
          claimScheduledWorkflowJob: () => Effect.succeed(workflowJob),
          persistWorkflowJob: (record) => {
            persistedJobs.push(record);

            return Effect.succeed(record);
          },
        }),
        retentionLegalHold: createRetentionLegalHoldModuleDouble({
          checkRetentionGuard: () =>
            Effect.succeed({
              dataType: retentionDataType.fileObject,
              legalHoldActive: true,
              purgeBlocked: true,
            }),
        }),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble({
            listManagedFiles: () =>
              Effect.succeed([
                {
                  fileId: `${platformModuleId.fileStorage}:${platformScope.organization}:org_1:file_1`,
                  fileName: "invoice.pdf",
                  contentType: "application/pdf",
                  sizeBytes: 1024,
                },
              ]),
            requestManagedFileUploadUrl,
            registerManagedFile,
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          ImportExportModule,
          createImportExportModuleDouble({
            startImportExportJobRecord,
            completeImportExportJobRecord,
            blockImportExportJobRecord,
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      importExport.runImportExportManagedFileSummaryWorkflowJob({
        jobId: "job_import_export_retention_blocked_1",
      }),
    );

    expect(result).toMatchObject({
      jobId: "job_import_export_retention_blocked_1",
      status: workflowJobStatus.blocked,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
    });
    expect(startImportExportJobRecord).toHaveBeenCalledTimes(1);
    expect(completeImportExportJobRecord).not.toHaveBeenCalled();
    expect(blockImportExportJobRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job_import_export_retention_blocked_1",
        lastError: `Managed-file summary export is blocked by an active retention legal hold on ${platformModuleId.fileStorage}:${platformScope.organization}:org_1:file_1.`,
      }),
    );
    expect(requestManagedFileUploadUrl).not.toHaveBeenCalled();
    expect(registerManagedFile).not.toHaveBeenCalled();
    expect(persistedJobs[persistedJobs.length - 1]).toMatchObject({
      jobId: "job_import_export_retention_blocked_1",
      status: workflowJobStatus.blocked,
    });
  });

  it("persists blocked workflow rows when claimed execution fails before completion", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const persistedJobs: ImportExportManagedFileSummaryWorkflowJobRecord[] = [];
    const startImportExportJobRecord = vi.fn(() =>
      Effect.succeed({
        jobId: "job_import_export_blocked_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
        status: workflowJobStatus.running,
        startedAt: "2026-05-07T12:16:00.000Z",
        createdAt: "2026-05-07T12:15:00.000Z",
      }),
    );
    const blockImportExportJobRecord = vi.fn(({ lastError, completedAt }) =>
      Effect.succeed({
        jobId: "job_import_export_blocked_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
        status: workflowJobStatus.blocked,
        lastError,
        startedAt: "2026-05-07T12:16:00.000Z",
        completedAt,
        createdAt: "2026-05-07T12:15:00.000Z",
      }),
    );
    const claimedJob = Schema.decodeUnknownSync(
      ImportExportManagedFileSummaryWorkflowJobRecordSchema,
    )({
      jobId: "job_import_export_blocked_1",
      runtime: "convex",
      sourceModuleId: platformModuleId.importExport,
      kind: workflowJobKind.importExportManagedFileSummary,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.running,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      attempts: 1,
      scheduledAt: "2026-05-07T12:15:00.000Z",
      payload: {
        sourceModuleId: platformModuleId.importExport,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        requestContext: operatorRequestContext,
        actorId: operatorRequestContext.actorId,
        correlationId: operatorRequestContext.correlationId,
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
      },
      createdAt: "2026-05-07T12:15:00.000Z",
      updatedAt: "2026-05-07T12:16:00.000Z",
    });
    const importExport = await Effect.runPromise(
      makeImportExportService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          getWorkflowJob: () => Effect.succeed(claimedJob),
          claimScheduledWorkflowJob: () => Effect.succeed(claimedJob),
          persistWorkflowJob: (record) => {
            persistedJobs.push(record);

            return Effect.succeed(record);
          },
        }),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble({
            listManagedFiles: () =>
              Effect.fail({
                _tag: "FileStorageFileNotFoundError" as const,
                fileId: "file_missing_1",
              }),
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          ImportExportModule,
          createImportExportModuleDouble({
            startImportExportJobRecord,
            blockImportExportJobRecord,
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      importExport.runImportExportManagedFileSummaryWorkflowJob({
        jobId: "job_import_export_blocked_1",
      }),
    );

    expect(result).toMatchObject({
      jobId: "job_import_export_blocked_1",
      kind: workflowJobKind.importExportManagedFileSummary,
      status: workflowJobStatus.blocked,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
    });
    expect(startImportExportJobRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job_import_export_blocked_1",
      }),
    );
    expect(blockImportExportJobRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job_import_export_blocked_1",
        lastError: "FileStorageFileNotFoundError",
      }),
    );
    expect(persistedJobs[persistedJobs.length - 1]).toMatchObject({
      jobId: "job_import_export_blocked_1",
      status: workflowJobStatus.blocked,
      lastError: "FileStorageFileNotFoundError",
    });
  });

  it("runs managed-file summary export workflow jobs and uploads a JSON artifact", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const persistedJobs: ImportExportManagedFileSummaryWorkflowJobRecord[] = [];
    const requestManagedFileUploadUrl = vi.fn(() =>
      Effect.succeed({
        uploadUrl: "https://upload.example/import-export",
        uploadToken: "upload_token_1",
      }),
    );
    const registerManagedFile = vi.fn(() =>
      Effect.succeed({
        fileId: "file_export_1",
        fileName: "managed-file-summary-export.json",
        contentType: "application/json",
        sizeBytes: 128,
        scope: platformScope.organization,
        scopeId: "org_1",
        uploadedBy: "usr_support_1",
        legalHoldActive: false,
      }),
    );
    const startImportExportJobRecord = vi.fn(() =>
      Effect.succeed({
        jobId: "job_import_export_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
        status: workflowJobStatus.running,
        startedAt: "2026-05-07T12:01:00.000Z",
        createdAt: "2026-05-07T12:00:00.000Z",
      }),
    );
    const completeImportExportJobRecord = vi.fn(() =>
      Effect.succeed({
        jobId: "job_import_export_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
        status: workflowJobStatus.completed,
        rowCount: 2,
        artifactFileId: "file_export_1",
        startedAt: "2026-05-07T12:01:00.000Z",
        completedAt: "2026-05-07T12:02:00.000Z",
        createdAt: "2026-05-07T12:00:00.000Z",
      }),
    );
    const fetchImplementation = vi.fn(
      async (_input, init) =>
        new Response(JSON.stringify({ storageId: "storage_1" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
    );
    const claimedJob = Schema.decodeUnknownSync(
      ImportExportManagedFileSummaryWorkflowJobRecordSchema,
    )({
      jobId: "job_import_export_1",
      runtime: "convex",
      sourceModuleId: platformModuleId.importExport,
      kind: workflowJobKind.importExportManagedFileSummary,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.running,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      attempts: 1,
      scheduledAt: "2026-05-07T12:00:00.000Z",
      payload: {
        sourceModuleId: platformModuleId.importExport,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        requestContext: operatorRequestContext,
        actorId: operatorRequestContext.actorId,
        correlationId: operatorRequestContext.correlationId,
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
      },
      createdAt: "2026-05-07T12:00:00.000Z",
      updatedAt: "2026-05-07T12:01:00.000Z",
    });
    const importExport = await Effect.runPromise(
      makeImportExportService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          getWorkflowJob: () => Effect.succeed(claimedJob),
          claimScheduledWorkflowJob: () => Effect.succeed(claimedJob),
          persistWorkflowJob: (record) => {
            persistedJobs.push(record);

            return Effect.succeed(record);
          },
        }),
        fetchImplementation,
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble({
            listManagedFiles: () =>
              Effect.succeed([
                {
                  fileId: "file_1",
                  fileName: "invoice.pdf",
                  contentType: "application/pdf",
                  sizeBytes: 1024,
                },
                {
                  fileId: "file_2",
                  fileName: "contract.docx",
                  contentType:
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                  sizeBytes: 2048,
                },
              ]),
            requestManagedFileUploadUrl,
            registerManagedFile,
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          ImportExportModule,
          createImportExportModuleDouble({
            startImportExportJobRecord,
            completeImportExportJobRecord,
            blockImportExportJobRecord: () => unexpectedImportExportEffect(),
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      importExport.runImportExportManagedFileSummaryWorkflowJob({
        jobId: "job_import_export_1",
      }),
    );

    expect(result).toMatchObject({
      jobId: "job_import_export_1",
      kind: workflowJobKind.importExportManagedFileSummary,
      status: workflowJobStatus.completed,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
    });
    expect(requestManagedFileUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: platformScope.organization,
        scopeId: "org_1",
        uploadedBy: operatorRequestContext.actorId,
      }),
    );
    expect(registerManagedFile).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: platformScope.organization,
        scopeId: "org_1",
        uploadToken: "upload_token_1",
        storageId: "storage_1",
        classification: dataClassification.tenantConfidential,
      }),
    );
    expect(completeImportExportJobRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job_import_export_1",
        artifactFileId: "file_export_1",
        rowCount: 2,
      }),
    );
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body)),
    ).toEqual([
      {
        fileId: "file_1",
        fileName: "invoice.pdf",
        contentType: "application/pdf",
        sizeBytes: 1024,
      },
      {
        fileId: "file_2",
        fileName: "contract.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: 2048,
      },
    ]);
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.importExport,
        action: importExportAuditAction.exportCompleted,
        target: `${platformModuleId.importExport}:job_import_export_1`,
      }),
    ]);
    expect(persistedJobs[persistedJobs.length - 1]).toMatchObject({
      jobId: "job_import_export_1",
      status: workflowJobStatus.completed,
    });
  });

  it("runs support-case summary export workflow jobs and uploads a JSON artifact", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } =
      createAuditLogModuleDouble();
    const persistedJobs: ImportExportSupportCaseSummaryWorkflowJobRecord[] = [];
    const requestManagedFileUploadUrl = vi.fn(() =>
      Effect.succeed({
        uploadUrl: "https://upload.example/import-export-support-cases",
        uploadToken: "upload_token_support_cases_1",
      }),
    );
    const registerManagedFile = vi.fn(() =>
      Effect.succeed({
        fileId: "file_support_case_export_1",
        fileName: "support-case-summary-export.json",
        contentType: "application/json",
        sizeBytes: 256,
        scope: platformScope.organization,
        scopeId: "org_1",
        uploadedBy: "usr_support_1",
        legalHoldActive: false,
      }),
    );
    const startImportExportJobRecord = vi.fn(() =>
      Effect.succeed({
        jobId: "job_import_export_support_case_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        source: importExportJobSource.supportCaseSummaryJson,
        format: importExportJobFormat.json,
        status: workflowJobStatus.running,
        startedAt: "2026-05-07T12:11:00.000Z",
        createdAt: "2026-05-07T12:10:00.000Z",
      }),
    );
    const completeImportExportJobRecord = vi.fn(() =>
      Effect.succeed({
        jobId: "job_import_export_support_case_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        source: importExportJobSource.supportCaseSummaryJson,
        format: importExportJobFormat.json,
        status: workflowJobStatus.completed,
        rowCount: 2,
        artifactFileId: "file_support_case_export_1",
        startedAt: "2026-05-07T12:11:00.000Z",
        completedAt: "2026-05-07T12:12:00.000Z",
        createdAt: "2026-05-07T12:10:00.000Z",
      }),
    );
    const fetchImplementation = vi.fn(
      async (_input, _init) =>
        new Response(JSON.stringify({ storageId: "storage_support_case_1" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
    );
    const emitBusinessEvent = vi.fn(() => Effect.void);
    const claimedJob = Schema.decodeUnknownSync(
      ImportExportSupportCaseSummaryWorkflowJobRecordSchema,
    )({
      jobId: "job_import_export_support_case_1",
      runtime: "convex",
      sourceModuleId: platformModuleId.importExport,
      kind: workflowJobKind.importExportSupportCaseSummary,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.running,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      attempts: 1,
      scheduledAt: "2026-05-07T12:10:00.000Z",
      payload: {
        sourceModuleId: platformModuleId.importExport,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        requestContext: operatorRequestContext,
        actorId: operatorRequestContext.actorId,
        correlationId: operatorRequestContext.correlationId,
        source: importExportJobSource.supportCaseSummaryJson,
        format: importExportJobFormat.json,
      },
      createdAt: "2026-05-07T12:10:00.000Z",
      updatedAt: "2026-05-07T12:11:00.000Z",
    });
    const supportCases = [
      {
        caseId: "case_1",
        supportAgent: "agent@example.com",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        summary: "Investigate invoice mismatch",
        status: "open",
        priority: "high",
        startedAt: "2026-05-06T10:00:00.000Z",
        lastUpdatedAt: "2026-05-07T11:59:00.000Z",
      },
      {
        caseId: "case_2",
        supportAgent: "agent@example.com",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        summary: "Confirm tenant onboarding fix",
        status: "resolved",
        priority: "normal",
        startedAt: "2026-05-05T09:00:00.000Z",
        lastUpdatedAt: "2026-05-07T10:30:00.000Z",
      },
    ] as const;
    const importExport = await Effect.runPromise(
      makeImportExportService({
        authorization: { check: authorizationCheck },
        businessEventEmitter: emitBusinessEvent,
        workflowJobs: createWorkflowJobsRepositoryDouble({
          getWorkflowJob: () => Effect.succeed(claimedJob),
          claimScheduledWorkflowJob: () => Effect.succeed(claimedJob),
          persistWorkflowJob: (record) => {
            persistedJobs.push(
              record as ImportExportSupportCaseSummaryWorkflowJobRecord,
            );

            return Effect.succeed(record);
          },
        }),
        supportCaseRepository: createSupportOperationsCaseRepositoryDouble({
          listSupportCases: () => Effect.succeed([...supportCases]),
        }),
        fetchImplementation,
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble({
            requestManagedFileUploadUrl,
            registerManagedFile,
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          ImportExportModule,
          createImportExportModuleDouble({
            startImportExportJobRecord,
            completeImportExportJobRecord,
            blockImportExportJobRecord: () => unexpectedImportExportEffect(),
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      importExport.runImportExportSupportCaseSummaryWorkflowJob({
        jobId: "job_import_export_support_case_1",
      }),
    );

    expect(result).toMatchObject({
      jobId: "job_import_export_support_case_1",
      kind: workflowJobKind.importExportSupportCaseSummary,
      status: workflowJobStatus.completed,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
    });
    expect(requestManagedFileUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: platformScope.organization,
        scopeId: "org_1",
        uploadedBy: operatorRequestContext.actorId,
      }),
    );
    expect(registerManagedFile).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: platformScope.organization,
        scopeId: "org_1",
        uploadToken: "upload_token_support_cases_1",
        storageId: "storage_support_case_1",
        classification: dataClassification.tenantConfidential,
      }),
    );
    expect(completeImportExportJobRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job_import_export_support_case_1",
        artifactFileId: "file_support_case_export_1",
        rowCount: 2,
      }),
    );
    expect(emitBusinessEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName:
          platformBusinessEventName.importExportSupportCaseSummaryCompleted,
        moduleId: platformModuleId.importExport,
        permissionScope: permissionScope.exportExecute,
        properties: expect.objectContaining({
          jobId: "job_import_export_support_case_1",
          source: importExportJobSource.supportCaseSummaryJson,
          format: importExportJobFormat.json,
          rowCount: 2,
          artifactFileId: "file_support_case_export_1",
        }),
      }),
    );
    expect(
      JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body)),
    ).toEqual(supportCases);
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.importExport,
        action: importExportAuditAction.exportCompleted,
        target: `${platformModuleId.importExport}:job_import_export_support_case_1`,
      }),
    ]);
    expect(persistedJobs[persistedJobs.length - 1]).toMatchObject({
      jobId: "job_import_export_support_case_1",
      status: workflowJobStatus.completed,
    });
  });

  it("keeps completed exports completed when completion audit append fails", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const { calls: auditCalls, service: auditLog } = createAuditLogModuleDouble(
      {
        append: () => Effect.fail(createAuditLogPersistenceError()),
      },
    );
    const persistedJobs: ImportExportManagedFileSummaryWorkflowJobRecord[] = [];
    const requestManagedFileUploadUrl = vi.fn(() =>
      Effect.succeed({
        uploadUrl: "https://upload.example/import-export-audit-failure",
        uploadToken: "upload_token_audit_failure_1",
      }),
    );
    const registerManagedFile = vi.fn(() =>
      Effect.succeed({
        fileId: "file_export_audit_failure_1",
        fileName: "managed-file-summary-export.json",
        contentType: "application/json",
        sizeBytes: 128,
        scope: platformScope.organization,
        scopeId: "org_1",
        uploadedBy: "usr_support_1",
        legalHoldActive: false,
      }),
    );
    const startImportExportJobRecord = vi.fn(() =>
      Effect.succeed({
        jobId: "job_import_export_audit_failure_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
        status: workflowJobStatus.running,
        startedAt: "2026-05-07T12:21:00.000Z",
        createdAt: "2026-05-07T12:20:00.000Z",
      }),
    );
    const completeImportExportJobRecord = vi.fn(() =>
      Effect.succeed({
        jobId: "job_import_export_audit_failure_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
        status: workflowJobStatus.completed,
        rowCount: 1,
        artifactFileId: "file_export_audit_failure_1",
        startedAt: "2026-05-07T12:21:00.000Z",
        completedAt: "2026-05-07T12:22:00.000Z",
        createdAt: "2026-05-07T12:20:00.000Z",
      }),
    );
    const blockImportExportJobRecord = vi.fn(() =>
      Effect.succeed({
        jobId: "job_import_export_audit_failure_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
        status: workflowJobStatus.blocked,
        lastError: "Unexpected block.",
        completedAt: "2026-05-07T12:22:00.000Z",
        createdAt: "2026-05-07T12:20:00.000Z",
      }),
    );
    const fetchImplementation = vi.fn(
      async (_input, _init) =>
        new Response(JSON.stringify({ storageId: "storage_audit_failure_1" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
    );
    const claimedJob = Schema.decodeUnknownSync(
      ImportExportManagedFileSummaryWorkflowJobRecordSchema,
    )({
      jobId: "job_import_export_audit_failure_1",
      runtime: "convex",
      sourceModuleId: platformModuleId.importExport,
      kind: workflowJobKind.importExportManagedFileSummary,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.running,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      attempts: 1,
      scheduledAt: "2026-05-07T12:20:00.000Z",
      payload: {
        sourceModuleId: platformModuleId.importExport,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        requestContext: operatorRequestContext,
        actorId: operatorRequestContext.actorId,
        correlationId: operatorRequestContext.correlationId,
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
      },
      createdAt: "2026-05-07T12:20:00.000Z",
      updatedAt: "2026-05-07T12:21:00.000Z",
    });
    const importExport = await Effect.runPromise(
      makeImportExportService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          getWorkflowJob: () => Effect.succeed(claimedJob),
          claimScheduledWorkflowJob: () => Effect.succeed(claimedJob),
          persistWorkflowJob: (record) => {
            persistedJobs.push(record);

            return Effect.succeed(record);
          },
        }),
        fetchImplementation,
      }).pipe(
        Effect.provideService(AuditLogModule, auditLog),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble({
            listManagedFiles: () =>
              Effect.succeed([
                {
                  fileId: "file_1",
                  fileName: "invoice.pdf",
                  contentType: "application/pdf",
                  sizeBytes: 1024,
                },
              ]),
            requestManagedFileUploadUrl,
            registerManagedFile,
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          ImportExportModule,
          createImportExportModuleDouble({
            startImportExportJobRecord,
            completeImportExportJobRecord,
            blockImportExportJobRecord,
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      importExport.runImportExportManagedFileSummaryWorkflowJob({
        jobId: "job_import_export_audit_failure_1",
      }),
    );

    expect(result).toMatchObject({
      jobId: "job_import_export_audit_failure_1",
      kind: workflowJobKind.importExportManagedFileSummary,
      status: workflowJobStatus.completed,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
    });
    expect(completeImportExportJobRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job_import_export_audit_failure_1",
        artifactFileId: "file_export_audit_failure_1",
        rowCount: 1,
      }),
    );
    expect(blockImportExportJobRecord).not.toHaveBeenCalled();
    expect(auditCalls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.importExport,
        action: importExportAuditAction.exportCompleted,
        target: `${platformModuleId.importExport}:job_import_export_audit_failure_1`,
      }),
    ]);
    expect(persistedJobs[persistedJobs.length - 1]).toMatchObject({
      jobId: "job_import_export_audit_failure_1",
      status: workflowJobStatus.completed,
    });
  });

  it("does not block completed exports when workflow completion persistence fails", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const requestManagedFileUploadUrl = vi.fn(() =>
      Effect.succeed({
        uploadUrl: "https://upload.example/import-export-persist-failure",
        uploadToken: "upload_token_persist_failure_1",
      }),
    );
    const registerManagedFile = vi.fn(() =>
      Effect.succeed({
        fileId: "file_export_persist_failure_1",
        fileName: "managed-file-summary-export.json",
        contentType: "application/json",
        sizeBytes: 128,
        scope: platformScope.organization,
        scopeId: "org_1",
        uploadedBy: "usr_support_1",
        legalHoldActive: false,
      }),
    );
    const startImportExportJobRecord = vi.fn(() =>
      Effect.succeed({
        jobId: "job_import_export_persist_failure_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
        status: workflowJobStatus.running,
        startedAt: "2026-05-07T12:31:00.000Z",
        createdAt: "2026-05-07T12:30:00.000Z",
      }),
    );
    const completeImportExportJobRecord = vi.fn(() =>
      Effect.succeed({
        jobId: "job_import_export_persist_failure_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
        status: workflowJobStatus.completed,
        rowCount: 1,
        artifactFileId: "file_export_persist_failure_1",
        startedAt: "2026-05-07T12:31:00.000Z",
        completedAt: "2026-05-07T12:32:00.000Z",
        createdAt: "2026-05-07T12:30:00.000Z",
      }),
    );
    const blockImportExportJobRecord = vi.fn(() =>
      Effect.succeed({
        jobId: "job_import_export_persist_failure_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
        status: workflowJobStatus.blocked,
        lastError: "Unexpected block.",
        completedAt: "2026-05-07T12:32:00.000Z",
        createdAt: "2026-05-07T12:30:00.000Z",
      }),
    );
    const fetchImplementation = vi.fn(
      async (_input, _init) =>
        new Response(
          JSON.stringify({ storageId: "storage_persist_failure_1" }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
    );
    const claimedJob = Schema.decodeUnknownSync(
      ImportExportManagedFileSummaryWorkflowJobRecordSchema,
    )({
      jobId: "job_import_export_persist_failure_1",
      runtime: "convex",
      sourceModuleId: platformModuleId.importExport,
      kind: workflowJobKind.importExportManagedFileSummary,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.running,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      attempts: 1,
      scheduledAt: "2026-05-07T12:30:00.000Z",
      payload: {
        sourceModuleId: platformModuleId.importExport,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        requestContext: operatorRequestContext,
        actorId: operatorRequestContext.actorId,
        correlationId: operatorRequestContext.correlationId,
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
      },
      createdAt: "2026-05-07T12:30:00.000Z",
      updatedAt: "2026-05-07T12:31:00.000Z",
    });
    const persistedCompletedWorkflowJob = vi.fn((record) =>
      Effect.fail({
        _tag: "WorkflowJobsPostgresRepositoryQueryError" as const,
        operation: "persistWorkflowJob" as const,
        cause: new Error("Workflow completion persistence failed."),
      }),
    );
    const importExport = await Effect.runPromise(
      makeImportExportService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          getWorkflowJob: () => Effect.succeed(claimedJob),
          claimScheduledWorkflowJob: () => Effect.succeed(claimedJob),
          persistWorkflowJob: persistedCompletedWorkflowJob,
        }),
        fetchImplementation,
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble({
            listManagedFiles: () =>
              Effect.succeed([
                {
                  fileId: "file_1",
                  fileName: "invoice.pdf",
                  contentType: "application/pdf",
                  sizeBytes: 1024,
                },
              ]),
            requestManagedFileUploadUrl,
            registerManagedFile,
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          ImportExportModule,
          createImportExportModuleDouble({
            startImportExportJobRecord,
            completeImportExportJobRecord,
            blockImportExportJobRecord,
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      importExport.runImportExportManagedFileSummaryWorkflowJob({
        jobId: "job_import_export_persist_failure_1",
      }),
    );

    expect(result).toMatchObject({
      jobId: "job_import_export_persist_failure_1",
      kind: workflowJobKind.importExportManagedFileSummary,
      status: workflowJobStatus.completed,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
    });
    expect(completeImportExportJobRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job_import_export_persist_failure_1",
        artifactFileId: "file_export_persist_failure_1",
        rowCount: 1,
      }),
    );
    expect(persistedCompletedWorkflowJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job_import_export_persist_failure_1",
        status: workflowJobStatus.completed,
      }),
    );
    expect(blockImportExportJobRecord).not.toHaveBeenCalled();
  });

  it("reconciles stale claimed workflow jobs from completed export records without rerunning artifacts", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const requestManagedFileUploadUrl = vi.fn(() =>
      Effect.succeed({
        uploadUrl: "https://upload.example/import-export-reconcile-claimed",
        uploadToken: "upload_token_reconcile_claimed_1",
      }),
    );
    const registerManagedFile = vi.fn(() =>
      Effect.succeed({
        fileId: "file_export_reconcile_claimed_1",
        fileName: "managed-file-summary-export.json",
        contentType: "application/json",
        sizeBytes: 128,
        scope: platformScope.organization,
        scopeId: "org_1",
        uploadedBy: "usr_support_1",
        legalHoldActive: false,
      }),
    );
    const startImportExportJobRecord = vi.fn(() =>
      unexpectedImportExportEffect(),
    );
    const completeImportExportJobRecord = vi.fn(() =>
      unexpectedImportExportEffect(),
    );
    const blockImportExportJobRecord = vi.fn(() =>
      unexpectedImportExportEffect(),
    );
    const claimedJob = Schema.decodeUnknownSync(
      ImportExportManagedFileSummaryWorkflowJobRecordSchema,
    )({
      jobId: "job_import_export_reconcile_claimed_1",
      runtime: "convex",
      sourceModuleId: platformModuleId.importExport,
      kind: workflowJobKind.importExportManagedFileSummary,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.running,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      attempts: 1,
      scheduledAt: "2026-05-07T12:40:00.000Z",
      payload: {
        sourceModuleId: platformModuleId.importExport,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        requestContext: operatorRequestContext,
        actorId: operatorRequestContext.actorId,
        correlationId: operatorRequestContext.correlationId,
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
      },
      createdAt: "2026-05-07T12:40:00.000Z",
      updatedAt: "2000-01-01T00:00:00.000Z",
    });
    const persistedJobs: ImportExportManagedFileSummaryWorkflowJobRecord[] = [];
    const importExport = await Effect.runPromise(
      makeImportExportService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          getWorkflowJob: () => Effect.succeed(claimedJob),
          claimScheduledWorkflowJob: () => Effect.succeed(claimedJob),
          persistWorkflowJob: (record) => {
            persistedJobs.push(record);

            return Effect.succeed(record);
          },
        }),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble({
            listManagedFiles: () =>
              Effect.succeed([
                {
                  fileId: "file_1",
                  fileName: "invoice.pdf",
                  contentType: "application/pdf",
                  sizeBytes: 1024,
                },
              ]),
            requestManagedFileUploadUrl,
            registerManagedFile,
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          ImportExportModule,
          createImportExportModuleDouble({
            getImportExportJobRecord: () =>
              Effect.succeed({
                jobId: "job_import_export_reconcile_claimed_1",
                tenantScope: platformScope.organization,
                tenantScopeId: "org_1",
                source: importExportJobSource.managedFileSummaryJson,
                format: importExportJobFormat.json,
                status: workflowJobStatus.completed,
                rowCount: 1,
                artifactFileId: "file_export_reconcile_claimed_1",
                startedAt: "2026-05-07T12:41:00.000Z",
                completedAt: "2026-05-07T12:42:00.000Z",
                createdAt: "2026-05-07T12:40:00.000Z",
              }),
            startImportExportJobRecord,
            completeImportExportJobRecord,
            blockImportExportJobRecord,
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      importExport.runImportExportManagedFileSummaryWorkflowJob({
        jobId: "job_import_export_reconcile_claimed_1",
      }),
    );

    expect(result).toMatchObject({
      jobId: "job_import_export_reconcile_claimed_1",
      kind: workflowJobKind.importExportManagedFileSummary,
      status: workflowJobStatus.completed,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
    });
    expect(startImportExportJobRecord).not.toHaveBeenCalled();
    expect(completeImportExportJobRecord).not.toHaveBeenCalled();
    expect(blockImportExportJobRecord).not.toHaveBeenCalled();
    expect(requestManagedFileUploadUrl).not.toHaveBeenCalled();
    expect(registerManagedFile).not.toHaveBeenCalled();
    expect(authorizationCheck).not.toHaveBeenCalled();
    expect(persistedJobs[persistedJobs.length - 1]).toMatchObject({
      jobId: "job_import_export_reconcile_claimed_1",
      status: workflowJobStatus.completed,
      completedAt: "2026-05-07T12:42:00.000Z",
    });
  });

  it("keeps completed export records completed when reconciliation persistence fails on stale claimed retries", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const requestManagedFileUploadUrl = vi.fn(() =>
      Effect.succeed({
        uploadUrl:
          "https://upload.example/import-export-reconcile-claimed-persist-failure",
        uploadToken: "upload_token_reconcile_claimed_persist_failure_1",
      }),
    );
    const registerManagedFile = vi.fn(() =>
      Effect.succeed({
        fileId: "file_export_reconcile_claimed_persist_failure_1",
        fileName: "managed-file-summary-export.json",
        contentType: "application/json",
        sizeBytes: 128,
        scope: platformScope.organization,
        scopeId: "org_1",
        uploadedBy: "usr_support_1",
        legalHoldActive: false,
      }),
    );
    const startImportExportJobRecord = vi.fn(() =>
      unexpectedImportExportEffect(),
    );
    const completeImportExportJobRecord = vi.fn(() =>
      unexpectedImportExportEffect(),
    );
    const blockImportExportJobRecord = vi.fn(() =>
      unexpectedImportExportEffect(),
    );
    const claimedJob = Schema.decodeUnknownSync(
      ImportExportManagedFileSummaryWorkflowJobRecordSchema,
    )({
      jobId: "job_import_export_reconcile_claimed_persist_failure_1",
      runtime: "convex",
      sourceModuleId: platformModuleId.importExport,
      kind: workflowJobKind.importExportManagedFileSummary,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.running,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      attempts: 1,
      scheduledAt: "2026-05-07T12:43:00.000Z",
      payload: {
        sourceModuleId: platformModuleId.importExport,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        requestContext: operatorRequestContext,
        actorId: operatorRequestContext.actorId,
        correlationId: operatorRequestContext.correlationId,
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
      },
      createdAt: "2026-05-07T12:43:00.000Z",
      updatedAt: "2000-01-01T00:00:00.000Z",
    });
    const persistWorkflowJob = vi.fn(() =>
      Effect.fail({
        _tag: "WorkflowJobsPostgresRepositoryQueryError" as const,
        operation: "persistWorkflowJob" as const,
        cause: new Error("Workflow reconciliation persistence failed."),
      }),
    );
    const importExport = await Effect.runPromise(
      makeImportExportService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          getWorkflowJob: () => Effect.succeed(claimedJob),
          claimScheduledWorkflowJob: () => Effect.succeed(claimedJob),
          persistWorkflowJob,
        }),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble({
            listManagedFiles: () =>
              Effect.succeed([
                {
                  fileId: "file_1",
                  fileName: "invoice.pdf",
                  contentType: "application/pdf",
                  sizeBytes: 1024,
                },
              ]),
            requestManagedFileUploadUrl,
            registerManagedFile,
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          ImportExportModule,
          createImportExportModuleDouble({
            getImportExportJobRecord: () =>
              Effect.succeed({
                jobId: "job_import_export_reconcile_claimed_persist_failure_1",
                tenantScope: platformScope.organization,
                tenantScopeId: "org_1",
                source: importExportJobSource.managedFileSummaryJson,
                format: importExportJobFormat.json,
                status: workflowJobStatus.completed,
                rowCount: 1,
                artifactFileId:
                  "file_export_reconcile_claimed_persist_failure_1",
                startedAt: "2026-05-07T12:44:00.000Z",
                completedAt: "2026-05-07T12:45:00.000Z",
                createdAt: "2026-05-07T12:43:00.000Z",
              }),
            startImportExportJobRecord,
            completeImportExportJobRecord,
            blockImportExportJobRecord,
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      importExport.runImportExportManagedFileSummaryWorkflowJob({
        jobId: "job_import_export_reconcile_claimed_persist_failure_1",
      }),
    );

    expect(result).toMatchObject({
      jobId: "job_import_export_reconcile_claimed_persist_failure_1",
      kind: workflowJobKind.importExportManagedFileSummary,
      status: workflowJobStatus.completed,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
    });
    expect(persistWorkflowJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job_import_export_reconcile_claimed_persist_failure_1",
        status: workflowJobStatus.completed,
        completedAt: "2026-05-07T12:45:00.000Z",
      }),
    );
    expect(startImportExportJobRecord).not.toHaveBeenCalled();
    expect(completeImportExportJobRecord).not.toHaveBeenCalled();
    expect(blockImportExportJobRecord).not.toHaveBeenCalled();
    expect(requestManagedFileUploadUrl).not.toHaveBeenCalled();
    expect(registerManagedFile).not.toHaveBeenCalled();
    expect(authorizationCheck).not.toHaveBeenCalled();
  });

  it("returns the running workflow summary without blocking when claimed reconciliation reads fail", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const claimScheduledWorkflowJob = vi.fn(() => Effect.succeed(undefined));
    const persistWorkflowJob = vi.fn((record) => Effect.succeed(record));
    const startImportExportJobRecord = vi.fn(() =>
      unexpectedImportExportEffect(),
    );
    const completeImportExportJobRecord = vi.fn(() =>
      unexpectedImportExportEffect(),
    );
    const blockImportExportJobRecord = vi.fn(() =>
      unexpectedImportExportEffect(),
    );
    const staleRunningJob = Schema.decodeUnknownSync(
      ImportExportManagedFileSummaryWorkflowJobRecordSchema,
    )({
      jobId: "job_import_export_reconcile_read_failure_1",
      runtime: "convex",
      sourceModuleId: platformModuleId.importExport,
      kind: workflowJobKind.importExportManagedFileSummary,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.running,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      attempts: 99,
      scheduledAt: "2026-05-07T12:46:00.000Z",
      payload: {
        sourceModuleId: platformModuleId.importExport,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        requestContext: operatorRequestContext,
        actorId: operatorRequestContext.actorId,
        correlationId: operatorRequestContext.correlationId,
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
      },
      createdAt: "2026-05-07T12:46:00.000Z",
      updatedAt: "2000-01-01T00:00:00.000Z",
    });
    const importExport = await Effect.runPromise(
      makeImportExportService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          getWorkflowJob: () => Effect.succeed(staleRunningJob),
          claimScheduledWorkflowJob,
          persistWorkflowJob,
        }),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble({}),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          ImportExportModule,
          createImportExportModuleDouble({
            getImportExportJobRecord: () =>
              Effect.fail({
                _tag: "ImportExportJobPostgresRepositoryQueryError" as const,
                operation: "getImportExportJobRecord" as const,
                cause: new Error("Import-export job read failed."),
              }),
            startImportExportJobRecord,
            completeImportExportJobRecord,
            blockImportExportJobRecord,
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      importExport.runImportExportManagedFileSummaryWorkflowJob({
        jobId: "job_import_export_reconcile_read_failure_1",
      }),
    );

    expect(result).toMatchObject({
      jobId: "job_import_export_reconcile_read_failure_1",
      kind: workflowJobKind.importExportManagedFileSummary,
      status: workflowJobStatus.running,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
    });
    expect(claimScheduledWorkflowJob).not.toHaveBeenCalled();
    expect(persistWorkflowJob).not.toHaveBeenCalled();
    expect(startImportExportJobRecord).not.toHaveBeenCalled();
    expect(completeImportExportJobRecord).not.toHaveBeenCalled();
    expect(blockImportExportJobRecord).not.toHaveBeenCalled();
    expect(authorizationCheck).not.toHaveBeenCalled();
  });

  it("reconciles exhausted stale workflow jobs from completed export records without blocking exports", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const claimScheduledWorkflowJob = vi.fn(() => Effect.succeed(undefined));
    const blockImportExportJobRecord = vi.fn(() =>
      unexpectedImportExportEffect(),
    );
    const staleRunningJob = Schema.decodeUnknownSync(
      ImportExportManagedFileSummaryWorkflowJobRecordSchema,
    )({
      jobId: "job_import_export_reconcile_stale_1",
      runtime: "convex",
      sourceModuleId: platformModuleId.importExport,
      kind: workflowJobKind.importExportManagedFileSummary,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.running,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      attempts: 99,
      scheduledAt: "2026-05-07T12:50:00.000Z",
      payload: {
        sourceModuleId: platformModuleId.importExport,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        requestContext: operatorRequestContext,
        actorId: operatorRequestContext.actorId,
        correlationId: operatorRequestContext.correlationId,
        source: importExportJobSource.managedFileSummaryJson,
        format: importExportJobFormat.json,
      },
      createdAt: "2026-05-07T12:50:00.000Z",
      updatedAt: "2000-01-01T00:00:00.000Z",
    });
    const persistedJobs: ImportExportManagedFileSummaryWorkflowJobRecord[] = [];
    const importExport = await Effect.runPromise(
      makeImportExportService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          getWorkflowJob: () => Effect.succeed(staleRunningJob),
          claimScheduledWorkflowJob,
          persistWorkflowJob: (record) => {
            persistedJobs.push(record);

            return Effect.succeed(record);
          },
        }),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble({}),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          ImportExportModule,
          createImportExportModuleDouble({
            getImportExportJobRecord: () =>
              Effect.succeed({
                jobId: "job_import_export_reconcile_stale_1",
                tenantScope: platformScope.organization,
                tenantScopeId: "org_1",
                source: importExportJobSource.managedFileSummaryJson,
                format: importExportJobFormat.json,
                status: workflowJobStatus.completed,
                rowCount: 1,
                artifactFileId: "file_export_reconcile_stale_1",
                startedAt: "2026-05-07T12:51:00.000Z",
                completedAt: "2026-05-07T12:52:00.000Z",
                createdAt: "2026-05-07T12:50:00.000Z",
              }),
            blockImportExportJobRecord,
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      importExport.runImportExportManagedFileSummaryWorkflowJob({
        jobId: "job_import_export_reconcile_stale_1",
      }),
    );

    expect(result).toMatchObject({
      jobId: "job_import_export_reconcile_stale_1",
      kind: workflowJobKind.importExportManagedFileSummary,
      status: workflowJobStatus.completed,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
    });
    expect(claimScheduledWorkflowJob).not.toHaveBeenCalled();
    expect(blockImportExportJobRecord).not.toHaveBeenCalled();
    expect(authorizationCheck).not.toHaveBeenCalled();
    expect(persistedJobs[persistedJobs.length - 1]).toMatchObject({
      jobId: "job_import_export_reconcile_stale_1",
      status: workflowJobStatus.completed,
      completedAt: "2026-05-07T12:52:00.000Z",
    });
  });

  it("runs managed-file summary export workflow jobs and uploads a CSV artifact", async () => {
    const authorizationCheck = createAuthorizationCheck();
    const persistedJobs: ImportExportManagedFileSummaryWorkflowJobRecord[] = [];
    const requestManagedFileUploadUrl = vi.fn(() =>
      Effect.succeed({
        uploadUrl: "https://upload.example/import-export-csv",
        uploadToken: "upload_token_csv_1",
      }),
    );
    const registerManagedFile = vi.fn(() =>
      Effect.succeed({
        fileId: "file_export_csv_1",
        fileName: "managed-file-summary-export.csv",
        contentType: "text/csv",
        sizeBytes: 128,
        scope: platformScope.organization,
        scopeId: "org_1",
        uploadedBy: "usr_support_1",
        legalHoldActive: false,
      }),
    );
    const startImportExportJobRecord = vi.fn(() =>
      Effect.succeed({
        jobId: "job_import_export_csv_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        source: importExportJobSource.managedFileSummaryCsv,
        format: importExportJobFormat.csv,
        status: workflowJobStatus.running,
        startedAt: "2026-05-07T12:11:00.000Z",
        createdAt: "2026-05-07T12:10:00.000Z",
      }),
    );
    const completeImportExportJobRecord = vi.fn(() =>
      Effect.succeed({
        jobId: "job_import_export_csv_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        source: importExportJobSource.managedFileSummaryCsv,
        format: importExportJobFormat.csv,
        status: workflowJobStatus.completed,
        rowCount: 3,
        artifactFileId: "file_export_csv_1",
        startedAt: "2026-05-07T12:11:00.000Z",
        completedAt: "2026-05-07T12:12:00.000Z",
        createdAt: "2026-05-07T12:10:00.000Z",
      }),
    );
    const fetchImplementation = vi.fn(
      async (_input, _init) =>
        new Response(JSON.stringify({ storageId: "storage_csv_1" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
    );
    const claimedJob = Schema.decodeUnknownSync(
      ImportExportManagedFileSummaryWorkflowJobRecordSchema,
    )({
      jobId: "job_import_export_csv_1",
      runtime: "convex",
      sourceModuleId: platformModuleId.importExport,
      kind: workflowJobKind.importExportManagedFileSummary,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.running,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      attempts: 1,
      scheduledAt: "2026-05-07T12:10:00.000Z",
      payload: {
        sourceModuleId: platformModuleId.importExport,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        requestContext: operatorRequestContext,
        actorId: operatorRequestContext.actorId,
        correlationId: operatorRequestContext.correlationId,
        source: importExportJobSource.managedFileSummaryCsv,
        format: importExportJobFormat.csv,
      },
      createdAt: "2026-05-07T12:10:00.000Z",
      updatedAt: "2026-05-07T12:11:00.000Z",
    });
    const importExport = await Effect.runPromise(
      makeImportExportService({
        authorization: { check: authorizationCheck },
        workflowJobs: createWorkflowJobsRepositoryDouble({
          getWorkflowJob: () => Effect.succeed(claimedJob),
          claimScheduledWorkflowJob: () => Effect.succeed(claimedJob),
          persistWorkflowJob: (record) => {
            persistedJobs.push(record);

            return Effect.succeed(record);
          },
        }),
        fetchImplementation,
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogModuleDouble().service,
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble({
            listManagedFiles: () =>
              Effect.succeed([
                {
                  fileId: "file_csv_1",
                  fileName: 'invoice, "final".pdf',
                  contentType: "application/pdf",
                  sizeBytes: 1024,
                },
                {
                  fileId: "file_csv_2",
                  fileName: "\t=dangerous.csv",
                  contentType: "text/csv",
                  sizeBytes: 512,
                },
                {
                  fileId: "file_csv_3",
                  fileName: "contract.docx",
                  contentType:
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                  sizeBytes: 2048,
                  deletedAt: "2026-05-07T12:09:00.000Z",
                },
              ]),
            requestManagedFileUploadUrl,
            registerManagedFile,
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionModuleDouble(),
        ),
        Effect.provideService(
          ImportExportModule,
          createImportExportModuleDouble({
            startImportExportJobRecord,
            completeImportExportJobRecord,
            blockImportExportJobRecord: () => unexpectedImportExportEffect(),
          }),
        ),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      importExport.runImportExportManagedFileSummaryWorkflowJob({
        jobId: "job_import_export_csv_1",
      }),
    );

    expect(result).toMatchObject({
      jobId: "job_import_export_csv_1",
      kind: workflowJobKind.importExportManagedFileSummary,
      status: workflowJobStatus.completed,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://upload.example/import-export-csv",
      expect.objectContaining({
        headers: {
          "content-type": "text/csv",
        },
        body: 'fileId,fileName,contentType,sizeBytes,deletedAt\nfile_csv_1,"invoice, ""final"".pdf",application/pdf,1024,\nfile_csv_2,\'\t=dangerous.csv,text/csv,512,\nfile_csv_3,contract.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,2048,2026-05-07T12:09:00.000Z',
      }),
    );
    expect(registerManagedFile).toHaveBeenCalledWith(
      expect.objectContaining({
        storageId: "storage_csv_1",
        fileName:
          "managed-file-summary-export.organization.org_1.job_import_export_csv_1.csv",
        contentType: "text/csv",
      }),
    );
    expect(completeImportExportJobRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job_import_export_csv_1",
        artifactFileId: "file_export_csv_1",
        rowCount: 3,
      }),
    );
    expect(persistedJobs[persistedJobs.length - 1]).toMatchObject({
      jobId: "job_import_export_csv_1",
      status: workflowJobStatus.completed,
      payload: {
        source: importExportJobSource.managedFileSummaryCsv,
        format: importExportJobFormat.csv,
      },
    });
  });
});
