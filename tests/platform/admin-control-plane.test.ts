import { Effect, Schema } from "effect";
import {
  actorType,
  AdminGovernanceActionPolicyMetadataListSchema,
  adminGovernanceActionPolicyId,
  adminGovernanceActionPolicySeverity,
  adminOperatorCapability,
  adminRoutePath,
  adminQuerySortDirection,
  customDomainLifecycleState,
  platformModuleId,
  platformScope,
  projectionProfile,
  runtimeConfigAuditAction,
  supportOperationsBreakGlassIncidentStatus,
  supportOperationsCasePriority,
  supportOperationsCaseStatus,
  supportOperationsImpersonationSessionStatus,
  workflowJobStatus,
} from "@comvestec/contracts";
import {
  buildAdminOperationsHomeSummary,
  buildAdminOperatorCapabilitySnapshot,
  buildAdminTenantWorkspaceProjection,
} from "@comvestec/platform";

const actionPolicies = Schema.validateSync(
  AdminGovernanceActionPolicyMetadataListSchema,
)([
  {
    actionId: adminGovernanceActionPolicyId.authorizationTupleWrite,
    label: "Grant authorization tuple",
    description: "Grant reviewed tenant access.",
    severity: adminGovernanceActionPolicySeverity.guarded,
    projectionProfile: projectionProfile.admin,
    requiresReason: true,
    requiresComment: false,
    stepUpRequired: false,
    reasonOptions: [
      {
        value: "reviewed-access-request",
        label: "Reviewed access request",
        description: "The request was reviewed before the grant.",
      },
    ],
  },
  {
    actionId: adminGovernanceActionPolicyId.breakGlassIncidentReview,
    label: "Review break-glass incident",
    description: "Close the reviewed incident.",
    severity: adminGovernanceActionPolicySeverity.highRisk,
    projectionProfile: projectionProfile.supportSafe,
    requiresReason: true,
    requiresComment: true,
    stepUpRequired: false,
    reasonOptions: [
      {
        value: "incident-closed",
        label: "Incident closed",
        description: "The break-glass review is complete.",
      },
    ],
  },
  {
    actionId: adminGovernanceActionPolicyId.repairGapInspection,
    label: "Reveal repair details",
    description: "Reveal redacted repair details.",
    severity: adminGovernanceActionPolicySeverity.guarded,
    projectionProfile: projectionProfile.admin,
    requiresReason: true,
    requiresComment: false,
    stepUpRequired: false,
    reasonOptions: [
      {
        value: "operator-investigation",
        label: "Operator investigation",
        description: "The operator is investigating the workflow failure.",
      },
    ],
  },
]);

describe("admin control-plane helpers", () => {
  it("derives a backend-backed capability snapshot for platform operators", async () => {
    const snapshot = await Effect.runPromise(
      buildAdminOperatorCapabilitySnapshot({
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_platform_operator",
          correlationId: "corr_admin_control_plane_platform",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
        actionPolicies,
      }),
    );

    expect(
      snapshot.capabilities.find(
        (capability) =>
          capability.capability === adminOperatorCapability.repairOperations,
      ),
    ).toMatchObject({
      allowed: true,
      visible: true,
      routePath: adminRoutePath.repairOperations,
      actionPolicyIds: [adminGovernanceActionPolicyId.repairGapInspection],
    });
  });

  it("hides platform-only capabilities for support operators", async () => {
    const snapshot = await Effect.runPromise(
      buildAdminOperatorCapabilitySnapshot({
        requestContext: {
          actorType: actorType.supportOperator,
          actorId: "usr_support_operator",
          sessionId: "sess_support_operator",
          correlationId: "corr_admin_control_plane_support",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
        actionPolicies,
      }),
    );

    expect(
      snapshot.capabilities.find(
        (capability) =>
          capability.capability === adminOperatorCapability.billing,
      ),
    ).toMatchObject({
      allowed: false,
      visible: false,
    });
    expect(
      snapshot.capabilities.find(
        (capability) =>
          capability.capability === adminOperatorCapability.supportOperations,
      ),
    ).toMatchObject({
      allowed: true,
      visible: true,
      actionPolicyIds: [adminGovernanceActionPolicyId.breakGlassIncidentReview],
    });
  });

  it("builds an operations-home posture summary with alerts and recent activity paging", async () => {
    const capabilities = await Effect.runPromise(
      buildAdminOperatorCapabilitySnapshot({
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_platform_operator",
          correlationId: "corr_admin_control_plane_summary",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
        actionPolicies,
      }),
    );

    const summary = await Effect.runPromise(
      buildAdminOperationsHomeSummary({
        capabilities,
        repairGaps: [
          {
            jobId: "workflow-jobs:billing-repair:organization:org_demo",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_demo",
            status: workflowJobStatus.blocked,
            attempts: 2,
            scheduledAt: "2026-05-12T12:00:00.000Z",
          },
        ],
        supportCases: [
          {
            status: supportOperationsCaseStatus.open,
          },
        ],
        impersonationSessions: [
          {
            status:
              supportOperationsImpersonationSessionStatus.revocationPending,
          },
        ],
        breakGlassIncidents: [
          {
            status: supportOperationsBreakGlassIncidentStatus.pendingReview,
          },
        ],
        pendingRuntimeConfigProposals: 1,
        pendingBrandingProposals: 0,
        recentActivity: [
          {
            eventId: "audit_evt_runtime",
            timestamp: "2026-05-12T12:05:00.000Z",
            actorId: "usr_platform_operator",
            tenantScope: platformScope.platform,
            tenantScopeId: platformScope.platform,
            moduleId: platformModuleId.runtimeConfig,
            action: runtimeConfigAuditAction.overrideChanged,
            target: "runtime-config:tenant-branding",
            correlationId: "corr_admin_control_plane_summary",
          },
        ],
        recentActivityQuery: {
          page: {
            page: 1,
            pageSize: 5,
          },
          sortDirection: adminQuerySortDirection.desc,
          exportMode: false,
        },
      }),
    );

    expect(summary.posture.blockedRepairGaps).toBe(1);
    expect(summary.posture.pendingBreakGlassIncidents).toBe(1);
    expect(summary.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "blocked-repair-gaps",
          href: adminRoutePath.repairOperations,
        }),
        expect.objectContaining({
          id: "pending-break-glass-incidents",
        }),
      ]),
    );
    expect(summary.recentActivity.pageInfo.totalItems).toBe(1);
  });

  it("builds a tenant-workspace aggregate projection", async () => {
    const capabilities = await Effect.runPromise(
      buildAdminOperatorCapabilitySnapshot({
        requestContext: {
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_platform_operator",
          correlationId: "corr_admin_control_plane_workspace",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
        actionPolicies,
      }),
    );

    const summary = await Effect.runPromise(
      buildAdminOperationsHomeSummary({
        capabilities,
        repairGaps: [],
        supportCases: [],
        impersonationSessions: [],
        breakGlassIncidents: [],
        pendingRuntimeConfigProposals: 0,
        pendingBrandingProposals: 0,
        recentActivity: [],
      }),
    );

    const workspace = await Effect.runPromise(
      buildAdminTenantWorkspaceProjection({
        capabilities,
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_demo",
          organizationId: "org_demo",
        },
        onboarding: {
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_demo",
            organizationId: "org_demo",
          },
        },
        memberships: [],
        invitations: [],
        billing: {},
        branding: {
          scope: platformScope.organization,
          scopeId: "org_demo",
          companyName: "Acme Organization",
          customDomainStatus: customDomainLifecycleState.active,
          effectiveScope: platformScope.organization,
        },
        support: {
          tenantScope: platformScope.organization,
          tenantScopeId: "org_demo",
          cases: [
            {
              caseId: "case_support_1",
              supportAgent: "usr_support_operator",
              tenantScope: platformScope.organization,
              tenantScopeId: "org_demo",
              summary: "Investigate tenant issue",
              status: supportOperationsCaseStatus.open,
              priority: supportOperationsCasePriority.normal,
              startedAt: "2026-05-12T10:00:00.000Z",
              lastUpdatedAt: "2026-05-12T10:30:00.000Z",
            },
          ],
          repairGaps: [],
        },
        audit: summary.recentActivity,
      }),
    );

    expect(workspace.tenant.scopeId).toBe("org_demo");
    expect(workspace.branding.companyName).toBe("Acme Organization");
    expect(workspace.support.cases).toHaveLength(1);
  });
});
