import {
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import type {
  ModuleConfigManifest,
  PermissionDescriptor,
  ProjectionDescriptor,
} from "@comvestec/contracts";
import type {
  PlatformDefaults,
  PlatformModuleManifest,
} from "@comvestec/config";
import {
  tenantBrandingConfigKey,
  tenantBrandingFeatureFlag,
} from "@comvestec/config";

const validPlatformModuleManifestSeed = [
  {
    moduleId: platformModuleId.tenantBranding,
    configKeys: [
      {
        key: tenantBrandingConfigKey.companyName,
        description: "Public display name for the tenant.",
        schema: "string",
        defaultValue: "inherit",
        billable: true,
        allowedScopes: [
          platformScope.platform,
          platformScope.enterprise,
          platformScope.organization,
        ],
        owner: platformModuleId.tenantBranding,
      },
    ],
    featureFlags: [
      {
        key: tenantBrandingFeatureFlag.enabled,
        description:
          "Enable tenant-specific branding beyond platform defaults.",
        owner: platformModuleId.tenantBranding,
        purpose: "Gate tenant-specific branding across app surfaces.",
        defaultEnabled: false,
        billable: true,
        allowedScopes: [
          platformScope.platform,
          platformScope.enterprise,
          platformScope.organization,
        ],
        retirementPlan: "None - premium capability.",
      },
    ],
    permissionScopes: [permissionScope.brandingManage],
    fieldClassifications: [],
    projectionProfiles: [],
  },
] satisfies readonly PlatformModuleManifest[];

void validPlatformModuleManifestSeed;

const invalidModuleConfigManifestSeed = [
  {
    // @ts-expect-error shared module config manifests must preserve narrowed module ids
    moduleId: "not-a-real-module",
    configKeys: [],
    featureFlags: [],
    permissionScopes: [permissionScope.tenantRead],
    fieldClassifications: [],
    projectionProfiles: [],
  },
] satisfies readonly ModuleConfigManifest[];

void invalidModuleConfigManifestSeed;

const invalidPlatformModuleManifestSeed = [
  {
    // @ts-expect-error invalid module ids must fail at compile time
    moduleId: "not-a-real-module",
    configKeys: [],
    featureFlags: [],
    permissionScopes: [permissionScope.tenantRead],
    fieldClassifications: [],
    projectionProfiles: [],
  },
] satisfies readonly PlatformModuleManifest[];

void invalidPlatformModuleManifestSeed;

const invalidPermissionDescriptorSeed = [
  {
    // @ts-expect-error invalid permission scopes must fail at compile time
    scope: "not:real",
    description: "invalid permission scope",
    assignableBy: [permissionScope.tenantWrite],
  },
] satisfies readonly PermissionDescriptor[];

void invalidPermissionDescriptorSeed;

const validFields = defineModuleFields({
  id: "id",
  email: "email",
});

const validProjectionDescriptorSeed = defineProjectionDescriptors(validFields, [
  {
    profile: projectionProfile.summary,
    visibleFields: [validFields.id],
    auditedFields: [],
  },
]);

void validProjectionDescriptorSeed;

const validDataClassificationDeclarationSeed =
  defineDataClassificationDeclarations(validFields, [
    {
      field: validFields.email,
      classification: dataClassification.tenantConfidential,
    },
  ]);

void validDataClassificationDeclarationSeed;

const invalidProjectionDescriptorSeed = [
  {
    // @ts-expect-error invalid projection profiles must fail at compile time
    profile: "invalid-profile",
    visibleFields: [validFields.id],
    auditedFields: [],
  },
] satisfies readonly ProjectionDescriptor[];

void invalidProjectionDescriptorSeed;

const invalidProjectionFieldSeed = defineProjectionDescriptors(validFields, [
  {
    profile: projectionProfile.summary,
    // @ts-expect-error projection fields must come from the declared field map
    visibleFields: [validFields.id, "missingField"],
    auditedFields: [],
  },
]);

void invalidProjectionFieldSeed;

const invalidDataClassificationFieldSeed = defineDataClassificationDeclarations(
  validFields,
  [
    {
      // @ts-expect-error classification fields must come from the declared field map
      field: "missingField",
      classification: dataClassification.public,
    },
  ],
);

void invalidDataClassificationFieldSeed;

const invalidPlatformDefaultsSeed = {
  architecture: "modular-monolith",
  // @ts-expect-error platform defaults must preserve narrowed runtime literal values
  runtime: "not-effect",
  storage: {
    primaryAppState: "convex",
    systemRecords: "postgresql",
    fileStorage: "convex",
  },
  tenancy: {
    scopes: ["platform", "enterprise", "organization", "individual"],
  },
  security: {
    fieldLevelAccess: true,
    sensitiveReadAudit: true,
    auditPermissionChanges: true,
  },
} satisfies PlatformDefaults;

void invalidPlatformDefaultsSeed;

export {};
