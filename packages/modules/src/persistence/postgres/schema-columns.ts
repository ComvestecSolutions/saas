import { getTableColumns } from "drizzle-orm";
import { postgresSchema } from "./schema";

export const postgresRecordTables = postgresSchema;

export const getPostgresSchemaColumnNames = () => ({
  auditLogEventsTable: Object.keys(
    getTableColumns(postgresSchema.auditLogEventsTable),
  ),
  runtimeConfigOverridesTable: Object.keys(
    getTableColumns(postgresSchema.runtimeConfigOverridesTable),
  ),
  runtimeConfigSyncArtifactsTable: Object.keys(
    getTableColumns(postgresSchema.runtimeConfigSyncArtifactsTable),
  ),
  identitySessionAuditTable: Object.keys(
    getTableColumns(postgresSchema.identitySessionAuditTable),
  ),
  tenantBrandingDomainVerificationTable: Object.keys(
    getTableColumns(postgresSchema.tenantBrandingDomainVerificationTable),
  ),
  billingEntitlementsTable: Object.keys(
    getTableColumns(postgresSchema.billingEntitlementsTable),
  ),
  billingPlansTable: Object.keys(
    getTableColumns(postgresSchema.billingPlansTable),
  ),
  billingPlanPricesTable: Object.keys(
    getTableColumns(postgresSchema.billingPlanPricesTable),
  ),
  billingPlanEntitlementsTable: Object.keys(
    getTableColumns(postgresSchema.billingPlanEntitlementsTable),
  ),
  billingCustomerAccountsTable: Object.keys(
    getTableColumns(postgresSchema.billingCustomerAccountsTable),
  ),
  billingSubscriptionsTable: Object.keys(
    getTableColumns(postgresSchema.billingSubscriptionsTable),
  ),
  billingPaymentEventsTable: Object.keys(
    getTableColumns(postgresSchema.billingPaymentEventsTable),
  ),
  webhookReceiptsTable: Object.keys(
    getTableColumns(postgresSchema.webhookReceiptsTable),
  ),
  tenantOnboardingRunsTable: Object.keys(
    getTableColumns(postgresSchema.tenantOnboardingRunsTable),
  ),
  tenantOnboardingStepsTable: Object.keys(
    getTableColumns(postgresSchema.tenantOnboardingStepsTable),
  ),
  tenantProvisioningReceiptsTable: Object.keys(
    getTableColumns(postgresSchema.tenantProvisioningReceiptsTable),
  ),
  workflowJobsTable: Object.keys(
    getTableColumns(postgresSchema.workflowJobsTable),
  ),
});
