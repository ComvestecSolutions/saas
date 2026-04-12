import {
  actorType,
  supportOperationsAuditAction,
  authorizationNamespace,
  authorizationRelation,
  customDomainLifecycleState,
  customDomainLifecycleStates,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  identityBrandingHandoffMode,
  moduleCapability,
  onboardingStepStatus,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
  runtimeChangeProposalAction,
  runtimeResolutionSource,
  telemetryKind,
  usageQuotaPeriod,
} from "@comvestec/contracts";
import type {
  AuditAction,
  AuthorizationNamespace,
  AuthorizationRelation,
  CustomDomainLifecycleState,
  IdentityBrandingHandoffMode,
  ModuleCapability,
  ModuleConfigManifest,
  OnboardingStepStatus,
  PermissionScope,
  PermissionDescriptor,
  PlatformModuleId,
  ProjectionDescriptor,
  RequestContext,
  RuntimeChangeProposalAction,
  RuntimeResolutionSource,
  TelemetryKind,
  UsageQuotaPeriod,
} from "@comvestec/contracts";
import type {
  PlatformHost,
  PlatformDefaults,
  PlatformModuleManifest,
} from "@comvestec/config";
import {
  platformHost,
  tenantBrandingConfigKey,
  tenantBrandingFeatureFlag,
} from "@comvestec/config";
import type {
  BrandingResolutionResult,
  RuntimeResolutionResult,
} from "@comvestec/modules";
import type { PublicWebSnapshot } from "@comvestec/platform";

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
        retirementPlan: "None — premium capability.",
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

const validStandaloneRequestContextSeed = {
  actorType: actorType.individualUser,
  actorId: "usr_1",
  sessionId: "sess_1",
  correlationId: "corr_1",
  tenant: {
    scope: platformScope.individual,
    scopeId: "usr_1",
    individualId: "usr_1",
  },
} satisfies RequestContext;

void validStandaloneRequestContextSeed;

const invalidRequestContextSeed = {
  // @ts-expect-error request contexts must use shared actor type literals
  actorType: "not-an-actor",
  correlationId: "corr_invalid",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
} satisfies RequestContext;

void invalidRequestContextSeed;

const validAuthorizationNamespaceSeed =
  authorizationNamespace.featureFlag satisfies AuthorizationNamespace;

void validAuthorizationNamespaceSeed;

const invalidAuthorizationNamespaceSeed =
  // @ts-expect-error authorization namespaces must use shared literals
  "feature" satisfies AuthorizationNamespace;

void invalidAuthorizationNamespaceSeed;

const validAuthorizationRelationSeed =
  authorizationRelation.impersonator satisfies AuthorizationRelation;

void validAuthorizationRelationSeed;

const invalidAuthorizationRelationSeed =
  // @ts-expect-error authorization relations must use shared literals
  "operator" satisfies AuthorizationRelation;

void invalidAuthorizationRelationSeed;

const validOnboardingStepStatusSeed =
  onboardingStepStatus.inProgress satisfies OnboardingStepStatus;

void validOnboardingStepStatusSeed;

const invalidOnboardingStepStatusSeed =
  // @ts-expect-error onboarding step statuses must use shared literals
  "pending" satisfies OnboardingStepStatus;

void invalidOnboardingStepStatusSeed;

const validUsageQuotaPeriodSeed =
  usageQuotaPeriod.month satisfies UsageQuotaPeriod;

void validUsageQuotaPeriodSeed;

const invalidUsageQuotaPeriodSeed =
  // @ts-expect-error usage quota periods must use shared literals
  "year" satisfies UsageQuotaPeriod;

void invalidUsageQuotaPeriodSeed;

const validIdentityBrandingHandoffModeSeed =
  identityBrandingHandoffMode.brandedRedirect satisfies IdentityBrandingHandoffMode;

void validIdentityBrandingHandoffModeSeed;

const invalidIdentityBrandingHandoffModeSeed =
  // @ts-expect-error identity handoff modes must use shared literals
  "embedded" satisfies IdentityBrandingHandoffMode;

void invalidIdentityBrandingHandoffModeSeed;

const validRuntimeResolutionSourceSeed =
  runtimeResolutionSource.unentitledDefault satisfies RuntimeResolutionSource;

void validRuntimeResolutionSourceSeed;

const invalidRuntimeResolutionSourceSeed =
  // @ts-expect-error runtime resolution sources must use shared literals
  "not-a-source" satisfies RuntimeResolutionSource;

void invalidRuntimeResolutionSourceSeed;

const validCustomDomainLifecycleStateSeed =
  customDomainLifecycleState.active satisfies CustomDomainLifecycleState;

void validCustomDomainLifecycleStateSeed;

const invalidCustomDomainLifecycleStateSeed =
  // @ts-expect-error custom domain lifecycle states must use shared literals
  "pending" satisfies CustomDomainLifecycleState;

void invalidCustomDomainLifecycleStateSeed;

const validTelemetryKindSeed = telemetryKind.audit satisfies TelemetryKind;

void validTelemetryKindSeed;

const invalidTelemetryKindSeed =
  // @ts-expect-error telemetry kinds must use shared literals
  "span" satisfies TelemetryKind;

void invalidTelemetryKindSeed;

const validAuditActionSeed =
  supportOperationsAuditAction.breakGlassStarted satisfies AuditAction;

void validAuditActionSeed;

const validRuntimeChangeProposalActionSeed =
  runtimeChangeProposalAction.rename satisfies RuntimeChangeProposalAction;

void validRuntimeChangeProposalActionSeed;

const validPlatformModuleIdSeed =
  platformModuleId.tenantBranding satisfies PlatformModuleId;

void validPlatformModuleIdSeed;

const invalidPlatformModuleIdSeed =
  // @ts-expect-error platform module ids must use shared literals
  "tenant_branding" satisfies PlatformModuleId;

void invalidPlatformModuleIdSeed;

const validPermissionScopeSeed =
  permissionScope.brandingManage satisfies PermissionScope;

void validPermissionScopeSeed;

const invalidPermissionScopeSeed =
  // @ts-expect-error permission scopes must use shared literals
  "branding.manage" satisfies PermissionScope;

void invalidPermissionScopeSeed;

const validModuleCapabilitySeed =
  moduleCapability.brandedRedirectHandoff satisfies ModuleCapability;

void validModuleCapabilitySeed;

const invalidModuleCapabilitySeed =
  // @ts-expect-error module capabilities must use shared literals
  "direct-write" satisfies ModuleCapability;

void invalidModuleCapabilitySeed;

const validPlatformHostSeed =
  platformHost.localDevelopment satisfies PlatformHost;

void validPlatformHostSeed;

const invalidPlatformHostSeed =
  // @ts-expect-error platform hosts must use shared literals
  "localhost" satisfies PlatformHost;

void invalidPlatformHostSeed;

const invalidAuditActionSeed =
  // @ts-expect-error audit actions must use shared literals
  "support.break-glass" satisfies AuditAction;

void invalidAuditActionSeed;

const invalidRuntimeChangeProposalActionSeed =
  // @ts-expect-error runtime change proposal actions must use shared literals
  "delete" satisfies RuntimeChangeProposalAction;

void invalidRuntimeChangeProposalActionSeed;

const validRuntimeResolutionResultSeed = {
  moduleId: platformModuleId.tenantBranding,
  key: tenantBrandingConfigKey.companyName,
  effectiveValue: "Acme",
  source: runtimeResolutionSource.runtimeOverride,
  entitled: true,
  resolvedScope: platformScope.organization,
  resolvedScopeId: "org_1",
} satisfies RuntimeResolutionResult;

void validRuntimeResolutionResultSeed;

const invalidRuntimeResolutionResultSeed = {
  moduleId: platformModuleId.tenantBranding,
  key: tenantBrandingConfigKey.companyName,
  effectiveValue: "Acme",
  // @ts-expect-error runtime resolution results must use shared source literals
  source: "pending-approval",
  entitled: true,
} satisfies RuntimeResolutionResult;

void invalidRuntimeResolutionResultSeed;

const validBrandingResolutionResultSeed = {
  publicProjection: {
    companyName: "Acme",
    themeTokens: {
      primary: "#111827",
      secondary: "#374151",
      accent: "#10B981",
    },
    effectiveScope: platformScope.organization,
    entitled: true,
  },
  adminProjection: {
    companyName: "Acme",
    customDomainStatus: customDomainLifecycleState.active,
    effectiveScope: platformScope.organization,
    entitled: true,
  },
} satisfies BrandingResolutionResult;

void validBrandingResolutionResultSeed;

const invalidBrandingResolutionResultSeed = {
  publicProjection: {
    companyName: "Acme",
    themeTokens: {
      primary: "#111827",
      secondary: "#374151",
      accent: "#10B981",
    },
    effectiveScope: platformScope.organization,
    entitled: true,
  },
  adminProjection: {
    companyName: "Acme",
    // @ts-expect-error branding results must use shared custom-domain lifecycle literals
    customDomainStatus: "pending",
    effectiveScope: platformScope.organization,
    entitled: true,
  },
} satisfies BrandingResolutionResult;

void invalidBrandingResolutionResultSeed;

const validPublicWebSnapshotSeed = {
  application: "Public web",
  focus: "trust and onboarding",
  requestContext: {
    actorType: actorType.anonymous,
    correlationId: "public-web.home",
    host: platformHost.localDevelopment,
    tenant: {
      scope: platformScope.platform,
      scopeId: platformScope.platform,
    },
  },
  platformRuntime: "effect",
  storage: {
    primaryAppState: "convex",
    systemRecords: "postgresql",
    fileStorage: "convex",
  },
  tenancyScopes: [
    platformScope.platform,
    platformScope.enterprise,
    platformScope.organization,
    platformScope.individual,
  ],
  secureByDefault: true,
  branding: {
    moduleId: platformModuleId.tenantBranding,
    companyName: "Platform brand fallback",
    supportedScopes: [
      platformScope.platform,
      platformScope.enterprise,
      platformScope.organization,
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
        retirementPlan: "None — premium capability.",
      },
      {
        key: tenantBrandingFeatureFlag.customDomain,
        description: "Allow tenant custom-domain requests and activation.",
        owner: platformModuleId.tenantBranding,
        purpose: "Gate custom-domain configuration and activation.",
        defaultEnabled: false,
        billable: true,
        allowedScopes: [
          platformScope.platform,
          platformScope.enterprise,
          platformScope.organization,
        ],
        retirementPlan: "Retire only with a domain migration plan.",
      },
      {
        key: tenantBrandingFeatureFlag.brandedEmails,
        description: "Apply tenant sender identity and branded email chrome.",
        owner: platformModuleId.tenantBranding,
        purpose: "Gate branded transactional email delivery.",
        defaultEnabled: false,
        billable: true,
        allowedScopes: [
          platformScope.platform,
          platformScope.enterprise,
          platformScope.organization,
        ],
        retirementPlan:
          "Retire only with a fallback to platform email branding.",
      },
    ],
    customDomainLifecycle: [...customDomainLifecycleStates],
  },
} satisfies PublicWebSnapshot;

void validPublicWebSnapshotSeed;

const invalidPublicWebSnapshotSeed = {
  application: "Public web",
  focus: "trust and onboarding",
  requestContext: {
    actorType: actorType.anonymous,
    correlationId: "public-web.home",
    tenant: {
      scope: platformScope.platform,
      scopeId: platformScope.platform,
    },
  },
  platformRuntime: "effect",
  storage: {
    primaryAppState: "convex",
    systemRecords: "postgresql",
    fileStorage: "convex",
  },
  tenancyScopes: [
    // @ts-expect-error tenancy scopes must use shared platform scope literals
    "not-a-scope",
  ],
  secureByDefault: true,
  branding: {
    moduleId: platformModuleId.tenantBranding,
    companyName: "Platform brand fallback",
    supportedScopes: [
      platformScope.platform,
      platformScope.enterprise,
      platformScope.organization,
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
        retirementPlan: "None — premium capability.",
      },
    ],
    customDomainLifecycle: [customDomainLifecycleState.unverified],
  },
} satisfies PublicWebSnapshot;

void invalidPublicWebSnapshotSeed;

export {};
