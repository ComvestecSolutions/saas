import { getTableColumns } from "drizzle-orm";
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

export * from "./audit-log";
export * from "./audit-log-repository";
export * from "./database";
export * from "./billing";
export * from "./billing-state-repository";
export * from "./billing-webhook-replay-repository";
export * from "./billing-webhook-repository";
export * from "./identity-session-repository";
export * from "./identity-session";
export * from "./runtime-config";
export * from "./tenant-branding";
export * from "./tenant-onboarding-repository";
export * from "./tenant-onboarding";

export const postgresRecordTables = {
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
};

export const getPostgresSchemaColumnNames = () => ({
  auditLogEventsTable: Object.keys(getTableColumns(auditLogEventsTable)),
  runtimeConfigOverridesTable: Object.keys(
    getTableColumns(runtimeConfigOverridesTable),
  ),
  runtimeConfigSyncArtifactsTable: Object.keys(
    getTableColumns(runtimeConfigSyncArtifactsTable),
  ),
  identitySessionAuditTable: Object.keys(
    getTableColumns(identitySessionAuditTable),
  ),
  tenantBrandingDomainVerificationTable: Object.keys(
    getTableColumns(tenantBrandingDomainVerificationTable),
  ),
  billingEntitlementsTable: Object.keys(
    getTableColumns(billingEntitlementsTable),
  ),
  billingPlansTable: Object.keys(getTableColumns(billingPlansTable)),
  billingPlanPricesTable: Object.keys(getTableColumns(billingPlanPricesTable)),
  billingPlanEntitlementsTable: Object.keys(
    getTableColumns(billingPlanEntitlementsTable),
  ),
  billingCustomerAccountsTable: Object.keys(
    getTableColumns(billingCustomerAccountsTable),
  ),
  billingSubscriptionsTable: Object.keys(
    getTableColumns(billingSubscriptionsTable),
  ),
  billingPaymentEventsTable: Object.keys(
    getTableColumns(billingPaymentEventsTable),
  ),
  webhookReceiptsTable: Object.keys(getTableColumns(webhookReceiptsTable)),
  tenantOnboardingRunsTable: Object.keys(
    getTableColumns(tenantOnboardingRunsTable),
  ),
  tenantOnboardingStepsTable: Object.keys(
    getTableColumns(tenantOnboardingStepsTable),
  ),
});
