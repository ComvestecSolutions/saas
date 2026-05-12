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
] as const;

export const AuditActionSchema = Schema.Literal(...auditActions);

export type AuditAction = Schema.Schema.Type<typeof AuditActionSchema>;
