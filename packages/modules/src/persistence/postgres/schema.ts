import { identitySessionAuditTable } from "./access";
import {
  auditLogEventsTable,
  runtimeConfigOverridesTable,
  runtimeConfigSyncArtifactsTable,
} from "./governance";
import {
  billingCustomerAccountsTable,
  billingEntitlementsTable,
  billingPaymentEventsTable,
  billingPlanEntitlementsTable,
  billingPlansTable,
  billingPlanPricesTable,
  billingSubscriptionsTable,
  tenantBrandingDomainVerificationTable,
  tenantOnboardingRunsTable,
  tenantOnboardingStepsTable,
  tenantProvisioningReceiptsTable,
  webhookReceiptsTable,
} from "./domains";

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
