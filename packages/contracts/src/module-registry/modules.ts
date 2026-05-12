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
