import { identitySessionAuditTable } from "./access/identity-session";
import { auditLogEventsTable } from "./governance/audit-log";
import {
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
import { tenantBrandingDomainVerificationTable } from "./domains/tenant-branding";
import {
  tenantOnboardingRunsTable,
  tenantOnboardingStepsTable,
} from "./domains/tenant-onboarding";
import { tenantProvisioningReceiptsTable } from "./domains/tenant-provisioning";
import { workflowJobsTable } from "./domains/workflow-jobs";

export {
  auditLogEventsTable,
  billingCustomerAccountsTable,
  billingEntitlementsTable,
  billingPaymentEventsTable,
  billingPlanEntitlementsTable,
  billingPlansTable,
  billingPlanPricesTable,
  billingSubscriptionsTable,
  identitySessionAuditTable,
  runtimeConfigOverridesTable,
  runtimeConfigSyncArtifactsTable,
  tenantBrandingDomainVerificationTable,
  tenantOnboardingRunsTable,
  tenantOnboardingStepsTable,
  tenantProvisioningReceiptsTable,
  webhookReceiptsTable,
  workflowJobsTable,
};

export const postgresSchema = {
  auditLogEventsTable,
  runtimeConfigOverridesTable,
  runtimeConfigSyncArtifactsTable,
  identitySessionAuditTable,
  tenantBrandingDomainVerificationTable,
  billingEntitlementsTable,
  billingPlansTable,
  billingPlanPricesTable,
  billingPlanEntitlementsTable,
  billingCustomerAccountsTable,
  billingSubscriptionsTable,
  billingPaymentEventsTable,
  webhookReceiptsTable,
  tenantOnboardingRunsTable,
  tenantOnboardingStepsTable,
  tenantProvisioningReceiptsTable,
  workflowJobsTable,
} as const;
