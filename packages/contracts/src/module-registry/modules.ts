import { Schema } from "effect";
import {
  DeclaredModuleConfigKeySchema,
  DeclaredModuleFeatureFlagKeySchema,
  moduleFeatureFlagDefaults,
} from "./key-factories";
import { PermissionScopeSchema } from "../access/permission-scopes";
import { PlatformScopeSchema } from "../access/platform-scopes";
import { ConfigSchemaTypeSchema } from "../data/config-schema-types";
import {
  DataClassificationDeclarationSchema,
  ProjectionDescriptorSchema,
} from "../data/descriptors";

const PlatformModuleIdConstantSchema = Schema.Struct({
  tenantManagement: Schema.Literal("tenant-management"),
  runtimeConfig: Schema.Literal("runtime-config"),
  authorization: Schema.Literal("authorization"),
  fieldSecurity: Schema.Literal("field-security"),
  auditLog: Schema.Literal("audit-log"),
  fileStorage: Schema.Literal("file-storage"),
  tenantBranding: Schema.Literal("tenant-branding"),
  observability: Schema.Literal("observability"),
  billingAndMetering: Schema.Literal("billing-and-metering"),
  notificationCenter: Schema.Literal("notification-center"),
  featureFlags: Schema.Literal("feature-flags"),
  identitySession: Schema.Literal("identity-session"),
  search: Schema.Literal("search"),
  workflowJobs: Schema.Literal("workflow-jobs"),
  emailDelivery: Schema.Literal("email-delivery"),
  webhooksApiAccess: Schema.Literal("webhooks-api-access"),
  importExport: Schema.Literal("import-export"),
  retentionLegalHold: Schema.Literal("retention-legal-hold"),
  supportOperations: Schema.Literal("support-operations"),
  adminOrganization: Schema.Literal("admin-organization"),
  adminSavedViews: Schema.Literal("admin-saved-views"),
  adminWorkspaces: Schema.Literal("admin-workspaces"),
  operationsHome: Schema.Literal("operations-home"),
  tenantWorkspace: Schema.Literal("tenant-workspace"),
  manualBreakGlass: Schema.Literal("manual-break-glass"),
  operatorWebhookDelivery: Schema.Literal("operator-webhook-delivery"),
  polarRevenueProjection: Schema.Literal("polar-revenue-projection"),
  openMeterUsageQuery: Schema.Literal("open-meter-usage-query"),
  vendorHealthAggregator: Schema.Literal("vendor-health-aggregator"),
  keycloakRoleRead: Schema.Literal("keycloak-role-read"),
  keycloakUserRead: Schema.Literal("keycloak-user-read"),
  polarCustomerRead: Schema.Literal("polar-customer-read"),
  openMeterMeterRead: Schema.Literal("open-meter-meter-read"),
  novuDeliveriesRead: Schema.Literal("novu-deliveries-read"),
  postalMailLogRead: Schema.Literal("postal-mail-log-read"),
  glitchTipIssuesRead: Schema.Literal("glitchtip-issues-read"),
  openPanelEventsRead: Schema.Literal("openpanel-events-read"),
  universalSearch: Schema.Literal("universal-search"),
  capabilitySnapshotV2: Schema.Literal("capability-snapshot-v2"),
  runAsBannerState: Schema.Literal("run-as-banner-state"),
  workflowRunsAdmin: Schema.Literal("workflow-runs-admin"),
  notificationCenterAdmin: Schema.Literal("notification-center-admin"),
  adminOperatorTestTokens: Schema.Literal("admin-operator-test-tokens"),
});

export const platformModuleId = Schema.validateSync(
  PlatformModuleIdConstantSchema,
)({
  tenantManagement: "tenant-management",
  runtimeConfig: "runtime-config",
  authorization: "authorization",
  fieldSecurity: "field-security",
  auditLog: "audit-log",
  fileStorage: "file-storage",
  tenantBranding: "tenant-branding",
  observability: "observability",
  billingAndMetering: "billing-and-metering",
  notificationCenter: "notification-center",
  featureFlags: "feature-flags",
  identitySession: "identity-session",
  search: "search",
  workflowJobs: "workflow-jobs",
  emailDelivery: "email-delivery",
  webhooksApiAccess: "webhooks-api-access",
  importExport: "import-export",
  retentionLegalHold: "retention-legal-hold",
  supportOperations: "support-operations",
  adminOrganization: "admin-organization",
  adminSavedViews: "admin-saved-views",
  adminWorkspaces: "admin-workspaces",
  operationsHome: "operations-home",
  tenantWorkspace: "tenant-workspace",
  manualBreakGlass: "manual-break-glass",
  operatorWebhookDelivery: "operator-webhook-delivery",
  polarRevenueProjection: "polar-revenue-projection",
  openMeterUsageQuery: "open-meter-usage-query",
  vendorHealthAggregator: "vendor-health-aggregator",
  keycloakRoleRead: "keycloak-role-read",
  keycloakUserRead: "keycloak-user-read",
  polarCustomerRead: "polar-customer-read",
  openMeterMeterRead: "open-meter-meter-read",
  novuDeliveriesRead: "novu-deliveries-read",
  postalMailLogRead: "postal-mail-log-read",
  glitchTipIssuesRead: "glitchtip-issues-read",
  openPanelEventsRead: "openpanel-events-read",
  universalSearch: "universal-search",
  capabilitySnapshotV2: "capability-snapshot-v2",
  runAsBannerState: "run-as-banner-state",
  workflowRunsAdmin: "workflow-runs-admin",
  notificationCenterAdmin: "notification-center-admin",
  adminOperatorTestTokens: "admin-operator-test-tokens",
} satisfies Schema.Schema.Type<typeof PlatformModuleIdConstantSchema>);

export const platformModuleIds = [
  platformModuleId.tenantManagement,
  platformModuleId.runtimeConfig,
  platformModuleId.authorization,
  platformModuleId.fieldSecurity,
  platformModuleId.auditLog,
  platformModuleId.fileStorage,
  platformModuleId.tenantBranding,
  platformModuleId.observability,
  platformModuleId.billingAndMetering,
  platformModuleId.notificationCenter,
  platformModuleId.featureFlags,
  platformModuleId.identitySession,
  platformModuleId.search,
  platformModuleId.workflowJobs,
  platformModuleId.emailDelivery,
  platformModuleId.webhooksApiAccess,
  platformModuleId.importExport,
  platformModuleId.retentionLegalHold,
  platformModuleId.supportOperations,
  platformModuleId.adminOrganization,
  platformModuleId.adminSavedViews,
  platformModuleId.adminWorkspaces,
  platformModuleId.operationsHome,
  platformModuleId.tenantWorkspace,
  platformModuleId.manualBreakGlass,
  platformModuleId.operatorWebhookDelivery,
  platformModuleId.polarRevenueProjection,
  platformModuleId.openMeterUsageQuery,
  platformModuleId.vendorHealthAggregator,
  platformModuleId.keycloakRoleRead,
  platformModuleId.keycloakUserRead,
  platformModuleId.polarCustomerRead,
  platformModuleId.openMeterMeterRead,
  platformModuleId.novuDeliveriesRead,
  platformModuleId.postalMailLogRead,
  platformModuleId.glitchTipIssuesRead,
  platformModuleId.openPanelEventsRead,
  platformModuleId.universalSearch,
  platformModuleId.capabilitySnapshotV2,
  platformModuleId.runAsBannerState,
  platformModuleId.workflowRunsAdmin,
  platformModuleId.notificationCenterAdmin,
  platformModuleId.adminOperatorTestTokens,
] as const;

export const PlatformModuleIdSchema = Schema.Literal(...platformModuleIds);

export type PlatformModuleId = Schema.Schema.Type<
  typeof PlatformModuleIdSchema
>;

export type ModuleEnabledFeatureFlagKey =
  `${PlatformModuleId}.${typeof moduleFeatureFlagDefaults.enabled}`;

export const getModuleEnabledFeatureFlagKey = (
  moduleId: PlatformModuleId,
): ModuleEnabledFeatureFlagKey =>
  `${moduleId}.${moduleFeatureFlagDefaults.enabled}`;

export const ConfigKeyDeclarationSchema = Schema.Struct({
  key: DeclaredModuleConfigKeySchema,
  description: Schema.NonEmptyString,
  schema: ConfigSchemaTypeSchema,
  defaultValue: Schema.Any,
  billable: Schema.Boolean,
  allowedScopes: Schema.Array(PlatformScopeSchema),
  owner: PlatformModuleIdSchema,
});

export type ConfigKeyDeclaration = Schema.Schema.Type<
  typeof ConfigKeyDeclarationSchema
>;

const FeatureFlagLifecycleConstantSchema = Schema.Struct({
  active: Schema.Literal("active"),
  deprecated: Schema.Literal("deprecated"),
  retired: Schema.Literal("retired"),
});

export const featureFlagLifecycle = Schema.validateSync(
  FeatureFlagLifecycleConstantSchema,
)({
  active: "active",
  deprecated: "deprecated",
  retired: "retired",
} satisfies Schema.Schema.Type<typeof FeatureFlagLifecycleConstantSchema>);

export const featureFlagLifecycles = [
  featureFlagLifecycle.active,
  featureFlagLifecycle.deprecated,
  featureFlagLifecycle.retired,
] as const;

export const FeatureFlagLifecycleSchema = Schema.Literal(
  ...featureFlagLifecycles,
);

export type FeatureFlagLifecycle = Schema.Schema.Type<
  typeof FeatureFlagLifecycleSchema
>;

export const FeatureFlagDeclarationSchema = Schema.Struct({
  key: DeclaredModuleFeatureFlagKeySchema,
  description: Schema.NonEmptyString,
  owner: PlatformModuleIdSchema,
  purpose: Schema.NonEmptyString,
  defaultEnabled: Schema.Boolean,
  billable: Schema.Boolean,
  allowedScopes: Schema.Array(PlatformScopeSchema),
  dependencies: Schema.Array(DeclaredModuleFeatureFlagKeySchema),
  lifecycle: FeatureFlagLifecycleSchema,
  retirementPlan: Schema.NonEmptyString,
});

export type FeatureFlagDeclaration = Schema.Schema.Type<
  typeof FeatureFlagDeclarationSchema
>;

export const ModuleConfigManifestSchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  configKeys: Schema.Array(ConfigKeyDeclarationSchema),
  featureFlags: Schema.Array(FeatureFlagDeclarationSchema),
  permissionScopes: Schema.Array(PermissionScopeSchema),
  fieldClassifications: Schema.Array(DataClassificationDeclarationSchema),
  projectionProfiles: Schema.Array(ProjectionDescriptorSchema),
});

export type ModuleConfigManifest = Schema.Schema.Type<
  typeof ModuleConfigManifestSchema
>;
