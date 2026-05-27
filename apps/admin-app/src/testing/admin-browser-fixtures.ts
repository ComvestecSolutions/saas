import {
  actorType,
  adminMemberRole,
  adminMemberStatus,
  adminNavigationKey,
  adminOperatorTestTokensAuditAction,
  adminOrganizationAuditAction,
  adminOrgRole,
  adminSavedViewResourceKind,
  type AdminOperatorCapabilitySnapshot,
  type AdminSavedView,
  adminWorkspacesAuditAction,
  adminGovernanceActionPolicyId,
  adminOperatorCapability,
  adminRoutePath,
  auditLogAuditAction,
  authorizationAuditAction,
  authorizationNamespace,
  authorizationRelation,
  billingAndMeteringAuditAction,
  billingPlanInterval,
  billingSubscriptionStatus,
  customDomainLifecycleState,
  featureFlagLifecycle,
  onboardingStepStatus,
  permissionScope,
  permissionScopes,
  persistedConfigSource,
  platformAdapterServiceName,
  platformModuleId,
  platformScope,
  projectionProfile,
  notificationChannel,
  notificationCenterAdminAuditAction,
  notificationDeliveryStatus,
  operationsHomeAlertSeverity,
  operationsHomeSnapshotSection,
  operationsHomeVendorPostureLevel,
  operatorWebhookDeliveryAuditAction,
  workflowRunStatus,
  manualBreakGlassAuditAction,
  retentionDataType,
  retentionLegalHoldAuditAction,
  retentionLegalHoldStatus,
  runtimeChangeProposalAction,
  runtimeConfigAuditAction,
  runtimeResolutionSource,
  runAsBannerStateAuditAction,
  supportOperationsAuditAction,
  supportOperationsBreakGlassIncidentStatus,
  supportOperationsCasePriority,
  supportOperationsCaseStatus,
  supportOperationsImpersonationSessionStatus,
  tenantInvitationStatus,
  tenantBrandingAuditAction,
  tenantManagementAuditAction,
  tenantMembershipMutationAction,
  tenantMembershipRelations,
  tenantOnboardingRunStatus,
  webhookApiKeyStatus,
  webhookSubscriptionStatus,
  operatorWebhookDeliveryStatus,
  type OperatorWebhookDelivery,
  webhooksApiAccessAuditAction,
  workflowJobGapReason,
  workflowJobStatus,
  workflowJobsAuditAction,
  workflowRunsAdminAuditAction,
  type RunAsBannerState,
} from "@comvestec/contracts";
import {
  auditLogFields,
  authorizationFields,
  runtimeConfigFields,
} from "@comvestec/config";
import {
  buildAdminTenantContext,
  sanitizeAdminTenantTargetScope,
  serializeAdminTenantTarget,
  type AdminTenantTarget,
} from "../lib/admin-tenant-target";
import type {
  AdminAccessControlLoaderInput,
  AdminAccessControlRouteData,
} from "../lib/access-control-route-data";
import type { AdminAuditLogRouteData } from "../lib/audit-log-route-data";
import type { AdminAuditLogV2RouteData } from "../lib/audit-log-v2-route-data";
import type { AdminAuditLogV2RawSearch } from "../lib/audit-log-v2-search";
import type { AdminBillingRouteData } from "../lib/billing-route-data";
import type {
  AdminBillingListInput,
  AdminBillingListRouteData,
} from "../lib/billing-list-route-data";
import type {
  AdminInvoiceDetailInput,
  AdminInvoiceDetailRouteData,
} from "../lib/invoice-detail-route-data";
import type {
  AdminMeterDetailInput,
  AdminMeterDetailRouteData,
} from "../lib/meter-detail-route-data";
import type {
  AdminKeycloakUserDetailInput,
  AdminKeycloakUserDetailRouteData,
} from "../lib/keycloak-user-detail-route-data";
import type {
  AdminKeycloakRoleDetailInput,
  AdminKeycloakRoleDetailRouteData,
} from "../lib/keycloak-role-detail-route-data";
import type {
  AdminBrandingListInput,
  AdminBrandingListRouteData,
} from "../lib/branding-list-route-data";
import type {
  AdminDomainDetailInput,
  AdminDomainDetailRouteData,
} from "../lib/domain-detail-route-data";
import type { AdminBrandingRouteData } from "../lib/branding-route-data";
import type { AdminFeatureFlagsRouteData } from "../lib/feature-flags-route-data";
import type {
  AdminGovernanceAccessV2Input,
  AdminGovernanceAccessV2RouteData,
} from "../lib/governance-access-route-data";
import type {
  AdminGovernanceConfigV2Input,
  AdminGovernanceConfigV2RouteData,
} from "../lib/governance-config-route-data";
import type {
  AdminGovernanceFlagV2Input,
  AdminGovernanceFlagV2RouteData,
} from "../lib/governance-flag-route-data";
import type { AdminRuntimeConfigRouteData } from "../lib/runtime-config-route-data";
import type { AdminShellRouteData } from "../lib/admin-shell-route-data";
import type { AdminSupportOperationsRouteData } from "../lib/support-operations-route-data";
import type {
  AdminSupportCasesInput,
  AdminSupportCasesRouteData,
} from "../lib/support-cases-route-data";
import type {
  AdminIncidentDetailInput,
  AdminIncidentDetailRouteData,
} from "../lib/incident-detail-route-data";
import type {
  AdminRetentionListInput,
  AdminRetentionListRouteData,
} from "../lib/retention-list-route-data";
import type {
  AdminLegalHoldDetailInput,
  AdminLegalHoldDetailRouteData,
} from "../lib/legal-hold-detail-route-data";
import type {
  AdminWebhookListInput,
  AdminWebhookListRouteData,
} from "../lib/webhook-list-route-data";
import type {
  AdminDeliveryDetailInput,
  AdminDeliveryDetailRouteData,
} from "../lib/delivery-detail-route-data";
import type {
  AdminApiKeyDetailInput,
  AdminApiKeyDetailRouteData,
} from "../lib/api-key-detail-route-data";
import type { AdminVendorListRouteData } from "../lib/vendor-list-route-data";
import type {
  AdminVendorDetailInput,
  AdminVendorDetailRouteData,
} from "../lib/vendor-detail-route-data";
import type {
  AdminNotifyListInput,
  AdminNotifyListRouteData,
} from "../lib/notify-list-route-data";
import type {
  AdminNotifyDetailInput,
  AdminNotifyDetailRouteData,
} from "../lib/notify-detail-route-data";
import type {
  AdminProfileInput,
  AdminProfileRouteData,
} from "../lib/admin-profile-route-data";
import type {
  AdminMembersInput,
  AdminMembersRouteData,
} from "../lib/admin-members-route-data";
import type {
  AdminMemberDetailInput,
  AdminMemberDetailRouteData,
} from "../lib/admin-member-detail-route-data";
import type {
  AdminTokensInput,
  AdminTokensRouteData,
} from "../lib/admin-tokens-route-data";
import type {
  AdminWorkspacesInput,
  AdminWorkspacesRouteData,
} from "../lib/admin-workspaces-route-data";
import type {
  AdminAuditInput,
  AdminAuditRouteData,
} from "../lib/admin-audit-route-data";
import type {
  AdminWorkflowRunsListInput,
  AdminWorkflowRunsListRouteData,
} from "../lib/workflow-runs-list-route-data";
import type {
  AdminWorkflowRunDetailInput,
  AdminWorkflowRunDetailRouteData,
} from "../lib/workflow-run-detail-route-data";
import type {
  AdminTenantRepairRouteData,
  AdminTenantRepairRouteLoaderInput,
} from "../lib/tenant-repair-route-data";
import type { AdminTenantWorkspaceIndexRouteData } from "../lib/tenant-workspace-index-route-data";
import type { AdminTenantWorkspace } from "@comvestec/platform";
import type {
  AdminUniversalSearchInput,
  AdminUniversalSearchRouteData,
} from "../lib/universal-search-route-data";
import type {
  AdminTenantWorkspaceV2LoaderInput,
  AdminTenantWorkspaceV2RouteData,
} from "../lib/tenant-workspace-v2-route-data";
import type { AdminCapabilitySnapshotV2RouteData } from "../lib/capability-snapshot-v2-route-data";
import type {
  AdminTenantsDirectoryRouteData,
  AdminTenantsDirectoryRow,
} from "../lib/tenants-directory-route-data";
import { tenantDirectoryFixture } from "../desk/fixtures/tenants";
import { resolveAdminTenantTargetDisplayName } from "../lib/admin-tenant-target-display-name";
import type { AdminComplianceRetentionRouteData } from "../lib/compliance-retention-route-data";
import type { AdminWebhooksApiAccessRouteData } from "../lib/webhooks-api-access-route-data";
import type {
  AdminOperationsHomeRouteData,
  AdminOperationsHomeRouteSnapshot,
} from "../lib/operations-home-route-data";

type Ready<T> = Extract<T, { readonly kind: "ready" }>;

type ShellReadyData = Ready<AdminShellRouteData>;
type RepairReadyData = Ready<AdminTenantRepairRouteData>;
type RepairJob = RepairReadyData["jobs"][number];
type OperationsSummary = RepairReadyData["summary"];
type OperationsSummaryAlert = OperationsSummary["alerts"][number];
type OperationsRecentActivity = OperationsSummary["recentActivity"];
type SupportReadyData = Ready<AdminSupportOperationsRouteData>;
type SupportCase = SupportReadyData["cases"][number];
type BreakGlassIncident = SupportReadyData["incidents"][number];
type ImpersonationSession = SupportReadyData["impersonationSessions"][number];
type RuntimeConfigReadyData = Ready<AdminRuntimeConfigRouteData>;
type RuntimeOverride = RuntimeConfigReadyData["overrides"][number];
type RuntimeProposal = RuntimeConfigReadyData["proposals"][number];
type FeatureFlagsReadyData = Ready<AdminFeatureFlagsRouteData>;
type FeatureFlag = FeatureFlagsReadyData["flags"][number];
type AccessControlReadyData = Ready<AdminAccessControlRouteData>;
type ProjectionProfileView = AccessControlReadyData["profiles"][number];
type ActionPolicy = AccessControlReadyData["actionPolicies"][number];
type AuthorizationTuple = NonNullable<
  AccessControlReadyData["tupleQuery"]
>["items"][number];
type AuthorizationTupleQuery = NonNullable<
  AccessControlReadyData["tupleQuery"]
>;
type AuditLogReadyData = Ready<AdminAuditLogRouteData>;
type AuditEvent = AuditLogReadyData["events"][number];
type BillingReadyData = Ready<AdminBillingRouteData>;
type BillingGap = BillingReadyData["gaps"][number];
type TenantWorkspaceIndexReadyData = Ready<AdminTenantWorkspaceIndexRouteData>;
type TenantWorkspaceTarget = TenantWorkspaceIndexReadyData["targets"][number];
type TenantWorkspace = AdminTenantWorkspace;
type BrandingReadyData = Ready<AdminBrandingRouteData>;
type BrandingView = BrandingReadyData["branding"];
type ComplianceReadyData = Ready<AdminComplianceRetentionRouteData>;
type RetentionPolicy = ComplianceReadyData["policies"][number];
type LegalHold = ComplianceReadyData["holds"][number];
type WebhooksReadyData = Ready<AdminWebhooksApiAccessRouteData>;
type WebhookSubscription = WebhooksReadyData["subscriptions"][number];
type WebhookApiKey = WebhooksReadyData["apiKeys"][number];

type BrandingMap = Record<string, BrandingView>;
type ComplianceMap = Record<
  string,
  {
    readonly policies: readonly RetentionPolicy[];
    readonly holds: readonly LegalHold[];
  }
>;
type WebhooksMap = Record<
  string,
  {
    readonly subscriptions: readonly WebhookSubscription[];
    readonly apiKeys: readonly WebhookApiKey[];
  }
>;
type WorkspaceMap = Record<string, TenantWorkspace>;

const operatorTargets = {
  organization: {
    scope: platformScope.organization,
    scopeId: "org_demo",
  },
  enterprise: {
    scope: platformScope.enterprise,
    scopeId: "ent_atlas",
  },
  individual: {
    scope: platformScope.individual,
    scopeId: "ind_solo",
  },
} as const satisfies Record<string, AdminTenantTarget>;

const targetKey = (target: AdminTenantTarget): string =>
  serializeAdminTenantTarget(target);

const orgTargetKey = targetKey(operatorTargets.organization);
const entTargetKey = targetKey(operatorTargets.enterprise);

const generatedTenantTargets: readonly AdminTenantTarget[] = Array.from(
  { length: 14 },
  (_, offset) => {
    const index = offset + 3;
    const scope =
      index % 2 === 0 ? platformScope.enterprise : platformScope.organization;

    return {
      scope,
      scopeId: `${scope.replace(/-/g, "_")}_tenant_${String(index).padStart(2, "0")}`,
    };
  },
);

const workspaceTenantTargets: readonly AdminTenantTarget[] = [
  operatorTargets.organization,
  operatorTargets.enterprise,
  ...generatedTenantTargets,
];

const formatFixtureTenantName = (target: AdminTenantTarget): string =>
  target.scopeId
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const timestamp = (day: number, hour: number, minute: number): string =>
  `2026-05-${String(day).padStart(2, "0")}T${String(hour).padStart(
    2,
    "0",
  )}:${String(minute).padStart(2, "0")}:00.000Z`;

const runtimeConfigArtifactStatus = {
  pending: "pending",
  approved: "approved",
  applied: "applied",
  rejected: "rejected",
} as const;

const repairStatuses = [
  workflowJobStatus.blocked,
  workflowJobStatus.scheduled,
  workflowJobStatus.running,
  workflowJobStatus.completed,
  workflowJobStatus.canceled,
] as const;

const capabilitySnapshot: AdminOperatorCapabilitySnapshot = {
  actorType: actorType.platformOperator,
  actorId: "usr_platform_operator",
  sessionId: "sess_admin_browser",
  capabilities: [
    {
      capability: adminOperatorCapability.operationsHome,
      routePath: adminRoutePath.operationsHome,
      visible: true,
      allowed: true,
      label: "Operations Home",
      actionPolicyIds: [],
    },
    {
      capability: adminOperatorCapability.repairOperations,
      routePath: adminRoutePath.repairOperations,
      visible: true,
      allowed: true,
      label: "Repair Operations",
      actionPolicyIds: [adminGovernanceActionPolicyId.repairGapInspection],
    },
    {
      capability: adminOperatorCapability.tenantWorkspace,
      routePath: adminRoutePath.tenantWorkspaceDiscovery,
      visible: true,
      allowed: true,
      label: "Tenant Workspace",
      actionPolicyIds: [],
    },
    {
      capability: adminOperatorCapability.runtimeConfig,
      routePath: adminRoutePath.runtimeConfig,
      visible: true,
      allowed: true,
      label: "Runtime Config",
      actionPolicyIds: [
        adminGovernanceActionPolicyId.runtimeConfigProposalSubmit,
        adminGovernanceActionPolicyId.runtimeConfigProposalReview,
      ],
    },
    {
      capability: adminOperatorCapability.featureFlags,
      routePath: adminRoutePath.featureFlags,
      visible: true,
      allowed: true,
      label: "Feature Flags",
      actionPolicyIds: [],
    },
    {
      capability: adminOperatorCapability.accessControl,
      routePath: adminRoutePath.accessControl,
      visible: true,
      allowed: true,
      label: "Access Control",
      actionPolicyIds: [adminGovernanceActionPolicyId.authorizationTupleDelete],
    },
    {
      capability: adminOperatorCapability.auditLog,
      routePath: adminRoutePath.auditLog,
      visible: true,
      allowed: true,
      label: "Audit Log",
      actionPolicyIds: [],
    },
    {
      capability: adminOperatorCapability.supportOperations,
      routePath: adminRoutePath.supportOperations,
      visible: true,
      allowed: true,
      label: "Support Operations",
      actionPolicyIds: [adminGovernanceActionPolicyId.breakGlassIncidentReview],
    },
    {
      capability: adminOperatorCapability.branding,
      routePath: adminRoutePath.branding,
      visible: true,
      allowed: true,
      label: "Branding & Domains",
      actionPolicyIds: [],
    },
    {
      capability: adminOperatorCapability.billing,
      routePath: adminRoutePath.billing,
      visible: true,
      allowed: true,
      label: "Billing & Entitlements",
      actionPolicyIds: [],
    },
    {
      capability: adminOperatorCapability.complianceRetention,
      routePath: adminRoutePath.complianceRetention,
      visible: true,
      allowed: true,
      label: "Compliance & Retention",
      actionPolicyIds: [],
    },
    {
      capability: adminOperatorCapability.webhooksApiAccess,
      routePath: adminRoutePath.webhooksApiAccess,
      visible: true,
      allowed: true,
      label: "Webhooks & API Access",
      actionPolicyIds: [],
    },
  ],
};

const operatorProfile: ShellReadyData["profile"] = {
  identity: {
    actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
    username: "operator@comvestec.com",
    email: "operator@comvestec.com",
    displayName: "Comvestec Platform Operator",
    actorType: actorType.platformOperator,
    enabled: true,
  },
  sessionId: capabilitySnapshot.sessionId ?? "sess_admin_browser",
  capabilities: capabilitySnapshot.capabilities,
};

const operatorDirectory: AccessControlReadyData["operatorDirectory"] = {
  currentOperator: operatorProfile,
  operators: [
    operatorProfile.identity,
    {
      actorId: "usr_support_operator",
      username: "support@comvestec.com",
      email: "support@comvestec.com",
      displayName: "Comvestec Support Operator",
      actorType: actorType.supportOperator,
      enabled: true,
    },
  ],
};

const buildRepairJob = (input: {
  readonly index: number;
  readonly target: AdminTenantTarget;
  readonly status: RepairJob["status"];
  readonly lastError?: string;
  readonly gapReason?: RepairJob["gapReason"];
}): RepairJob => ({
  jobId: `job_${input.target.scopeId}_${String(input.index).padStart(2, "0")}`,
  tenantScope: input.target.scope,
  tenantScopeId: input.target.scopeId,
  status: input.status,
  attempts: (input.index % 4) + 1,
  scheduledAt: timestamp(10 + (input.index % 10), 8 + (input.index % 8), 5),
  ...(input.status === workflowJobStatus.completed
    ? {
        completedAt: timestamp(
          10 + (input.index % 10),
          9 + (input.index % 8),
          15,
        ),
      }
    : {}),
  ...(input.gapReason === undefined ? {} : { gapReason: input.gapReason }),
  ...(input.lastError === undefined ? {} : { lastError: input.lastError }),
});

const createRepairJobs = (): RepairJob[] => {
  const seeded: RepairJob[] = [
    buildRepairJob({
      index: 1,
      target: operatorTargets.organization,
      status: workflowJobStatus.blocked,
      gapReason: workflowJobGapReason.missingCustomerAccount,
      lastError: "Polar customer record is missing for org_demo.",
    }),
    buildRepairJob({
      index: 2,
      target: operatorTargets.organization,
      status: workflowJobStatus.scheduled,
      gapReason: workflowJobGapReason.missingSubscriptionState,
    }),
    buildRepairJob({
      index: 3,
      target: operatorTargets.enterprise,
      status: workflowJobStatus.running,
      gapReason: workflowJobGapReason.missingSubscriptionState,
      lastError: "Subscription state is still reconciling for ent_atlas.",
    }),
    buildRepairJob({
      index: 4,
      target: operatorTargets.organization,
      status: workflowJobStatus.canceled,
      gapReason: workflowJobGapReason.missingCustomerAccount,
    }),
    buildRepairJob({
      index: 5,
      target: operatorTargets.individual,
      status: workflowJobStatus.completed,
      gapReason: workflowJobGapReason.missingSubscriptionState,
    }),
  ];

  for (let index = 6; index <= 32; index += 1) {
    const target =
      index % 3 === 0
        ? operatorTargets.enterprise
        : index % 3 === 1
          ? operatorTargets.organization
          : operatorTargets.individual;
    const status =
      repairStatuses[index % repairStatuses.length] ??
      workflowJobStatus.blocked;
    seeded.push(
      buildRepairJob({
        index,
        target,
        status,
        gapReason:
          index % 2 === 0
            ? workflowJobGapReason.missingCustomerAccount
            : workflowJobGapReason.missingSubscriptionState,
        ...(status === workflowJobStatus.blocked
          ? {
              lastError: `Workflow stalled at gate ${index} for ${target.scopeId}.`,
            }
          : {}),
      }),
    );
  }

  return seeded;
};

const createSupportCases = (): SupportCase[] => {
  const cases: SupportCase[] = [
    {
      caseId: "case_org_priority",
      supportAgent: "usr_support_lead",
      tenantScope: operatorTargets.organization.scope,
      tenantScopeId: operatorTargets.organization.scopeId,
      summary: "Organization billing outage follow-up",
      status: supportOperationsCaseStatus.escalated,
      priority: supportOperationsCasePriority.high,
      startedAt: timestamp(13, 8, 0),
      lastUpdatedAt: timestamp(13, 8, 45),
    },
    {
      caseId: "case_ent_onboarding",
      supportAgent: "usr_support_operator",
      tenantScope: operatorTargets.enterprise.scope,
      tenantScopeId: operatorTargets.enterprise.scopeId,
      summary: "Enterprise onboarding workflow needs review",
      status: supportOperationsCaseStatus.open,
      priority: supportOperationsCasePriority.normal,
      startedAt: timestamp(12, 9, 0),
      lastUpdatedAt: timestamp(12, 9, 30),
    },
  ];

  for (let index = 3; index <= 28; index += 1) {
    const target =
      index % 2 === 0
        ? operatorTargets.organization
        : operatorTargets.enterprise;
    const status =
      index % 3 === 0
        ? supportOperationsCaseStatus.resolved
        : index % 3 === 1
          ? supportOperationsCaseStatus.open
          : supportOperationsCaseStatus.escalated;
    const priority =
      index % 3 === 0
        ? supportOperationsCasePriority.low
        : index % 3 === 1
          ? supportOperationsCasePriority.normal
          : supportOperationsCasePriority.high;

    cases.push({
      caseId: `case_${target.scopeId}_${String(index).padStart(2, "0")}`,
      supportAgent: `usr_support_${String((index % 4) + 1)}`,
      tenantScope: target.scope,
      tenantScopeId: target.scopeId,
      summary: `${target.scopeId} support issue ${index}`,
      status,
      priority,
      startedAt: timestamp(10 + (index % 10), 7 + (index % 8), 0),
      lastUpdatedAt: timestamp(10 + (index % 10), 7 + (index % 8), 30),
    });
  }

  return cases;
};

const createBreakGlassIncidents = (): BreakGlassIncident[] =>
  Array.from({ length: 14 }, (_, offset) => ({
    caseId: `incident_case_${String(offset + 1).padStart(2, "0")}`,
    status:
      offset % 2 === 0
        ? supportOperationsBreakGlassIncidentStatus.pendingReview
        : supportOperationsBreakGlassIncidentStatus.reviewed,
    startedAt: timestamp(8 + (offset % 8), 10, 0),
    approvedBy: `usr_platform_operator_${(offset % 3) + 1}`,
    reason:
      offset % 2 === 0
        ? "Support escalation requires protected-record access."
        : "Incident review has been completed.",
    expiresAt: timestamp(18 + (offset % 8), 10, 0),
  }));

const createImpersonationSessions = (): ImpersonationSession[] =>
  Array.from({ length: 14 }, (_, offset) => ({
    caseId: `impersonation_case_${String(offset + 1).padStart(2, "0")}`,
    status:
      offset % 3 === 0
        ? supportOperationsImpersonationSessionStatus.active
        : offset % 3 === 1
          ? supportOperationsImpersonationSessionStatus.revocationPending
          : supportOperationsImpersonationSessionStatus.revoked,
    startedAt: timestamp(9 + (offset % 9), 11, 15),
  }));

const createRuntimeOverrides = (): RuntimeOverride[] =>
  Array.from({ length: 30 }, (_, offset) => ({
    moduleId:
      offset % 2 === 0
        ? platformModuleId.runtimeConfig
        : platformModuleId.featureFlags,
    key:
      offset % 2 === 0
        ? `${platformModuleId.runtimeConfig}.session.timeout-${offset + 1}`
        : `${platformModuleId.featureFlags}.rollout.bucket-${offset + 1}`,
    scope:
      offset % 3 === 0
        ? platformScope.organization
        : offset % 3 === 1
          ? platformScope.enterprise
          : platformScope.individual,
    scopeId: `scope_${String(offset + 1).padStart(2, "0")}`,
    value: offset % 2 === 0 ? String(15 + offset) : `cohort-${offset + 1}`,
    source:
      offset % 2 === 0
        ? persistedConfigSource.runtimeOverride
        : persistedConfigSource.codeDefault,
    changedBy: `usr_platform_operator_${(offset % 4) + 1}`,
    changedAt: timestamp(9 + (offset % 10), 12, offset % 60),
  }));

const createRuntimeProposals = (): RuntimeProposal[] =>
  Array.from({ length: 28 }, (_, offset) => ({
    proposalId: `proposal_${String(offset + 1).padStart(2, "0")}`,
    moduleId:
      offset % 2 === 0
        ? platformModuleId.runtimeConfig
        : platformModuleId.featureFlags,
    key:
      offset % 2 === 0
        ? `${platformModuleId.runtimeConfig}.proposal.timeout-${offset + 1}`
        : `${platformModuleId.featureFlags}.proposal.rollout-${offset + 1}`,
    scope:
      offset % 3 === 0
        ? platformScope.organization
        : offset % 3 === 1
          ? platformScope.enterprise
          : undefined,
    scopeId:
      offset % 3 === 2 ? undefined : `proposal_scope_${String(offset + 1)}`,
    value: offset % 2 === 0 ? String(20 + offset) : `preview-${offset + 1}`,
    source: persistedConfigSource.runtimeOverride,
    changedBy: `usr_platform_operator_${(offset % 3) + 1}`,
    changedAt: timestamp(11 + (offset % 8), 13, offset % 60),
    approvalReason: "Routine runtime governance review.",
    action:
      offset % 3 === 0
        ? runtimeChangeProposalAction.create
        : offset % 3 === 1
          ? runtimeChangeProposalAction.update
          : runtimeChangeProposalAction.rename,
    artifactPath: `governance/runtime-config/proposals/${offset + 1}.json`,
    runtimeValue: `runtime-${offset + 1}`,
    codeValue: `code-${offset + 1}`,
    status:
      offset % 4 === 0
        ? runtimeConfigArtifactStatus.pending
        : offset % 4 === 1
          ? runtimeConfigArtifactStatus.approved
          : offset % 4 === 2
            ? runtimeConfigArtifactStatus.applied
            : runtimeConfigArtifactStatus.rejected,
    generatedAt: timestamp(11 + (offset % 8), 14, offset % 60),
    decidedBy:
      offset % 4 === 0
        ? undefined
        : `usr_platform_operator_${(offset % 2) + 1}`,
    decisionReason:
      offset % 4 === 0 ? undefined : "Governance decision recorded.",
    decidedAt:
      offset % 4 === 0
        ? undefined
        : timestamp(11 + (offset % 8), 15, offset % 60),
  }));

const createFeatureFlags = (): FeatureFlag[] =>
  Array.from({ length: 30 }, (_, offset) => ({
    key: `${platformModuleId.featureFlags}.operator-flag-${offset + 1}`,
    description: `Operator-visible rollout flag ${offset + 1}`,
    owner:
      offset % 2 === 0
        ? platformModuleId.featureFlags
        : platformModuleId.tenantManagement,
    purpose: "Browser-testable admin rollout control.",
    defaultEnabled: offset % 2 === 0,
    effectiveState: offset % 3 !== 0,
    source:
      offset % 2 === 0
        ? runtimeResolutionSource.runtimeOverride
        : runtimeResolutionSource.codeDefault,
    entitled: true,
    dependencies:
      offset % 5 === 0
        ? [`${platformModuleId.featureFlags}.operator-flag-1`]
        : [],
    lifecycle:
      offset % 4 === 0
        ? featureFlagLifecycle.active
        : offset % 4 === 1
          ? featureFlagLifecycle.deprecated
          : featureFlagLifecycle.active,
    retirementPlan: "Retire after operator migration completes.",
    scope:
      offset % 3 === 0
        ? platformScope.organization
        : offset % 3 === 1
          ? platformScope.enterprise
          : undefined,
  }));

const createProjectionProfiles = (): ProjectionProfileView[] => [
  {
    moduleId: platformModuleId.authorization,
    profile: projectionProfile.admin,
    visibleFields: [
      authorizationFields.tupleNamespace,
      authorizationFields.tupleObject,
      authorizationFields.tupleRelation,
    ],
    auditedFields: [authorizationFields.tupleSubject],
  },
  {
    moduleId: platformModuleId.auditLog,
    profile: projectionProfile.supportSafe,
    visibleFields: [
      auditLogFields.moduleId,
      auditLogFields.action,
      auditLogFields.timestamp,
    ],
    auditedFields: [auditLogFields.actorId, auditLogFields.target],
  },
  {
    moduleId: platformModuleId.runtimeConfig,
    profile: projectionProfile.detail,
    visibleFields: [
      runtimeConfigFields.key,
      runtimeConfigFields.scope,
      runtimeConfigFields.value,
    ],
    auditedFields: [
      runtimeConfigFields.value,
      runtimeConfigFields.approvalReason,
    ],
  },
];

const createActionPolicies = (): ActionPolicy[] => [
  {
    actionId: adminGovernanceActionPolicyId.authorizationTupleDelete,
    label: "Revoke authorization tuple",
    description:
      "Removing an exact-scope tuple requires a governed reason and operator comment.",
    severity: "high-risk",
    projectionProfile: projectionProfile.admin,
    requiresReason: true,
    requiresComment: true,
    stepUpRequired: false,
    reasonOptions: [
      {
        value: "tenant-offboarding",
        label: "Tenant offboarding",
        description:
          "Access should be removed because the tenant is offboarding.",
      },
      {
        value: "incorrect-grant",
        label: "Incorrect grant",
        description: "Access was granted to the wrong subject or relation.",
      },
    ],
  },
  {
    actionId: adminGovernanceActionPolicyId.repairGapInspection,
    label: "Inspect repair gaps",
    description: "Repair-gap inspection requires a governed operator workflow.",
    severity: "guarded",
    projectionProfile: projectionProfile.supportSafe,
    requiresReason: true,
    requiresComment: false,
    stepUpRequired: false,
    reasonOptions: [
      {
        value: "customer-escalation",
        label: "Customer escalation",
        description: "A customer-impacting issue needs immediate review.",
      },
    ],
  },
];

const createAuthorizationTuples = (): AuthorizationTuple[] => {
  const tuples: AuthorizationTuple[] = [];

  for (let index = 1; index <= 14; index += 1) {
    tuples.push({
      namespace: authorizationNamespace.tenant,
      object: operatorTargets.organization.scopeId,
      relation: authorizationRelation.viewer,
      subject:
        index === 3
          ? "usr_target_revoke"
          : `usr_org_member_${String(index).padStart(2, "0")}`,
    });
  }

  tuples.push({
    namespace: authorizationNamespace.organization,
    object: operatorTargets.enterprise.scopeId,
    relation: authorizationRelation.admin,
    subject: "usr_ent_admin_01",
  });

  return tuples;
};

const createAuditEvents = (): AuditEvent[] => {
  const events: AuditEvent[] = [];

  for (let index = 1; index <= 28; index += 1) {
    events.push({
      eventId: `audit_event_${String(index).padStart(2, "0")}`,
      timestamp: timestamp(6 + (index % 12), 9 + (index % 6), index % 60),
      actorId: `usr_platform_operator_${(index % 4) + 1}`,
      tenantScope:
        index % 2 === 0 ? platformScope.organization : platformScope.enterprise,
      tenantScopeId:
        index % 2 === 0
          ? operatorTargets.organization.scopeId
          : operatorTargets.enterprise.scopeId,
      moduleId: platformModuleId.auditLog,
      action: auditLogAuditAction.exported,
      target: `export:${index}`,
      reason:
        index % 4 === 0
          ? "Recorded through admin browser fixtures."
          : undefined,
      correlationId:
        index % 5 === 0 ? `corr_${String(index).padStart(2, "0")}` : undefined,
    });
  }

  for (let index = 29; index <= 34; index += 1) {
    events.push({
      eventId: `audit_event_${String(index).padStart(2, "0")}`,
      timestamp: timestamp(6 + (index % 12), 11 + (index % 4), index % 60),
      actorId: `usr_platform_operator_${(index % 4) + 1}`,
      tenantScope: platformScope.organization,
      tenantScopeId: operatorTargets.organization.scopeId,
      moduleId: platformModuleId.runtimeConfig,
      action: runtimeConfigAuditAction.overrideChanged,
      target: `${platformModuleId.runtimeConfig}.session.timeout`,
      reason: "Runtime override adjusted.",
    });
  }

  for (let index = 35; index <= 40; index += 1) {
    events.push({
      eventId: `audit_event_${String(index).padStart(2, "0")}`,
      timestamp: timestamp(6 + (index % 12), 12 + (index % 4), index % 60),
      actorId: `usr_platform_operator_${(index % 4) + 1}`,
      tenantScope: platformScope.enterprise,
      tenantScopeId: operatorTargets.enterprise.scopeId,
      moduleId: platformModuleId.supportOperations,
      action: supportOperationsAuditAction.breakGlassReviewed,
      target: `case_${index}`,
      reason: "Support incident reviewed.",
    });
  }

  return events;
};

const createTenantTargets = (): TenantWorkspaceTarget[] => {
  const targets: TenantWorkspaceTarget[] = [
    {
      target: operatorTargets.organization,
      displayName: resolveAdminTenantTargetDisplayName(
        operatorTargets.organization,
      ),
      lastTouchedAt: timestamp(14, 10, 30),
      signals: [
        {
          signalId: "repair-gap:org:billing-repair",
          kind: "repair-gap",
          status: workflowJobStatus.blocked,
          detail: "Billing repair workflow currently needs operator attention.",
          timestamp: timestamp(14, 10, 30),
        },
        {
          signalId: "support-case:org:billing-outage",
          kind: "support-case",
          status: supportOperationsCaseStatus.escalated,
          detail: "Organization billing outage follow-up",
          timestamp: timestamp(13, 8, 45),
        },
      ],
    },
    {
      target: operatorTargets.enterprise,
      displayName: resolveAdminTenantTargetDisplayName(
        operatorTargets.enterprise,
      ),
      lastTouchedAt: timestamp(12, 9, 30),
      signals: [
        {
          signalId: "support-case:ent:onboarding-review",
          kind: "support-case",
          status: supportOperationsCaseStatus.open,
          detail: "Enterprise onboarding workflow needs review",
          timestamp: timestamp(12, 9, 30),
        },
      ],
    },
  ];

  generatedTenantTargets.forEach((target, offset) => {
    const index = offset + 3;

    targets.push({
      target,
      displayName: resolveAdminTenantTargetDisplayName(target),
      lastTouchedAt: timestamp(8 + (index % 8), 9 + (index % 6), 20),
      signals: [
        {
          signalId:
            index % 2 === 0
              ? `repair-gap:${target.scope}:${target.scopeId}:${index}`
              : `support-case:${target.scope}:${target.scopeId}:${index}`,
          kind: index % 2 === 0 ? "repair-gap" : "support-case",
          status:
            index % 2 === 0
              ? workflowJobStatus.scheduled
              : supportOperationsCaseStatus.open,
          detail:
            index % 2 === 0
              ? `Repair queue item ${index}`
              : `Support queue item ${index}`,
          timestamp: timestamp(8 + (index % 8), 9 + (index % 6), 20),
        },
      ],
    });
  });

  return targets;
};

const createBrandingViews = (): BrandingMap => {
  const views = workspaceTenantTargets.reduce<BrandingMap>(
    (result, target, index) => {
      if (target.scope === platformScope.individual) {
        throw new Error(
          "Branding fixtures do not support individual tenant targets.",
        );
      }

      result[targetKey(target)] = {
        scope: target.scope,
        scopeId: target.scopeId,
        companyName: formatFixtureTenantName(target),
        customDomainStatus:
          index % 2 === 0
            ? customDomainLifecycleState.active
            : customDomainLifecycleState.verifying,
        effectiveScope: target.scope,
        changedAt: timestamp(8 + (index % 8), 10 + (index % 5), 0),
      };

      return result;
    },
    {},
  );

  views[orgTargetKey] = {
    scope: operatorTargets.organization.scope,
    scopeId: operatorTargets.organization.scopeId,
    companyName: "Org Demo",
    customDomainStatus: customDomainLifecycleState.active,
    effectiveScope: platformScope.organization,
    changedAt: timestamp(11, 12, 0),
  };
  views[entTargetKey] = {
    scope: operatorTargets.enterprise.scope,
    scopeId: operatorTargets.enterprise.scopeId,
    companyName: "Atlas Enterprise",
    customDomainStatus: customDomainLifecycleState.verifying,
    effectiveScope: platformScope.enterprise,
    changedAt: timestamp(12, 10, 0),
  };

  return views;
};

const createComplianceData = (): ComplianceMap => {
  const data = workspaceTenantTargets.reduce<ComplianceMap>(
    (result, target, index) => {
      result[targetKey(target)] = {
        policies: Array.from({ length: 8 }, (_, offset) => ({
          policyId: `policy_${target.scopeId}_${String(offset + 1).padStart(2, "0")}`,
          dataType:
            offset % 2 === 0
              ? retentionDataType.fileObject
              : retentionDataType.auditLogEvent,
          retentionDays: 30 + index + offset,
          legalHoldActive: (index + offset) % 4 === 0,
        })),
        holds: Array.from({ length: 6 }, (_, offset) => ({
          legalHoldId: `hold_${target.scopeId}_${String(offset + 1).padStart(2, "0")}`,
          dataType:
            offset % 2 === 0
              ? retentionDataType.fileObject
              : retentionDataType.webhookReceipt,
          targetId: `${target.scopeId}_target_${String(offset + 1).padStart(2, "0")}`,
          status:
            offset % 3 === 0
              ? retentionLegalHoldStatus.active
              : retentionLegalHoldStatus.released,
          placedAt: timestamp(7 + (offset % 8), 10 + (index % 5), 10),
          releasedAt:
            offset % 3 === 0 ? undefined : timestamp(10 + (offset % 5), 15, 0),
          evidence: `Ticketed legal hold evidence for ${target.scopeId}.`,
          legalHoldActive: offset % 3 === 0,
        })),
      };

      return result;
    },
    {},
  );

  data[orgTargetKey] = {
    policies: Array.from({ length: 28 }, (_, offset) => ({
      policyId: `policy_org_${String(offset + 1).padStart(2, "0")}`,
      dataType:
        offset % 2 === 0
          ? retentionDataType.fileObject
          : retentionDataType.auditLogEvent,
      retentionDays: 30 + offset,
      legalHoldActive: offset % 4 === 0,
    })),
    holds: Array.from({ length: 26 }, (_, offset) => ({
      legalHoldId: `hold_org_${String(offset + 1).padStart(2, "0")}`,
      dataType:
        offset % 2 === 0
          ? retentionDataType.fileObject
          : retentionDataType.webhookReceipt,
      targetId: `target_${String(offset + 1).padStart(2, "0")}`,
      status:
        offset % 3 === 0
          ? retentionLegalHoldStatus.active
          : retentionLegalHoldStatus.released,
      placedAt: timestamp(7 + (offset % 8), 10, 10),
      releasedAt:
        offset % 3 === 0 ? undefined : timestamp(10 + (offset % 5), 15, 0),
      evidence: "Ticketed legal hold evidence.",
      legalHoldActive: offset % 3 === 0,
    })),
  };

  return data;
};

const synthesizeOperatorWebhookDeliveries = (
  scope: AdminTenantTarget["scope"],
  scopeId: string,
  subscriptionIds: readonly string[],
): readonly OperatorWebhookDelivery[] => {
  const subs =
    subscriptionIds.length === 0
      ? [`sub_${scopeId}_placeholder`]
      : subscriptionIds;
  const statuses = [
    operatorWebhookDeliveryStatus.delivered,
    operatorWebhookDeliveryStatus.delivered,
    operatorWebhookDeliveryStatus.failed,
    operatorWebhookDeliveryStatus.exhausted,
    operatorWebhookDeliveryStatus.pending,
    operatorWebhookDeliveryStatus.delivered,
    operatorWebhookDeliveryStatus.replayed,
    operatorWebhookDeliveryStatus.canceled,
  ] as const;
  return Array.from({ length: 8 }, (_, offset) => {
    const sub = subs[offset % subs.length] ?? subs[0]!;
    const status = statuses[offset % statuses.length] ?? statuses[0]!;
    const isTerminal =
      status === operatorWebhookDeliveryStatus.delivered ||
      status === operatorWebhookDeliveryStatus.failed ||
      status === operatorWebhookDeliveryStatus.exhausted ||
      status === operatorWebhookDeliveryStatus.canceled ||
      status === operatorWebhookDeliveryStatus.replayed;
    const lastResponseStatus = isTerminal
      ? status === operatorWebhookDeliveryStatus.delivered
        ? 200
        : 503
      : undefined;
    return {
      id: `dlv_${scopeId}_${String(offset + 1).padStart(2, "0")}`,
      subscriptionId: sub,
      targetTenant: { scope, scopeId },
      eventType:
        offset % 2 === 0
          ? "billing.subscription.updated"
          : "tenant.branding.updated",
      requestUrl: `https://hooks.example.com/${scopeId}/${(offset % 4) + 1}`,
      requestMethod: "POST" as const,
      requestBody: `{"event":"sample","attempt":${offset + 1}}`,
      payloadHash:
        "a".repeat(63) + String((offset % 10).toString(16)).slice(0, 1),
      signature: "b".repeat(64),
      signatureTimestamp: timestamp(9 + (offset % 8), 14, offset % 60),
      status,
      attemptCount: status === operatorWebhookDeliveryStatus.pending ? 1 : 3,
      enqueuedAt: timestamp(8 + (offset % 8), 12, offset % 60),
      ...(isTerminal
        ? { lastAttemptAt: timestamp(8 + (offset % 8), 13, offset % 60) }
        : {}),
      ...(lastResponseStatus === undefined ? {} : { lastResponseStatus }),
      ...(status === operatorWebhookDeliveryStatus.failed ||
      status === operatorWebhookDeliveryStatus.exhausted
        ? { lastErrorMessage: "Upstream returned 503" }
        : {}),
      correlationId: `cor_${scopeId}_${String(offset + 1).padStart(2, "0")}`,
    } satisfies OperatorWebhookDelivery;
  });
};

const createWebhooksData = (): WebhooksMap => {
  const data = workspaceTenantTargets.reduce<WebhooksMap>(
    (result, target, index) => {
      result[targetKey(target)] = {
        subscriptions: Array.from({ length: 8 }, (_, offset) => ({
          subscriptionId: `sub_${target.scopeId}_${String(offset + 1).padStart(2, "0")}`,
          url: `https://hooks.example.com/${target.scopeId}/${offset + 1}`,
          events: [
            "billing.subscription.updated",
            ...(offset % 2 === 0 ? ["tenant.branding.updated"] : []),
          ],
          status:
            offset % 3 === 0
              ? webhookSubscriptionStatus.paused
              : webhookSubscriptionStatus.active,
          lastDeliveryAt:
            offset % 4 === 0
              ? undefined
              : timestamp(9 + (offset % 8), 14 + (index % 4), 0),
        })),
        apiKeys: Array.from({ length: 8 }, (_, offset) => ({
          apiKeyId: `api_${target.scopeId}_${String(offset + 1).padStart(2, "0")}`,
          label: `${formatFixtureTenantName(target)} key ${offset + 1}`,
          prefix: `${target.scopeId.slice(0, 8)}_${String(offset + 1).padStart(2, "0")}`,
          status:
            offset % 4 === 0
              ? webhookApiKeyStatus.revoked
              : webhookApiKeyStatus.active,
          createdAt: timestamp(6 + (offset % 10), 11 + (index % 4), 0),
          rotatedAt:
            offset % 5 === 0 ? timestamp(7 + (offset % 8), 12, 0) : undefined,
          revokedAt:
            offset % 4 === 0 ? timestamp(8 + (offset % 7), 13, 0) : undefined,
        })),
      };

      return result;
    },
    {},
  );

  data[orgTargetKey] = {
    subscriptions: Array.from({ length: 27 }, (_, offset) => ({
      subscriptionId: `sub_org_${String(offset + 1).padStart(2, "0")}`,
      url: `https://hooks.example.com/org-demo/${offset + 1}`,
      events: [
        "billing.subscription.updated",
        ...(offset % 2 === 0 ? ["tenant.branding.updated"] : []),
      ],
      status:
        offset % 3 === 0
          ? webhookSubscriptionStatus.paused
          : webhookSubscriptionStatus.active,
      lastDeliveryAt:
        offset % 4 === 0 ? undefined : timestamp(9 + (offset % 8), 16, 0),
    })),
    apiKeys: Array.from({ length: 27 }, (_, offset) => ({
      apiKeyId: `api_org_${String(offset + 1).padStart(2, "0")}`,
      label: `Operations key ${offset + 1}`,
      prefix: `org_${String(offset + 1).padStart(2, "0")}`,
      status:
        offset % 4 === 0
          ? webhookApiKeyStatus.revoked
          : webhookApiKeyStatus.active,
      createdAt: timestamp(6 + (offset % 10), 11, 0),
      rotatedAt:
        offset % 5 === 0 ? timestamp(7 + (offset % 8), 12, 0) : undefined,
      revokedAt:
        offset % 4 === 0 ? timestamp(8 + (offset % 7), 13, 0) : undefined,
    })),
  };

  return data;
};

const createWorkspaceMap = (): WorkspaceMap => {
  const organizationTenant = buildAdminTenantContext(
    operatorTargets.organization,
  );
  const enterpriseTenant = buildAdminTenantContext(operatorTargets.enterprise);
  const brandingViews = createBrandingViews();
  const organizationBranding = brandingViews[orgTargetKey];
  const enterpriseBranding = brandingViews[entTargetKey];

  if (organizationBranding === undefined || enterpriseBranding === undefined) {
    throw new Error(
      "Expected branded tenant targets to be present in browser fixtures.",
    );
  }

  const genericWorkspaces = workspaceTenantTargets.reduce<WorkspaceMap>(
    (result, target, index) => {
      const key = targetKey(target);
      const branding = brandingViews[key];

      if (branding === undefined) {
        throw new Error(
          `Expected branding fixture state to exist for ${target.scopeId}.`,
        );
      }

      const tenant = buildAdminTenantContext(target);
      const hasRepairGap = index % 2 === 0;

      result[key] = {
        capabilities: capabilitySnapshot,
        tenant,
        onboarding: {
          tenant,
          run: {
            runId: `onboarding_${target.scopeId}`,
            triggeredBy: "usr_platform_operator",
            status: tenantOnboardingRunStatus.completed,
            currentStepId: "identity",
            startedAt: timestamp(8 + (index % 8), 7 + (index % 3), 0),
            completedAt: timestamp(8 + (index % 8), 8 + (index % 3), 0),
            steps: [
              {
                stepId: "identity",
                label: "Identity",
                status: onboardingStepStatus.completed,
                requiredModuleId: platformModuleId.identitySession,
                retryCount: 0,
              },
            ],
          },
        },
        memberships: [
          {
            subject: `usr_owner_${target.scopeId}`,
            relations: [tenantMembershipRelations[0]],
          },
        ],
        invitations:
          index % 3 === 0
            ? [
                {
                  invitationId: `inv_${target.scopeId}`,
                  recipientEmail: `${target.scopeId}@fixture.test`,
                  relation: tenantMembershipRelations[4],
                  status: tenantInvitationStatus.pending,
                  issuedBy: "usr_platform_operator",
                  issuedAt: timestamp(9 + (index % 6), 9, 0),
                  expiresAt: timestamp(20, 9, 0),
                },
              ]
            : [],
        billing: {
          plan:
            target.scope === platformScope.enterprise ? "enterprise" : "growth",
          billingInterval:
            target.scope === platformScope.enterprise
              ? billingPlanInterval.year
              : billingPlanInterval.month,
          status: billingSubscriptionStatus.active,
          currentPeriodEnd: timestamp(28, 0, 0),
        },
        branding,
        support: {
          tenantScope: target.scope,
          tenantScopeId: target.scopeId,
          cases: hasRepairGap
            ? []
            : [
                {
                  caseId: `case_${target.scopeId}`,
                  supportAgent: "usr_support_operator",
                  tenantScope: target.scope,
                  tenantScopeId: target.scopeId,
                  summary: `${formatFixtureTenantName(target)} queue review`,
                  status: supportOperationsCaseStatus.open,
                  priority: supportOperationsCasePriority.normal,
                  startedAt: timestamp(10 + (index % 5), 8, 0),
                  lastUpdatedAt: timestamp(10 + (index % 5), 8, 30),
                },
              ],
          repairGaps: hasRepairGap
            ? [
                {
                  jobId: `job_${target.scopeId}_01`,
                  tenantScope: target.scope,
                  tenantScopeId: target.scopeId,
                  status: workflowJobStatus.scheduled,
                  attempts: 1,
                  scheduledAt: timestamp(11 + (index % 4), 10, 0),
                  gapReason: workflowJobGapReason.missingCustomerAccount,
                },
              ]
            : [],
        },
        audit: {
          pageInfo: {
            page: { page: 1, pageSize: 20 },
            totalItems: 1,
            totalPages: 1,
            exportMode: false,
          },
          items: [
            {
              eventId: `workspace_audit_${target.scopeId}_1`,
              timestamp: timestamp(11 + (index % 4), 15, 0),
              actorId: "usr_platform_operator",
              tenantScope: target.scope,
              tenantScopeId: target.scopeId,
              moduleId:
                target.scope === platformScope.enterprise
                  ? platformModuleId.billingAndMetering
                  : platformModuleId.tenantManagement,
              action:
                target.scope === platformScope.enterprise
                  ? billingAndMeteringAuditAction.reconciliationTriggered
                  : tenantManagementAuditAction.onboardingInspected,
              target: target.scopeId,
            },
          ],
        },
      };

      return result;
    },
    {},
  );

  return {
    ...genericWorkspaces,
    [orgTargetKey]: {
      capabilities: capabilitySnapshot,
      tenant: organizationTenant,
      onboarding: {
        tenant: organizationTenant,
        run: {
          runId: "onboarding_org_demo",
          triggeredBy: "usr_platform_operator",
          status: tenantOnboardingRunStatus.inProgress,
          currentStepId: "branding",
          startedAt: timestamp(11, 8, 0),
          steps: [
            {
              stepId: "identity",
              label: "Identity",
              status: onboardingStepStatus.completed,
              requiredModuleId: platformModuleId.identitySession,
              retryCount: 0,
            },
            {
              stepId: "branding",
              label: "Branding",
              status: onboardingStepStatus.inProgress,
              requiredModuleId: platformModuleId.tenantBranding,
              retryCount: 1,
            },
          ],
        },
      },
      memberships: [
        {
          subject: "usr_owner_org_demo",
          relations: [
            tenantMembershipRelations[0],
            tenantMembershipRelations[3],
          ],
        },
        {
          subject: "usr_viewer_org_demo",
          relations: [tenantMembershipRelations[4]],
        },
      ],
      invitations: [
        {
          invitationId: "inv_org_demo",
          recipientEmail: "new.member@org-demo.test",
          relation: tenantMembershipRelations[3],
          status: tenantInvitationStatus.pending,
          issuedBy: "usr_platform_operator",
          issuedAt: timestamp(10, 9, 0),
          expiresAt: timestamp(20, 9, 0),
        },
      ],
      billing: {
        plan: "growth",
        billingInterval: billingPlanInterval.month,
        status: billingSubscriptionStatus.active,
        currentPeriodEnd: timestamp(28, 0, 0),
      },
      branding: organizationBranding,
      support: {
        tenantScope: operatorTargets.organization.scope,
        tenantScopeId: operatorTargets.organization.scopeId,
        cases: [
          {
            caseId: "case_org_priority",
            supportAgent: "usr_support_lead",
            tenantScope: operatorTargets.organization.scope,
            tenantScopeId: operatorTargets.organization.scopeId,
            summary: "Organization billing outage follow-up",
            status: supportOperationsCaseStatus.escalated,
            priority: supportOperationsCasePriority.high,
            startedAt: timestamp(13, 8, 0),
            lastUpdatedAt: timestamp(13, 8, 45),
          },
        ],
        repairGaps: [
          {
            jobId: "job_org_demo_01",
            tenantScope: operatorTargets.organization.scope,
            tenantScopeId: operatorTargets.organization.scopeId,
            status: workflowJobStatus.blocked,
            attempts: 3,
            scheduledAt: timestamp(14, 10, 30),
            gapReason: workflowJobGapReason.missingCustomerAccount,
          },
        ],
      },
      audit: {
        pageInfo: {
          page: { page: 1, pageSize: 20 },
          totalItems: 2,
          totalPages: 1,
          exportMode: false,
        },
        items: [
          {
            eventId: "workspace_audit_org_1",
            timestamp: timestamp(12, 13, 0),
            actorId: "usr_platform_operator",
            tenantScope: operatorTargets.organization.scope,
            tenantScopeId: operatorTargets.organization.scopeId,
            moduleId: platformModuleId.tenantManagement,
            action: tenantManagementAuditAction.onboardingInspected,
            target: operatorTargets.organization.scopeId,
          },
          {
            eventId: "workspace_audit_org_2",
            timestamp: timestamp(12, 14, 0),
            actorId: "usr_platform_operator",
            tenantScope: operatorTargets.organization.scope,
            tenantScopeId: operatorTargets.organization.scopeId,
            moduleId: platformModuleId.tenantBranding,
            action: tenantBrandingAuditAction.customDomainLifecycleUpdated,
            target: operatorTargets.organization.scopeId,
          },
        ],
      },
    },
    [entTargetKey]: {
      capabilities: capabilitySnapshot,
      tenant: enterpriseTenant,
      onboarding: {
        tenant: enterpriseTenant,
        run: {
          runId: "onboarding_ent_atlas",
          triggeredBy: "usr_platform_operator",
          status: tenantOnboardingRunStatus.completed,
          currentStepId: "billing",
          startedAt: timestamp(9, 7, 0),
          completedAt: timestamp(9, 8, 0),
          steps: [
            {
              stepId: "identity",
              label: "Identity",
              status: onboardingStepStatus.completed,
              requiredModuleId: platformModuleId.identitySession,
              retryCount: 0,
            },
            {
              stepId: "billing",
              label: "Billing",
              status: onboardingStepStatus.completed,
              requiredModuleId: platformModuleId.billingAndMetering,
              retryCount: 0,
            },
          ],
        },
      },
      memberships: [
        {
          subject: "usr_ent_owner",
          relations: [tenantMembershipRelations[0]],
        },
      ],
      invitations: [],
      billing: {
        plan: "enterprise",
        billingInterval: billingPlanInterval.year,
        status: billingSubscriptionStatus.active,
        currentPeriodEnd: timestamp(30, 0, 0),
      },
      branding: enterpriseBranding,
      support: {
        tenantScope: operatorTargets.enterprise.scope,
        tenantScopeId: operatorTargets.enterprise.scopeId,
        cases: [
          {
            caseId: "case_ent_onboarding",
            supportAgent: "usr_support_operator",
            tenantScope: operatorTargets.enterprise.scope,
            tenantScopeId: operatorTargets.enterprise.scopeId,
            summary: "Enterprise onboarding workflow needs review",
            status: supportOperationsCaseStatus.open,
            priority: supportOperationsCasePriority.normal,
            startedAt: timestamp(12, 9, 0),
            lastUpdatedAt: timestamp(12, 9, 30),
          },
        ],
        repairGaps: [],
      },
      audit: {
        pageInfo: {
          page: { page: 1, pageSize: 20 },
          totalItems: 1,
          totalPages: 1,
          exportMode: false,
        },
        items: [
          {
            eventId: "workspace_audit_ent_1",
            timestamp: timestamp(11, 15, 0),
            actorId: "usr_platform_operator",
            tenantScope: operatorTargets.enterprise.scope,
            tenantScopeId: operatorTargets.enterprise.scopeId,
            moduleId: platformModuleId.billingAndMetering,
            action: billingAndMeteringAuditAction.reconciliationTriggered,
            target: operatorTargets.enterprise.scopeId,
          },
        ],
      },
    },
  };
};

const clone = <T>(value: T): T => structuredClone(value);

const sortNewestFirst = <T extends { readonly timestamp: string }>(
  values: readonly T[],
): T[] =>
  [...values].sort((left, right) =>
    right.timestamp.localeCompare(left.timestamp),
  );

const buildRecentActivity = (
  events: readonly AuditEvent[],
): OperationsRecentActivity => {
  const items = sortNewestFirst(events).slice(0, 5);

  return {
    pageInfo: {
      page: { page: 1, pageSize: 5 },
      totalItems: items.length,
      totalPages: items.length === 0 ? 0 : 1,
      exportMode: false,
    },
    items,
  };
};

const buildAlerts = (input: {
  readonly jobs: readonly RepairJob[];
  readonly cases: readonly SupportCase[];
  readonly incidents: readonly BreakGlassIncident[];
}): readonly OperationsSummaryAlert[] => {
  const blockedRepairGaps = input.jobs.filter(
    (job) => job.status === workflowJobStatus.blocked,
  ).length;
  const escalatedCases = input.cases.filter(
    (supportCase) =>
      supportCase.status === supportOperationsCaseStatus.escalated,
  ).length;
  const pendingIncidents = input.incidents.filter(
    (incident) =>
      incident.status ===
      supportOperationsBreakGlassIncidentStatus.pendingReview,
  ).length;

  return [
    ...(blockedRepairGaps === 0
      ? []
      : [
          {
            id: "blocked-repair-gaps",
            severity: "critical" as const,
            title: "Blocked repair gaps need action",
            detail:
              "Replay or cancel blocked repair workflows before customers stall.",
            href: adminRoutePath.repairOperations,
            count: blockedRepairGaps,
          },
        ]),
    ...(pendingIncidents === 0
      ? []
      : [
          {
            id: "pending-break-glass",
            severity: "warning" as const,
            title: "Break-glass reviews pending",
            detail:
              "Review privileged support access before the current window expires.",
            href: adminRoutePath.supportOperations,
            count: pendingIncidents,
          },
        ]),
    ...(escalatedCases === 0
      ? []
      : [
          {
            id: "escalated-cases",
            severity: "info" as const,
            title: "Escalated support cases",
            detail:
              "Customer-facing escalations remain open across the operator queue.",
            href: adminRoutePath.supportOperations,
            count: escalatedCases,
          },
        ]),
  ];
};

const buildOperationsSummary = (input: {
  readonly jobs: readonly RepairJob[];
  readonly cases: readonly SupportCase[];
  readonly incidents: readonly BreakGlassIncident[];
  readonly sessions: readonly ImpersonationSession[];
  readonly auditEvents: readonly AuditEvent[];
}): OperationsSummary => {
  const blockedRepairGaps = input.jobs.filter(
    (job) => job.status === workflowJobStatus.blocked,
  ).length;
  const scheduledRepairGaps = input.jobs.filter(
    (job) => job.status === workflowJobStatus.scheduled,
  ).length;
  const staleRunningRepairGaps = input.jobs.filter(
    (job) => job.status === workflowJobStatus.running,
  ).length;
  const openSupportCases = input.cases.filter(
    (supportCase) => supportCase.status === supportOperationsCaseStatus.open,
  ).length;
  const escalatedSupportCases = input.cases.filter(
    (supportCase) =>
      supportCase.status === supportOperationsCaseStatus.escalated,
  ).length;
  const pendingBreakGlassIncidents = input.incidents.filter(
    (incident) =>
      incident.status ===
      supportOperationsBreakGlassIncidentStatus.pendingReview,
  ).length;
  const activeImpersonationSessions = input.sessions.filter(
    (session) =>
      session.status === supportOperationsImpersonationSessionStatus.active,
  ).length;
  const revocationPendingImpersonationSessions = input.sessions.filter(
    (session) =>
      session.status ===
      supportOperationsImpersonationSessionStatus.revocationPending,
  ).length;

  return {
    capabilities: capabilitySnapshot,
    posture: {
      openRepairGaps:
        blockedRepairGaps + scheduledRepairGaps + staleRunningRepairGaps,
      blockedRepairGaps,
      scheduledRepairGaps,
      staleRunningRepairGaps,
      openSupportCases,
      escalatedSupportCases,
      activeImpersonationSessions,
      revocationPendingImpersonationSessions,
      pendingBreakGlassIncidents,
      pendingRuntimeConfigProposals: 6,
      pendingBrandingProposals: 2,
    },
    alerts: buildAlerts(input),
    recentActivity: buildRecentActivity(input.auditEvents),
  };
};

const buildOperationsHomeV2Snapshot = (input: {
  readonly jobs: readonly RepairJob[];
  readonly cases: readonly SupportCase[];
  readonly incidents: readonly BreakGlassIncident[];
  readonly sessions: readonly ImpersonationSession[];
  readonly auditEvents: readonly AuditEvent[];
}): AdminOperationsHomeRouteSnapshot => {
  const openSupportCases = input.cases.filter(
    (supportCase) => supportCase.status === supportOperationsCaseStatus.open,
  ).length;
  const pendingBreakGlassIncidents = input.incidents.filter(
    (incident) =>
      incident.status ===
      supportOperationsBreakGlassIncidentStatus.pendingReview,
  ).length;
  const activeImpersonationSessions = input.sessions.filter(
    (session) =>
      session.status === supportOperationsImpersonationSessionStatus.active,
  ).length;
  const revocationPendingImpersonationSessions = input.sessions.filter(
    (session) =>
      session.status ===
      supportOperationsImpersonationSessionStatus.revocationPending,
  ).length;
  const openRepairGaps = input.jobs.filter(
    (job) =>
      job.status === workflowJobStatus.blocked ||
      job.status === workflowJobStatus.scheduled ||
      job.status === workflowJobStatus.running,
  ).length;
  const activeAlerts = buildAlerts({
    jobs: input.jobs,
    cases: input.cases,
    incidents: input.incidents,
  }).map((alert, index) => ({
    id: `ops-home-alert-${alert.id}`,
    severity:
      alert.severity === "critical"
        ? operationsHomeAlertSeverity.critical
        : alert.severity === "warning"
          ? operationsHomeAlertSeverity.warning
          : operationsHomeAlertSeverity.info,
    title: alert.title,
    summary: alert.detail,
    openedAt: timestamp(19 + index, 8 + index, 10),
    sourceVendor:
      alert.id === "blocked-repair-gaps"
        ? platformAdapterServiceName.polar
        : alert.id === "pending-break-glass"
          ? platformAdapterServiceName.keycloak
          : platformAdapterServiceName.novu,
    deepLink: alert.href,
  }));
  const pendingApprovals = [
    ...(pendingBreakGlassIncidents === 0
      ? []
      : [
          {
            id: "approval-break-glass-review",
            kind: "Break-glass incident",
            target: `${pendingBreakGlassIncidents} pending incident${pendingBreakGlassIncidents === 1 ? "" : "s"}`,
            requestedBy: "support-reviewer",
            requestedAt: timestamp(20, 9, 15),
            reasonPreview:
              "Privileged support access is waiting for an admin decision.",
            ttlSeconds: 3_600,
          },
        ]),
    ...(revocationPendingImpersonationSessions === 0
      ? []
      : [
          {
            id: "approval-impersonation-revocation",
            kind: "Impersonation revocation",
            target: `${revocationPendingImpersonationSessions} pending session${revocationPendingImpersonationSessions === 1 ? "" : "s"}`,
            requestedBy: "platform-operator",
            requestedAt: timestamp(20, 10, 5),
            reasonPreview:
              "Revocation-pending sessions should close before the grace window expires.",
            ttlSeconds: 1_800,
          },
        ]),
  ];
  const vendorPosture = [
    {
      vendor: platformAdapterServiceName.keycloak,
      posture: operationsHomeVendorPostureLevel.nominal,
      version: "26.0.0",
      latencyP95Ms: 24,
    },
    {
      vendor: platformAdapterServiceName.polar,
      posture: operationsHomeVendorPostureLevel.nominal,
      version: "0.6.0",
      latencyP95Ms: 41,
    },
    {
      vendor: platformAdapterServiceName.novu,
      posture: operationsHomeVendorPostureLevel.degraded,
      version: "2.3.1",
      latencyP95Ms: 230,
      lastIncidentAt: timestamp(18, 16, 45),
    },
    {
      vendor: platformAdapterServiceName.postal,
      posture: operationsHomeVendorPostureLevel.down,
      latencyP95Ms: 0,
      lastIncidentAt: timestamp(18, 17, 10),
    },
  ];
  const partialFailures = [
    {
      section: operationsHomeSnapshotSection.vendorPosture,
      reason: "Postal admin API unreachable.",
    },
  ];

  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    correlationId: "corr-admin-browser-fixture",
    windowMinutes: 1440,
    kpis: [
      {
        id: "kpi-support-open",
        label: "Open support cases",
        value: openSupportCases,
        unit: "cases",
        trend: { direction: "flat", delta: 0, windowMinutes: 1440 },
        tone: openSupportCases > 0 ? "drift" : "nominal",
        drillResourceKind: "users",
      },
      {
        id: "kpi-break-glass-pending",
        label: "Pending break-glass",
        value: pendingBreakGlassIncidents,
        unit: "incidents",
        trend: { direction: "flat", delta: 0, windowMinutes: 1440 },
        tone: pendingBreakGlassIncidents > 0 ? "drift" : "nominal",
        drillResourceKind: "audit-events",
      },
      {
        id: "kpi-impersonation-active",
        label: "Active impersonations",
        value: activeImpersonationSessions,
        unit: "sessions",
        trend: { direction: "flat", delta: 0, windowMinutes: 1440 },
        tone: activeImpersonationSessions > 0 ? "drift" : "nominal",
        drillResourceKind: "users",
      },
      {
        id: "kpi-repair-open",
        label: "Open repair gaps",
        value: openRepairGaps,
        unit: "gaps",
        trend: { direction: "flat", delta: 0, windowMinutes: 1440 },
        tone: openRepairGaps > 0 ? "error" : "nominal",
        drillResourceKind: "billing-invoices",
      },
    ],
    activeAlerts,
    recentAudit: input.auditEvents.slice(0, 5).map((event, index) => ({
      id: `audit-${index}-${event.eventId}`,
      actor: event.actorId,
      action: event.action,
      target: event.target ?? "platform",
      occurredAt: event.timestamp,
      classification: "internal",
    })),
    pendingApprovals,
    vendorPosture,
    partialFailures,
  };
};

const buildCapabilitySnapshotV2 = (): Extract<
  AdminCapabilitySnapshotV2RouteData,
  { readonly kind: "ready" }
>["snapshot"] => ({
  actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
  actorType: capabilitySnapshot.actorType,
  scopes: [platformScope.platform],
  permissions: [
    permissionScope.operationsHomeRead,
    permissionScope.tenantWorkspaceRead,
    permissionScope.capabilitySnapshotV2Read,
  ],
  adminOrgRole: adminOrgRole.owner,
  navigationMap: [
    {
      key: adminNavigationKey.operationsHome,
      visible: true,
      requiresStepUp: false,
    },
    {
      key: adminNavigationKey.tenantList,
      visible: true,
      requiresStepUp: false,
    },
    {
      key: adminNavigationKey.tenantWorkspace,
      visible: true,
      requiresStepUp: false,
    },
    { key: adminNavigationKey.auditLog, visible: true, requiresStepUp: false },
    { key: adminNavigationKey.webhooks, visible: true, requiresStepUp: false },
    {
      key: adminNavigationKey.billingConsole,
      visible: true,
      requiresStepUp: false,
    },
    {
      key: adminNavigationKey.vendorHealth,
      visible: true,
      requiresStepUp: false,
    },
    {
      key: adminNavigationKey.universalSearch,
      visible: true,
      requiresStepUp: false,
    },
    {
      key: adminNavigationKey.breakGlassConsole,
      visible: true,
      requiresStepUp: true,
    },
    { key: adminNavigationKey.settings, visible: true, requiresStepUp: false },
  ],
  highRiskAffordances: [],
  derivedAt: "2026-01-01T00:00:00.000Z",
  correlationId: "corr-admin-browser-capability-snapshot",
});

const buildTenantWorkspaceV2Snapshot = (
  input: AdminTenantWorkspaceV2LoaderInput,
): Extract<
  AdminTenantWorkspaceV2RouteData,
  { readonly kind: "ready" }
>["snapshot"] => {
  const scope = sanitizeAdminTenantTargetScope(input.scope);
  const target: AdminTenantTarget =
    scope === undefined
      ? { scope: platformScope.organization, scopeId: input.tenantId }
      : { scope, scopeId: input.tenantId };

  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    correlationId: "corr-admin-browser-tenant-workspace",
    tenant: buildAdminTenantContext(target),
    windowMinutes: input.windowMinutes ?? 1440,
    tenantOverview: {
      displayName: formatFixtureTenantName(target),
      brandingState: "published",
      planTier: "platform-foundation",
      billingStatus: billingSubscriptionStatus.active,
      legalHoldActive: false,
    },
    members: [],
    recentActivity: [],
    openIncidents: [],
    usageSpotlights: [],
    pendingTenantApprovals: [],
    partialFailures: [],
  };
};

const buildTupleQuery = (input: {
  readonly tuples: readonly AuthorizationTuple[];
  readonly filters: AdminAccessControlLoaderInput;
}): AuthorizationTupleQuery | undefined => {
  if (
    input.filters.namespace === undefined ||
    input.filters.object === undefined ||
    input.filters.relation === undefined
  ) {
    return undefined;
  }

  const matching = input.tuples
    .filter(
      (tuple) =>
        tuple.namespace === input.filters.namespace &&
        tuple.object === input.filters.object &&
        tuple.relation === input.filters.relation &&
        (input.filters.subject === undefined ||
          tuple.subject.includes(input.filters.subject)),
    )
    .sort((left, right) => left.subject.localeCompare(right.subject));
  const page = input.filters.page ?? 1;
  const pageSize = 10;
  const totalItems = matching.length;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
  const items = matching.slice((page - 1) * pageSize, page * pageSize);
  const detail =
    input.filters.detailSubject === undefined
      ? undefined
      : matching.find((tuple) => tuple.subject === input.filters.detailSubject);

  return {
    items,
    pageInfo: {
      page: { page, pageSize },
      totalItems,
      totalPages,
      exportMode: false,
    },
    ...(detail === undefined ? {} : { detail }),
  };
};

export type AdminBrowserFixtureState = {
  readonly capabilities: AdminOperatorCapabilitySnapshot;
  readonly repairJobs: RepairJob[];
  readonly supportCases: SupportCase[];
  readonly incidents: BreakGlassIncident[];
  readonly impersonationSessions: ImpersonationSession[];
  readonly runtimeOverrides: RuntimeOverride[];
  readonly runtimeProposals: RuntimeProposal[];
  readonly featureFlags: FeatureFlag[];
  readonly projectionProfiles: ProjectionProfileView[];
  readonly actionPolicies: ActionPolicy[];
  readonly authorizationTuples: AuthorizationTuple[];
  readonly auditEvents: AuditEvent[];
  readonly tenantTargets: TenantWorkspaceTarget[];
  readonly brandingViews: BrandingMap;
  readonly complianceData: ComplianceMap;
  readonly webhooksData: WebhooksMap;
  readonly workspaces: WorkspaceMap;
  loadShell: (
    location: Readonly<{ pathname: string; searchStr: string }>,
  ) => Promise<AdminShellRouteData>;
  loadOperationsHome: () => Promise<AdminOperationsHomeRouteData>;
  loadCapabilitySnapshotV2: () => Promise<AdminCapabilitySnapshotV2RouteData>;
  loadTenantsDirectory: () => Promise<AdminTenantsDirectoryRouteData>;
  loadRepair: (
    input?: AdminTenantRepairRouteLoaderInput,
  ) => Promise<AdminTenantRepairRouteData>;
  loadSupport: () => Promise<AdminSupportOperationsRouteData>;
  loadSupportCases: (
    input: AdminSupportCasesInput,
  ) => Promise<AdminSupportCasesRouteData>;
  loadIncidentDetail: (
    input: AdminIncidentDetailInput,
  ) => Promise<AdminIncidentDetailRouteData>;
  loadRetentionList: (
    input: AdminRetentionListInput,
  ) => Promise<AdminRetentionListRouteData>;
  loadLegalHoldDetail: (
    input: AdminLegalHoldDetailInput,
  ) => Promise<AdminLegalHoldDetailRouteData>;
  loadWebhookList: (
    input: AdminWebhookListInput,
  ) => Promise<AdminWebhookListRouteData>;
  loadDeliveryDetail: (
    input: AdminDeliveryDetailInput,
  ) => Promise<AdminDeliveryDetailRouteData>;
  loadApiKeyDetail: (
    input: AdminApiKeyDetailInput,
  ) => Promise<AdminApiKeyDetailRouteData>;
  loadVendorList: () => Promise<AdminVendorListRouteData>;
  loadVendorDetail: (
    input: AdminVendorDetailInput,
  ) => Promise<AdminVendorDetailRouteData>;
  loadNotifyList: (
    input: AdminNotifyListInput,
  ) => Promise<AdminNotifyListRouteData>;
  loadNotifyDetail: (
    input: AdminNotifyDetailInput,
  ) => Promise<AdminNotifyDetailRouteData>;
  loadAdminProfile: (
    input: AdminProfileInput,
  ) => Promise<AdminProfileRouteData>;
  loadAdminMembers: (
    input: AdminMembersInput,
  ) => Promise<AdminMembersRouteData>;
  loadAdminMemberDetail: (
    input: AdminMemberDetailInput,
  ) => Promise<AdminMemberDetailRouteData>;
  loadAdminTokens: (input: AdminTokensInput) => Promise<AdminTokensRouteData>;
  loadAdminWorkspaces: (
    input: AdminWorkspacesInput,
  ) => Promise<AdminWorkspacesRouteData>;
  loadAdminAudit: (input: AdminAuditInput) => Promise<AdminAuditRouteData>;
  loadWorkflowRunsList: (
    input: AdminWorkflowRunsListInput,
  ) => Promise<AdminWorkflowRunsListRouteData>;
  loadWorkflowRunDetail: (
    input: AdminWorkflowRunDetailInput,
  ) => Promise<AdminWorkflowRunDetailRouteData>;
  loadBilling: () => Promise<AdminBillingRouteData>;
  loadBillingList: (
    input: AdminBillingListInput,
  ) => Promise<AdminBillingListRouteData>;
  loadInvoiceDetail: (
    input: AdminInvoiceDetailInput,
  ) => Promise<AdminInvoiceDetailRouteData>;
  loadMeterDetail: (
    input: AdminMeterDetailInput,
  ) => Promise<AdminMeterDetailRouteData>;
  loadKeycloakUserDetail: (
    input: AdminKeycloakUserDetailInput,
  ) => Promise<AdminKeycloakUserDetailRouteData>;
  loadKeycloakRoleDetail: (
    input: AdminKeycloakRoleDetailInput,
  ) => Promise<AdminKeycloakRoleDetailRouteData>;
  loadBrandingList: (
    input: AdminBrandingListInput,
  ) => Promise<AdminBrandingListRouteData>;
  loadDomainDetail: (
    input: AdminDomainDetailInput,
  ) => Promise<AdminDomainDetailRouteData>;
  loadRuntimeConfig: () => Promise<AdminRuntimeConfigRouteData>;
  loadFeatureFlags: () => Promise<AdminFeatureFlagsRouteData>;
  loadAccessControl: (
    input?: AdminAccessControlLoaderInput,
  ) => Promise<AdminAccessControlRouteData>;
  loadAuditLog: (moduleId?: string) => Promise<AdminAuditLogRouteData>;
  loadAuditLogV2: (
    rawSearch: AdminAuditLogV2RawSearch,
  ) => Promise<AdminAuditLogV2RouteData>;
  loadGovernanceConfigV2: (
    input: AdminGovernanceConfigV2Input,
  ) => Promise<AdminGovernanceConfigV2RouteData>;
  loadGovernanceFlagV2: (
    input: AdminGovernanceFlagV2Input,
  ) => Promise<AdminGovernanceFlagV2RouteData>;
  loadGovernanceAccessV2: (
    input: AdminGovernanceAccessV2Input,
  ) => Promise<AdminGovernanceAccessV2RouteData>;
  loadTenantWorkspaceIndex: () => Promise<AdminTenantWorkspaceIndexRouteData>;
  loadTenantWorkspaceV2: (
    input: AdminTenantWorkspaceV2LoaderInput,
  ) => Promise<AdminTenantWorkspaceV2RouteData>;
  loadBranding: (
    scope?: string,
    scopeId?: string,
  ) => Promise<AdminBrandingRouteData>;
  loadCompliance: (
    scope?: string,
    scopeId?: string,
  ) => Promise<AdminComplianceRetentionRouteData>;
  loadWebhooks: (
    scope?: string,
    scopeId?: string,
  ) => Promise<AdminWebhooksApiAccessRouteData>;
  loadUniversalSearch: (
    input: AdminUniversalSearchInput,
  ) => Promise<AdminUniversalSearchRouteData>;
  replayWorkflowRun: (input: {
    readonly data: {
      readonly runId: string;
      readonly reason: string;
      readonly reasonAttachmentText?: string;
    };
  }) => Promise<{
    readonly accepted: true;
    readonly runId: string;
    readonly replayRunId: string | null;
  }>;
  cancelWorkflowRun: (input: {
    readonly data: {
      readonly runId: string;
      readonly reason: string;
      readonly reasonAttachmentText?: string;
    };
  }) => Promise<{
    readonly accepted: true;
    readonly runId: string;
  }>;
  resendNotification: (input: {
    readonly data: {
      readonly notificationId: string;
      readonly reason: string;
      readonly reasonAttachmentText?: string;
    };
  }) => Promise<{
    readonly accepted: true;
    readonly notificationId: string;
    readonly resendNotificationId: string | null;
  }>;
  releaseBreakGlassGrant: (input: {
    readonly data: {
      readonly caseId: string;
      readonly releaseReasonCatalogId: string;
    };
  }) => Promise<{
    readonly caseId: string;
  }>;
  releaseRunAsGrant: (input: {
    readonly data: {
      readonly grantId: string;
      readonly reasonId: string;
      readonly reasonAttachmentText: string;
    };
  }) => Promise<{
    readonly grantId: string;
  }>;
  releaseLegalHold: (input: {
    readonly data: {
      readonly legalHoldId: string;
    };
  }) => Promise<{
    readonly legalHoldId: string;
  }>;
  retryWebhookDelivery: (input: {
    readonly data: {
      readonly deliveryId: string;
      readonly retryReasonCatalogId: string;
    };
  }) => Promise<{
    readonly deliveryId: string;
  }>;
  rotateWebhookApiKey: (input: {
    readonly data: {
      readonly apiKeyId: string;
      readonly scope: "enterprise" | "organization" | "individual";
      readonly scopeId: string;
    };
  }) => Promise<{
    readonly apiKeyId: string;
  }>;
  revokeWebhookApiKey: (input: {
    readonly data: {
      readonly apiKeyId: string;
      readonly scope: "enterprise" | "organization" | "individual";
      readonly scopeId: string;
    };
  }) => Promise<{
    readonly apiKeyId: string;
  }>;
  verifyCustomDomain: (input: {
    readonly data: {
      readonly hostname: string;
      readonly scope: "enterprise" | "organization";
      readonly scopeId: string;
      readonly reasonId: string;
      readonly approvalNotes: string;
    };
  }) => Promise<{
    readonly hostname: string;
  }>;
  inviteAdminMember: (input: {
    readonly data: {
      readonly email: string;
      readonly invitedRole: string;
      readonly reasonId: string;
      readonly reasonAttachmentText: string;
    };
  }) => Promise<{
    readonly memberId: string;
    readonly invitationId: string;
    readonly email: string;
    readonly invitationToken: string;
  }>;
  removeAdminMember: (input: {
    readonly data: {
      readonly memberId: string;
      readonly reasonId: string;
      readonly reasonAttachmentText: string;
    };
  }) => Promise<{
    readonly memberId: string;
  }>;
  createAdminWorkspace: (input: {
    readonly data: {
      readonly ownerSubjectId: string;
      readonly name: string;
      readonly serializedLayout: string;
      readonly reasonId: string;
      readonly reasonAttachmentText: string;
    };
  }) => Promise<{
    readonly workspaceId: string;
    readonly name: string;
  }>;
  deleteAdminWorkspace: (input: {
    readonly data: {
      readonly ownerSubjectId: string;
      readonly workspaceId: string;
      readonly reasonId: string;
      readonly reasonAttachmentText: string;
    };
  }) => Promise<{
    readonly workspaceId: string;
  }>;
  issueAdminOperatorTestToken: (input: {
    readonly data: {
      readonly label: string;
      readonly expiresAt: string;
      readonly reasonCatalogId: string;
      readonly reasonAttachmentText: string;
    };
  }) => Promise<{
    readonly tokenId: string;
    readonly label: string;
    readonly tokenPrefix: string;
    readonly plaintextToken: string;
  }>;
  revokeAdminOperatorTestToken: (input: {
    readonly data: {
      readonly tokenId: string;
      readonly reasonCatalogId: string;
      readonly reasonAttachmentText: string;
    };
  }) => Promise<{
    readonly tokenId: string;
  }>;
  replayRepairGap: (input: {
    readonly data: {
      readonly jobId: string;
      readonly inspectionReason?: string;
    };
  }) => Promise<{ readonly job: RepairJob }>;
  cancelRepairGap: (input: {
    readonly data: {
      readonly jobId: string;
      readonly inspectionReason?: string;
    };
  }) => Promise<{ readonly job: RepairJob }>;
  deleteAccessTuple: (input: {
    readonly data: {
      readonly tuple: AuthorizationTuple;
      readonly reason: string;
    };
  }) => Promise<void>;
  provisionAccessOperator: (input: {
    readonly data: {
      readonly displayName: string;
      readonly email: string;
      readonly username?: string;
      readonly actorType:
        | typeof actorType.platformOperator
        | typeof actorType.supportOperator;
      readonly reason: string;
    };
  }) => Promise<{
    readonly operator: AccessControlReadyData["operatorDirectory"]["operators"][number];
    readonly updatedExisting: boolean;
    readonly credentialHandoff: {
      readonly signInUrl: string;
      readonly temporaryPassword: string;
    };
  }>;
  mutateTenantMembership: (input: {
    readonly data: {
      readonly tenantId: string;
      readonly scope: AdminTenantTarget["scope"];
      readonly subject: string;
      readonly relation: (typeof tenantMembershipRelations)[number];
      readonly action:
        | typeof tenantMembershipMutationAction.grant
        | typeof tenantMembershipMutationAction.revoke;
      readonly mutationReason: string;
    };
  }) => Promise<{
    readonly tenant: TenantWorkspace["tenant"];
    readonly subject: string;
    readonly relation: (typeof tenantMembershipRelations)[number];
    readonly action:
      | typeof tenantMembershipMutationAction.grant
      | typeof tenantMembershipMutationAction.revoke;
    readonly changed: boolean;
    readonly membership: TenantWorkspace["memberships"][number];
  }>;
  issueTenantInvitation: (input: {
    readonly data: {
      readonly tenantId: string;
      readonly scope: AdminTenantTarget["scope"];
      readonly recipientEmail: string;
      readonly relation: (typeof tenantMembershipRelations)[number];
      readonly issueReason: string;
    };
  }) => Promise<{
    readonly tenant: TenantWorkspace["tenant"];
    readonly invitation: TenantWorkspace["invitations"][number];
    readonly handoff: {
      readonly invitationToken: string;
      readonly expiresAt: string;
    };
    readonly delivery: {
      readonly status: "queued" | "not-queued";
      readonly template: string;
    };
  }>;
  revokeTenantInvitation: (input: {
    readonly data: {
      readonly tenantId: string;
      readonly scope: AdminTenantTarget["scope"];
      readonly invitationId: string;
      readonly revocationReason: string;
    };
  }) => Promise<{
    readonly tenant: TenantWorkspace["tenant"];
    readonly invitationId: string;
    readonly changed: boolean;
    readonly invitation: TenantWorkspace["invitations"][number];
  }>;
  submitRuntimeConfigProposal: (input: {
    readonly data: {
      readonly moduleId: string;
      readonly key: string;
      readonly scope: string;
      readonly scopeId: string;
      readonly value: unknown;
      readonly approvalReason: string;
    };
  }) => Promise<{
    readonly proposal: {
      readonly proposalId: string;
      readonly moduleId: string;
      readonly key: string;
      readonly status: "pending" | "approved" | "rejected" | "applied";
      readonly approvalReason: string;
    };
    readonly auditEvent: { readonly correlationId: string };
  }>;
  reviewRuntimeConfigProposal: (input: {
    readonly data: {
      readonly proposalId: string;
      readonly status: "approved" | "rejected";
      readonly decisionReason: string;
    };
  }) => Promise<{
    readonly proposal: {
      readonly proposalId: string;
      readonly status: "approved" | "rejected";
      readonly decisionReason: string;
    };
    readonly auditEvent: { readonly correlationId: string };
  }>;
  submitFeatureFlagProposal: (input: {
    readonly data: {
      readonly moduleId: string;
      readonly key: string;
      readonly enabled: boolean;
      readonly approvalReason: string;
    };
  }) => Promise<{
    readonly proposal: {
      readonly proposalId: string;
      readonly moduleId: string;
      readonly key: string;
      readonly enabled: boolean;
      readonly status: "pending" | "approved" | "rejected" | "applied";
      readonly approvalReason: string;
    };
    readonly auditEvent: { readonly correlationId: string };
  }>;
  reviewFeatureFlagProposal: (input: {
    readonly data: {
      readonly proposalId: string;
      readonly status: "approved" | "rejected";
      readonly decisionReason: string;
    };
  }) => Promise<{
    readonly proposal: {
      readonly proposalId: string;
      readonly status: "approved" | "rejected";
      readonly decisionReason: string;
    };
    readonly auditEvent: { readonly correlationId: string };
  }>;
  revokeAuthorizationTuple: (input: {
    readonly data: {
      readonly tuple: {
        readonly namespace: string;
        readonly object: string;
        readonly relation: string;
        readonly subject: string;
      };
      readonly reason: string;
    };
  }) => Promise<{
    readonly auditEvent: { readonly correlationId: string };
  }>;
};

type VendorReady = Extract<
  AdminVendorListRouteData,
  { readonly kind: "ready" }
>;

const buildVendorAggregate = (): VendorReady["aggregate"] => ({
  entries: [
    {
      serviceName: platformAdapterServiceName.keycloak,
      status: "healthy",
      version: "26.0.0",
      latencyMs: 24,
      lastCheckedAt: new Date(0).toISOString(),
    },
    {
      serviceName: platformAdapterServiceName.polar,
      status: "healthy",
      version: "0.6.0",
      latencyMs: 41,
      lastCheckedAt: new Date(0).toISOString(),
    },
    {
      serviceName: platformAdapterServiceName.novu,
      status: "degraded",
      version: "2.3.1",
      latencyMs: 230,
      lastCheckedAt: new Date(0).toISOString(),
      message: "Novu provider returned non-200 healthcheck.",
    },
    {
      serviceName: platformAdapterServiceName.postal,
      status: "unavailable",
      latencyMs: 0,
      lastCheckedAt: new Date(0).toISOString(),
      message: "Postal admin API unreachable.",
    },
  ],
  partialFailures: [
    {
      serviceName: platformAdapterServiceName.postal,
      reason: "Postal admin API unreachable.",
    },
  ],
  generatedAt: new Date(0).toISOString(),
  correlationId: "corr_admin_vendor_fixture",
});

const buildVendorAggregateReady = (): AdminVendorListRouteData => ({
  kind: "ready",
  aggregate: buildVendorAggregate(),
});

export const createAdminBrowserFixtureState = (): AdminBrowserFixtureState => {
  const repairJobs = createRepairJobs();
  const supportCases = createSupportCases();
  const incidents = createBreakGlassIncidents();
  const impersonationSessions = createImpersonationSessions();
  const runtimeOverrides = createRuntimeOverrides();
  const runtimeProposals = createRuntimeProposals();
  const featureFlags = createFeatureFlags();
  const projectionProfiles = createProjectionProfiles();
  const actionPolicies = createActionPolicies();
  const authorizationTuples = createAuthorizationTuples();
  const auditEvents = createAuditEvents();
  const tenantTargets = createTenantTargets();
  const brandingViews = createBrandingViews();
  const complianceData = createComplianceData();
  const webhooksData = createWebhooksData();
  const workspaces = createWorkspaceMap();
  const adminMembers = [
    {
      id: "adm_member_fixture_1",
      keycloakSubjectId: "kc_owner_fixture_1",
      email: "owner@comvestec.com",
      displayName: "Admin Owner Fixture",
      role: adminMemberRole.adminOwner,
      status: adminMemberStatus.active,
      invitedAt: new Date(0).toISOString(),
      acceptedAt: new Date(500).toISOString(),
      lastActiveAt: new Date(1500).toISOString(),
      createdBy: "usr_platform_operator",
      updatedAt: new Date(1000).toISOString(),
    },
    {
      id: "adm_member_fixture_2",
      keycloakSubjectId: "kc_audit_fixture_2",
      email: "audit@comvestec.com",
      displayName: "Admin Auditor Fixture",
      role: adminMemberRole.compliance,
      status: adminMemberStatus.active,
      invitedAt: new Date(2000).toISOString(),
      acceptedAt: new Date(2500).toISOString(),
      lastActiveAt: new Date(3500).toISOString(),
      createdBy: "usr_platform_operator",
      updatedAt: new Date(3000).toISOString(),
    },
  ];
  const adminTokens = [
    {
      id: "aot_fixture_active",
      tokenPrefix: "aott_a1b2c3d4",
      label: "QA harness — primary",
      issuedBy: "usr_platform_operator",
      issuedAt: new Date(0).toISOString(),
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "aot_fixture_revoked",
      tokenPrefix: "aott_e5f6g7h8",
      label: "Rotation cleanup",
      issuedBy: "usr_platform_operator",
      issuedAt: new Date(0).toISOString(),
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      revokedAt: new Date(Date.now() - 60 * 1000).toISOString(),
    },
  ];
  const adminWorkspaces = [
    {
      id: "wsp_fixture_1",
      ownerSubjectId: "usr_platform_operator",
      name: "Daily driver",
      position: 1,
      serializedLayout:
        '{"panes":[{"id":"mission-control","resource":"operations-home"}]}',
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
    {
      id: "wsp_fixture_2",
      ownerSubjectId: "usr_platform_operator",
      name: "Incident response",
      position: 2,
      serializedLayout:
        '{"panes":[{"id":"support","resource":"support"},{"id":"audit","resource":"audit"}]}',
      createdAt: new Date(500).toISOString(),
      updatedAt: new Date(1000).toISOString(),
    },
  ];
  const adminSavedViews: AdminSavedView[] = [
    {
      id: "sv_fixture_audit_focus",
      ownerSubjectId: "usr_platform_operator",
      name: "Audit triage",
      resourceKind: adminSavedViewResourceKind.auditEvents,
      serializedView:
        '{"filters":{"action":["manual-break-glass.issue"]},"sort":{"field":"timestamp","direction":"desc"},"columns":["eventId","action","actorId"],"density":"compact"}',
      pinned: true,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(1000).toISOString(),
      lastUsedAt: new Date(1500).toISOString(),
    },
    {
      id: "sv_fixture_runtime_watch",
      ownerSubjectId: "usr_platform_operator",
      name: "Runtime drift watch",
      resourceKind: adminSavedViewResourceKind.runtimeConfig,
      serializedView:
        '{"filters":{"source":["override"]},"sort":{"field":"updatedAt","direction":"desc"},"columns":["key","effectiveValue"],"density":"comfortable"}',
      pinned: true,
      createdAt: new Date(2000).toISOString(),
      updatedAt: new Date(2500).toISOString(),
      lastUsedAt: new Date(2600).toISOString(),
    },
    {
      id: "sv_fixture_delivery_failures",
      ownerSubjectId: "usr_platform_operator",
      name: "Failed deliveries",
      resourceKind: adminSavedViewResourceKind.webhookDeliveries,
      serializedView:
        '{"filters":{"status":["failed"]},"sort":{"field":"updatedAt","direction":"desc"},"columns":["deliveryId","status"],"density":"compact"}',
      pinned: false,
      createdAt: new Date(3000).toISOString(),
      updatedAt: new Date(3500).toISOString(),
      lastUsedAt: new Date(3600).toISOString(),
    },
  ];
  let runAsBannerState: RunAsBannerState = {
    active: false,
    releasable: false,
  };
  let adminOperators = operatorDirectory.operators.map((operator) => ({
    ...operator,
  }));

  const pushAuditEvent = (event: AuditEvent) => {
    auditEvents.unshift(event);
  };

  const buildOperatorDirectorySnapshot =
    (): AccessControlReadyData["operatorDirectory"] => ({
      currentOperator: clone(operatorProfile),
      operators: clone(adminOperators),
    });

  const computeAdminTokenTotals = () => {
    const now = Date.now();
    const active = adminTokens.filter(
      (token) =>
        token.revokedAt === undefined &&
        new Date(token.expiresAt).getTime() > now,
    ).length;
    const expiringSoon = adminTokens.filter(
      (token) =>
        token.revokedAt === undefined &&
        new Date(token.expiresAt).getTime() - now <= 24 * 60 * 60 * 1000,
    ).length;
    const revoked = adminTokens.filter(
      (token) => token.revokedAt !== undefined,
    ).length;

    return {
      active,
      expiringSoon,
      revoked,
    };
  };

  const resolveWorkspace = (input: {
    readonly tenantId: string;
    readonly scope: AdminTenantTarget["scope"];
  }) => {
    const target: AdminTenantTarget = {
      scope: input.scope,
      scopeId: input.tenantId,
    };
    const workspaceKey = serializeAdminTenantTarget(target);
    const workspace = workspaces[workspaceKey];

    if (workspace === undefined) {
      throw new Error(
        `Unknown tenant workspace target: ${input.scope}:${input.tenantId}`,
      );
    }

    return {
      workspaceKey,
      workspace,
      tenant: buildAdminTenantContext(target),
    } as const;
  };

  const replaceRepairJob = (
    jobId: string,
    transform: (job: RepairJob) => RepairJob,
  ): RepairJob => {
    const jobIndex = repairJobs.findIndex(
      (candidate) => candidate.jobId === jobId,
    );

    if (jobIndex === -1) {
      throw new Error(`Unknown repair job: ${jobId}`);
    }

    const currentJob = repairJobs[jobIndex];

    if (currentJob === undefined) {
      throw new Error(
        `Repair job disappeared before it could be updated: ${jobId}`,
      );
    }

    const nextJob = transform(currentJob);
    repairJobs.splice(jobIndex, 1, nextJob);

    return nextJob;
  };

  return {
    capabilities: capabilitySnapshot,
    repairJobs,
    supportCases,
    incidents,
    impersonationSessions,
    runtimeOverrides,
    runtimeProposals,
    featureFlags,
    projectionProfiles,
    actionPolicies,
    authorizationTuples,
    auditEvents,
    tenantTargets,
    brandingViews,
    complianceData,
    webhooksData,
    workspaces,
    loadShell: async () => ({
      kind: "ready",
      profile: clone(operatorProfile),
      workspaces: clone(adminWorkspaces),
      savedViews: clone(adminSavedViews),
      runAsBanner: clone(runAsBannerState),
    }),
    loadOperationsHome: async (): Promise<AdminOperationsHomeRouteData> => ({
      kind: "ready",
      snapshot: buildOperationsHomeV2Snapshot({
        jobs: repairJobs,
        cases: supportCases,
        incidents,
        sessions: impersonationSessions,
        auditEvents,
      }),
      partialFailures: [],
    }),
    loadCapabilitySnapshotV2:
      async (): Promise<AdminCapabilitySnapshotV2RouteData> => ({
        kind: "ready",
        snapshot: buildCapabilitySnapshotV2(),
        fromCache: false,
      }),
    loadTenantsDirectory:
      async (): Promise<AdminTenantsDirectoryRouteData> => ({
        kind: "ready",
        rows: tenantDirectoryFixture.map(
          (row): AdminTenantsDirectoryRow => ({
            key: row.key,
            displayName: row.displayName,
            target: row.target,
            environment: row.environment,
            status: row.status,
            approvalsOpen: row.approvalsOpen,
          }),
        ),
      }),
    loadRepair: async () => ({
      kind: "ready",
      summary: buildOperationsSummary({
        jobs: repairJobs,
        cases: supportCases,
        incidents,
        sessions: impersonationSessions,
        auditEvents,
      }),
      jobs: clone(repairJobs),
    }),
    loadSupport: async () => ({
      kind: "ready",
      cases: clone(supportCases),
      incidents: clone(incidents),
      impersonationSessions: clone(impersonationSessions),
    }),
    loadSupportCases: async (input) => {
      const filteredCases = clone(supportCases).filter((supportCase) =>
        input.caseStatus === undefined
          ? true
          : supportCase.status === input.caseStatus,
      );
      const filteredIncidents = clone(incidents).filter((incident) =>
        input.incidentStatus === undefined
          ? true
          : incident.status === input.incidentStatus,
      );
      const filteredImpersonation = clone(impersonationSessions).filter(
        (session) =>
          input.impersonationStatus === undefined
            ? true
            : session.status === input.impersonationStatus,
      );
      return {
        kind: "ready",
        cases: filteredCases,
        incidents: filteredIncidents,
        impersonationSessions: filteredImpersonation,
        ...(input.selectedIncidentId === undefined
          ? {}
          : { selectedIncidentId: input.selectedIncidentId }),
      };
    },
    loadIncidentDetail: async (input) => {
      const match = clone(incidents).find(
        (incident) => incident.caseId === input.incidentId,
      );
      if (match === undefined) {
        return {
          kind: "error",
          title: "Incident not found",
          description:
            "The requested break-glass incident could not be located. The incident id may be stale.",
        };
      }
      return { kind: "ready", incident: match };
    },
    loadRetentionList: async (input) => {
      if (
        input.scope === undefined ||
        input.scopeId === undefined ||
        input.scopeId.length === 0
      ) {
        return {
          kind: "ready",
          scope: null,
          scopeId: null,
          policies: [],
          holds: [],
          scheduleEntries: [],
          ...(input.selectedHoldId === undefined
            ? {}
            : { selectedHoldId: input.selectedHoldId }),
        };
      }
      const resolvedScope = sanitizeAdminTenantTargetScope(input.scope);
      if (resolvedScope === undefined) {
        return {
          kind: "ready",
          scope: input.scope,
          scopeId: input.scopeId,
          policies: [],
          holds: [],
          scheduleEntries: [],
          ...(input.selectedHoldId === undefined
            ? {}
            : { selectedHoldId: input.selectedHoldId }),
        };
      }
      const scopeKey = targetKey({
        scope: resolvedScope,
        scopeId: input.scopeId,
      });
      const bucket = complianceData[scopeKey];
      const policies = bucket === undefined ? [] : clone(bucket.policies);
      const holds = bucket === undefined ? [] : clone(bucket.holds);
      return {
        kind: "ready",
        scope: input.scope,
        scopeId: input.scopeId,
        policies,
        holds,
        scheduleEntries: [],
        ...(input.selectedHoldId === undefined
          ? {}
          : { selectedHoldId: input.selectedHoldId }),
      };
    },
    loadLegalHoldDetail: async (input) => {
      const resolvedScope = sanitizeAdminTenantTargetScope(input.scope);
      const scopeKey =
        resolvedScope === undefined
          ? undefined
          : targetKey({ scope: resolvedScope, scopeId: input.scopeId });
      const bucket =
        scopeKey === undefined ? undefined : complianceData[scopeKey];
      const match =
        bucket === undefined
          ? undefined
          : clone(bucket.holds).find(
              (candidate) => candidate.legalHoldId === input.holdId,
            );
      if (match === undefined) {
        return {
          kind: "error",
          title: "Legal hold not found",
          description:
            "The requested legal hold could not be located in the current retention scope. The hold id may be stale or already released.",
        };
      }
      return {
        kind: "ready",
        hold: match,
        scope: input.scope,
        scopeId: input.scopeId,
      };
    },
    loadWebhookList: async (input) => {
      if (
        input.scope === undefined ||
        input.scopeId === undefined ||
        input.scopeId.length === 0
      ) {
        return {
          kind: "ready",
          scope: null,
          scopeId: null,
          subscriptions: [],
          deliveries: [],
          ...(input.selectedDeliveryId === undefined
            ? {}
            : { selectedDeliveryId: input.selectedDeliveryId }),
        };
      }
      const resolvedScope = sanitizeAdminTenantTargetScope(input.scope);
      if (resolvedScope === undefined) {
        return {
          kind: "ready",
          scope: input.scope,
          scopeId: input.scopeId,
          subscriptions: [],
          deliveries: [],
          ...(input.selectedDeliveryId === undefined
            ? {}
            : { selectedDeliveryId: input.selectedDeliveryId }),
        };
      }
      const scopeKey = targetKey({
        scope: resolvedScope,
        scopeId: input.scopeId,
      });
      const bucket = webhooksData[scopeKey];
      const subscriptions =
        bucket === undefined ? [] : clone(bucket.subscriptions);
      const deliveries = synthesizeOperatorWebhookDeliveries(
        resolvedScope,
        input.scopeId,
        subscriptions.map((sub) => sub.subscriptionId),
      );
      return {
        kind: "ready",
        scope: input.scope,
        scopeId: input.scopeId,
        subscriptions,
        deliveries,
        ...(input.selectedDeliveryId === undefined
          ? {}
          : { selectedDeliveryId: input.selectedDeliveryId }),
      };
    },
    loadDeliveryDetail: async (input) => {
      const resolvedScope = sanitizeAdminTenantTargetScope(input.scope);
      const scopeKey =
        resolvedScope === undefined || input.scopeId === undefined
          ? undefined
          : targetKey({ scope: resolvedScope, scopeId: input.scopeId });
      const bucket =
        scopeKey === undefined ? undefined : webhooksData[scopeKey];
      const subscriptionIds =
        bucket === undefined
          ? []
          : bucket.subscriptions.map((sub) => sub.subscriptionId);
      const deliveries =
        resolvedScope === undefined || input.scopeId === undefined
          ? []
          : synthesizeOperatorWebhookDeliveries(
              resolvedScope,
              input.scopeId,
              subscriptionIds,
            );
      const match = deliveries.find(
        (delivery) => delivery.id === input.deliveryId,
      );
      if (match === undefined) {
        return {
          kind: "error",
          title: "Delivery not found",
          description:
            "The requested webhook delivery could not be located. The delivery id may be stale or already pruned.",
        };
      }
      return {
        kind: "ready",
        delivery: match,
        scope: input.scope ?? null,
        scopeId: input.scopeId ?? null,
      };
    },
    loadApiKeyDetail: async (input) => {
      const scopeKey = targetKey({
        scope: input.scope,
        scopeId: input.scopeId,
      });
      const bucket = webhooksData[scopeKey];
      const match =
        bucket === undefined
          ? undefined
          : clone(bucket.apiKeys).find(
              (candidate) => candidate.apiKeyId === input.keyId,
            );
      if (match === undefined) {
        return {
          kind: "error",
          title: "API key not found",
          description:
            "The requested webhook API key could not be located in the current tenant scope. The key id may be stale or already revoked.",
        };
      }
      return {
        kind: "ready",
        apiKey: match,
        scope: input.scope,
        scopeId: input.scopeId,
      };
    },
    loadVendorList: async () => buildVendorAggregateReady(),
    loadVendorDetail: async (input) => {
      const aggregate = buildVendorAggregate();
      const entry = aggregate.entries.find(
        (candidate) => candidate.serviceName === input.serviceName,
      );
      if (entry === undefined) {
        return {
          kind: "error",
          title: "Vendor not found",
          description: `No vendor-health entry was reported for service '${input.serviceName}' in the current aggregate. The aggregator may not yet expose a healthcheck for this adapter, or the entry was pruned.`,
        };
      }
      const partialFailure = aggregate.partialFailures.find(
        (candidate) => candidate.serviceName === input.serviceName,
      );
      return {
        kind: "ready",
        entry,
        correlationId: aggregate.correlationId,
        generatedAt: aggregate.generatedAt,
        ...(partialFailure === undefined ? {} : { partialFailure }),
      };
    },
    loadNotifyList: async (input) => ({
      kind: "ready",
      filters: input.filters,
      result: {
        notifications: [
          {
            notificationId: "ntf_fixture_1",
            channel: notificationChannel.email,
            status: notificationDeliveryStatus.delivered,
            recipientProjection: "ops-recipient@example.test",
            subjectProjection: "Welcome to the workspace",
            createdAt: new Date(0).toISOString(),
            deliveredAt: new Date(1000).toISOString(),
          },
          {
            notificationId: "ntf_fixture_2",
            channel: notificationChannel.email,
            status: notificationDeliveryStatus.failed,
            recipientProjection: "ops-recipient2@example.test",
            subjectProjection: "Password reset",
            createdAt: new Date(2000).toISOString(),
            lastError: "Provider rejected the recipient address.",
          },
        ],
      },
    }),
    loadNotifyDetail: async (input) => ({
      kind: "ready",
      notification: {
        notificationId: input.notificationId,
        channel: notificationChannel.email,
        status: notificationDeliveryStatus.delivered,
        recipientProjection: "ops-recipient@example.test",
        subjectProjection: "Welcome to the workspace",
        createdAt: new Date(0).toISOString(),
        deliveredAt: new Date(1000).toISOString(),
        payloadProjection: '{ "template": "welcome" }',
        providerMetadata: '{ "providerId": "novu" }',
        auditCorrelationId: "corr_ntf_fixture",
      },
    }),
    loadAdminProfile: async () => ({
      kind: "ready",
      profile: {
        identity: {
          actorId: "usr_platform_operator",
          username: "operator@comvestec.com",
          email: "operator@comvestec.com",
          displayName: "Comvestec Platform Operator",
          actorType: actorType.platformOperator,
          enabled: true,
        },
        sessionId: "sess_admin_profile_fixture",
        capabilities: operatorProfile.capabilities,
      },
    }),
    loadAdminMembers: async (input) => ({
      kind: "ready",
      filter: input.filter,
      members: clone(adminMembers),
    }),
    loadAdminMemberDetail: async (input) => {
      const member = adminMembers.find(
        (candidate) => candidate.id === input.memberId,
      );

      return member === undefined
        ? {
            kind: "error",
            title: "Admin member not found",
            description: `No admin organization member matched '${input.memberId}'.`,
          }
        : {
            kind: "ready",
            member: clone(member),
          };
    },
    loadAdminTokens: async (input) => ({
      kind: "ready",
      filter: input.filter,
      result: {
        tokens: clone(adminTokens),
        totals: computeAdminTokenTotals(),
      },
    }),
    loadAdminWorkspaces: async () => ({
      kind: "ready",
      ownerSubjectId: "usr_platform_operator",
      workspaces: clone(adminWorkspaces),
    }),
    loadAdminAudit: async () => ({
      kind: "ready",
      events: [
        {
          eventId: "evt_admin_audit_fixture_1",
          timestamp: new Date(0).toISOString(),
          actorId: "usr_platform_operator",
          moduleId: platformModuleId.adminOrganization,
          tenantScope: platformScope.platform,
          tenantScopeId: "platform",
          action: "admin-organization.member.invited",
          target: "adm_member_fixture_1",
          correlationId: "corr_admin_audit_fixture_1",
        },
        {
          eventId: "evt_admin_audit_fixture_2",
          timestamp: new Date(1000).toISOString(),
          actorId: "usr_platform_operator",
          moduleId: platformModuleId.adminOrganization,
          tenantScope: platformScope.platform,
          tenantScopeId: "platform",
          action: "admin-organization.member.role-changed",
          target: "adm_member_fixture_1",
        },
      ],
    }),
    loadWorkflowRunsList: async (input) => ({
      kind: "ready",
      filters: input.filters,
      result: {
        runs: [
          {
            runId: "wfr_fixture_1",
            moduleId: platformModuleId.workflowJobs,
            workflowKey: "platform.audit-log.sweep",
            status: workflowRunStatus.succeeded,
            queuedAt: new Date(0).toISOString(),
            startedAt: new Date(1000).toISOString(),
            finishedAt: new Date(2000).toISOString(),
            durationMs: 1000,
            attempt: 1,
          },
          {
            runId: "wfr_fixture_2",
            moduleId: platformModuleId.workflowJobs,
            workflowKey: "platform.notifications.flush",
            status: workflowRunStatus.failed,
            queuedAt: new Date(3000).toISOString(),
            startedAt: new Date(4000).toISOString(),
            finishedAt: new Date(5000).toISOString(),
            durationMs: 1000,
            attempt: 2,
            lastError: "Upstream provider timed out.",
          },
        ],
      },
    }),
    loadWorkflowRunDetail: async (input) => ({
      kind: "ready",
      run: {
        runId: input.runId,
        moduleId: platformModuleId.workflowJobs,
        workflowKey: "platform.audit-log.sweep",
        status: workflowRunStatus.succeeded,
        queuedAt: new Date(0).toISOString(),
        startedAt: new Date(1000).toISOString(),
        finishedAt: new Date(2000).toISOString(),
        durationMs: 1000,
        attempt: 1,
        steps: [
          {
            stepKey: "drain",
            status: workflowRunStatus.succeeded,
            startedAt: new Date(1000).toISOString(),
            finishedAt: new Date(1500).toISOString(),
          },
          {
            stepKey: "publish",
            status: workflowRunStatus.succeeded,
            startedAt: new Date(1500).toISOString(),
            finishedAt: new Date(2000).toISOString(),
          },
        ],
        payloadProjection: '{ "sweep": "daily" }',
        auditCorrelationId: "corr_wfr_fixture",
      },
    }),
    loadBilling: async () => ({ kind: "ready", gaps: clone(repairJobs) }),
    loadBillingList: async (input) => {
      const tenantTargets = input.tenantTargets;
      if (tenantTargets.length === 0) {
        return {
          kind: "ready",
          rows: [],
          posture: {
            tenantCount: 0,
            aggregateMrrMinorUnits: 0,
            aggregateArrMinorUnits: 0,
            currency: null,
          },
          ...(input.selectedTenantId === undefined
            ? {}
            : { selectedTenantId: input.selectedTenantId }),
        };
      }
      const rows = tenantTargets.map((tenant, index) => ({
        tenant,
        displayName: resolveAdminTenantTargetDisplayName(tenant),
        projection: {
          snapshot: {
            id: `proj_${tenant.scopeId}`,
            tenant,
            billingPeriodStart: new Date(0).toISOString(),
            billingPeriodEnd: new Date(0).toISOString(),
            subscriptionMrr: {
              currency: "USD",
              amountMinorUnits: 100_00 * (index + 1),
            },
            churnRate: 0,
            expansion: { currency: "USD", amountMinorUnits: 0 },
            contraction: { currency: "USD", amountMinorUnits: 0 },
            projectedNextPeriodRevenue: {
              currency: "USD",
              amountMinorUnits: 100_00 * (index + 1),
            },
            activeSubscriptionCount: 5 + index,
            sourcePolarAccountId: `acct_${tenant.scopeId}`,
            computedAt: new Date(0).toISOString(),
            correlationId: `corr_${tenant.scopeId}`,
          },
          isFresh: true,
        },
        customerCount: 3 + index,
      }));
      return {
        kind: "ready",
        rows,
        posture: {
          tenantCount: rows.length,
          aggregateMrrMinorUnits: rows.reduce(
            (acc, row) =>
              acc +
              (row.projection?.snapshot.subscriptionMrr.amountMinorUnits ?? 0),
            0,
          ),
          aggregateArrMinorUnits: rows.reduce(
            (acc, row) =>
              acc +
              (row.projection?.snapshot.subscriptionMrr.amountMinorUnits ?? 0) *
                12,
            0,
          ),
          currency: "USD",
        },
        ...(input.selectedTenantId === undefined
          ? {}
          : { selectedTenantId: input.selectedTenantId }),
      };
    },
    loadInvoiceDetail: async (input) => ({
      kind: "ready",
      invoiceId: input.invoiceId,
      tenant: input.tenant,
      customer: {
        summary: {
          customerId: input.customerId,
          externalId: input.tenant.scopeId,
          email: "billing@fixture.local",
          name: "Fixture Customer",
          billingAddress: {
            line1: "1 Fixture Way",
            city: "Cape Town",
            country: "ZA",
          },
          createdAt: new Date(0).toISOString(),
          totalSpendCents: 250_000,
          subscriptionCount: 2,
        },
        isFresh: true,
      },
    }),
    loadMeterDetail: async (input) => {
      const meterView = {
        summary: {
          meterSlug: input.meterSlug,
          displayName: `Fixture ${input.meterSlug}`,
          aggregation: "SUM" as const,
          eventType: "events.fixture",
          createdAt: new Date(0).toISOString(),
        },
        isFresh: true,
      };
      if (
        input.subject === undefined ||
        input.granularity === undefined ||
        input.window === undefined
      ) {
        return {
          kind: "ready",
          tenant: input.tenant,
          meter: meterView,
          usage: null,
        };
      }
      return {
        kind: "ready",
        tenant: input.tenant,
        meter: meterView,
        usage: {
          result: {
            id: `usage_${input.meterSlug}`,
            tenant: input.tenant,
            subject: input.subject,
            meterSlug: input.meterSlug,
            window: input.window,
            granularity: input.granularity,
            aggregated: [
              { windowStart: new Date(0).toISOString(), value: 10 },
              { windowStart: new Date(0).toISOString(), value: 20 },
              { windowStart: new Date(0).toISOString(), value: 15 },
            ],
            computedAt: new Date(0).toISOString(),
            correlationId: "corr_meter_fixture",
          },
          isFresh: true,
        },
      };
    },
    loadKeycloakUserDetail: async (input) => ({
      kind: "ready",
      tenant: input.tenant,
      user: {
        userId: input.userId,
        username: "fixture.operator",
        email: "fixture.operator@comvestec.com",
        firstName: "Fixture",
        lastName: "Operator",
        enabled: true,
        emailVerified: true,
        createdAt: new Date(0).toISOString(),
        lastLogin: new Date(60_000).toISOString(),
        requiredActions: ["UPDATE_PASSWORD"],
        realm: "comvestec-admin",
      },
      isFresh: true,
    }),
    loadKeycloakRoleDetail: async (input) => ({
      kind: "ready",
      tenant: input.tenant,
      role: {
        roleId: input.roleId,
        roleName: "tenant-admin",
        description: "Tenant-wide administrative role.",
        composite: true,
        clientRole: false,
        realm: "comvestec-admin",
        compositeRoles: [
          {
            roleId: "kc_role_support",
            roleName: "tenant-support",
            description: "Support operator role.",
            composite: false,
            clientRole: false,
          },
        ],
        members: [
          {
            userId: "kc_usr_fixture_1",
            username: "fixture.member",
            email: "fixture.member@comvestec.com",
            enabled: true,
          },
          {
            userId: "kc_usr_fixture_2",
            username: "fixture.viewer",
            email: "fixture.viewer@comvestec.com",
            enabled: false,
          },
        ],
      },
      isFresh: true,
    }),
    loadBrandingList: async (input) => {
      const rows = input.tenantTargets.map((tenant) => {
        if (tenant.scope !== "enterprise" && tenant.scope !== "organization") {
          return {
            tenant,
            branding: null,
            unsupported: true,
          };
        }
        return {
          tenant,
          branding: {
            scope: tenant.scope,
            scopeId: tenant.scopeId,
            companyName: `Fixture ${tenant.scopeId}`,
            customDomainStatus: "verifying" as const,
            effectiveScope: tenant.scope,
            changedAt: new Date(0).toISOString(),
          },
          unsupported: false,
        };
      });
      return {
        kind: "ready",
        rows,
        ...(input.selectedTenantId === undefined
          ? {}
          : { selectedTenantId: input.selectedTenantId }),
      };
    },
    loadDomainDetail: async (input) => {
      if (
        input.tenant.scope !== "enterprise" &&
        input.tenant.scope !== "organization"
      ) {
        return {
          kind: "denied",
          reason:
            "Custom-domain lifecycle is only available for enterprise or organization tenants.",
        };
      }
      return {
        kind: "ready",
        hostname: input.hostname,
        tenant: input.tenant,
        lifecycleState: "verifying" as const,
        dnsRecords: [
          {
            recordType: "TXT" as const,
            host: `_comvestec-verify.${input.hostname}`,
            value: `comvestec-domain-verify=${input.tenant.scope}:${input.tenant.scopeId}`,
          },
          {
            recordType: "CNAME" as const,
            host: input.hostname,
            value: "tenant-edge.comvestec.app",
          },
        ],
        changedAt: new Date(0).toISOString(),
      };
    },
    loadRuntimeConfig: async () => ({
      kind: "ready",
      overrides: clone(runtimeOverrides),
      proposals: clone(runtimeProposals),
    }),
    loadFeatureFlags: async () => ({
      kind: "ready",
      flags: clone(featureFlags),
    }),
    loadAccessControl: async (input = {}) => {
      const tupleQuery = buildTupleQuery({
        tuples: authorizationTuples,
        filters: input,
      });

      return tupleQuery === undefined
        ? {
            kind: "ready",
            profiles: clone(projectionProfiles),
            actionPolicies: clone(actionPolicies),
            operatorDirectory: buildOperatorDirectorySnapshot(),
          }
        : {
            kind: "ready",
            profiles: clone(projectionProfiles),
            actionPolicies: clone(actionPolicies),
            operatorDirectory: buildOperatorDirectorySnapshot(),
            tupleQuery,
          };
    },
    loadAuditLog: async (moduleId) => ({
      kind: "ready",
      events: clone(
        auditEvents.filter(
          (event) => event.moduleId === (moduleId ?? platformModuleId.auditLog),
        ),
      ),
    }),
    loadAuditLogV2: async (rawSearch): Promise<AdminAuditLogV2RouteData> => {
      const moduleId =
        typeof rawSearch.module === "string" && rawSearch.module.length > 0
          ? (rawSearch.module as typeof platformModuleId.auditLog)
          : platformModuleId.auditLog;
      const filtered = auditEvents.filter(
        (event) => event.moduleId === moduleId,
      );
      const windowPreset =
        rawSearch.window === "1h" ||
        rawSearch.window === "6h" ||
        rawSearch.window === "24h" ||
        rawSearch.window === "7d" ||
        rawSearch.window === "custom"
          ? rawSearch.window
          : "24h";
      return {
        kind: "ready",
        events: clone(filtered),
        filters: {
          module: moduleId,
          window: windowPreset,
          liveTail: rawSearch.tail === "1" || rawSearch.tail === "true",
        },
        appliedQueryMode: "by-module",
        totalBeforeLocalFilter: filtered.length,
      };
    },
    loadGovernanceConfigV2: async (
      input,
    ): Promise<AdminGovernanceConfigV2RouteData> => {
      const moduleId = input.moduleId ?? platformModuleId.runtimeConfig;
      const overrides = clone(runtimeOverrides).map((override) => ({
        ...override,
        value: override.value == null ? null : String(override.value),
      }));
      const proposals = clone(runtimeProposals).map((proposal) => {
        const { value, runtimeValue, codeValue, ...rest } = proposal;
        return {
          ...rest,
          value: value == null ? null : String(value),
          ...(runtimeValue === undefined
            ? {}
            : {
                runtimeValue:
                  runtimeValue == null ? null : String(runtimeValue),
              }),
          ...(codeValue === undefined
            ? {}
            : { codeValue: codeValue == null ? null : String(codeValue) }),
        };
      });
      const selectedKey =
        input.key !== undefined && input.key.length > 0 ? input.key : undefined;
      const selectedOverride =
        selectedKey === undefined
          ? undefined
          : overrides.find((override) => override.key === selectedKey);
      const selectedProposals =
        selectedKey === undefined
          ? []
          : proposals.filter((proposal) => proposal.key === selectedKey);
      return {
        kind: "ready",
        moduleId,
        overrides,
        proposals,
        ...(selectedKey === undefined ? {} : { selectedKey }),
        ...(selectedOverride === undefined ? {} : { selectedOverride }),
        selectedProposals,
      };
    },
    loadGovernanceFlagV2: async (
      input,
    ): Promise<AdminGovernanceFlagV2RouteData> => {
      const moduleId = input.moduleId ?? platformModuleId.featureFlags;
      const flags = clone(featureFlags);
      const selectedFlagKey =
        input.flagKey !== undefined && input.flagKey.length > 0
          ? input.flagKey
          : undefined;
      const selectedFlag =
        selectedFlagKey === undefined
          ? undefined
          : flags.find((flag) => flag.key === selectedFlagKey);
      return {
        kind: "ready",
        moduleId,
        flags,
        ...(selectedFlagKey === undefined ? {} : { selectedFlagKey }),
        ...(selectedFlag === undefined ? {} : { selectedFlag }),
      };
    },
    loadGovernanceAccessV2: async (
      input,
    ): Promise<AdminGovernanceAccessV2RouteData> => {
      const tupleQuery = buildTupleQuery({
        tuples: authorizationTuples,
        filters: input,
      });
      const filteredActionPolicies = actionPolicies.filter(
        (policy) =>
          policy.actionId ===
            adminGovernanceActionPolicyId.authorizationTupleWrite ||
          policy.actionId ===
            adminGovernanceActionPolicyId.authorizationTupleDelete,
      );
      return {
        kind: "ready",
        projectionProfiles: clone(projectionProfiles),
        actionPolicies: clone(filteredActionPolicies),
        memberships: buildOperatorDirectorySnapshot(),
        permissionScopes: [...permissionScopes],
        ...(tupleQuery === undefined ? {} : { tupleQuery }),
      };
    },
    loadTenantWorkspaceIndex: async () => ({
      kind: "ready",
      targets: clone(tenantTargets),
    }),
    loadTenantWorkspaceV2: async (
      input,
    ): Promise<AdminTenantWorkspaceV2RouteData> => ({
      kind: "ready",
      snapshot: buildTenantWorkspaceV2Snapshot(input),
      partialFailures: [],
    }),
    loadBranding: async (scope, scopeId) => {
      const resolvedScope = sanitizeAdminTenantTargetScope(scope);

      if (
        resolvedScope === undefined ||
        scopeId === undefined ||
        scopeId.trim().length === 0
      ) {
        return { kind: "no-scope" };
      }

      if (resolvedScope === platformScope.individual) {
        return {
          kind: "denied",
          reason:
            "Branding view currently supports organization and enterprise tenant targets.",
        };
      }

      const key = targetKey({ scope: resolvedScope, scopeId });
      const branding = brandingViews[key];

      return branding === undefined
        ? { kind: "no-scope" }
        : { kind: "ready", branding };
    },
    loadCompliance: async (scope, scopeId) => {
      const resolvedScope = sanitizeAdminTenantTargetScope(scope);

      if (
        resolvedScope === undefined ||
        scopeId === undefined ||
        scopeId.trim().length === 0
      ) {
        return { kind: "no-scope" };
      }

      const data = complianceData[targetKey({ scope: resolvedScope, scopeId })];

      return data === undefined
        ? { kind: "no-scope" }
        : {
            kind: "ready",
            policies: clone(data.policies),
            holds: clone(data.holds),
          };
    },
    loadWebhooks: async (scope, scopeId) => {
      const resolvedScope = sanitizeAdminTenantTargetScope(scope);

      if (
        resolvedScope === undefined ||
        scopeId === undefined ||
        scopeId.trim().length === 0
      ) {
        return { kind: "no-scope" };
      }

      const data = webhooksData[targetKey({ scope: resolvedScope, scopeId })];

      return data === undefined
        ? { kind: "no-scope" }
        : {
            kind: "ready",
            subscriptions: clone(data.subscriptions),
            apiKeys: clone(data.apiKeys),
          };
    },
    loadUniversalSearch: async (input) => {
      if (input.query.trim().length === 0) {
        return { kind: "shell" };
      }
      // Default browser-harness universal-search response: a
      // deterministic single tenant hit so the omnibar can be
      // exercised end-to-end without standing up the live
      // federated index. Per-test overrides replace this entry
      // through the `loadUniversalSearch` fixture seam.
      return {
        kind: "ready",
        fromCache: false,
        result: {
          query: input.query,
          entries: [
            {
              facet: "tenants",
              id: "ten_omnibar_fixture",
              label: `Omnibar tenant match for "${input.query}"`,
              scopeTag: "tenant",
              permalink: "/r/tenant/ten_omnibar_fixture",
              fieldClassification: "public",
            },
          ],
          partialFailures: [],
          indexFreshness: {
            lastReindexedAt: new Date(0).toISOString(),
            isFresh: true,
          },
          correlationId: "corr_omnibar_fixture",
          generatedAt: new Date(0).toISOString(),
        },
      };
    },
    replayRepairGap: async ({ data }) => {
      const job = replaceRepairJob(data.jobId, (currentJob) => ({
        ...currentJob,
        status: workflowJobStatus.running,
        lastError: undefined,
        attempts: currentJob.attempts + 1,
        scheduledAt: timestamp(16, 9, 0),
      }));

      pushAuditEvent({
        eventId: `audit_event_replay_${job.jobId}`,
        timestamp: timestamp(16, 9, 1),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: job.tenantScope,
        tenantScopeId: job.tenantScopeId,
        moduleId: platformModuleId.workflowJobs,
        action: workflowJobsAuditAction.repairGapReplayed,
        target: job.jobId,
        reason: data.inspectionReason,
      });

      return { job: clone(job) };
    },
    cancelRepairGap: async ({ data }) => {
      const job = replaceRepairJob(data.jobId, (currentJob) => ({
        ...currentJob,
        status: workflowJobStatus.canceled,
        lastError: undefined,
      }));

      pushAuditEvent({
        eventId: `audit_event_cancel_${job.jobId}`,
        timestamp: timestamp(16, 9, 2),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: job.tenantScope,
        tenantScopeId: job.tenantScopeId,
        moduleId: platformModuleId.workflowJobs,
        action: workflowJobsAuditAction.repairGapCanceled,
        target: job.jobId,
        reason: data.inspectionReason,
      });

      return { job: clone(job) };
    },
    deleteAccessTuple: async ({ data }) => {
      const tupleIndex = authorizationTuples.findIndex(
        (tuple) =>
          tuple.namespace === data.tuple.namespace &&
          tuple.object === data.tuple.object &&
          tuple.relation === data.tuple.relation &&
          tuple.subject === data.tuple.subject,
      );

      if (tupleIndex === -1) {
        throw new Error("Authorization tuple no longer exists.");
      }

      authorizationTuples.splice(tupleIndex, 1);

      pushAuditEvent({
        eventId: `audit_event_tuple_${data.tuple.subject}`,
        timestamp: timestamp(16, 9, 3),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: platformScope.organization,
        tenantScopeId: operatorTargets.organization.scopeId,
        moduleId: platformModuleId.authorization,
        action: authorizationAuditAction.tupleChanged,
        target: `${data.tuple.namespace}:${data.tuple.object}:${data.tuple.relation}:${data.tuple.subject}`,
        reason: data.reason,
      });
    },
    provisionAccessOperator: async ({ data }) => {
      const username = data.username ?? data.email;
      const existingIndex = adminOperators.findIndex(
        (operator) =>
          operator.username === username || operator.email === data.email,
      );
      const actorId =
        existingIndex === -1
          ? `usr_${username.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`
          : (adminOperators[existingIndex]?.actorId ?? "usr_platform_operator");
      const operator = {
        actorId,
        username,
        email: data.email,
        displayName: data.displayName,
        actorType: data.actorType,
        enabled: true,
      } as const;

      if (existingIndex === -1) {
        adminOperators = [...adminOperators, operator];
      } else {
        adminOperators = adminOperators.map((currentOperator, index) =>
          index === existingIndex ? operator : currentOperator,
        );
      }

      return {
        operator: clone(operator),
        updatedExisting: existingIndex !== -1,
        credentialHandoff: {
          signInUrl: "http://localhost:3004/sign-in",
          temporaryPassword: "Adm_fixture_operator!aA1",
        },
      };
    },
    mutateTenantMembership: async ({ data }) => {
      const { workspace, workspaceKey, tenant } = resolveWorkspace({
        tenantId: data.tenantId,
        scope: data.scope,
      });
      const existingMembership = workspace.memberships.find(
        (membership) => membership.subject === data.subject,
      ) ?? {
        subject: data.subject,
        relations: [] as Array<(typeof tenantMembershipRelations)[number]>,
      };
      const nextRelations =
        data.action === tenantMembershipMutationAction.grant
          ? existingMembership.relations.includes(data.relation)
            ? existingMembership.relations
            : [...existingMembership.relations, data.relation]
          : existingMembership.relations.filter(
              (relation) => relation !== data.relation,
            );
      const changed =
        data.action === tenantMembershipMutationAction.grant
          ? !existingMembership.relations.includes(data.relation)
          : existingMembership.relations.includes(data.relation);
      const nextMembership = {
        subject: data.subject,
        relations: nextRelations,
      } as const;
      const existingIndex = workspace.memberships.findIndex(
        (membership) => membership.subject === data.subject,
      );
      const nextMemberships =
        nextMembership.relations.length === 0
          ? workspace.memberships.filter(
              (membership) => membership.subject !== data.subject,
            )
          : existingIndex === -1
            ? [...workspace.memberships, nextMembership]
            : workspace.memberships.map((membership, index) =>
                index === existingIndex ? nextMembership : membership,
              );

      workspaces[workspaceKey] = {
        ...workspace,
        memberships: nextMemberships,
      };

      pushAuditEvent({
        eventId: `audit_event_membership_${data.scope}_${data.tenantId}_${data.subject}_${data.relation}`,
        timestamp: timestamp(16, 9, 4),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: data.scope,
        tenantScopeId: data.tenantId,
        moduleId: platformModuleId.tenantManagement,
        action:
          data.action === tenantMembershipMutationAction.grant
            ? tenantManagementAuditAction.membershipGranted
            : tenantManagementAuditAction.membershipRevoked,
        target: data.subject,
        reason: data.mutationReason,
      });

      return {
        tenant,
        subject: data.subject,
        relation: data.relation,
        action: data.action,
        changed,
        membership: clone(nextMembership),
      };
    },
    issueTenantInvitation: async ({ data }) => {
      const { workspace, workspaceKey, tenant } = resolveWorkspace({
        tenantId: data.tenantId,
        scope: data.scope,
      });
      const invitation = {
        invitationId: `inv_${workspace.invitations.length + 1}_${data.scope}_${data.tenantId}`,
        recipientEmail: data.recipientEmail,
        relation: data.relation,
        status: tenantInvitationStatus.pending,
        issuedBy: capabilitySnapshot.actorId ?? "usr_platform_operator",
        issuedAt: timestamp(16, 9, 5),
        expiresAt: timestamp(20, 9, 5),
      } as const;

      workspaces[workspaceKey] = {
        ...workspace,
        invitations: [invitation, ...workspace.invitations],
      };
      pushAuditEvent({
        eventId: `audit_event_invitation_issue_${invitation.invitationId}`,
        timestamp: timestamp(16, 9, 6),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: data.scope,
        tenantScopeId: data.tenantId,
        moduleId: platformModuleId.tenantManagement,
        action: tenantManagementAuditAction.invitationIssued,
        target: invitation.recipientEmail,
        reason: data.issueReason,
      });

      return {
        tenant,
        invitation: clone(invitation),
        handoff: {
          invitationToken: `tok_${invitation.invitationId}`,
          expiresAt: invitation.expiresAt,
        },
        delivery: {
          status: "not-queued" as const,
          template: "tenant-invitation",
        },
      };
    },
    revokeTenantInvitation: async ({ data }) => {
      const { workspace, workspaceKey, tenant } = resolveWorkspace({
        tenantId: data.tenantId,
        scope: data.scope,
      });
      const invitationIndex = workspace.invitations.findIndex(
        (invitation) => invitation.invitationId === data.invitationId,
      );

      if (invitationIndex === -1) {
        throw new Error(`Unknown invitation: ${data.invitationId}`);
      }

      const currentInvitation = workspace.invitations[invitationIndex];

      if (currentInvitation === undefined) {
        throw new Error(
          `Invitation disappeared before revocation: ${data.invitationId}`,
        );
      }

      const changed =
        currentInvitation.status === tenantInvitationStatus.pending;
      const nextInvitation = changed
        ? {
            ...currentInvitation,
            status: tenantInvitationStatus.revoked,
            revokedAt: timestamp(16, 9, 7),
            revokedBy: capabilitySnapshot.actorId ?? "usr_platform_operator",
          }
        : currentInvitation;

      workspaces[workspaceKey] = {
        ...workspace,
        invitations: workspace.invitations.map((invitation, index) =>
          index === invitationIndex ? nextInvitation : invitation,
        ),
      };
      pushAuditEvent({
        eventId: `audit_event_invitation_revoke_${data.invitationId}`,
        timestamp: timestamp(16, 9, 8),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: data.scope,
        tenantScopeId: data.tenantId,
        moduleId: platformModuleId.tenantManagement,
        action: tenantManagementAuditAction.invitationRevoked,
        target: data.invitationId,
        reason: data.revocationReason,
      });

      return {
        tenant,
        invitationId: data.invitationId,
        changed,
        invitation: clone(nextInvitation),
      };
    },
    replayWorkflowRun: async ({ data }) => {
      const replayRunId = `${data.runId}_replay`;
      pushAuditEvent({
        eventId: `audit_event_workflow_run_replay_${data.runId}`,
        timestamp: timestamp(16, 10, 3),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: platformScope.organization,
        tenantScopeId: operatorTargets.organization.scopeId,
        moduleId: platformModuleId.workflowRunsAdmin,
        action: workflowRunsAdminAuditAction.replayed,
        target: data.runId,
        reason: data.reason,
        correlationId: replayRunId,
      });

      return {
        accepted: true as const,
        runId: data.runId,
        replayRunId,
      };
    },
    cancelWorkflowRun: async ({ data }) => {
      pushAuditEvent({
        eventId: `audit_event_workflow_run_cancel_${data.runId}`,
        timestamp: timestamp(16, 10, 4),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: platformScope.organization,
        tenantScopeId: operatorTargets.organization.scopeId,
        moduleId: platformModuleId.workflowRunsAdmin,
        action: workflowRunsAdminAuditAction.canceled,
        target: data.runId,
        reason: data.reason,
      });

      return {
        accepted: true as const,
        runId: data.runId,
      };
    },
    resendNotification: async ({ data }) => {
      const resendNotificationId = `${data.notificationId}_resend`;
      pushAuditEvent({
        eventId: `audit_event_notification_resend_${data.notificationId}`,
        timestamp: timestamp(16, 10, 5),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: platformScope.organization,
        tenantScopeId: operatorTargets.organization.scopeId,
        moduleId: platformModuleId.notificationCenterAdmin,
        action: notificationCenterAdminAuditAction.resent,
        target: data.notificationId,
        reason: data.reason,
        correlationId: resendNotificationId,
      });

      return {
        accepted: true as const,
        notificationId: data.notificationId,
        resendNotificationId,
      };
    },
    releaseBreakGlassGrant: async ({ data }) => {
      pushAuditEvent({
        eventId: `audit_event_break_glass_release_${data.caseId}`,
        timestamp: timestamp(16, 10, 6),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: platformScope.organization,
        tenantScopeId: operatorTargets.organization.scopeId,
        moduleId: platformModuleId.manualBreakGlass,
        action: manualBreakGlassAuditAction.release,
        target: data.caseId,
        reason: data.releaseReasonCatalogId,
      });

      return {
        caseId: data.caseId,
      };
    },
    releaseRunAsGrant: async ({ data }) => {
      runAsBannerState = {
        active: false,
        releasable: false,
      };

      pushAuditEvent({
        eventId: `audit_event_run_as_release_${data.grantId}`,
        timestamp: timestamp(16, 10, 6),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: platformScope.platform,
        tenantScopeId: "platform",
        moduleId: platformModuleId.runAsBannerState,
        action: runAsBannerStateAuditAction.released,
        target: data.grantId,
        reason: data.reasonId,
      });

      return {
        grantId: data.grantId,
      };
    },
    releaseLegalHold: async ({ data }) => {
      pushAuditEvent({
        eventId: `audit_event_legal_hold_release_${data.legalHoldId}`,
        timestamp: timestamp(16, 10, 7),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: platformScope.organization,
        tenantScopeId: operatorTargets.organization.scopeId,
        moduleId: platformModuleId.retentionLegalHold,
        action: retentionLegalHoldAuditAction.holdReleased,
        target: data.legalHoldId,
      });

      return {
        legalHoldId: data.legalHoldId,
      };
    },
    retryWebhookDelivery: async ({ data }) => {
      pushAuditEvent({
        eventId: `audit_event_webhook_delivery_retry_${data.deliveryId}`,
        timestamp: timestamp(16, 10, 8),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: platformScope.organization,
        tenantScopeId: operatorTargets.organization.scopeId,
        moduleId: platformModuleId.operatorWebhookDelivery,
        action: operatorWebhookDeliveryAuditAction.retried,
        target: data.deliveryId,
        reason: data.retryReasonCatalogId,
      });

      return {
        deliveryId: data.deliveryId,
      };
    },
    rotateWebhookApiKey: async ({ data }) => {
      pushAuditEvent({
        eventId: `audit_event_api_key_rotate_${data.apiKeyId}`,
        timestamp: timestamp(16, 10, 9),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: data.scope,
        tenantScopeId: data.scopeId,
        moduleId: platformModuleId.webhooksApiAccess,
        action: webhooksApiAccessAuditAction.apiKeyRotated,
        target: data.apiKeyId,
      });

      return {
        apiKeyId: data.apiKeyId,
      };
    },
    revokeWebhookApiKey: async ({ data }) => {
      pushAuditEvent({
        eventId: `audit_event_api_key_revoke_${data.apiKeyId}`,
        timestamp: timestamp(16, 10, 10),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: data.scope,
        tenantScopeId: data.scopeId,
        moduleId: platformModuleId.webhooksApiAccess,
        action: webhooksApiAccessAuditAction.apiKeyRevoked,
        target: data.apiKeyId,
      });

      return {
        apiKeyId: data.apiKeyId,
      };
    },
    verifyCustomDomain: async ({ data }) => {
      pushAuditEvent({
        eventId: `audit_event_custom_domain_activate_${data.hostname}`,
        timestamp: timestamp(16, 10, 11),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: data.scope,
        tenantScopeId: data.scopeId,
        moduleId: platformModuleId.tenantBranding,
        action: tenantBrandingAuditAction.customDomainLifecycleUpdated,
        target: data.hostname,
        reason: data.reasonId,
      });

      return {
        hostname: data.hostname,
      };
    },
    inviteAdminMember: async ({ data }) => {
      const invitationId = `adm_invitation_${adminMembers.length + 1}`;
      const invitationToken = `invite_${adminMembers.length + 1}_plaintext`;

      pushAuditEvent({
        eventId: `audit_event_admin_member_invite_${invitationId}`,
        timestamp: timestamp(16, 10, 12),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: platformScope.platform,
        tenantScopeId: "platform",
        moduleId: platformModuleId.adminOrganization,
        action: adminOrganizationAuditAction.memberInvited,
        target: invitationId,
        reason: data.reasonId,
      });

      return {
        memberId: invitationId,
        invitationId,
        email: data.email,
        invitationToken,
      };
    },
    removeAdminMember: async ({ data }) => {
      const memberIndex = adminMembers.findIndex(
        (member) => member.id === data.memberId,
      );
      if (memberIndex !== -1) {
        adminMembers.splice(memberIndex, 1);
      }

      pushAuditEvent({
        eventId: `audit_event_admin_member_remove_${data.memberId}`,
        timestamp: timestamp(16, 10, 13),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: platformScope.platform,
        tenantScopeId: "platform",
        moduleId: platformModuleId.adminOrganization,
        action: adminOrganizationAuditAction.memberRemoved,
        target: data.memberId,
        reason: data.reasonId,
      });

      return {
        memberId: data.memberId,
      };
    },
    createAdminWorkspace: async ({ data }) => {
      const workspaceId = `wsp_fixture_${adminWorkspaces.length + 1}`;
      const createdAt = timestamp(16, 10, 14);

      adminWorkspaces.push({
        id: workspaceId,
        ownerSubjectId: data.ownerSubjectId,
        name: data.name,
        position: adminWorkspaces.length + 1,
        serializedLayout: data.serializedLayout,
        createdAt,
        updatedAt: createdAt,
      });

      pushAuditEvent({
        eventId: `audit_event_admin_workspace_create_${workspaceId}`,
        timestamp: createdAt,
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: platformScope.platform,
        tenantScopeId: "platform",
        moduleId: platformModuleId.adminWorkspaces,
        action: adminWorkspacesAuditAction.create,
        target: workspaceId,
        reason: data.reasonId,
      });

      return {
        workspaceId,
        name: data.name,
      };
    },
    deleteAdminWorkspace: async ({ data }) => {
      const workspaceIndex = adminWorkspaces.findIndex(
        (workspace) => workspace.id === data.workspaceId,
      );
      if (workspaceIndex !== -1) {
        adminWorkspaces.splice(workspaceIndex, 1);
        adminWorkspaces.forEach((workspace, index) => {
          workspace.position = index + 1;
        });
      }

      pushAuditEvent({
        eventId: `audit_event_admin_workspace_delete_${data.workspaceId}`,
        timestamp: timestamp(16, 10, 15),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: platformScope.platform,
        tenantScopeId: "platform",
        moduleId: platformModuleId.adminWorkspaces,
        action: adminWorkspacesAuditAction.delete,
        target: data.workspaceId,
        reason: data.reasonId,
      });

      return {
        workspaceId: data.workspaceId,
      };
    },
    issueAdminOperatorTestToken: async ({ data }) => {
      const tokenId = `aot_fixture_${adminTokens.length + 1}`;
      const tokenPrefix = `aott_${(adminTokens.length + 1).toString().padStart(8, "0")}`;
      const issuedAt = timestamp(16, 10, 16);
      const plaintextToken = `${tokenPrefix}_plaintext`;

      adminTokens.unshift({
        id: tokenId,
        tokenPrefix,
        label: data.label,
        issuedBy: capabilitySnapshot.actorId ?? "usr_platform_operator",
        issuedAt,
        expiresAt: data.expiresAt,
      });

      pushAuditEvent({
        eventId: `audit_event_admin_token_issue_${tokenId}`,
        timestamp: issuedAt,
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: platformScope.platform,
        tenantScopeId: "platform",
        moduleId: platformModuleId.adminOperatorTestTokens,
        action: adminOperatorTestTokensAuditAction.issued,
        target: tokenId,
        reason: data.reasonCatalogId,
      });

      return {
        tokenId,
        label: data.label,
        tokenPrefix,
        plaintextToken,
      };
    },
    revokeAdminOperatorTestToken: async ({ data }) => {
      const token = adminTokens.find(
        (candidate) => candidate.id === data.tokenId,
      );
      if (token !== undefined) {
        token.revokedAt = timestamp(16, 10, 17);
      }

      pushAuditEvent({
        eventId: `audit_event_admin_token_revoke_${data.tokenId}`,
        timestamp: timestamp(16, 10, 17),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: platformScope.platform,
        tenantScopeId: "platform",
        moduleId: platformModuleId.adminOperatorTestTokens,
        action: adminOperatorTestTokensAuditAction.revoked,
        target: data.tokenId,
        reason: data.reasonCatalogId,
      });

      return {
        tokenId: data.tokenId,
      };
    },
    submitRuntimeConfigProposal: async ({ data }) => {
      const proposalId = `prop_${data.moduleId}_${data.key}_${Date.now()}`;
      const correlationId = `audit_event_runtime_config_submit_${proposalId}`;
      pushAuditEvent({
        eventId: correlationId,
        timestamp: timestamp(16, 10, 1),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: platformScope.organization,
        tenantScopeId: operatorTargets.organization.scopeId,
        moduleId: platformModuleId.runtimeConfig,
        action: runtimeConfigAuditAction.overrideProposed,
        target: `${data.moduleId}/${data.key}`,
        reason: data.approvalReason,
      });
      return {
        proposal: {
          proposalId,
          moduleId: data.moduleId,
          key: data.key,
          status: "pending" as const,
          approvalReason: data.approvalReason,
        },
        auditEvent: { correlationId },
      };
    },
    reviewRuntimeConfigProposal: async ({ data }) => {
      const correlationId = `audit_event_runtime_config_review_${data.proposalId}`;
      pushAuditEvent({
        eventId: correlationId,
        timestamp: timestamp(16, 10, 2),
        actorId: capabilitySnapshot.actorId ?? "usr_platform_operator",
        tenantScope: platformScope.organization,
        tenantScopeId: operatorTargets.organization.scopeId,
        moduleId: platformModuleId.runtimeConfig,
        action: runtimeConfigAuditAction.proposalReviewed,
        target: data.proposalId,
        reason: data.decisionReason,
      });
      return {
        proposal: {
          proposalId: data.proposalId,
          status: data.status,
          decisionReason: data.decisionReason,
        },
        auditEvent: { correlationId },
      };
    },
    submitFeatureFlagProposal: async ({ data }) => {
      const proposalId = `prop_${data.moduleId}_${data.key}_${Date.now()}`;
      const correlationId = `audit_event_feature_flag_submit_${proposalId}`;
      return {
        proposal: {
          proposalId,
          moduleId: data.moduleId,
          key: data.key,
          enabled: data.enabled,
          status: "pending" as const,
          approvalReason: data.approvalReason,
        },
        auditEvent: { correlationId },
      };
    },
    reviewFeatureFlagProposal: async ({ data }) => {
      const correlationId = `audit_event_feature_flag_review_${data.proposalId}`;
      return {
        proposal: {
          proposalId: data.proposalId,
          status: data.status,
          decisionReason: data.decisionReason,
        },
        auditEvent: { correlationId },
      };
    },
    revokeAuthorizationTuple: async ({ data }) => {
      const correlationId = `audit_event_tuple_revoke_${data.tuple.subject}`;
      return {
        auditEvent: { correlationId },
      };
    },
  };
};

export const knownAdminTargets = {
  organization: operatorTargets.organization,
  enterprise: operatorTargets.enterprise,
  individual: operatorTargets.individual,
} as const;
