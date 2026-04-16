import { auditLogEventsTable } from "./audit-log";
import {
  billingCustomerAccountsTable,
  billingEntitlementsTable,
  billingPaymentEventsTable,
  billingPlanEntitlementsTable,
  billingPlansTable,
  billingPlanPricesTable,
  billingSubscriptionsTable,
  webhookReceiptsTable,
} from "./billing";
import { identitySessionAuditTable } from "./identity-session";
import {
  runtimeConfigOverridesTable,
  runtimeConfigSyncArtifactsTable,
} from "./runtime-config";
import { tenantBrandingDomainVerificationTable } from "./tenant-branding";
import {
  tenantOnboardingRunsTable,
  tenantOnboardingStepsTable,
} from "./tenant-onboarding";
import { tenantProvisioningReceiptsTable } from "./tenant-provisioning";

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
} as const;
