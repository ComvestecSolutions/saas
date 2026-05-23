import { Schema } from "effect";
import { platformModuleId } from "../module-registry/modules";
import { defineModuleAuditActions } from "./audit-action-helpers";

export const authorizationAuditAction = defineModuleAuditActions(
  platformModuleId.authorization,
  {
    decisionPrivileged: "decision.privileged",
    tupleChanged: "tuple.changed",
  },
);

export const fieldSecurityAuditAction = defineModuleAuditActions(
  platformModuleId.fieldSecurity,
  {
    sensitiveRead: "sensitive-read",
  },
);

export const auditLogAuditAction = defineModuleAuditActions(
  platformModuleId.auditLog,
  {
    exported: "exported",
  },
);

export const runtimeConfigAuditAction = defineModuleAuditActions(
  platformModuleId.runtimeConfig,
  {
    overrideProposed: "override.proposed",
    overrideChanged: "override.changed",
    proposalReviewed: "proposal.reviewed",
  },
);

export const supportOperationsAuditAction = defineModuleAuditActions(
  platformModuleId.supportOperations,
  {
    impersonationStarted: "impersonation.started",
    impersonationRevoked: "impersonation.revoked",
    supportCaseUpserted: "support-case.upserted",
    breakGlassStarted: "break-glass.started",
    breakGlassReviewed: "break-glass.reviewed",
  },
);

export const billingAndMeteringAuditAction = defineModuleAuditActions(
  platformModuleId.billingAndMetering,
  {
    quotaBlocked: "quota.blocked",
    reconciliationTriggered: "reconciliation.triggered",
    reconciliationCanceled: "reconciliation.canceled",
  },
);

export const workflowJobsAuditAction = defineModuleAuditActions(
  platformModuleId.workflowJobs,
  {
    repairGapReplayed: "repair-gap.replayed",
    repairGapCanceled: "repair-gap.canceled",
  },
);

export const tenantManagementAuditAction = defineModuleAuditActions(
  platformModuleId.tenantManagement,
  {
    onboardingCompleted: "onboarding.completed",
    onboardingInspected: "onboarding.inspected",
    invitationsInspected: "invitations.inspected",
    invitationIssued: "invitation.issued",
    invitationRedeemed: "invitation.redeemed",
    invitationRevoked: "invitation.revoked",
    membershipsInspected: "memberships.inspected",
    membershipGranted: "membership.granted",
    membershipRevoked: "membership.revoked",
  },
);

export const tenantBrandingAuditAction = defineModuleAuditActions(
  platformModuleId.tenantBranding,
  {
    assetPublished: "asset.published",
    customDomainRequested: "custom-domain.requested",
    customDomainLifecycleUpdated: "custom-domain.lifecycle-updated",
  },
);

export const fileStorageAuditAction = defineModuleAuditActions(
  platformModuleId.fileStorage,
  {
    registered: "registered",
    downloadResolved: "download.resolved",
    deleted: "deleted",
  },
);

export const importExportAuditAction = defineModuleAuditActions(
  platformModuleId.importExport,
  {
    exportRequested: "export.requested",
    exportCompleted: "export.completed",
    exportInspected: "export.inspected",
  },
);

export const notificationCenterAuditAction = defineModuleAuditActions(
  platformModuleId.notificationCenter,
  {
    preferenceUpserted: "preference.upserted",
  },
);

export const searchAuditAction = defineModuleAuditActions(
  platformModuleId.search,
  {
    indexEnsureRequested: "index.ensure-requested",
    indexReindexRequested: "index.reindex-requested",
    indexDeleteRequested: "index.delete-requested",
    indexEnsured: "index.ensured",
    indexDeleted: "index.deleted",
    queryExecuted: "query.executed",
    queryPreviewed: "query.previewed",
  },
);

export const webhooksApiAccessAuditAction = defineModuleAuditActions(
  platformModuleId.webhooksApiAccess,
  {
    deliveryRequested: "delivery.requested",
    apiKeyCreated: "api-key.created",
    apiKeyRotated: "api-key.rotated",
    apiKeyRotationCompensated: "api-key.rotation-compensated",
    apiKeyRevoked: "api-key.revoked",
  },
);

export const retentionLegalHoldAuditAction = defineModuleAuditActions(
  platformModuleId.retentionLegalHold,
  {
    policyUpserted: "policy.upserted",
    holdPlaced: "hold.placed",
    holdReleased: "hold.released",
  },
);

export const adminOrganizationAuditAction = defineModuleAuditActions(
  platformModuleId.adminOrganization,
  {
    memberInvited: "member.invited",
    invitationRedeemed: "invitation.redeemed",
    memberRoleChanged: "member.role-changed",
    memberRemoved: "member.removed",
    ownerSeeded: "owner.seeded",
  },
);

export const adminSavedViewsAuditAction = defineModuleAuditActions(
  platformModuleId.adminSavedViews,
  {
    created: "created",
    updated: "updated",
    deleted: "deleted",
    pinned: "pinned",
    unpinned: "unpinned",
  },
);

export const adminWorkspacesAuditAction = defineModuleAuditActions(
  platformModuleId.adminWorkspaces,
  {
    create: "created",
    update: "updated",
    delete: "deleted",
    reorder: "reordered",
  },
);

export const operationsHomeAuditAction = defineModuleAuditActions(
  platformModuleId.operationsHome,
  {
    read: "read",
  },
);

export const tenantWorkspaceAuditAction = defineModuleAuditActions(
  platformModuleId.tenantWorkspace,
  {
    read: "read",
  },
);

export const manualBreakGlassAuditAction = defineModuleAuditActions(
  platformModuleId.manualBreakGlass,
  {
    issue: "issue",
    release: "release",
    autoExpire: "auto-expire",
  },
);

export const operatorWebhookDeliveryAuditAction = defineModuleAuditActions(
  platformModuleId.operatorWebhookDelivery,
  {
    enqueued: "enqueued",
    attempted: "attempted",
    delivered: "delivered",
    failed: "failed",
    exhausted: "exhausted",
    replayed: "replayed",
    retried: "retried",
    canceled: "canceled",
    replayGuardShortCircuit: "replay-guard.short-circuit",
  },
);

export const polarRevenueProjectionAuditAction = defineModuleAuditActions(
  platformModuleId.polarRevenueProjection,
  {
    snapshotComputed: "snapshot.computed",
    backfillRequested: "backfill.requested",
  },
);

export const openMeterUsageQueryAuditAction = defineModuleAuditActions(
  platformModuleId.openMeterUsageQuery,
  {
    queryExecuted: "query.executed",
    backfillRequested: "backfill.requested",
  },
);

export const vendorHealthAggregatorAuditAction = defineModuleAuditActions(
  platformModuleId.vendorHealthAggregator,
  {
    snapshotComputed: "snapshot.computed",
  },
);

export const keycloakUserReadAuditAction = defineModuleAuditActions(
  platformModuleId.keycloakUserRead,
  {
    readPerformed: "read.performed",
  },
);

export const polarCustomerReadAuditAction = defineModuleAuditActions(
  platformModuleId.polarCustomerRead,
  {
    readPerformed: "read.performed",
  },
);

export const openMeterMeterReadAuditAction = defineModuleAuditActions(
  platformModuleId.openMeterMeterRead,
  {
    readPerformed: "read.performed",
  },
);

export const novuDeliveriesReadAuditAction = defineModuleAuditActions(
  platformModuleId.novuDeliveriesRead,
  {
    readPerformed: "read.performed",
  },
);

export const postalMailLogReadAuditAction = defineModuleAuditActions(
  platformModuleId.postalMailLogRead,
  {
    readPerformed: "read.performed",
  },
);

export const glitchTipIssuesReadAuditAction = defineModuleAuditActions(
  platformModuleId.glitchTipIssuesRead,
  {
    readPerformed: "read.performed",
  },
);

export const openPanelEventsReadAuditAction = defineModuleAuditActions(
  platformModuleId.openPanelEventsRead,
  {
    readPerformed: "read.performed",
  },
);

export const universalSearchAuditAction = defineModuleAuditActions(
  platformModuleId.universalSearch,
  {
    queryExecuted: "query.executed",
    reindexRequested: "reindex.requested",
  },
);

export const capabilitySnapshotV2AuditAction = defineModuleAuditActions(
  platformModuleId.capabilitySnapshotV2,
  {
    snapshotDerived: "snapshot.derived",
    cacheInvalidated: "cache.invalidated",
  },
);

export const runAsBannerStateAuditAction = defineModuleAuditActions(
  platformModuleId.runAsBannerState,
  {
    queried: "queried",
    released: "released",
  },
);

export const workflowRunsAdminAuditAction = defineModuleAuditActions(
  platformModuleId.workflowRunsAdmin,
  {
    listed: "listed",
    detailRead: "detail-read",
    replayed: "replayed",
    canceled: "canceled",
  },
);

export const notificationCenterAdminAuditAction = defineModuleAuditActions(
  platformModuleId.notificationCenterAdmin,
  {
    listed: "listed",
    detailRead: "detail-read",
    resent: "resent",
  },
);

export const adminOperatorTestTokensAuditAction = defineModuleAuditActions(
  platformModuleId.adminOperatorTestTokens,
  {
    issued: "issued",
    revoked: "revoked",
    listed: "listed",
    usedSuccess: "used.success",
    usedFailure: "used.failure",
  },
);

export const auditActions = [
  authorizationAuditAction.decisionPrivileged,
  authorizationAuditAction.tupleChanged,
  fieldSecurityAuditAction.sensitiveRead,
  auditLogAuditAction.exported,
  runtimeConfigAuditAction.overrideProposed,
  runtimeConfigAuditAction.overrideChanged,
  runtimeConfigAuditAction.proposalReviewed,
  supportOperationsAuditAction.impersonationStarted,
  supportOperationsAuditAction.impersonationRevoked,
  supportOperationsAuditAction.supportCaseUpserted,
  supportOperationsAuditAction.breakGlassStarted,
  supportOperationsAuditAction.breakGlassReviewed,
  billingAndMeteringAuditAction.quotaBlocked,
  billingAndMeteringAuditAction.reconciliationTriggered,
  billingAndMeteringAuditAction.reconciliationCanceled,
  workflowJobsAuditAction.repairGapReplayed,
  workflowJobsAuditAction.repairGapCanceled,
  tenantManagementAuditAction.onboardingCompleted,
  tenantManagementAuditAction.onboardingInspected,
  tenantManagementAuditAction.invitationsInspected,
  tenantManagementAuditAction.invitationIssued,
  tenantManagementAuditAction.invitationRedeemed,
  tenantManagementAuditAction.invitationRevoked,
  tenantManagementAuditAction.membershipsInspected,
  tenantManagementAuditAction.membershipGranted,
  tenantManagementAuditAction.membershipRevoked,
  tenantBrandingAuditAction.assetPublished,
  tenantBrandingAuditAction.customDomainRequested,
  tenantBrandingAuditAction.customDomainLifecycleUpdated,
  fileStorageAuditAction.registered,
  fileStorageAuditAction.downloadResolved,
  fileStorageAuditAction.deleted,
  importExportAuditAction.exportRequested,
  importExportAuditAction.exportCompleted,
  importExportAuditAction.exportInspected,
  notificationCenterAuditAction.preferenceUpserted,
  searchAuditAction.indexEnsureRequested,
  searchAuditAction.indexReindexRequested,
  searchAuditAction.indexDeleteRequested,
  searchAuditAction.indexEnsured,
  searchAuditAction.indexDeleted,
  searchAuditAction.queryExecuted,
  searchAuditAction.queryPreviewed,
  webhooksApiAccessAuditAction.deliveryRequested,
  webhooksApiAccessAuditAction.apiKeyCreated,
  webhooksApiAccessAuditAction.apiKeyRotated,
  webhooksApiAccessAuditAction.apiKeyRotationCompensated,
  webhooksApiAccessAuditAction.apiKeyRevoked,
  retentionLegalHoldAuditAction.policyUpserted,
  retentionLegalHoldAuditAction.holdPlaced,
  retentionLegalHoldAuditAction.holdReleased,
  adminOrganizationAuditAction.memberInvited,
  adminOrganizationAuditAction.invitationRedeemed,
  adminOrganizationAuditAction.memberRoleChanged,
  adminOrganizationAuditAction.memberRemoved,
  adminOrganizationAuditAction.ownerSeeded,
  adminSavedViewsAuditAction.created,
  adminSavedViewsAuditAction.updated,
  adminSavedViewsAuditAction.deleted,
  adminSavedViewsAuditAction.pinned,
  adminSavedViewsAuditAction.unpinned,
  adminWorkspacesAuditAction.create,
  adminWorkspacesAuditAction.update,
  adminWorkspacesAuditAction.delete,
  adminWorkspacesAuditAction.reorder,
  operationsHomeAuditAction.read,
  tenantWorkspaceAuditAction.read,
  manualBreakGlassAuditAction.issue,
  manualBreakGlassAuditAction.release,
  manualBreakGlassAuditAction.autoExpire,
  operatorWebhookDeliveryAuditAction.enqueued,
  operatorWebhookDeliveryAuditAction.attempted,
  operatorWebhookDeliveryAuditAction.delivered,
  operatorWebhookDeliveryAuditAction.failed,
  operatorWebhookDeliveryAuditAction.exhausted,
  operatorWebhookDeliveryAuditAction.replayed,
  operatorWebhookDeliveryAuditAction.retried,
  operatorWebhookDeliveryAuditAction.canceled,
  operatorWebhookDeliveryAuditAction.replayGuardShortCircuit,
  polarRevenueProjectionAuditAction.snapshotComputed,
  polarRevenueProjectionAuditAction.backfillRequested,
  openMeterUsageQueryAuditAction.queryExecuted,
  openMeterUsageQueryAuditAction.backfillRequested,
  vendorHealthAggregatorAuditAction.snapshotComputed,
  keycloakUserReadAuditAction.readPerformed,
  polarCustomerReadAuditAction.readPerformed,
  openMeterMeterReadAuditAction.readPerformed,
  novuDeliveriesReadAuditAction.readPerformed,
  postalMailLogReadAuditAction.readPerformed,
  glitchTipIssuesReadAuditAction.readPerformed,
  openPanelEventsReadAuditAction.readPerformed,
  universalSearchAuditAction.queryExecuted,
  universalSearchAuditAction.reindexRequested,
  capabilitySnapshotV2AuditAction.snapshotDerived,
  capabilitySnapshotV2AuditAction.cacheInvalidated,
  runAsBannerStateAuditAction.queried,
  runAsBannerStateAuditAction.released,
  workflowRunsAdminAuditAction.listed,
  workflowRunsAdminAuditAction.detailRead,
  workflowRunsAdminAuditAction.replayed,
  workflowRunsAdminAuditAction.canceled,
  notificationCenterAdminAuditAction.listed,
  notificationCenterAdminAuditAction.detailRead,
  notificationCenterAdminAuditAction.resent,
  adminOperatorTestTokensAuditAction.issued,
  adminOperatorTestTokensAuditAction.revoked,
  adminOperatorTestTokensAuditAction.listed,
  adminOperatorTestTokensAuditAction.usedSuccess,
  adminOperatorTestTokensAuditAction.usedFailure,
] as const;

export const AuditActionSchema = Schema.Literal(...auditActions);

export type AuditAction = Schema.Schema.Type<typeof AuditActionSchema>;
