import { Effect } from "effect";
import {
  actorType,
  platformModuleId,
  platformScope,
  supportOperationsCasePriority,
  supportOperationsCaseStatus,
  supportOperationsBreakGlassIncidentStatus,
  supportOperationsImpersonationSessionStatus,
  supportOperationsAuditAction,
  workflowJobGapReason,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
  type SupportOperationsBreakGlassIncidentStatus,
  type SupportOperationsImpersonationSessionStatus,
  type AuditEvent,
} from "@comvestec/contracts";
import {
  type AuditLogPostgresRepositoryService,
  type BillingReconciliationWorkflowJobRecord,
  type BreakGlassGrant,
  type SupportOperationsCaseRecord,
  createSupportOperationsBreakGlassIncidentRecord,
  createSupportOperationsImpersonationSessionRecord,
  type BreakGlassIncidentAlreadyReviewedError,
  FieldSecurityModule,
  makeSupportOperationsModule,
  makeFieldSecurityModule,
  type SupportOperationsBreakGlassIncidentPostgresRepositoryService,
  type SupportOperationsBreakGlassIncidentReviewResult,
  SupportOperationsModule,
  type SupportOperationsBreakGlassIncidentRecord,
  type SupportOperationsImpersonationSessionRecord,
  type SupportOperationsImpersonationSessionRevocationResult,
  revokeSupportOperationsImpersonationSession,
} from "@comvestec/modules";
import {
  KeycloakAdapter,
  type KeycloakAdapterOptions,
  makeKeycloakAdapter,
  makeSupportOperationsService,
  makeValkeyAdapter,
  platformAdapterServiceName,
  ValkeyAdapter,
} from "@comvestec/platform";
import {
  createKeycloakTestOptions,
  createValkeyTestClient,
} from "../platform-adapter-doubles";
import {
  makeSupportOperationsPersistence,
  supportOperationsImpersonationSessionRevocationFinalizableStatuses,
} from "../../packages/platform/src/services/governance/support-operations";

const supportOperatorRequestContext = {
  actorType: actorType.supportOperator,
  actorId: "usr_support_operator_1",
  sessionId: "sess_support_operator_1",
  correlationId: "corr_support_operations_1",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
} as const;

const supportOperatorRequestContextWithoutActorId = {
  actorType: actorType.supportOperator,
  sessionId: "sess_support_operator_without_actor_id",
  correlationId: "corr_support_operations_missing_actor_id",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
} as const;

type SupportOperationsPersistence = Parameters<
  typeof makeSupportOperationsService
>[0]["persistence"];

type SupportOperationsWorkflowJobs = Parameters<
  typeof makeSupportOperationsService
>[0]["workflowJobs"];

const createSupportOperationsHarness = async (overrides?: {
  readonly insertAuditEvent?: (input: {
    readonly event: AuditEvent;
    readonly insertedAuditEvents: AuditEvent[];
  }) => ReturnType<AuditLogPostgresRepositoryService["insertAuditEvent"]>;
  readonly keycloakOptions?: Partial<KeycloakAdapterOptions>;
  readonly upsertSupportCase?: (input: {
    readonly supportCase: SupportOperationsCaseRecord;
    readonly supportCases: Map<string, SupportOperationsCaseRecord>;
  }) => ReturnType<SupportOperationsPersistence["upsertSupportCase"]>;
  readonly listSupportCases?: (input: {
    readonly query?: Parameters<
      SupportOperationsPersistence["listSupportCases"]
    >[0];
    readonly supportCases: Map<string, SupportOperationsCaseRecord>;
  }) => ReturnType<SupportOperationsPersistence["listSupportCases"]>;
  readonly getSupportCase?: (input: {
    readonly caseId: string;
    readonly supportCases: Map<string, SupportOperationsCaseRecord>;
  }) => ReturnType<SupportOperationsPersistence["getSupportCase"]>;
  readonly listRepairGapWorkflowJobs?: (input: {
    readonly query: Parameters<
      SupportOperationsWorkflowJobs["listRepairGapWorkflowJobs"]
    >[0];
    readonly repairGapJobs: readonly BillingReconciliationWorkflowJobRecord[];
  }) => ReturnType<SupportOperationsWorkflowJobs["listRepairGapWorkflowJobs"]>;
  readonly persistUpsertedSupportCase?: (input: {
    readonly upsertResult: Parameters<
      SupportOperationsPersistence["persistUpsertedSupportCase"]
    >[0];
    readonly supportCases: Map<string, SupportOperationsCaseRecord>;
    readonly insertedAuditEvents: AuditEvent[];
  }) => ReturnType<SupportOperationsPersistence["persistUpsertedSupportCase"]>;
  readonly compareAndSetImpersonationSessionStatus?: (input: {
    readonly session: SupportOperationsImpersonationSessionRecord;
    readonly expectedStatus: SupportOperationsImpersonationSessionStatus;
    readonly nextStatus: SupportOperationsImpersonationSessionStatus;
    readonly impersonationSessions: Map<
      string,
      SupportOperationsImpersonationSessionRecord
    >;
  }) => ReturnType<
    SupportOperationsPersistence["compareAndSetImpersonationSessionStatus"]
  >;
  readonly upsertImpersonationSession?: (input: {
    readonly session: SupportOperationsImpersonationSessionRecord;
    readonly impersonationSessions: Map<
      string,
      SupportOperationsImpersonationSessionRecord
    >;
  }) => ReturnType<SupportOperationsPersistence["upsertImpersonationSession"]>;
  readonly persistStartedImpersonation?: (input: {
    readonly grant: Parameters<
      SupportOperationsPersistence["persistStartedImpersonation"]
    >[0];
    readonly impersonationSessions: Map<
      string,
      SupportOperationsImpersonationSessionRecord
    >;
    readonly insertedAuditEvents: AuditEvent[];
  }) => ReturnType<SupportOperationsPersistence["persistStartedImpersonation"]>;
  readonly listImpersonationSessions?: (input: {
    readonly status?: SupportOperationsImpersonationSessionStatus;
    readonly impersonationSessions: Map<
      string,
      SupportOperationsImpersonationSessionRecord
    >;
  }) => ReturnType<SupportOperationsPersistence["listImpersonationSessions"]>;
  readonly getImpersonationSession?: (input: {
    readonly caseId: string;
    readonly impersonationSessions: Map<
      string,
      SupportOperationsImpersonationSessionRecord
    >;
  }) => ReturnType<SupportOperationsPersistence["getImpersonationSession"]>;
  readonly persistRevokedImpersonationSession?: (input: {
    readonly revocationResult: SupportOperationsImpersonationSessionRevocationResult;
    readonly impersonationSessions: Map<
      string,
      SupportOperationsImpersonationSessionRecord
    >;
    readonly insertedAuditEvents: AuditEvent[];
  }) => ReturnType<
    SupportOperationsPersistence["persistRevokedImpersonationSession"]
  >;
  readonly persistGrantedBreakGlass?: (input: {
    readonly grant: BreakGlassGrant;
    readonly breakGlassIncidents: Map<
      string,
      SupportOperationsBreakGlassIncidentRecord
    >;
    readonly insertedAuditEvents: AuditEvent[];
  }) => ReturnType<SupportOperationsPersistence["persistGrantedBreakGlass"]>;
  readonly getBreakGlassIncident?: (input: {
    readonly caseId: string;
    readonly breakGlassIncidents: Map<
      string,
      SupportOperationsBreakGlassIncidentRecord
    >;
  }) => ReturnType<SupportOperationsPersistence["getBreakGlassIncident"]>;
  readonly persistReviewedBreakGlassIncident?: (input: {
    readonly reviewResult: SupportOperationsBreakGlassIncidentReviewResult;
    readonly breakGlassIncidents: Map<
      string,
      SupportOperationsBreakGlassIncidentRecord
    >;
    readonly insertedAuditEvents: AuditEvent[];
  }) => ReturnType<
    SupportOperationsPersistence["persistReviewedBreakGlassIncident"]
  >;
}) => {
  const insertedAuditEvents: AuditEvent[] = [];
  const supportCases = new Map<string, SupportOperationsCaseRecord>();
  const repairGapJobs: BillingReconciliationWorkflowJobRecord[] = [];
  const impersonationSessions = new Map<
    string,
    SupportOperationsImpersonationSessionRecord
  >();
  const breakGlassIncidents = new Map<
    string,
    SupportOperationsBreakGlassIncidentRecord
  >();
  const auditLogRepository = {
    insertAuditEvent: (event) => {
      return (
        overrides?.insertAuditEvent?.({ event, insertedAuditEvents }) ??
        (() => {
          insertedAuditEvents.push(event);

          return Effect.succeed(event);
        })()
      );
    },
    queryByModule: () => Effect.succeed([]),
    queryByTarget: () => Effect.succeed([]),
    queryByActor: () => Effect.succeed([]),
    queryByTenant: () => Effect.succeed([]),
  } satisfies AuditLogPostgresRepositoryService;
  const breakGlassIncidentRepository = {
    upsertBreakGlassIncident: (incident) => {
      breakGlassIncidents.set(incident.caseId, incident);
      return Effect.succeed(incident);
    },
    getBreakGlassIncident: (caseId) =>
      Effect.succeed(breakGlassIncidents.get(caseId)),
    listBreakGlassIncidents: (status) =>
      Effect.succeed(
        [...breakGlassIncidents.values()].filter(
          (incident) => status === undefined || incident.status === status,
        ),
      ),
  } satisfies SupportOperationsBreakGlassIncidentPostgresRepositoryService;
  const workflowJobs = {
    listRepairGapWorkflowJobs: (query) =>
      overrides?.listRepairGapWorkflowJobs?.({
        query,
        repairGapJobs,
      }) ??
      Effect.succeed(
        repairGapJobs.filter(
          (job) =>
            job.sourceModuleId === query.sourceModuleId &&
            (query.tenantScope === undefined ||
              job.tenantScope === query.tenantScope) &&
            (query.tenantScopeId === undefined ||
              job.tenantScopeId === query.tenantScopeId),
        ),
      ),
  } satisfies SupportOperationsWorkflowJobs;
  const persistence: SupportOperationsPersistence = {
    upsertSupportCase: (supportCase: SupportOperationsCaseRecord) =>
      overrides?.upsertSupportCase?.({
        supportCase,
        supportCases,
      }) ??
      (() => {
        supportCases.set(supportCase.caseId, supportCase);

        return Effect.succeed(supportCase);
      })(),
    listSupportCases: (query) =>
      overrides?.listSupportCases?.({ query, supportCases }) ??
      Effect.succeed(
        [...supportCases.values()].filter(
          (supportCase) =>
            query === undefined ||
            (typeof query === "string"
              ? supportCase.status === query
              : (query.status === undefined ||
                  supportCase.status === query.status) &&
                (query.tenantScope === undefined ||
                  supportCase.tenantScope === query.tenantScope) &&
                (query.tenantScopeId === undefined ||
                  supportCase.tenantScopeId === query.tenantScopeId)),
        ),
      ),
    getSupportCase: (caseId: string) =>
      overrides?.getSupportCase?.({ caseId, supportCases }) ??
      Effect.succeed(supportCases.get(caseId)),
    persistUpsertedSupportCase: (upsertResult) =>
      overrides?.persistUpsertedSupportCase?.({
        upsertResult,
        supportCases,
        insertedAuditEvents,
      }) ??
      (() => {
        supportCases.set(upsertResult.case.caseId, upsertResult.case);
        insertedAuditEvents.push(upsertResult.auditEvent);

        return Effect.succeed(upsertResult.case);
      })(),
    compareAndSetImpersonationSessionStatus: ({
      session,
      expectedStatus,
      nextStatus,
    }) =>
      overrides?.compareAndSetImpersonationSessionStatus?.({
        session,
        expectedStatus,
        nextStatus,
        impersonationSessions,
      }) ??
      (() => {
        const currentSession = impersonationSessions.get(session.caseId);

        if (currentSession === undefined) {
          return Effect.succeed(undefined);
        }

        if (currentSession.status !== expectedStatus) {
          return Effect.succeed(currentSession);
        }

        const transitionedSession = {
          ...currentSession,
          status: nextStatus,
        } satisfies SupportOperationsImpersonationSessionRecord;

        impersonationSessions.set(
          transitionedSession.caseId,
          transitionedSession,
        );

        return Effect.succeed(transitionedSession);
      })(),
    upsertImpersonationSession: (
      session: SupportOperationsImpersonationSessionRecord,
    ) =>
      overrides?.upsertImpersonationSession?.({
        session,
        impersonationSessions,
      }) ??
      (() => {
        impersonationSessions.set(session.caseId, session);

        return Effect.succeed(session);
      })(),
    persistStartedImpersonation: (grant) =>
      overrides?.persistStartedImpersonation?.({
        grant,
        impersonationSessions,
        insertedAuditEvents,
      }) ??
      createSupportOperationsImpersonationSessionRecord(grant).pipe(
        Effect.map((session) => {
          impersonationSessions.set(session.caseId, session);
          insertedAuditEvents.push(grant.auditEvent);

          return grant;
        }),
      ),
    listImpersonationSessions: (
      status?: SupportOperationsImpersonationSessionStatus,
    ) =>
      overrides?.listImpersonationSessions?.({
        impersonationSessions,
        ...(status === undefined ? {} : { status }),
      }) ??
      Effect.succeed(
        [...impersonationSessions.values()].filter(
          (session) => status === undefined || session.status === status,
        ),
      ),
    getImpersonationSession: (caseId: string) =>
      overrides?.getImpersonationSession?.({
        caseId,
        impersonationSessions,
      }) ?? Effect.succeed(impersonationSessions.get(caseId)),
    persistRevokedImpersonationSession: (
      revocationResult: SupportOperationsImpersonationSessionRevocationResult,
    ) =>
      overrides?.persistRevokedImpersonationSession?.({
        revocationResult,
        impersonationSessions,
        insertedAuditEvents,
      }) ??
      (() => {
        const existingSession = impersonationSessions.get(
          revocationResult.session.caseId,
        );

        if (existingSession === undefined) {
          return Effect.fail({
            _tag: "SupportOperationsImpersonationSessionNotFoundError",
            caseId: revocationResult.session.caseId,
          } as const);
        }

        if (
          existingSession.status ===
          supportOperationsImpersonationSessionStatus.revoked
        ) {
          return Effect.fail({
            _tag: "SupportOperationsImpersonationSessionAlreadyRevokedError",
            caseId: revocationResult.session.caseId,
          } as const);
        }

        impersonationSessions.set(
          revocationResult.session.caseId,
          revocationResult.session,
        );
        insertedAuditEvents.push(revocationResult.auditEvent);

        return Effect.succeed(revocationResult.session);
      })(),
    persistGrantedBreakGlass: (grant: BreakGlassGrant) =>
      overrides?.persistGrantedBreakGlass?.({
        grant,
        breakGlassIncidents,
        insertedAuditEvents,
      }) ??
      createSupportOperationsBreakGlassIncidentRecord(grant).pipe(
        Effect.map((incident) => {
          breakGlassIncidents.set(incident.caseId, incident);
          insertedAuditEvents.push(grant.auditEvent);

          return grant;
        }),
      ),
    listBreakGlassIncidents: (
      status?: SupportOperationsBreakGlassIncidentStatus,
    ) => breakGlassIncidentRepository.listBreakGlassIncidents(status),
    getBreakGlassIncident: (caseId: string) =>
      overrides?.getBreakGlassIncident?.({ caseId, breakGlassIncidents }) ??
      breakGlassIncidentRepository.getBreakGlassIncident(caseId),
    persistReviewedBreakGlassIncident: (
      reviewResult: SupportOperationsBreakGlassIncidentReviewResult,
    ) =>
      overrides?.persistReviewedBreakGlassIncident?.({
        reviewResult,
        breakGlassIncidents,
        insertedAuditEvents,
      }) ??
      (() => {
        const existingIncident = breakGlassIncidents.get(
          reviewResult.incident.caseId,
        );

        if (existingIncident === undefined) {
          return Effect.fail({
            _tag: "SupportOperationsBreakGlassIncidentNotFoundError",
            caseId: reviewResult.incident.caseId,
          } as const);
        }

        if (
          existingIncident.status ===
          supportOperationsBreakGlassIncidentStatus.reviewed
        ) {
          return Effect.fail({
            _tag: "BreakGlassIncidentAlreadyReviewedError",
            caseId: reviewResult.incident.caseId,
          } satisfies BreakGlassIncidentAlreadyReviewedError);
        }

        breakGlassIncidents.set(
          reviewResult.incident.caseId,
          reviewResult.incident,
        );
        insertedAuditEvents.push(reviewResult.auditEvent);

        return Effect.succeed(reviewResult.incident);
      })(),
  };
  const valkey = await Effect.runPromise(
    makeValkeyAdapter({
      url: "redis://127.0.0.1:6379",
      client: createValkeyTestClient(),
    }),
  );
  const keycloak = await Effect.runPromise(
    makeKeycloakAdapter(createKeycloakTestOptions(overrides?.keycloakOptions)),
  );
  const supportOperations = await Effect.runPromise(
    makeSupportOperationsModule().pipe(
      Effect.provideService(KeycloakAdapter, keycloak),
    ),
  );
  const fieldSecurity = await Effect.runPromise(makeFieldSecurityModule());
  const service = await Effect.runPromise(
    makeSupportOperationsService({
      auditLogRepository,
      persistence,
      workflowJobs,
    }).pipe(
      Effect.provideService(FieldSecurityModule, fieldSecurity),
      Effect.provideService(KeycloakAdapter, keycloak),
      Effect.provideService(ValkeyAdapter, valkey),
      Effect.provideService(SupportOperationsModule, supportOperations),
    ),
  );

  return {
    breakGlassIncidents,
    impersonationSessions,
    insertedAuditEvents,
    repairGapJobs,
    supportCases,
    service,
    valkey,
  };
};

describe("support-operations platform service", () => {
  it("resolves the operator session, derives approval provenance, and persists impersonation audit events", async () => {
    const { impersonationSessions, insertedAuditEvents, service, valkey } =
      await createSupportOperationsHarness();

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const grant = await Effect.runPromise(
      service.startImpersonation({
        sessionId: supportOperatorRequestContext.sessionId,
        impersonatedActorId: "usr_member_1",
        reason: "Investigate tenant access issue",
        requestedDurationMinutes: 15,
      }),
    );

    expect(grant.grantedRequestContext.impersonation).toEqual({
      impersonatedActorId: "usr_member_1",
      approvedBy: supportOperatorRequestContext.actorId,
      reason: "Investigate tenant access issue",
    });
    expect(grant.grantedRequestContext.tenant).toEqual({
      scope: platformScope.organization,
      scopeId: "org_1",
      organizationId: "org_1",
    });
    expect(insertedAuditEvents).toEqual([grant.auditEvent]);
    expect(
      impersonationSessions.get(grant.grantedRequestContext.sessionId),
    ).toMatchObject({
      caseId: grant.grantedRequestContext.sessionId,
      status: supportOperationsImpersonationSessionStatus.active,
    });
    expect(insertedAuditEvents[0]).toMatchObject({
      moduleId: platformModuleId.supportOperations,
      action: supportOperationsAuditAction.impersonationStarted,
      target: "organization:org_1:usr_member_1",
      actorId: supportOperatorRequestContext.actorId,
    });
  });

  it("upserts support-case metadata and preserves the original case start time", async () => {
    const existingStartedAt = "2026-05-03T10:00:00.000Z";
    const { insertedAuditEvents, service, supportCases, valkey } =
      await createSupportOperationsHarness();

    supportCases.set("case_support_case_1", {
      caseId: "case_support_case_1",
      supportAgent: "usr_support_operator_0",
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      summary: "Initial authentication investigation",
      status: supportOperationsCaseStatus.open,
      priority: supportOperationsCasePriority.normal,
      startedAt: existingStartedAt,
      lastUpdatedAt: "2026-05-03T10:05:00.000Z",
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const supportCase = await Effect.runPromise(
      service.upsertCase({
        sessionId: supportOperatorRequestContext.sessionId,
        caseId: "case_support_case_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        summary: "Escalated tenant authentication investigation",
        status: supportOperationsCaseStatus.escalated,
        priority: supportOperationsCasePriority.high,
        changeReason: "Escalated after repeated authentication failures.",
      }),
    );

    expect(supportCase).toMatchObject({
      caseId: "case_support_case_1",
      supportAgent: supportOperatorRequestContext.actorId,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      summary: "Escalated tenant authentication investigation",
      status: supportOperationsCaseStatus.escalated,
      priority: supportOperationsCasePriority.high,
      startedAt: existingStartedAt,
      lastUpdatedAt: expect.any(String),
    });
    expect(supportCases.get("case_support_case_1")).toMatchObject({
      caseId: "case_support_case_1",
      summary: "Escalated tenant authentication investigation",
      status: supportOperationsCaseStatus.escalated,
      priority: supportOperationsCasePriority.high,
      startedAt: existingStartedAt,
    });
    expect(insertedAuditEvents.at(-1)).toMatchObject({
      moduleId: platformModuleId.supportOperations,
      action: supportOperationsAuditAction.supportCaseUpserted,
      target: "case:case_support_case_1",
      actorId: supportOperatorRequestContext.actorId,
      reason: "Escalated after repeated authentication failures.",
    });
  });

  it("defaults support-case listing to open rows and allows explicit status filters", async () => {
    const openCase: SupportOperationsCaseRecord = {
      caseId: "case_support_case_open",
      supportAgent: supportOperatorRequestContext.actorId,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      summary: "Active tenant lockout investigation",
      status: supportOperationsCaseStatus.open,
      priority: supportOperationsCasePriority.high,
      startedAt: "2026-05-03T11:00:00.000Z",
      lastUpdatedAt: "2026-05-03T11:05:00.000Z",
    };
    const resolvedCase: SupportOperationsCaseRecord = {
      caseId: "case_support_case_resolved",
      supportAgent: supportOperatorRequestContext.actorId,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      summary: "Resolved tenant lockout investigation",
      status: supportOperationsCaseStatus.resolved,
      priority: supportOperationsCasePriority.normal,
      startedAt: "2026-05-03T09:00:00.000Z",
      lastUpdatedAt: "2026-05-03T09:15:00.000Z",
    };
    const { service, supportCases, valkey } =
      await createSupportOperationsHarness();

    supportCases.set(openCase.caseId, openCase);
    supportCases.set(resolvedCase.caseId, resolvedCase);

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const defaultCases = await Effect.runPromise(
      service.listCases({
        sessionId: supportOperatorRequestContext.sessionId,
      }),
    );
    const resolvedCases = await Effect.runPromise(
      service.listCases({
        sessionId: supportOperatorRequestContext.sessionId,
        status: supportOperationsCaseStatus.resolved,
      }),
    );

    expect(defaultCases).toEqual([openCase]);
    expect(resolvedCases).toEqual([resolvedCase]);
  });

  it("aggregates tenant health with support-safe repair-gap summaries for the requested tenant", async () => {
    const caseQueries: Parameters<
      SupportOperationsPersistence["listSupportCases"]
    >[0][] = [];
    const repairGapQueries: Parameters<
      SupportOperationsWorkflowJobs["listRepairGapWorkflowJobs"]
    >[0][] = [];
    const matchingCase: SupportOperationsCaseRecord = {
      caseId: "case_support_health_org_1",
      supportAgent: supportOperatorRequestContext.actorId,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      summary: "Investigate unresolved billing drift for org_1",
      status: supportOperationsCaseStatus.escalated,
      priority: supportOperationsCasePriority.high,
      startedAt: "2026-05-03T11:00:00.000Z",
      lastUpdatedAt: "2026-05-03T11:05:00.000Z",
    };
    const otherCase: SupportOperationsCaseRecord = {
      caseId: "case_support_health_org_2",
      supportAgent: supportOperatorRequestContext.actorId,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_2",
      summary: "Investigate onboarding issue for org_2",
      status: supportOperationsCaseStatus.open,
      priority: supportOperationsCasePriority.normal,
      startedAt: "2026-05-03T09:00:00.000Z",
      lastUpdatedAt: "2026-05-03T09:15:00.000Z",
    };
    const matchingRepairGap: BillingReconciliationWorkflowJobRecord = {
      jobId:
        "workflow-jobs:billing-repair:operator-requested:organization:org_1:checkout_1",
      runtime: platformAdapterServiceName.convex,
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationSweep,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.blocked,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      attempts: 3,
      scheduledAt: "2026-05-03T10:30:00.000Z",
      gapReason: workflowJobGapReason.repairFailed,
      lastError:
        "Sensitive provider failure details that must stay off support-safe responses.",
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        organizationId: "org_1",
        provider: "polar",
        correlationId: "corr_billing_repair_org_1",
        trigger: workflowJobTrigger.operatorRequested,
      },
      createdAt: "2026-05-03T10:00:00.000Z",
      updatedAt: "2026-05-03T10:35:00.000Z",
    };
    const otherRepairGap: BillingReconciliationWorkflowJobRecord = {
      jobId:
        "workflow-jobs:billing-repair:operator-requested:organization:org_2:checkout_2",
      runtime: platformAdapterServiceName.convex,
      sourceModuleId: platformModuleId.billingAndMetering,
      kind: workflowJobKind.reconciliationSweep,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_2",
      attempts: 1,
      scheduledAt: "2026-05-03T12:00:00.000Z",
      gapReason: workflowJobGapReason.missingSubscriptionState,
      payload: {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_2",
        organizationId: "org_2",
        provider: "polar",
        correlationId: "corr_billing_repair_org_2",
        trigger: workflowJobTrigger.operatorRequested,
      },
      createdAt: "2026-05-03T11:45:00.000Z",
      updatedAt: "2026-05-03T11:50:00.000Z",
    };
    const { repairGapJobs, service, supportCases, valkey } =
      await createSupportOperationsHarness({
        listSupportCases: ({ query, supportCases }) => {
          caseQueries.push(query);

          return Effect.succeed(
            [...supportCases.values()].filter(
              (supportCase) =>
                typeof query === "object" &&
                query !== null &&
                (query.status === undefined ||
                  supportCase.status === query.status) &&
                (query.tenantScope === undefined ||
                  supportCase.tenantScope === query.tenantScope) &&
                (query.tenantScopeId === undefined ||
                  supportCase.tenantScopeId === query.tenantScopeId),
            ),
          );
        },
        listRepairGapWorkflowJobs: ({ query, repairGapJobs }) => {
          repairGapQueries.push(query);

          return Effect.succeed(
            repairGapJobs.filter(
              (job) =>
                job.sourceModuleId === query.sourceModuleId &&
                (query.tenantScope === undefined ||
                  job.tenantScope === query.tenantScope) &&
                (query.tenantScopeId === undefined ||
                  job.tenantScopeId === query.tenantScopeId),
            ),
          );
        },
      });

    supportCases.set(matchingCase.caseId, matchingCase);
    supportCases.set(otherCase.caseId, otherCase);
    repairGapJobs.push(matchingRepairGap, otherRepairGap);

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const tenantHealth = await Effect.runPromise(
      service.getTenantHealth({
        sessionId: supportOperatorRequestContext.sessionId,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
      }),
    );

    expect(tenantHealth).toMatchObject({
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      cases: [
        {
          caseId: matchingCase.caseId,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          status: supportOperationsCaseStatus.escalated,
        },
      ],
      repairGaps: [
        {
          jobId: matchingRepairGap.jobId,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          status: workflowJobStatus.blocked,
          gapReason: workflowJobGapReason.repairFailed,
        },
      ],
    });
    expect(tenantHealth.cases).toHaveLength(1);
    expect(tenantHealth.repairGaps).toHaveLength(1);
    expect(tenantHealth.repairGaps[0]).not.toHaveProperty("lastError");
    expect(caseQueries).toEqual([
      {
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
      },
    ]);
    expect(repairGapQueries).toEqual([
      {
        sourceModuleId: platformModuleId.billingAndMetering,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
      },
    ]);
  });

  it("lists active impersonation sessions after durable impersonation starts", async () => {
    const { impersonationSessions, service, valkey } =
      await createSupportOperationsHarness();

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const grant = await Effect.runPromise(
      service.startImpersonation({
        sessionId: supportOperatorRequestContext.sessionId,
        impersonatedActorId: "usr_member_1",
        reason: "Investigate tenant access issue",
        requestedDurationMinutes: 15,
      }),
    );

    const sessions = await Effect.runPromise(
      service.listImpersonationSessions({
        sessionId: supportOperatorRequestContext.sessionId,
        status: supportOperationsImpersonationSessionStatus.active,
      }),
    );

    expect(impersonationSessions.size).toBe(1);
    expect(sessions).toEqual([
      {
        caseId: grant.grantedRequestContext.sessionId,
        status: supportOperationsImpersonationSessionStatus.active,
        startedAt: grant.auditEvent.timestamp,
      },
    ]);
  });

  it("defaults impersonation session listing to active rows and allows pending discovery", async () => {
    const { impersonationSessions, service, valkey } =
      await createSupportOperationsHarness();
    const activeStartedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const pendingStartedAt = new Date(Date.now() - 4 * 60 * 1000).toISOString();
    const expiredStartedAt = new Date(
      Date.now() - 30 * 60 * 1000,
    ).toISOString();

    impersonationSessions.set("sess_impersonation_active", {
      caseId: "sess_impersonation_active",
      supportAgent: supportOperatorRequestContext.actorId,
      impersonatedUser: "usr_member_1",
      startedAt: activeStartedAt,
      durationMinutes: 15,
      status: supportOperationsImpersonationSessionStatus.active,
      approvedBy: supportOperatorRequestContext.actorId,
      reason: "Investigate tenant access issue",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    impersonationSessions.set("sess_impersonation_pending_list", {
      caseId: "sess_impersonation_pending_list",
      supportAgent: supportOperatorRequestContext.actorId,
      impersonatedUser: "usr_member_1",
      startedAt: pendingStartedAt,
      durationMinutes: 15,
      status: supportOperationsImpersonationSessionStatus.revocationPending,
      approvedBy: supportOperatorRequestContext.actorId,
      reason: "Investigate tenant access issue",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    impersonationSessions.set("sess_impersonation_expired_default", {
      caseId: "sess_impersonation_expired_default",
      supportAgent: supportOperatorRequestContext.actorId,
      impersonatedUser: "usr_member_1",
      startedAt: expiredStartedAt,
      durationMinutes: 15,
      status: supportOperationsImpersonationSessionStatus.active,
      approvedBy: supportOperatorRequestContext.actorId,
      reason: "Investigate tenant access issue",
      expiresAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const defaultSessions = await Effect.runPromise(
      service.listImpersonationSessions({
        sessionId: supportOperatorRequestContext.sessionId,
      }),
    );
    const pendingSessions = await Effect.runPromise(
      service.listImpersonationSessions({
        sessionId: supportOperatorRequestContext.sessionId,
        status: supportOperationsImpersonationSessionStatus.revocationPending,
      }),
    );

    expect(defaultSessions).toEqual([
      {
        caseId: "sess_impersonation_active",
        status: supportOperationsImpersonationSessionStatus.active,
        startedAt: activeStartedAt,
      },
    ]);
    expect(pendingSessions).toEqual([
      {
        caseId: "sess_impersonation_pending_list",
        status: supportOperationsImpersonationSessionStatus.revocationPending,
        startedAt: pendingStartedAt,
      },
    ]);
    expect(
      impersonationSessions.get("sess_impersonation_expired_default"),
    ).toMatchObject({
      status: supportOperationsImpersonationSessionStatus.expired,
    });
  });

  it("does not overwrite newer revoked rows during stale expiry reconciliation", async () => {
    const revokedStartedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const staleExpiredStartedAt = new Date(
      Date.now() - 30 * 60 * 1000,
    ).toISOString();
    const revokedSession: SupportOperationsImpersonationSessionRecord = {
      caseId: "sess_impersonation_stale_expiry",
      supportAgent: supportOperatorRequestContext.actorId,
      impersonatedUser: "usr_member_1",
      startedAt: revokedStartedAt,
      durationMinutes: 15,
      status: supportOperationsImpersonationSessionStatus.revoked,
      approvedBy: supportOperatorRequestContext.actorId,
      reason: "Investigate tenant access issue",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
    const { impersonationSessions, service, valkey } =
      await createSupportOperationsHarness({
        listImpersonationSessions: ({ status, impersonationSessions }) => {
          if (status === supportOperationsImpersonationSessionStatus.active) {
            return Effect.succeed([
              {
                ...revokedSession,
                startedAt: staleExpiredStartedAt,
                status: supportOperationsImpersonationSessionStatus.active,
                expiresAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
              },
            ]);
          }

          return Effect.succeed(
            [...impersonationSessions.values()].filter(
              (session) => status === undefined || session.status === status,
            ),
          );
        },
      });

    impersonationSessions.set(revokedSession.caseId, revokedSession);

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const expiredSessions = await Effect.runPromise(
      service.listImpersonationSessions({
        sessionId: supportOperatorRequestContext.sessionId,
        status: supportOperationsImpersonationSessionStatus.expired,
      }),
    );

    expect(expiredSessions).toEqual([]);
    expect(impersonationSessions.get(revokedSession.caseId)).toMatchObject({
      status: supportOperationsImpersonationSessionStatus.revoked,
      startedAt: revokedStartedAt,
    });
  });

  it("revokes active impersonation sessions and persists a distinct revocation audit event", async () => {
    const { insertedAuditEvents, service, valkey } =
      await createSupportOperationsHarness();

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const grant = await Effect.runPromise(
      service.startImpersonation({
        sessionId: supportOperatorRequestContext.sessionId,
        impersonatedActorId: "usr_member_1",
        reason: "Investigate tenant access issue",
        requestedDurationMinutes: 15,
      }),
    );

    const revokedSession = await Effect.runPromise(
      service.revokeImpersonationSession({
        sessionId: supportOperatorRequestContext.sessionId,
        caseId: grant.grantedRequestContext.sessionId,
        revocationReason: "Support investigation complete.",
      }),
    );

    const activeSessions = await Effect.runPromise(
      service.listImpersonationSessions({
        sessionId: supportOperatorRequestContext.sessionId,
        status: supportOperationsImpersonationSessionStatus.active,
      }),
    );
    const revokedSessions = await Effect.runPromise(
      service.listImpersonationSessions({
        sessionId: supportOperatorRequestContext.sessionId,
        status: supportOperationsImpersonationSessionStatus.revoked,
      }),
    );

    expect(revokedSession).toEqual({
      caseId: grant.grantedRequestContext.sessionId,
      status: supportOperationsImpersonationSessionStatus.revoked,
      startedAt: grant.auditEvent.timestamp,
    });
    expect(activeSessions).toEqual([]);
    expect(revokedSessions).toEqual([
      {
        caseId: grant.grantedRequestContext.sessionId,
        status: supportOperationsImpersonationSessionStatus.revoked,
        startedAt: grant.auditEvent.timestamp,
      },
    ]);
    expect(insertedAuditEvents).toEqual([
      grant.auditEvent,
      expect.objectContaining({
        moduleId: platformModuleId.supportOperations,
        action: supportOperationsAuditAction.impersonationRevoked,
        target: `case:${grant.grantedRequestContext.sessionId}`,
        actorId: supportOperatorRequestContext.actorId,
        reason: "Support investigation complete.",
      }),
    ]);
  });

  it("reconciles expired impersonation sessions into durable expired state", async () => {
    const { impersonationSessions, service, valkey } =
      await createSupportOperationsHarness();
    const expiredStartedAt = new Date(
      Date.now() - 30 * 60 * 1000,
    ).toISOString();
    const expiredAt = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    impersonationSessions.set("sess_impersonation_expired", {
      caseId: "sess_impersonation_expired",
      supportAgent: supportOperatorRequestContext.actorId,
      impersonatedUser: "usr_member_1",
      startedAt: expiredStartedAt,
      durationMinutes: 15,
      status: supportOperationsImpersonationSessionStatus.active,
      approvedBy: supportOperatorRequestContext.actorId,
      reason: "Investigate tenant access issue",
      expiresAt: expiredAt,
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const activeSessions = await Effect.runPromise(
      service.listImpersonationSessions({
        sessionId: supportOperatorRequestContext.sessionId,
        status: supportOperationsImpersonationSessionStatus.active,
      }),
    );
    const expiredSessions = await Effect.runPromise(
      service.listImpersonationSessions({
        sessionId: supportOperatorRequestContext.sessionId,
        status: supportOperationsImpersonationSessionStatus.expired,
      }),
    );

    expect(activeSessions).toEqual([]);
    expect(expiredSessions).toEqual([
      {
        caseId: "sess_impersonation_expired",
        status: supportOperationsImpersonationSessionStatus.expired,
        startedAt: expiredStartedAt,
      },
    ]);
    expect(
      impersonationSessions.get("sess_impersonation_expired"),
    ).toMatchObject({
      status: supportOperationsImpersonationSessionStatus.expired,
    });
  });

  it("rejects revocation for expired impersonation sessions before calling Keycloak", async () => {
    const keycloakOptions = createKeycloakTestOptions();
    const revokedSessionIds: string[] = [];

    const { impersonationSessions, service, valkey } =
      await createSupportOperationsHarness({
        keycloakOptions: {
          fetch: async (input, init) => {
            const url = typeof input === "string" ? input : input.toString();

            if (
              init?.method === "DELETE" &&
              url.startsWith(
                `${keycloakOptions.baseUrl}/admin/realms/${keycloakOptions.realm}/sessions/`,
              )
            ) {
              revokedSessionIds.push(url.split("/").pop() ?? "");
            }

            return keycloakOptions.fetch!(input, init);
          },
        },
      });
    const startedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const expiresAt = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    impersonationSessions.set("sess_impersonation_expired_revoke", {
      caseId: "sess_impersonation_expired_revoke",
      supportAgent: supportOperatorRequestContext.actorId,
      impersonatedUser: "usr_member_1",
      startedAt,
      durationMinutes: 15,
      status: supportOperationsImpersonationSessionStatus.active,
      approvedBy: supportOperatorRequestContext.actorId,
      reason: "Investigate tenant access issue",
      expiresAt,
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.revokeImpersonationSession({
          sessionId: supportOperatorRequestContext.sessionId,
          caseId: "sess_impersonation_expired_revoke",
          revocationReason: "Support investigation complete.",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "SupportOperationsImpersonationSessionNoLongerActiveError",
        caseId: "sess_impersonation_expired_revoke",
        status: supportOperationsImpersonationSessionStatus.expired,
      },
    });
    expect(revokedSessionIds).toEqual([]);
    expect(
      impersonationSessions.get("sess_impersonation_expired_revoke"),
    ).toMatchObject({
      status: supportOperationsImpersonationSessionStatus.expired,
    });
  });

  it("retries revocation-pending sessions through Keycloak and finalizes when the session is already gone", async () => {
    const keycloakOptions = createKeycloakTestOptions();
    const revokedSessionIds: string[] = [];

    const { impersonationSessions, insertedAuditEvents, service, valkey } =
      await createSupportOperationsHarness({
        keycloakOptions: {
          fetch: async (input, init) => {
            const url = typeof input === "string" ? input : input.toString();
            const sessionPath = `${keycloakOptions.baseUrl}/admin/realms/${keycloakOptions.realm}/sessions/`;

            if (init?.method === "DELETE" && url.startsWith(sessionPath)) {
              revokedSessionIds.push(url.split("/").pop() ?? "");

              if (url.endsWith("/sess_impersonation_pending")) {
                return new Response("", {
                  status: 404,
                  statusText: "Not Found",
                });
              }
            }

            return keycloakOptions.fetch!(input, init);
          },
        },
      });
    const startedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    impersonationSessions.set("sess_impersonation_pending", {
      caseId: "sess_impersonation_pending",
      supportAgent: supportOperatorRequestContext.actorId,
      impersonatedUser: "usr_member_1",
      startedAt,
      durationMinutes: 15,
      status: supportOperationsImpersonationSessionStatus.revocationPending,
      approvedBy: supportOperatorRequestContext.actorId,
      reason: "Investigate tenant access issue",
      expiresAt,
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const revokedSession = await Effect.runPromise(
      service.revokeImpersonationSession({
        sessionId: supportOperatorRequestContext.sessionId,
        caseId: "sess_impersonation_pending",
        revocationReason: "Support investigation complete.",
      }),
    );

    expect(revokedSession).toEqual({
      caseId: "sess_impersonation_pending",
      status: supportOperationsImpersonationSessionStatus.revoked,
      startedAt,
    });
    expect(revokedSessionIds).toEqual(["sess_impersonation_pending"]);
    expect(insertedAuditEvents).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.supportOperations,
        action: supportOperationsAuditAction.impersonationRevoked,
        target: "case:sess_impersonation_pending",
      }),
    ]);
  });

  it("leaves durable revocation-pending state when Keycloak revocation fails before confirmation", async () => {
    const keycloakOptions = createKeycloakTestOptions();
    const { impersonationSessions, service, valkey } =
      await createSupportOperationsHarness({
        keycloakOptions: {
          fetch: async (input, init) => {
            const url = typeof input === "string" ? input : input.toString();

            if (
              init?.method === "DELETE" &&
              url.endsWith("/sess_impersonation_usr_member_1")
            ) {
              return new Response("revocation failed", {
                status: 500,
                statusText: "Internal Server Error",
              });
            }

            return keycloakOptions.fetch!(input, init);
          },
        },
      });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const grant = await Effect.runPromise(
      service.startImpersonation({
        sessionId: supportOperatorRequestContext.sessionId,
        impersonatedActorId: "usr_member_1",
        reason: "Investigate tenant access issue",
        requestedDurationMinutes: 15,
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.revokeImpersonationSession({
          sessionId: supportOperatorRequestContext.sessionId,
          caseId: grant.grantedRequestContext.sessionId,
          revocationReason: "Support investigation complete.",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "KeycloakAdapterRequestError",
        operation: "sessionRevocation",
        status: 500,
      },
    });
    expect(
      impersonationSessions.get(grant.grantedRequestContext.sessionId),
    ).toMatchObject({
      status: supportOperationsImpersonationSessionStatus.revocationPending,
    });
  });

  it("leaves durable revocation-pending state when finalization fails after Keycloak revocation", async () => {
    const { impersonationSessions, service, valkey } =
      await createSupportOperationsHarness({
        persistRevokedImpersonationSession: () =>
          Effect.fail({
            _tag: "SupportOperationsImpersonationSessionPostgresRepositoryQueryError",
            operation: "updateImpersonationSession",
            cause: new Error("Simulated revocation finalization failure."),
          } as const),
      });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const grant = await Effect.runPromise(
      service.startImpersonation({
        sessionId: supportOperatorRequestContext.sessionId,
        impersonatedActorId: "usr_member_1",
        reason: "Investigate tenant access issue",
        requestedDurationMinutes: 15,
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.revokeImpersonationSession({
          sessionId: supportOperatorRequestContext.sessionId,
          caseId: grant.grantedRequestContext.sessionId,
          revocationReason: "Support investigation complete.",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "SupportOperationsImpersonationSessionPostgresRepositoryQueryError",
        operation: "updateImpersonationSession",
      },
    });
    expect(
      impersonationSessions.get(grant.grantedRequestContext.sessionId),
    ).toMatchObject({
      status: supportOperationsImpersonationSessionStatus.revocationPending,
    });
  });

  it("rejects already-revoked impersonation sessions before calling Keycloak", async () => {
    const keycloakOptions = createKeycloakTestOptions();
    const revokedSessionIds: string[] = [];

    const { impersonationSessions, service, valkey } =
      await createSupportOperationsHarness({
        keycloakOptions: {
          fetch: async (input, init) => {
            const url = typeof input === "string" ? input : input.toString();

            if (
              init?.method === "DELETE" &&
              url.startsWith(
                `${keycloakOptions.baseUrl}/admin/realms/${keycloakOptions.realm}/sessions/`,
              )
            ) {
              revokedSessionIds.push(url.split("/").pop() ?? "");
            }

            return keycloakOptions.fetch!(input, init);
          },
        },
      });
    const startedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    impersonationSessions.set("sess_impersonation_revoked", {
      caseId: "sess_impersonation_revoked",
      supportAgent: supportOperatorRequestContext.actorId,
      impersonatedUser: "usr_member_1",
      startedAt,
      durationMinutes: 15,
      status: supportOperationsImpersonationSessionStatus.revoked,
      approvedBy: supportOperatorRequestContext.actorId,
      reason: "Investigate tenant access issue",
      expiresAt,
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.revokeImpersonationSession({
          sessionId: supportOperatorRequestContext.sessionId,
          caseId: "sess_impersonation_revoked",
          revocationReason: "Support investigation complete.",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "SupportOperationsImpersonationSessionAlreadyRevokedError",
        caseId: "sess_impersonation_revoked",
      },
    });
    expect(revokedSessionIds).toEqual([]);
  });

  it("does not retry Keycloak when a stale active revoke loses the race to a revoked row", async () => {
    const keycloakOptions = createKeycloakTestOptions();
    const revokedSessionIds: string[] = [];
    const staleActiveSession: SupportOperationsImpersonationSessionRecord = {
      caseId: "sess_impersonation_stale_revoke",
      supportAgent: supportOperatorRequestContext.actorId,
      impersonatedUser: "usr_member_1",
      startedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      durationMinutes: 15,
      status: supportOperationsImpersonationSessionStatus.active,
      approvedBy: supportOperatorRequestContext.actorId,
      reason: "Investigate tenant access issue",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
    const revokedSession = {
      ...staleActiveSession,
      status: supportOperationsImpersonationSessionStatus.revoked,
    } satisfies SupportOperationsImpersonationSessionRecord;
    const { impersonationSessions, service, valkey } =
      await createSupportOperationsHarness({
        keycloakOptions: {
          fetch: async (input, init) => {
            const url = typeof input === "string" ? input : input.toString();

            if (
              init?.method === "DELETE" &&
              url.startsWith(
                `${keycloakOptions.baseUrl}/admin/realms/${keycloakOptions.realm}/sessions/`,
              )
            ) {
              revokedSessionIds.push(url.split("/").pop() ?? "");
            }

            return keycloakOptions.fetch!(input, init);
          },
        },
        getImpersonationSession: ({ caseId }) =>
          caseId === staleActiveSession.caseId
            ? Effect.succeed(staleActiveSession)
            : Effect.succeed(undefined),
      });

    impersonationSessions.set(revokedSession.caseId, revokedSession);

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.revokeImpersonationSession({
          sessionId: supportOperatorRequestContext.sessionId,
          caseId: staleActiveSession.caseId,
          revocationReason: "Support investigation complete.",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "SupportOperationsImpersonationSessionAlreadyRevokedError",
        caseId: staleActiveSession.caseId,
      },
    });
    expect(revokedSessionIds).toEqual([]);
    expect(impersonationSessions.get(revokedSession.caseId)).toMatchObject({
      status: supportOperationsImpersonationSessionStatus.revoked,
    });
  });

  it("allows the transactional revocation finalizer to complete pending sessions", async () => {
    const pendingSession: SupportOperationsImpersonationSessionRecord = {
      caseId: "sess_impersonation_pending",
      supportAgent: supportOperatorRequestContext.actorId,
      impersonatedUser: "usr_member_1",
      startedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      durationMinutes: 15,
      status: supportOperationsImpersonationSessionStatus.revocationPending,
      approvedBy: supportOperatorRequestContext.actorId,
      reason: "Investigate tenant access issue",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
    const revocationResult = await Effect.runPromise(
      revokeSupportOperationsImpersonationSession({
        requestContext: supportOperatorRequestContext,
        session: pendingSession,
        revocationReason: "Support investigation complete.",
      }),
    );
    let capturedWhereCondition: unknown;

    const persistence = makeSupportOperationsPersistence({
      database: {
        transaction: async <T>(useTransaction: (tx: never) => Promise<T>) =>
          useTransaction({
            update: () => ({
              set: () => ({
                where: (condition: unknown) => {
                  capturedWhereCondition = condition;

                  return {
                    returning: async () => [
                      {
                        caseId: revocationResult.session.caseId,
                      },
                    ],
                  };
                },
              }),
            }),
            insert: () => ({
              values: () => ({
                execute: async () => undefined,
              }),
            }),
          } as never),
      } as never,
      supportCaseRepository: {
        upsertSupportCase: () => Effect.die("unused"),
        listSupportCases: () => Effect.die("unused"),
        getSupportCase: () => Effect.die("unused"),
      },
      breakGlassIncidentRepository: {
        upsertBreakGlassIncident: () => Effect.die("unused"),
        listBreakGlassIncidents: () => Effect.die("unused"),
        getBreakGlassIncident: () => Effect.die("unused"),
      },
      impersonationSessionRepository: {
        upsertImpersonationSession: () => Effect.die("unused"),
        listImpersonationSessions: () => Effect.die("unused"),
        getImpersonationSession: () => Effect.die("unused"),
      },
    });

    const persistedSession = await Effect.runPromise(
      persistence.persistRevokedImpersonationSession(revocationResult),
    );
    const seenPredicateValues = new Set<unknown>();
    const serializedPredicate = JSON.stringify(
      capturedWhereCondition,
      (_key, value) => {
        if (typeof value !== "object" || value === null) {
          return value;
        }

        if (seenPredicateValues.has(value)) {
          return undefined;
        }

        seenPredicateValues.add(value);

        return value;
      },
    );

    expect(persistedSession).toEqual(revocationResult.session);
    expect(
      supportOperationsImpersonationSessionRevocationFinalizableStatuses,
    ).toEqual([supportOperationsImpersonationSessionStatus.revocationPending]);
    expect(serializedPredicate).toContain(
      supportOperationsImpersonationSessionStatus.revocationPending,
    );
    expect(serializedPredicate).not.toContain(
      `{"value":"${supportOperationsImpersonationSessionStatus.active}"}`,
    );
  });

  it("does not rewrite support-case startedAt on conflicts and rolls back failed audit inserts", async () => {
    let capturedSupportCaseConflictSet: Record<string, unknown> | undefined;
    let persistedSupportCases = new Map<string, unknown>();

    const persistence = makeSupportOperationsPersistence({
      database: {
        transaction: async <T>(useTransaction: (tx: never) => Promise<T>) => {
          const stagedSupportCases = new Map(persistedSupportCases);
          let insertCount = 0;

          try {
            const result = await useTransaction({
              insert: () => {
                insertCount += 1;

                if (insertCount === 1) {
                  return {
                    values: (values: { readonly caseId: string }) => ({
                      onConflictDoUpdate: ({
                        set,
                      }: {
                        readonly set: Record<string, unknown>;
                      }) => {
                        capturedSupportCaseConflictSet = set;

                        return {
                          execute: async () => {
                            stagedSupportCases.set(values.caseId, values);
                          },
                        };
                      },
                    }),
                  };
                }

                return {
                  values: () => ({
                    execute: async () => {
                      throw new Error("Simulated audit insert failure.");
                    },
                  }),
                };
              },
            } as never);

            persistedSupportCases = stagedSupportCases;

            return result;
          } catch (error) {
            return Promise.reject(error);
          }
        },
      } as never,
      supportCaseRepository: {
        upsertSupportCase: () => Effect.die("unused"),
        listSupportCases: () => Effect.die("unused"),
        getSupportCase: () => Effect.die("unused"),
      },
      breakGlassIncidentRepository: {
        upsertBreakGlassIncident: () => Effect.die("unused"),
        listBreakGlassIncidents: () => Effect.die("unused"),
        getBreakGlassIncident: () => Effect.die("unused"),
      },
      impersonationSessionRepository: {
        upsertImpersonationSession: () => Effect.die("unused"),
        listImpersonationSessions: () => Effect.die("unused"),
        getImpersonationSession: () => Effect.die("unused"),
      },
    });

    const result = await Effect.runPromise(
      Effect.either(
        persistence.persistUpsertedSupportCase({
          case: {
            caseId: "case_support_case_rollback",
            supportAgent: supportOperatorRequestContext.actorId,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
            summary: "Escalated tenant authentication investigation",
            status: supportOperationsCaseStatus.escalated,
            priority: supportOperationsCasePriority.high,
            startedAt: "2026-05-03T10:00:00.000Z",
            lastUpdatedAt: "2026-05-03T10:15:00.000Z",
          },
          auditEvent: {
            eventId: "evt_support_case_rollback",
            moduleId: platformModuleId.supportOperations,
            action: supportOperationsAuditAction.supportCaseUpserted,
            target: "case:case_support_case_rollback",
            actorId: supportOperatorRequestContext.actorId,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
            reason: "Escalated after repeated authentication failures.",
            correlationId: supportOperatorRequestContext.correlationId,
            timestamp: "2026-05-03T10:15:00.000Z",
          },
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AuditLogPostgresRepositoryPersistenceError",
        operation: "insertAuditEvent",
      },
    });
    expect(capturedSupportCaseConflictSet).toBeDefined();
    expect(capturedSupportCaseConflictSet ?? {}).not.toHaveProperty(
      "startedAt",
    );
    expect(persistedSupportCases.size).toBe(0);
  });

  it("resolves the operator session, derives approval provenance, and persists break-glass audit events", async () => {
    const { insertedAuditEvents, service, valkey } =
      await createSupportOperationsHarness();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const grant = await Effect.runPromise(
      service.grantBreakGlassAccess({
        sessionId: supportOperatorRequestContext.sessionId,
        reason: "Resolve emergency tenant outage",
        expiresAt,
      }),
    );

    expect(grant.grantedRequestContext.breakGlass).toEqual({
      approvedBy: supportOperatorRequestContext.actorId,
      reason: "Resolve emergency tenant outage",
      expiresAt,
    });
    expect(insertedAuditEvents).toEqual([grant.auditEvent]);
    expect(insertedAuditEvents[0]).toMatchObject({
      moduleId: platformModuleId.supportOperations,
      action: supportOperationsAuditAction.breakGlassStarted,
      target: platformScope.platform,
      actorId: supportOperatorRequestContext.actorId,
    });
  });

  it("lists pending break-glass incidents after a durable grant", async () => {
    const { breakGlassIncidents, service, valkey } =
      await createSupportOperationsHarness();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const grant = await Effect.runPromise(
      service.grantBreakGlassAccess({
        sessionId: supportOperatorRequestContext.sessionId,
        reason: "Resolve emergency tenant outage",
        expiresAt,
      }),
    );

    const incidents = await Effect.runPromise(
      service.listBreakGlassIncidents({
        sessionId: supportOperatorRequestContext.sessionId,
        status: supportOperationsBreakGlassIncidentStatus.pendingReview,
      }),
    );

    expect(breakGlassIncidents.size).toBe(1);
    expect(incidents).toEqual([
      {
        caseId: grant.auditEvent.eventId,
        status: supportOperationsBreakGlassIncidentStatus.pendingReview,
        startedAt: grant.auditEvent.timestamp,
        approvedBy: supportOperatorRequestContext.actorId,
        reason: "Resolve emergency tenant outage",
        expiresAt,
      },
    ]);
  });

  it("projects break-glass incident detail with support-safe expiry context", async () => {
    const { service, valkey } = await createSupportOperationsHarness();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const grant = await Effect.runPromise(
      service.grantBreakGlassAccess({
        sessionId: supportOperatorRequestContext.sessionId,
        reason: "Resolve emergency tenant outage",
        expiresAt,
      }),
    );

    await expect(
      Effect.runPromise(
        service.getBreakGlassIncident({
          sessionId: supportOperatorRequestContext.sessionId,
          caseId: grant.auditEvent.eventId,
        }),
      ),
    ).resolves.toEqual({
      caseId: grant.auditEvent.eventId,
      status: supportOperationsBreakGlassIncidentStatus.pendingReview,
      startedAt: grant.auditEvent.timestamp,
      approvedBy: supportOperatorRequestContext.actorId,
      reason: "Resolve emergency tenant outage",
      expiresAt,
    });
  });

  it("reviews pending break-glass incidents and persists a distinct review audit event", async () => {
    const { insertedAuditEvents, service, valkey } =
      await createSupportOperationsHarness();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const grant = await Effect.runPromise(
      service.grantBreakGlassAccess({
        sessionId: supportOperatorRequestContext.sessionId,
        reason: "Resolve emergency tenant outage",
        expiresAt,
      }),
    );

    const reviewedIncident = await Effect.runPromise(
      service.reviewBreakGlassIncident({
        sessionId: supportOperatorRequestContext.sessionId,
        caseId: grant.auditEvent.eventId,
        reviewReason: "Post-incident review completed.",
      }),
    );

    const pendingIncidents = await Effect.runPromise(
      service.listBreakGlassIncidents({
        sessionId: supportOperatorRequestContext.sessionId,
        status: supportOperationsBreakGlassIncidentStatus.pendingReview,
      }),
    );
    const reviewedIncidents = await Effect.runPromise(
      service.listBreakGlassIncidents({
        sessionId: supportOperatorRequestContext.sessionId,
        status: supportOperationsBreakGlassIncidentStatus.reviewed,
      }),
    );

    expect(reviewedIncident).toEqual({
      caseId: grant.auditEvent.eventId,
      status: supportOperationsBreakGlassIncidentStatus.reviewed,
      startedAt: grant.auditEvent.timestamp,
      approvedBy: supportOperatorRequestContext.actorId,
      reason: "Resolve emergency tenant outage",
      expiresAt,
    });
    expect(pendingIncidents).toEqual([]);
    expect(reviewedIncidents).toEqual([
      {
        caseId: grant.auditEvent.eventId,
        status: supportOperationsBreakGlassIncidentStatus.reviewed,
        startedAt: grant.auditEvent.timestamp,
        approvedBy: supportOperatorRequestContext.actorId,
        reason: "Resolve emergency tenant outage",
        expiresAt,
      },
    ]);
    expect(insertedAuditEvents).toEqual([
      grant.auditEvent,
      expect.objectContaining({
        moduleId: platformModuleId.supportOperations,
        action: supportOperationsAuditAction.breakGlassReviewed,
        target: `case:${grant.auditEvent.eventId}`,
        actorId: supportOperatorRequestContext.actorId,
        reason: "Post-incident review completed.",
      }),
    ]);
  });

  it("does not leave partial audit or incident state when durable break-glass persistence fails", async () => {
    const { breakGlassIncidents, insertedAuditEvents, service, valkey } =
      await createSupportOperationsHarness({
        persistGrantedBreakGlass: () =>
          Effect.fail({
            _tag: "SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError",
            operation: "upsertBreakGlassIncident",
            cause: new Error("Simulated break-glass incident write failure."),
          } as const),
      });
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.grantBreakGlassAccess({
          sessionId: supportOperatorRequestContext.sessionId,
          reason: "Resolve emergency tenant outage",
          expiresAt,
        }),
      ),
    );

    expect(result._tag).toBe("Left");
    expect(insertedAuditEvents).toEqual([]);
    expect(breakGlassIncidents.size).toBe(0);
  });

  it("rejects stale review attempts without persisting a duplicate review audit event", async () => {
    const { insertedAuditEvents, service, valkey } =
      await createSupportOperationsHarness({
        getBreakGlassIncident: ({ caseId, breakGlassIncidents }) => {
          const incident = breakGlassIncidents.get(caseId);

          if (
            incident !== undefined &&
            incident.status ===
              supportOperationsBreakGlassIncidentStatus.pendingReview
          ) {
            breakGlassIncidents.set(caseId, {
              ...incident,
              status: supportOperationsBreakGlassIncidentStatus.reviewed,
            });
          }

          return Effect.succeed(incident);
        },
      });
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const grant = await Effect.runPromise(
      service.grantBreakGlassAccess({
        sessionId: supportOperatorRequestContext.sessionId,
        reason: "Resolve emergency tenant outage",
        expiresAt,
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.reviewBreakGlassIncident({
          sessionId: supportOperatorRequestContext.sessionId,
          caseId: grant.auditEvent.eventId,
          reviewReason: "Post-incident review completed.",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "BreakGlassIncidentAlreadyReviewedError",
        caseId: grant.auditEvent.eventId,
      },
    });
    expect(insertedAuditEvents).toEqual([grant.auditEvent]);
  });

  it("revokes the issued impersonation session when audit persistence fails", async () => {
    const keycloakOptions = createKeycloakTestOptions();
    const revokedSessionIds: string[] = [];

    const { insertedAuditEvents, service, valkey } =
      await createSupportOperationsHarness({
        persistStartedImpersonation: () =>
          Effect.fail({
            _tag: "AuditLogPostgresRepositoryPersistenceError",
            operation: "insertAuditEvent",
            cause: new Error("Simulated audit write failure."),
          } as const),
        keycloakOptions: {
          fetch: async (input, init) => {
            const url = typeof input === "string" ? input : input.toString();

            if (
              init?.method === "DELETE" &&
              url.startsWith(
                `${keycloakOptions.baseUrl}/admin/realms/${keycloakOptions.realm}/sessions/`,
              )
            ) {
              revokedSessionIds.push(url.split("/").pop() ?? "");
            }

            return keycloakOptions.fetch!(input, init);
          },
        },
      });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.startImpersonation({
          sessionId: supportOperatorRequestContext.sessionId,
          impersonatedActorId: "usr_member_1",
          reason: "Investigate tenant access issue",
          requestedDurationMinutes: 15,
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AuditLogPostgresRepositoryPersistenceError",
        operation: "insertAuditEvent",
      },
    });
    expect(insertedAuditEvents).toEqual([]);
    expect(revokedSessionIds).toEqual(["sess_impersonation_usr_member_1"]);
  });

  it("surfaces a compensation error when revoking a failed impersonation session also fails", async () => {
    const keycloakOptions = createKeycloakTestOptions();

    const { service, valkey } = await createSupportOperationsHarness({
      persistStartedImpersonation: () =>
        Effect.fail({
          _tag: "AuditLogPostgresRepositoryPersistenceError",
          operation: "insertAuditEvent",
          cause: new Error("Simulated audit write failure."),
        } as const),
      keycloakOptions: {
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();

          if (
            init?.method === "DELETE" &&
            url.startsWith(
              `${keycloakOptions.baseUrl}/admin/realms/${keycloakOptions.realm}/sessions/`,
            )
          ) {
            return new Response("Keycloak unavailable", {
              status: 503,
              statusText: "Service Unavailable",
            });
          }

          return keycloakOptions.fetch!(input, init);
        },
      },
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.startImpersonation({
          sessionId: supportOperatorRequestContext.sessionId,
          impersonatedActorId: "usr_member_1",
          reason: "Investigate tenant access issue",
          requestedDurationMinutes: 15,
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "SupportOperationsImpersonationCompensationError",
        sessionId: "sess_impersonation_usr_member_1",
        persistenceFailure: {
          _tag: "AuditLogPostgresRepositoryPersistenceError",
          operation: "insertAuditEvent",
        },
        revocationFailure: {
          _tag: "KeycloakAdapterRequestError",
          operation: "sessionRevocation",
          status: 503,
        },
      },
    });
  });

  it("treats a missing Keycloak session during compensation as a revocation failure", async () => {
    const keycloakOptions = createKeycloakTestOptions();

    const { service, valkey } = await createSupportOperationsHarness({
      persistStartedImpersonation: () =>
        Effect.fail({
          _tag: "AuditLogPostgresRepositoryPersistenceError",
          operation: "insertAuditEvent",
          cause: new Error("Simulated audit write failure."),
        } as const),
      keycloakOptions: {
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();

          if (
            init?.method === "DELETE" &&
            url.startsWith(
              `${keycloakOptions.baseUrl}/admin/realms/${keycloakOptions.realm}/sessions/`,
            )
          ) {
            return new Response("Session not found", {
              status: 404,
              statusText: "Not Found",
            });
          }

          return keycloakOptions.fetch!(input, init);
        },
      },
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.startImpersonation({
          sessionId: supportOperatorRequestContext.sessionId,
          impersonatedActorId: "usr_member_1",
          reason: "Investigate tenant access issue",
          requestedDurationMinutes: 15,
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "SupportOperationsImpersonationCompensationError",
        sessionId: "sess_impersonation_usr_member_1",
        persistenceFailure: {
          _tag: "AuditLogPostgresRepositoryPersistenceError",
          operation: "insertAuditEvent",
        },
        revocationFailure: {
          _tag: "KeycloakAdapterRequestError",
          operation: "sessionRevocation",
          status: 404,
        },
      },
    });
  });

  it("surfaces malformed Keycloak client-credentials responses as compensation failures", async () => {
    const keycloakOptions = createKeycloakTestOptions();

    const { service, valkey } = await createSupportOperationsHarness({
      persistStartedImpersonation: () =>
        Effect.fail({
          _tag: "AuditLogPostgresRepositoryPersistenceError",
          operation: "insertAuditEvent",
          cause: new Error("Simulated audit write failure."),
        } as const),
      keycloakOptions: {
        fetch: async (input, init) => {
          const url = typeof input === "string" ? input : input.toString();

          if (
            url ===
            `${keycloakOptions.baseUrl}/realms/${keycloakOptions.realm}/protocol/openid-connect/token`
          ) {
            const requestBody = new URLSearchParams(String(init?.body ?? ""));

            if (requestBody.get("grant_type") === "client_credentials") {
              return new Response(JSON.stringify({ expires_in: 1800 }), {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                },
              });
            }
          }

          return keycloakOptions.fetch!(input, init);
        },
      },
    });

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContext.sessionId,
        requestContext: supportOperatorRequestContext,
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.startImpersonation({
          sessionId: supportOperatorRequestContext.sessionId,
          impersonatedActorId: "usr_member_1",
          reason: "Investigate tenant access issue",
          requestedDurationMinutes: 15,
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "SupportOperationsImpersonationCompensationError",
        sessionId: "sess_impersonation_usr_member_1",
        persistenceFailure: {
          _tag: "AuditLogPostgresRepositoryPersistenceError",
          operation: "insertAuditEvent",
        },
        revocationFailure: {
          _tag: "KeycloakAdapterRequestError",
          operation: "clientCredentialsGrant",
        },
      },
    });
  });

  it("rejects impersonation when the resolved session lacks approval actor provenance", async () => {
    const { service, valkey } = await createSupportOperationsHarness();

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorRequestContextWithoutActorId.sessionId,
        requestContext: supportOperatorRequestContextWithoutActorId,
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.startImpersonation({
          sessionId: supportOperatorRequestContextWithoutActorId.sessionId,
          impersonatedActorId: "usr_member_1",
          reason: "Investigate tenant access issue",
          requestedDurationMinutes: 15,
        }),
      ),
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      throw new Error(
        "Expected impersonation without approval actor provenance to fail.",
      );
    }
    expect(result.left).toMatchObject({
      _tag: "SupportOperationsApprovalActorMissingError",
      actorType: actorType.supportOperator,
      correlationId: "corr_support_operations_missing_actor_id",
    });
  });
});
