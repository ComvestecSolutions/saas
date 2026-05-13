import { Effect, Schema } from "effect";
import {
  actorType,
  type AdminGovernanceActionPolicyId,
  AdminGovernanceActionPolicyMetadataListSchema,
  adminGovernanceActionPolicyId,
  type AdminOperatorCapability,
  adminOperatorCapability,
  AdminOperatorCapabilitySnapshotSchema,
  adminQuerySortDirection,
  AdminQueryPageInfoSchema,
  AdminQueryPageSchema,
  AdminQuerySortDirectionSchema,
  adminRoutePath,
  AdminRoutePathSchema,
  type AuditEvent,
  AuditEventSchema,
  type BillingRepairGap,
  BillingSummaryViewSchema,
  type PlatformModuleId,
  platformScope,
  type RequestContext,
  RequestContextSchema,
  type SupportOperationsBreakGlassIncidentStatus,
  supportOperationsBreakGlassIncidentStatus,
  supportOperationsCaseStatus,
  supportOperationsImpersonationSessionStatus,
  SupportOperationsTenantHealthViewSchema,
  TenantBrandingSupportSafeViewSchema,
  workflowJobStatus,
  AdminTenantInvitationQueryResultSchema,
  AdminTenantMembershipQueryResultSchema,
  AdminTenantOnboardingReviewResultSchema,
  type TenantContext,
  TenantContextSchema,
} from "@comvestec/contracts";
import { platformModuleId } from "@comvestec/contracts";
import type {
  AdminGovernanceAuthorizationTupleQuery,
  AdminGovernanceAuthorizationTupleView,
  AdminGovernanceService,
  AdminGovernanceServiceError,
} from "../governance/admin-governance";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

const AdminAuditSliceQuerySchema = Schema.Struct({
  page: AdminQueryPageSchema,
  sortDirection: AdminQuerySortDirectionSchema,
  exportMode: Schema.Boolean,
  detailLookupId: Schema.optional(Schema.NonEmptyString),
});

export type AdminAuditSliceQuery = Schema.Schema.Type<
  typeof AdminAuditSliceQuerySchema
>;

const AdminAuditSliceSchema = Schema.Struct({
  pageInfo: AdminQueryPageInfoSchema,
  items: Schema.Array(AuditEventSchema),
  detail: Schema.optional(AuditEventSchema),
});

export type AdminAuditSlice = Schema.Schema.Type<typeof AdminAuditSliceSchema>;

const AdminOperationsHomeAlertSeveritySchema = Schema.Literal(
  "info",
  "warning",
  "critical",
);

const AdminOperationsHomeAlertSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  severity: AdminOperationsHomeAlertSeveritySchema,
  title: Schema.NonEmptyString,
  detail: Schema.NonEmptyString,
  href: AdminRoutePathSchema,
  count: Schema.NonNegativeInt,
});

const AdminOperationsHomePostureSchema = Schema.Struct({
  openRepairGaps: Schema.NonNegativeInt,
  blockedRepairGaps: Schema.NonNegativeInt,
  scheduledRepairGaps: Schema.NonNegativeInt,
  staleRunningRepairGaps: Schema.NonNegativeInt,
  openSupportCases: Schema.NonNegativeInt,
  escalatedSupportCases: Schema.NonNegativeInt,
  activeImpersonationSessions: Schema.NonNegativeInt,
  revocationPendingImpersonationSessions: Schema.NonNegativeInt,
  pendingBreakGlassIncidents: Schema.NonNegativeInt,
  pendingRuntimeConfigProposals: Schema.NonNegativeInt,
  pendingBrandingProposals: Schema.NonNegativeInt,
});

export const AdminOperationsHomeSummarySchema = Schema.Struct({
  capabilities: AdminOperatorCapabilitySnapshotSchema,
  posture: AdminOperationsHomePostureSchema,
  alerts: Schema.Array(AdminOperationsHomeAlertSchema),
  recentActivity: AdminAuditSliceSchema,
});

export type AdminOperationsHomeSummary = Schema.Schema.Type<
  typeof AdminOperationsHomeSummarySchema
>;

export const AdminTenantWorkspaceRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  tenant: TenantContextSchema,
  inspectionReason: Schema.optional(Schema.NonEmptyString),
  audit: AdminAuditSliceQuerySchema,
});

export type AdminTenantWorkspaceRequest = Schema.Schema.Type<
  typeof AdminTenantWorkspaceRequestSchema
>;

export const AdminTenantWorkspaceSchema = Schema.Struct({
  capabilities: AdminOperatorCapabilitySnapshotSchema,
  tenant: TenantContextSchema,
  onboarding: AdminTenantOnboardingReviewResultSchema,
  memberships: AdminTenantMembershipQueryResultSchema.fields.memberships,
  invitations: AdminTenantInvitationQueryResultSchema.fields.invitations,
  billing: BillingSummaryViewSchema,
  branding: TenantBrandingSupportSafeViewSchema,
  support: SupportOperationsTenantHealthViewSchema,
  audit: AdminAuditSliceSchema,
});

export type AdminTenantWorkspace = Schema.Schema.Type<
  typeof AdminTenantWorkspaceSchema
>;

const defaultAdminAuditSliceQuery = Schema.validateSync(
  AdminAuditSliceQuerySchema,
)({
  page: {
    page: 1,
    pageSize: 5,
  },
  sortDirection: adminQuerySortDirection.desc,
  exportMode: false,
});

const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);
const decodeAdminOperationsHomeSummary = Schema.decodeUnknown(
  AdminOperationsHomeSummarySchema,
);
const decodeAdminTenantWorkspace = Schema.decodeUnknown(
  AdminTenantWorkspaceSchema,
);
const decodeAdminAuditSlice = Schema.decodeUnknown(AdminAuditSliceSchema);
const decodeAdminOperatorCapabilitySnapshot = Schema.decodeUnknown(
  AdminOperatorCapabilitySnapshotSchema,
);

type AdminGovernanceRuntimeModule = Pick<
  typeof import("../governance/admin-governance"),
  "runAdminGovernanceFromEnvironment"
>;

type SupportOperationsRuntimeModule = Pick<
  typeof import("../governance/support-operations"),
  "runSupportOperationsFromEnvironment"
>;

type AdminTenantManagementRuntimeModule = Pick<
  typeof import("../domains/admin-tenant-management"),
  "runAdminTenantManagementFromEnvironment"
>;

type TenantBrandingRuntimeModule = Pick<
  typeof import("../domains/tenant-branding"),
  "runTenantBrandingFromEnvironment"
>;

type AdminBillingRuntimeModule = Pick<
  typeof import("../domains/admin-billing"),
  "runAdminBillingFromEnvironment"
>;

const loadAdminGovernanceRuntime = () =>
  loadRuntimeModuleOrDie<AdminGovernanceRuntimeModule>(
    () => import("../governance/admin-governance"),
  );

const loadSupportOperationsRuntime = () =>
  loadRuntimeModuleOrDie<SupportOperationsRuntimeModule>(
    () => import("../governance/support-operations"),
  );

const loadAdminTenantManagementRuntime = () =>
  loadRuntimeModuleOrDie<AdminTenantManagementRuntimeModule>(
    () => import("../domains/admin-tenant-management"),
  );

const loadTenantBrandingRuntime = () =>
  loadRuntimeModuleOrDie<TenantBrandingRuntimeModule>(
    () => import("../domains/tenant-branding"),
  );

const loadAdminBillingRuntime = () =>
  loadRuntimeModuleOrDie<AdminBillingRuntimeModule>(
    () => import("../domains/admin-billing"),
  );

const countRepairGaps = (
  jobs: readonly BillingRepairGap[],
  status: (typeof workflowJobStatus)[keyof typeof workflowJobStatus],
) => jobs.filter((job) => job.status === status).length;

const findCapability = (
  snapshot: Schema.Schema.Type<typeof AdminOperatorCapabilitySnapshotSchema>,
  capability: AdminOperatorCapability,
) => snapshot.capabilities.find((entry) => entry.capability === capability);

const capabilityMatrix: ReadonlyArray<{
  readonly capability: AdminOperatorCapability;
  readonly routePath: Schema.Schema.Type<typeof AdminRoutePathSchema>;
  readonly label: string;
  readonly allowedActorTypes: readonly RequestContext["actorType"][];
  readonly actionPolicyIds: readonly AdminGovernanceActionPolicyId[];
  readonly deniedReason: string;
}> = [
  {
    capability: adminOperatorCapability.operationsHome,
    routePath: adminRoutePath.operationsHome,
    label: "Operations Home",
    allowedActorTypes: [actorType.platformOperator, actorType.supportOperator],
    actionPolicyIds: [],
    deniedReason:
      "Operations Home requires a trusted operator session resolved by the backend control plane.",
  },
  {
    capability: adminOperatorCapability.repairOperations,
    routePath: adminRoutePath.repairOperations,
    label: "Repair Operations",
    allowedActorTypes: [actorType.platformOperator],
    actionPolicyIds: [
      adminGovernanceActionPolicyId.repairGapInspection,
    ] as const,
    deniedReason:
      "Billing repair workflow controls require a platform-operator session scoped to the platform tenant.",
  },
  {
    capability: adminOperatorCapability.tenantWorkspace,
    routePath: adminRoutePath.tenantWorkspace,
    label: "Tenant Workspace",
    allowedActorTypes: [actorType.platformOperator],
    actionPolicyIds: [],
    deniedReason:
      "Tenant workspace composition currently depends on platform-operator tenant-management and billing surfaces.",
  },
  {
    capability: adminOperatorCapability.runtimeConfig,
    routePath: adminRoutePath.runtimeConfig,
    label: "Runtime Config",
    allowedActorTypes: [actorType.platformOperator, actorType.supportOperator],
    actionPolicyIds: [
      adminGovernanceActionPolicyId.runtimeConfigProposalSubmit,
      adminGovernanceActionPolicyId.runtimeConfigProposalReview,
    ] as const,
    deniedReason:
      "Runtime config inspection requires a trusted operator session on the governance backend.",
  },
  {
    capability: adminOperatorCapability.featureFlags,
    routePath: adminRoutePath.featureFlags,
    label: "Feature Flags",
    allowedActorTypes: [actorType.platformOperator, actorType.supportOperator],
    actionPolicyIds: [],
    deniedReason:
      "Feature-flag inspection requires a trusted operator session on the governance backend.",
  },
  {
    capability: adminOperatorCapability.accessControl,
    routePath: adminRoutePath.accessControl,
    label: "Access Control",
    allowedActorTypes: [actorType.platformOperator, actorType.supportOperator],
    actionPolicyIds: [
      adminGovernanceActionPolicyId.authorizationTupleWrite,
      adminGovernanceActionPolicyId.authorizationTupleDelete,
    ] as const,
    deniedReason:
      "Access-control inspection requires a trusted operator session on the governance backend.",
  },
  {
    capability: adminOperatorCapability.auditLog,
    routePath: adminRoutePath.auditLog,
    label: "Audit Log",
    allowedActorTypes: [actorType.platformOperator, actorType.supportOperator],
    actionPolicyIds: [],
    deniedReason:
      "Audit-log review requires a trusted operator session on the governance backend.",
  },
  {
    capability: adminOperatorCapability.supportOperations,
    routePath: adminRoutePath.supportOperations,
    label: "Support Operations",
    allowedActorTypes: [actorType.platformOperator, actorType.supportOperator],
    actionPolicyIds: [
      adminGovernanceActionPolicyId.breakGlassIncidentReview,
    ] as const,
    deniedReason:
      "Support operations require a trusted support or platform operator session.",
  },
  {
    capability: adminOperatorCapability.branding,
    routePath: adminRoutePath.branding,
    label: "Branding & Domains",
    allowedActorTypes: [actorType.platformOperator, actorType.supportOperator],
    actionPolicyIds: [],
    deniedReason:
      "Branding inspection requires a trusted operator session and support-safe projection policies.",
  },
  {
    capability: adminOperatorCapability.billing,
    routePath: adminRoutePath.billing,
    label: "Billing & Entitlements",
    allowedActorTypes: [actorType.platformOperator],
    actionPolicyIds: [] as const,
    deniedReason:
      "Billing explanation and reconciliation workflows are currently platform-operator only.",
  },
  {
    capability: adminOperatorCapability.complianceRetention,
    routePath: adminRoutePath.complianceRetention,
    label: "Compliance & Retention",
    allowedActorTypes: [actorType.platformOperator, actorType.supportOperator],
    actionPolicyIds: [] as const,
    deniedReason: "Compliance review requires a trusted operator session.",
  },
  {
    capability: adminOperatorCapability.webhooksApiAccess,
    routePath: adminRoutePath.webhooksApiAccess,
    label: "Webhooks & API Access",
    allowedActorTypes: [actorType.platformOperator, actorType.supportOperator],
    actionPolicyIds: [] as const,
    deniedReason: "Integration inspection requires a trusted operator session.",
  },
];

const buildAdminQueryPageInfo = (input: {
  readonly totalItems: number;
  readonly page: Schema.Schema.Type<typeof AdminQueryPageSchema>;
  readonly exportMode: boolean;
}) =>
  Schema.decodeUnknown(AdminQueryPageInfoSchema)({
    page: input.page,
    totalItems: input.totalItems,
    totalPages:
      input.exportMode || input.totalItems === 0
        ? input.exportMode && input.totalItems > 0
          ? 1
          : 0
        : Math.ceil(input.totalItems / input.page.pageSize),
    exportMode: input.exportMode,
  });

const buildAuditSlice = (
  events: readonly AuditEvent[],
  query: AdminAuditSliceQuery = defaultAdminAuditSliceQuery,
) => {
  const sortedEvents = [...events].sort((left, right) =>
    query.sortDirection === adminQuerySortDirection.asc
      ? left.timestamp.localeCompare(right.timestamp)
      : right.timestamp.localeCompare(left.timestamp),
  );
  const detail =
    query.detailLookupId === undefined
      ? undefined
      : sortedEvents.find((event) => event.eventId === query.detailLookupId);
  const items = query.exportMode
    ? sortedEvents
    : sortedEvents.slice(
        (query.page.page - 1) * query.page.pageSize,
        (query.page.page - 1) * query.page.pageSize + query.page.pageSize,
      );

  return buildAdminQueryPageInfo({
    totalItems: sortedEvents.length,
    page: query.page,
    exportMode: query.exportMode,
  }).pipe(
    Effect.flatMap((pageInfo) =>
      decodeAdminAuditSlice({
        pageInfo,
        items,
        ...(detail === undefined ? {} : { detail }),
      }),
    ),
  );
};

export const buildAdminOperatorCapabilitySnapshot = (input: {
  readonly requestContext: RequestContext;
  readonly actionPolicies: Schema.Schema.Type<
    typeof AdminGovernanceActionPolicyMetadataListSchema
  >;
}) =>
  decodeRequestContext(input.requestContext).pipe(
    Effect.flatMap((requestContext) => {
      const availablePolicyIds = new Set(
        input.actionPolicies.map((policy) => policy.actionId),
      );

      return decodeAdminOperatorCapabilitySnapshot({
        actorType: requestContext.actorType,
        ...(requestContext.actorId === undefined
          ? {}
          : { actorId: requestContext.actorId }),
        ...(requestContext.sessionId === undefined
          ? {}
          : { sessionId: requestContext.sessionId }),
        capabilities: capabilityMatrix.map((definition) => {
          const allowed = definition.allowedActorTypes.includes(
            requestContext.actorType,
          );

          return {
            capability: definition.capability,
            routePath: definition.routePath,
            visible: allowed,
            allowed,
            label: definition.label,
            ...(allowed ? {} : { reason: definition.deniedReason }),
            actionPolicyIds: definition.actionPolicyIds.filter((policyId) =>
              availablePolicyIds.has(policyId),
            ),
          };
        }),
      });
    }),
  );

export const buildAdminOperationsHomeSummary = (input: {
  readonly capabilities: Schema.Schema.Type<
    typeof AdminOperatorCapabilitySnapshotSchema
  >;
  readonly repairGaps: readonly BillingRepairGap[];
  readonly supportCases: readonly {
    readonly status: string;
  }[];
  readonly impersonationSessions: readonly {
    readonly status: string;
  }[];
  readonly breakGlassIncidents: readonly {
    readonly status: SupportOperationsBreakGlassIncidentStatus;
  }[];
  readonly pendingRuntimeConfigProposals: number;
  readonly pendingBrandingProposals: number;
  readonly recentActivity: readonly AuditEvent[];
  readonly recentActivityQuery?: AdminAuditSliceQuery;
}) => {
  const blockedRepairGaps = countRepairGaps(
    input.repairGaps,
    workflowJobStatus.blocked,
  );
  const scheduledRepairGaps = countRepairGaps(
    input.repairGaps,
    workflowJobStatus.scheduled,
  );
  const staleRunningRepairGaps = countRepairGaps(
    input.repairGaps,
    workflowJobStatus.running,
  );
  const openSupportCases = input.supportCases.filter(
    (supportCase) => supportCase.status === supportOperationsCaseStatus.open,
  ).length;
  const escalatedSupportCases = input.supportCases.filter(
    (supportCase) =>
      supportCase.status === supportOperationsCaseStatus.escalated,
  ).length;
  const activeImpersonationSessions = input.impersonationSessions.filter(
    (session) =>
      session.status === supportOperationsImpersonationSessionStatus.active,
  ).length;
  const revocationPendingImpersonationSessions =
    input.impersonationSessions.filter(
      (session) =>
        session.status ===
        supportOperationsImpersonationSessionStatus.revocationPending,
    ).length;
  const pendingBreakGlassIncidents = input.breakGlassIncidents.filter(
    (incident) =>
      incident.status ===
      supportOperationsBreakGlassIncidentStatus.pendingReview,
  ).length;

  return buildAuditSlice(
    input.recentActivity,
    input.recentActivityQuery ?? defaultAdminAuditSliceQuery,
  ).pipe(
    Effect.flatMap((recentActivity) =>
      decodeAdminOperationsHomeSummary({
        capabilities: input.capabilities,
        posture: {
          openRepairGaps: input.repairGaps.length,
          blockedRepairGaps,
          scheduledRepairGaps,
          staleRunningRepairGaps,
          openSupportCases,
          escalatedSupportCases,
          activeImpersonationSessions,
          revocationPendingImpersonationSessions,
          pendingBreakGlassIncidents,
          pendingRuntimeConfigProposals: input.pendingRuntimeConfigProposals,
          pendingBrandingProposals: input.pendingBrandingProposals,
        },
        alerts: [
          ...(blockedRepairGaps === 0
            ? []
            : [
                {
                  id: "blocked-repair-gaps",
                  severity: "warning",
                  title: "Blocked repair gaps need review",
                  detail:
                    "Tenant repair workflows are blocked and may require replay or cancellation.",
                  href: adminRoutePath.repairOperations,
                  count: blockedRepairGaps,
                },
              ]),
          ...(pendingBreakGlassIncidents === 0
            ? []
            : [
                {
                  id: "pending-break-glass-incidents",
                  severity: "warning",
                  title: "Break-glass reviews are pending",
                  detail:
                    "Support-safe incident reviews remain open and should be closed after post-incident review.",
                  href: adminRoutePath.supportOperations,
                  count: pendingBreakGlassIncidents,
                },
              ]),
          ...(input.pendingRuntimeConfigProposals === 0
            ? []
            : [
                {
                  id: "pending-runtime-proposals",
                  severity: "info",
                  title: "Runtime proposals are awaiting review",
                  detail:
                    "Operator review is still pending for runtime-governed change proposals.",
                  href: adminRoutePath.runtimeConfig,
                  count: input.pendingRuntimeConfigProposals,
                },
              ]),
          ...(input.pendingBrandingProposals === 0
            ? []
            : [
                {
                  id: "pending-branding-proposals",
                  severity: "info",
                  title: "Branding governance changes are pending",
                  detail:
                    "Tenant-branding runtime proposals are waiting for governance review.",
                  href: adminRoutePath.branding,
                  count: input.pendingBrandingProposals,
                },
              ]),
        ],
        recentActivity,
      }),
    ),
  );
};

const withAdminGovernanceSession = <A, E>(
  environment: unknown,
  sessionId: string,
  use: (input: {
    readonly requestContext: RequestContext;
    readonly service: AdminGovernanceService;
  }) => Effect.Effect<A, E | AdminGovernanceServiceError>,
) =>
  loadAdminGovernanceRuntime().pipe(
    Effect.flatMap(({ runAdminGovernanceFromEnvironment }) =>
      runAdminGovernanceFromEnvironment(environment, (service) =>
        service.resolveRequestContext({ sessionId }).pipe(
          Effect.flatMap((requestContext) =>
            use({
              requestContext,
              service,
            }),
          ),
        ),
      ),
    ),
  );

export const getAdminOperatorCapabilitySnapshotFromSessionId = (
  environment: unknown,
  input: {
    readonly sessionId: string;
  },
) =>
  withAdminGovernanceSession(
    environment,
    input.sessionId,
    ({ requestContext, service }) =>
      service
        .listActionPolicies({
          requestContext,
        })
        .pipe(
          Effect.flatMap((actionPolicies) =>
            buildAdminOperatorCapabilitySnapshot({
              requestContext,
              actionPolicies,
            }),
          ),
        ),
  );

export const getAdminOperationsHomeSummaryFromSessionId = (
  environment: unknown,
  input: {
    readonly sessionId: string;
    readonly recentActivity?: AdminAuditSliceQuery;
  },
) =>
  withAdminGovernanceSession(
    environment,
    input.sessionId,
    ({ requestContext, service }) =>
      service
        .listActionPolicies({
          requestContext,
        })
        .pipe(
          Effect.flatMap((actionPolicies) =>
            buildAdminOperatorCapabilitySnapshot({
              requestContext,
              actionPolicies,
            }),
          ),
          Effect.flatMap((capabilities) =>
            Effect.all({
              capabilities: Effect.succeed(capabilities),
              repairGaps:
                findCapability(
                  capabilities,
                  adminOperatorCapability.repairOperations,
                )?.allowed === true
                  ? loadAdminBillingRuntime().pipe(
                      Effect.flatMap(({ runAdminBillingFromEnvironment }) =>
                        runAdminBillingFromEnvironment(
                          environment,
                          (billingService) =>
                            billingService
                              .listBillingRepairGaps({
                                sessionId: input.sessionId,
                              })
                              .pipe(Effect.map((result) => result.jobs)),
                        ),
                      ),
                    )
                  : Effect.succeed([] as const),
              supportCases: loadSupportOperationsRuntime().pipe(
                Effect.flatMap(({ runSupportOperationsFromEnvironment }) =>
                  Effect.all([
                    runSupportOperationsFromEnvironment(
                      environment,
                      (supportService) =>
                        supportService.listCases({
                          sessionId: input.sessionId,
                          status: supportOperationsCaseStatus.open,
                        }),
                    ),
                    runSupportOperationsFromEnvironment(
                      environment,
                      (supportService) =>
                        supportService.listCases({
                          sessionId: input.sessionId,
                          status: supportOperationsCaseStatus.escalated,
                        }),
                    ),
                  ]).pipe(
                    Effect.map(([openCases, escalatedCases]) => [
                      ...openCases,
                      ...escalatedCases,
                    ]),
                  ),
                ),
              ),
              impersonationSessions: loadSupportOperationsRuntime().pipe(
                Effect.flatMap(({ runSupportOperationsFromEnvironment }) =>
                  runSupportOperationsFromEnvironment(
                    environment,
                    (supportService) =>
                      supportService.listImpersonationSessions({
                        sessionId: input.sessionId,
                      }),
                  ),
                ),
              ),
              breakGlassIncidents: loadSupportOperationsRuntime().pipe(
                Effect.flatMap(({ runSupportOperationsFromEnvironment }) =>
                  runSupportOperationsFromEnvironment(
                    environment,
                    (supportService) =>
                      supportService.listBreakGlassIncidents({
                        sessionId: input.sessionId,
                      }),
                  ),
                ),
              ),
              runtimeConfigProposals: service.listRuntimeConfigProposals({
                requestContext,
                moduleId: platformModuleId.runtimeConfig,
              }),
              brandingProposals: service.listRuntimeConfigProposals({
                requestContext,
                moduleId: platformModuleId.tenantBranding,
              }),
              recentActivityGroups: Effect.all([
                service.queryAuditEventsByModule({
                  requestContext,
                  moduleId: platformModuleId.runtimeConfig,
                }),
                service.queryAuditEventsByModule({
                  requestContext,
                  moduleId: platformModuleId.tenantBranding,
                }),
                service.queryAuditEventsByModule({
                  requestContext,
                  moduleId: platformModuleId.supportOperations,
                }),
                service.queryAuditEventsByModule({
                  requestContext,
                  moduleId: platformModuleId.billingAndMetering,
                }),
              ]),
            }).pipe(
              Effect.flatMap(
                ({
                  capabilities,
                  repairGaps,
                  supportCases,
                  impersonationSessions,
                  breakGlassIncidents,
                  runtimeConfigProposals,
                  brandingProposals,
                  recentActivityGroups,
                }) =>
                  buildAdminOperationsHomeSummary({
                    capabilities,
                    repairGaps,
                    supportCases,
                    impersonationSessions,
                    breakGlassIncidents,
                    pendingRuntimeConfigProposals:
                      runtimeConfigProposals.filter(
                        (proposal) => proposal.status === "pending",
                      ).length,
                    pendingBrandingProposals: brandingProposals.filter(
                      (proposal) => proposal.status === "pending",
                    ).length,
                    recentActivity: recentActivityGroups.flat(),
                    ...(input.recentActivity === undefined
                      ? {}
                      : { recentActivityQuery: input.recentActivity }),
                  }),
              ),
            ),
          ),
        ),
  );

export const getAdminTenantWorkspaceFromSessionId = (
  environment: unknown,
  input: AdminTenantWorkspaceRequest,
) =>
  Schema.decodeUnknown(AdminTenantWorkspaceRequestSchema)(input).pipe(
    Effect.flatMap((request) =>
      withAdminGovernanceSession(
        environment,
        request.sessionId,
        ({ requestContext, service }) =>
          Effect.all({
            capabilities: service
              .listActionPolicies({
                requestContext,
              })
              .pipe(
                Effect.flatMap((actionPolicies) =>
                  buildAdminOperatorCapabilitySnapshot({
                    requestContext,
                    actionPolicies,
                  }),
                ),
              ),
            onboarding: loadAdminTenantManagementRuntime().pipe(
              Effect.flatMap(({ runAdminTenantManagementFromEnvironment }) =>
                runAdminTenantManagementFromEnvironment(
                  environment,
                  (tenantService) =>
                    tenantService.reviewTenantOnboarding({
                      sessionId: request.sessionId,
                      tenant: request.tenant,
                      ...(request.inspectionReason === undefined
                        ? {}
                        : { inspectionReason: request.inspectionReason }),
                    }),
                ),
              ),
            ),
            memberships: loadAdminTenantManagementRuntime().pipe(
              Effect.flatMap(({ runAdminTenantManagementFromEnvironment }) =>
                runAdminTenantManagementFromEnvironment(
                  environment,
                  (tenantService) =>
                    tenantService.listTenantMemberships({
                      sessionId: request.sessionId,
                      tenant: request.tenant,
                      ...(request.inspectionReason === undefined
                        ? {}
                        : { inspectionReason: request.inspectionReason }),
                    }),
                ),
              ),
            ),
            invitations: loadAdminTenantManagementRuntime().pipe(
              Effect.flatMap(({ runAdminTenantManagementFromEnvironment }) =>
                runAdminTenantManagementFromEnvironment(
                  environment,
                  (tenantService) =>
                    tenantService.listTenantInvitations({
                      sessionId: request.sessionId,
                      tenant: request.tenant,
                      ...(request.inspectionReason === undefined
                        ? {}
                        : { inspectionReason: request.inspectionReason }),
                    }),
                ),
              ),
            ),
            billing: loadAdminBillingRuntime().pipe(
              Effect.flatMap(({ runAdminBillingFromEnvironment }) =>
                runAdminBillingFromEnvironment(environment, (billingService) =>
                  billingService.inspectBillingState({
                    sessionId: request.sessionId,
                    tenant: request.tenant,
                    ...(request.inspectionReason === undefined
                      ? {}
                      : { inspectionReason: request.inspectionReason }),
                  }),
                ),
              ),
            ),
            branding: loadTenantBrandingRuntime().pipe(
              Effect.flatMap(({ runTenantBrandingFromEnvironment }) =>
                runTenantBrandingFromEnvironment(
                  environment,
                  (brandingService) =>
                    brandingService.getSupportSafeView({
                      sessionId: request.sessionId,
                      scope:
                        request.tenant.scope === platformScope.enterprise
                          ? platformScope.enterprise
                          : platformScope.organization,
                      scopeId:
                        request.tenant.scope === platformScope.enterprise
                          ? request.tenant.scopeId
                          : (request.tenant.organizationId ??
                            request.tenant.scopeId),
                    }),
                ),
              ),
            ),
            support: loadSupportOperationsRuntime().pipe(
              Effect.flatMap(({ runSupportOperationsFromEnvironment }) =>
                runSupportOperationsFromEnvironment(
                  environment,
                  (supportService) =>
                    supportService.getTenantHealth({
                      sessionId: request.sessionId,
                      tenantScope:
                        request.tenant.scope === "platform"
                          ? "organization"
                          : request.tenant.scope,
                      tenantScopeId: request.tenant.scopeId,
                    }),
                ),
              ),
            ),
            audit: service.queryAuditEventsByTenant({
              requestContext,
              tenantScope: request.tenant.scope,
              tenantScopeId: request.tenant.scopeId,
            }),
          }).pipe(
            Effect.flatMap(
              ({
                capabilities,
                onboarding,
                memberships,
                invitations,
                billing,
                branding,
                support,
                audit,
              }) =>
                buildAuditSlice(audit, request.audit).pipe(
                  Effect.flatMap((auditSlice) =>
                    decodeAdminTenantWorkspace({
                      capabilities,
                      tenant: request.tenant,
                      onboarding,
                      memberships: memberships.memberships,
                      invitations: invitations.invitations,
                      billing: billing.billing,
                      branding,
                      support,
                      audit: auditSlice,
                    }),
                  ),
                ),
            ),
          ),
      ),
    ),
  );

export const buildAdminTenantWorkspaceProjection = (input: {
  readonly capabilities: Schema.Schema.Type<
    typeof AdminOperatorCapabilitySnapshotSchema
  >;
  readonly tenant: TenantContext;
  readonly onboarding: Schema.Schema.Type<
    typeof AdminTenantOnboardingReviewResultSchema
  >;
  readonly memberships: Schema.Schema.Type<
    typeof AdminTenantMembershipQueryResultSchema
  >["memberships"];
  readonly invitations: Schema.Schema.Type<
    typeof AdminTenantInvitationQueryResultSchema
  >["invitations"];
  readonly billing: Schema.Schema.Type<typeof BillingSummaryViewSchema>;
  readonly branding: Schema.Schema.Type<
    typeof TenantBrandingSupportSafeViewSchema
  >;
  readonly support: Schema.Schema.Type<
    typeof SupportOperationsTenantHealthViewSchema
  >;
  readonly audit: AdminAuditSlice;
}) =>
  decodeAdminTenantWorkspace({
    capabilities: input.capabilities,
    tenant: input.tenant,
    onboarding: input.onboarding,
    memberships: input.memberships,
    invitations: input.invitations,
    billing: input.billing,
    branding: input.branding,
    support: input.support,
    audit: input.audit,
  });

export const listAdminAuthorizationTuplesFromSessionId = (
  environment: unknown,
  input: {
    readonly sessionId: string;
    readonly query: AdminGovernanceAuthorizationTupleQuery;
  },
) =>
  withAdminGovernanceSession(
    environment,
    input.sessionId,
    ({ requestContext, service }) =>
      service.listAuthorizationTuples({
        requestContext,
        query: input.query,
      }),
  );

export const deleteAdminAuthorizationTupleFromSessionId = (
  environment: unknown,
  input: {
    readonly sessionId: string;
    readonly tuple: AdminGovernanceAuthorizationTupleView;
    readonly reason: string;
  },
) =>
  withAdminGovernanceSession(
    environment,
    input.sessionId,
    ({ requestContext, service }) =>
      service.deleteAuthorizationTuple({
        requestContext,
        tuple: input.tuple,
        reason: input.reason,
      }),
  );

export const listAdminGovernanceProjectionProfilesFromSessionId = (
  environment: unknown,
  input: {
    readonly sessionId: string;
    readonly moduleId?: PlatformModuleId;
  },
) =>
  withAdminGovernanceSession(
    environment,
    input.sessionId,
    ({ requestContext, service }) =>
      service.listProjectionProfiles({
        requestContext,
        ...(input.moduleId === undefined ? {} : { moduleId: input.moduleId }),
      }),
  );

export const listAdminGovernanceActionPoliciesFromSessionId = (
  environment: unknown,
  input: {
    readonly sessionId: string;
  },
) =>
  withAdminGovernanceSession(
    environment,
    input.sessionId,
    ({ requestContext, service }) =>
      service.listActionPolicies({
        requestContext,
      }),
  );
