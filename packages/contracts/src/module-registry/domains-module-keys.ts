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
