import {
  defineModuleConfigKeys,
  defineModuleFeatureFlags,
  defineModuleRuntimeValueKeys,
} from "./key-factories";
import { platformModuleId } from "./modules";

export const billingAndMeteringConfigKey = defineModuleConfigKeys(
  platformModuleId.billingAndMetering,
  {
    meterFlushIntervalSeconds: "meter.flushIntervalSeconds",
    usageEnforcementMode: "usageEnforcementMode",
  },
);

export const billingAndMeteringFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.billingAndMetering,
  {
    quotaEnforcement: "quotaEnforcement",
    apiRequests: "api.requests",
  },
);

export const observabilityConfigKey = defineModuleConfigKeys(
  platformModuleId.observability,
  {
    tracesSampleRate: "tracesSampleRate",
    sloErrorBudgetAlertWindowMinutes: "slo.errorBudgetAlertWindowMinutes",
  },
);

export const observabilityFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.observability,
  {
    errorTrackingEnabled: "errorTrackingEnabled",
    sloDashboards: "sloDashboards",
  },
);

export const tenantBrandingConfigKey = defineModuleConfigKeys(
  platformModuleId.tenantBranding,
  {
    companyName: "companyName",
    logoAssetId: "logoAssetId",
    faviconAssetId: "faviconAssetId",
    themePrimary: "theme.primary",
    themeSecondary: "theme.secondary",
    themeAccent: "theme.accent",
    fontHeading: "font.heading",
    fontBody: "font.body",
    supportEmail: "supportEmail",
    replyToEmail: "replyToEmail",
    customDomainHost: "customDomain.host",
  },
);

export const tenantBrandingFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.tenantBranding,
  {
    customDomain: "customDomain",
    brandedEmails: "brandedEmails",
  },
);

export const tenantBrandingRuntimeValueKey = defineModuleRuntimeValueKeys(
  platformModuleId.tenantBranding,
  {
    customDomainStatus: "customDomain.status",
  },
);

export const tenantManagementConfigKey = defineModuleConfigKeys(
  platformModuleId.tenantManagement,
  {
    membershipInviteExpiryHours: "membership.inviteExpiryHours",
    membershipInviteReminderHoursBeforeExpiry:
      "membership.inviteReminderHoursBeforeExpiry",
    onboardingReminderDays: "onboarding.reminderDays",
  },
);

export const tenantManagementFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.tenantManagement,
  {
    enterpriseHierarchy: "enterpriseHierarchy",
    guidedOnboarding: "guidedOnboarding",
  },
);

export const operationsHomeConfigKey = defineModuleConfigKeys(
  platformModuleId.operationsHome,
  {
    defaultWindowMinutes: "defaultWindowMinutes",
    kpiSet: "kpiSet",
    recentAuditLimit: "recentAuditLimit",
  },
);

export const operationsHomeFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.operationsHome,
  {
    v2Enabled: "v2Enabled",
  },
);

export const tenantWorkspaceConfigKey = defineModuleConfigKeys(
  platformModuleId.tenantWorkspace,
  {
    defaultWindowMinutes: "defaultWindowMinutes",
    membersLimit: "membersLimit",
    recentActivityLimit: "recentActivityLimit",
  },
);

export const tenantWorkspaceFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.tenantWorkspace,
  {
    v2Enabled: "v2Enabled",
  },
);

export const polarRevenueProjectionConfigKey = defineModuleConfigKeys(
  platformModuleId.polarRevenueProjection,
  {
    snapshotIntervalMinutes: "snapshot.intervalMinutes",
    historyRetentionDays: "history.retentionDays",
    polarApiBaseUrl: "polar.apiBaseUrl",
    polarApiKey: "polar.apiKey",
    cacheMaxSize: "cache.maxSize",
  },
);

export const polarRevenueProjectionFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.polarRevenueProjection,
  {
    backfillEnabled: "backfill.enabled",
  },
);

export const openMeterUsageQueryConfigKey = defineModuleConfigKeys(
  platformModuleId.openMeterUsageQuery,
  {
    queryCacheTtlSeconds: "queryCache.ttlSeconds",
    maxWindowDays: "maxWindow.days",
    cacheMaxSize: "cache.maxSize",
  },
);

export const openMeterUsageQueryFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.openMeterUsageQuery,
  {},
);

export const vendorHealthAggregatorConfigKey = defineModuleConfigKeys(
  platformModuleId.vendorHealthAggregator,
  {
    snapshotCacheTtlSeconds: "snapshot.cacheTtlSeconds",
    cacheMaxSize: "cache.maxSize",
  },
);

export const vendorHealthAggregatorFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.vendorHealthAggregator,
  {},
);

export const keycloakUserReadConfigKey = defineModuleConfigKeys(
  platformModuleId.keycloakUserRead,
  {
    cacheMaxSize: "cache.maxSize",
    snapshotCacheTtlSeconds: "snapshot.cacheTtlSeconds",
    defaultListLimit: "list.defaultLimit",
  },
);

export const keycloakUserReadFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.keycloakUserRead,
  {},
);

export const keycloakRoleReadConfigKey = defineModuleConfigKeys(
  platformModuleId.keycloakRoleRead,
  {
    cacheMaxSize: "cache.maxSize",
    snapshotCacheTtlSeconds: "snapshot.cacheTtlSeconds",
  },
);

export const keycloakRoleReadFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.keycloakRoleRead,
  {},
);

export const polarCustomerReadConfigKey = defineModuleConfigKeys(
  platformModuleId.polarCustomerRead,
  {
    cacheMaxSize: "cache.maxSize",
    snapshotCacheTtlSeconds: "snapshot.cacheTtlSeconds",
    defaultListLimit: "list.defaultLimit",
  },
);

export const polarCustomerReadFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.polarCustomerRead,
  {},
);

export const openMeterMeterReadConfigKey = defineModuleConfigKeys(
  platformModuleId.openMeterMeterRead,
  {
    cacheMaxSize: "cache.maxSize",
    snapshotCacheTtlSeconds: "snapshot.cacheTtlSeconds",
    defaultListLimit: "list.defaultLimit",
  },
);

export const openMeterMeterReadFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.openMeterMeterRead,
  {},
);

export const novuDeliveriesReadConfigKey = defineModuleConfigKeys(
  platformModuleId.novuDeliveriesRead,
  {
    cacheMaxSize: "cache.maxSize",
    snapshotCacheTtlSeconds: "snapshot.cacheTtlSeconds",
    defaultListLimit: "list.defaultLimit",
  },
);

export const novuDeliveriesReadFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.novuDeliveriesRead,
  {},
);

export const postalMailLogReadConfigKey = defineModuleConfigKeys(
  platformModuleId.postalMailLogRead,
  {
    cacheMaxSize: "cache.maxSize",
    snapshotCacheTtlSeconds: "snapshot.cacheTtlSeconds",
    defaultListLimit: "list.defaultLimit",
  },
);

export const postalMailLogReadFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.postalMailLogRead,
  {},
);

export const glitchTipIssuesReadConfigKey = defineModuleConfigKeys(
  platformModuleId.glitchTipIssuesRead,
  {
    cacheMaxSize: "cache.maxSize",
    snapshotCacheTtlSeconds: "snapshot.cacheTtlSeconds",
    defaultListLimit: "list.defaultLimit",
  },
);

export const glitchTipIssuesReadFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.glitchTipIssuesRead,
  {},
);

export const openPanelEventsReadConfigKey = defineModuleConfigKeys(
  platformModuleId.openPanelEventsRead,
  {
    cacheMaxSize: "cache.maxSize",
    snapshotCacheTtlSeconds: "snapshot.cacheTtlSeconds",
    defaultListLimit: "list.defaultLimit",
  },
);

export const openPanelEventsReadFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.openPanelEventsRead,
  {},
);

export const universalSearchConfigKey = defineModuleConfigKeys(
  platformModuleId.universalSearch,
  {
    perFacetLimitDefault: "perFacet.limitDefault",
    perFacetLimitMax: "perFacet.limitMax",
    cacheMaxSize: "cache.maxSize",
    cacheTtlSeconds: "cache.ttlSeconds",
    indexFreshnessThresholdSeconds: "index.freshnessThresholdSeconds",
  },
);

export const universalSearchFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.universalSearch,
  {
    reindexEnabled: "reindex.enabled",
  },
);
