import {
  actorType,
  customDomainLifecycleState,
  customDomainLifecycleStates,
  featureFlagLifecycle,
  platformModuleId,
  platformScope,
  runtimeResolutionSource,
} from "@comvestec/contracts";
import {
  emailDeliveryFeatureFlag,
  platformHost,
  tenantBrandingConfigKey,
  tenantBrandingFeatureFlag,
} from "@comvestec/config";
import type {
  BrandingResolutionResult,
  RuntimeResolutionResult,
} from "@comvestec/modules";
import type { PublicWebSnapshot } from "@comvestec/platform";

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
    themeTokens: {
      primary: "#111827",
      secondary: "#374151",
      accent: "#10B981",
    },
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
    themeTokens: {
      primary: "#111827",
      secondary: "#374151",
      accent: "#10B981",
    },
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
    projection: {
      companyName: "Platform brand fallback",
      effectiveScope: platformScope.platform,
      entitled: false,
      themeTokens: {
        primary: "#0F172A",
        secondary: "#334155",
        accent: "#0EA5E9",
      },
    },
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
        dependencies: [],
        lifecycle: featureFlagLifecycle.active,
        retirementPlan: "None - premium capability.",
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
        dependencies: [tenantBrandingFeatureFlag.enabled],
        lifecycle: featureFlagLifecycle.active,
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
        dependencies: [
          tenantBrandingFeatureFlag.enabled,
          emailDeliveryFeatureFlag.enabled,
        ],
        lifecycle: featureFlagLifecycle.active,
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
    projection: {
      companyName: "Platform brand fallback",
      effectiveScope: platformScope.platform,
      entitled: false,
      themeTokens: {
        primary: "#0F172A",
        secondary: "#334155",
        accent: "#0EA5E9",
      },
    },
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
        dependencies: [],
        lifecycle: featureFlagLifecycle.active,
        retirementPlan: "None - premium capability.",
      },
    ],
    customDomainLifecycle: [customDomainLifecycleState.unverified],
  },
} satisfies PublicWebSnapshot;

void invalidPublicWebSnapshotSeed;

export {};
