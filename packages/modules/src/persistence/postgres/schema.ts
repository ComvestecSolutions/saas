import { identitySessionAuditTable } from "./access/identity-session";
import { auditLogEventsTable } from "./governance/audit-log";
import {
  retentionLegalHoldsTable,
  retentionPoliciesTable,
} from "./governance/retention-legal-hold";
import {
  supportOperationsCasesTable,
  supportOperationsBreakGlassIncidentsTable,
  supportOperationsImpersonationSessionsTable,
} from "./governance/support-operations";
import {
  runtimeConfigOverrideProposalsTable,
  runtimeConfigOverridesTable,
  runtimeConfigSyncArtifactsTable,
} from "./governance/runtime-config";
import {
  billingCustomerAccountsTable,
  billingEntitlementsTable,
  billingPaymentEventsTable,
  billingPlanEntitlementsTable,
  billingPlansTable,
  billingPlanPricesTable,
  billingSubscriptionsTable,
  webhookReceiptsTable,
} from "./domains/billing";
import {
  webhookApiKeysTable,
  webhookOutboundDeliveriesTable,
  webhookSubscriptionsTable,
} from "./domains/webhooks-api-access";
import {
  emailDeliveryTrackingTable,
  emailRecipientSuppressionsTable,
} from "./domains/email-delivery";
import { importExportJobsTable } from "./domains/import-export";
import {
  notificationCenterEmailPreferencesTable,
  notificationCenterEmailReceiptsTable,
} from "./domains/notification-center";
import { tenantBrandingDomainVerificationTable } from "./domains/tenant-branding";
import {
  tenantOnboardingRunsTable,
  tenantOnboardingStepsTable,
} from "./domains/tenant-onboarding";
import { searchTenantIndexesTable } from "./domains/search";
import { tenantProvisioningReceiptsTable } from "./domains/tenant-provisioning";
import { tenantMembershipInvitationsTable } from "./domains/tenant-invitations";
import { workflowJobsTable } from "./domains/workflow-jobs";

export {
  auditLogEventsTable,
  billingCustomerAccountsTable,
  billingEntitlementsTable,
  emailDeliveryTrackingTable,
  emailRecipientSuppressionsTable,
  importExportJobsTable,
  notificationCenterEmailPreferencesTable,
  notificationCenterEmailReceiptsTable,
  billingPaymentEventsTable,
  billingPlanEntitlementsTable,
  billingPlansTable,
  billingPlanPricesTable,
  billingSubscriptionsTable,
  identitySessionAuditTable,
  retentionLegalHoldsTable,
  retentionPoliciesTable,
  supportOperationsCasesTable,
  supportOperationsBreakGlassIncidentsTable,
  supportOperationsImpersonationSessionsTable,
  runtimeConfigOverrideProposalsTable,
  runtimeConfigOverridesTable,
  runtimeConfigSyncArtifactsTable,
  searchTenantIndexesTable,
  tenantBrandingDomainVerificationTable,
  tenantMembershipInvitationsTable,
  tenantOnboardingRunsTable,
  tenantOnboardingStepsTable,
  tenantProvisioningReceiptsTable,
  webhookReceiptsTable,
  webhookApiKeysTable,
  webhookOutboundDeliveriesTable,
  webhookSubscriptionsTable,
  workflowJobsTable,
};

export const postgresSchema = {
  auditLogEventsTable,
  retentionPoliciesTable,
  retentionLegalHoldsTable,
  supportOperationsCasesTable,
  supportOperationsBreakGlassIncidentsTable,
  supportOperationsImpersonationSessionsTable,
  runtimeConfigOverrideProposalsTable,
  runtimeConfigOverridesTable,
  runtimeConfigSyncArtifactsTable,
  identitySessionAuditTable,
  tenantBrandingDomainVerificationTable,
  searchTenantIndexesTable,
  billingEntitlementsTable,
  billingPlansTable,
  billingPlanPricesTable,
  billingPlanEntitlementsTable,
  billingCustomerAccountsTable,
  billingSubscriptionsTable,
  billingPaymentEventsTable,
  emailDeliveryTrackingTable,
  emailRecipientSuppressionsTable,
  importExportJobsTable,
  notificationCenterEmailPreferencesTable,
  notificationCenterEmailReceiptsTable,
  webhookReceiptsTable,
  webhookApiKeysTable,
  webhookOutboundDeliveriesTable,
  webhookSubscriptionsTable,
  tenantMembershipInvitationsTable,
  tenantOnboardingRunsTable,
  tenantOnboardingStepsTable,
  tenantProvisioningReceiptsTable,
  workflowJobsTable,
} as const;
