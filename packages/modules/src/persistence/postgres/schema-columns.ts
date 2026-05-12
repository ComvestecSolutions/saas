import { getTableColumns } from "drizzle-orm";
import { postgresSchema } from "./schema";

export const postgresRecordTables = postgresSchema;

export const getPostgresSchemaColumnNames = () => ({
  auditLogEventsTable: Object.keys(
    getTableColumns(postgresSchema.auditLogEventsTable),
  ),
  retentionPoliciesTable: Object.keys(
    getTableColumns(postgresSchema.retentionPoliciesTable),
  ),
  retentionLegalHoldsTable: Object.keys(
    getTableColumns(postgresSchema.retentionLegalHoldsTable),
  ),
  supportOperationsCasesTable: Object.keys(
    getTableColumns(postgresSchema.supportOperationsCasesTable),
  ),
  supportOperationsBreakGlassIncidentsTable: Object.keys(
    getTableColumns(postgresSchema.supportOperationsBreakGlassIncidentsTable),
  ),
  supportOperationsImpersonationSessionsTable: Object.keys(
    getTableColumns(postgresSchema.supportOperationsImpersonationSessionsTable),
  ),
  runtimeConfigOverridesTable: Object.keys(
    getTableColumns(postgresSchema.runtimeConfigOverridesTable),
  ),
  runtimeConfigOverrideProposalsTable: Object.keys(
    getTableColumns(postgresSchema.runtimeConfigOverrideProposalsTable),
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
  searchTenantIndexesTable: Object.keys(
    getTableColumns(postgresSchema.searchTenantIndexesTable),
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
  emailDeliveryTrackingTable: Object.keys(
    getTableColumns(postgresSchema.emailDeliveryTrackingTable),
  ),
  emailRecipientSuppressionsTable: Object.keys(
    getTableColumns(postgresSchema.emailRecipientSuppressionsTable),
  ),
  importExportJobsTable: Object.keys(
    getTableColumns(postgresSchema.importExportJobsTable),
  ),
  notificationCenterEmailPreferencesTable: Object.keys(
    getTableColumns(postgresSchema.notificationCenterEmailPreferencesTable),
  ),
  notificationCenterEmailReceiptsTable: Object.keys(
    getTableColumns(postgresSchema.notificationCenterEmailReceiptsTable),
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
  webhookSubscriptionsTable: Object.keys(
    getTableColumns(postgresSchema.webhookSubscriptionsTable),
  ),
  webhookOutboundDeliveriesTable: Object.keys(
    getTableColumns(postgresSchema.webhookOutboundDeliveriesTable),
  ),
  webhookApiKeysTable: Object.keys(
    getTableColumns(postgresSchema.webhookApiKeysTable),
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
