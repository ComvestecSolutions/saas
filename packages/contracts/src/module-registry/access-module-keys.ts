import {
  defineModuleConfigKeys,
  defineModuleFeatureFlags,
} from "./key-factories";
import { platformModuleId } from "./modules";

export const authorizationConfigKey = defineModuleConfigKeys(
  platformModuleId.authorization,
  {
    cacheTtlSeconds: "cache.ttlSeconds",
  },
);

export const authorizationFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.authorization,
  {},
);

export const fieldSecurityConfigKey = defineModuleConfigKeys(
  platformModuleId.fieldSecurity,
  {
    sensitiveReadAudit: "sensitiveReadAudit",
  },
);

export const fieldSecurityFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.fieldSecurity,
  {},
);

export const identitySessionConfigKey = defineModuleConfigKeys(
  platformModuleId.identitySession,
  {
    sessionIdleTimeoutMinutes: "session.idleTimeoutMinutes",
    sessionAbsoluteTimeoutHours: "session.absoluteTimeoutHours",
  },
);

export const identitySessionFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.identitySession,
  {
    mfaEnforced: "mfaEnforced",
  },
);

export const adminOrganizationConfigKey = defineModuleConfigKeys(
  platformModuleId.adminOrganization,
  {
    invitationExpiryHours: "invitation.expiryHours",
    invitationTtlMinutes: "invitation.ttlMinutes",
    minimumOwnerCount: "owner.minimumCount",
  },
);

export const adminOrganizationFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.adminOrganization,
  {
    selfServiceInvitations: "selfServiceInvitations",
  },
);

export const adminSavedViewsConfigKey = defineModuleConfigKeys(
  platformModuleId.adminSavedViews,
  {
    maxViewsPerUser: "view.maxPerUser",
  },
);

export const adminSavedViewsFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.adminSavedViews,
  {},
);

export const adminWorkspacesConfigKey = defineModuleConfigKeys(
  platformModuleId.adminWorkspaces,
  {
    maxWorkspacesPerUser: "workspace.maxPerUser",
  },
);

export const adminWorkspacesFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.adminWorkspaces,
  {},
);

export const manualBreakGlassConfigKey = defineModuleConfigKeys(
  platformModuleId.manualBreakGlass,
  {
    maxTtlMinutes: "grant.maxTtlMinutes",
    maxActiveGrantsPerSupportOperator: "grant.maxActivePerSupportOperator",
    cacheMaxSize: "cache.maxSize",
  },
);

export const manualBreakGlassFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.manualBreakGlass,
  {},
);

export const capabilitySnapshotV2ConfigKey = defineModuleConfigKeys(
  platformModuleId.capabilitySnapshotV2,
  {
    cacheMaxSize: "cache.maxSize",
    cacheTtlSeconds: "cache.ttlSeconds",
  },
);

export const capabilitySnapshotV2FeatureFlag = defineModuleFeatureFlags(
  platformModuleId.capabilitySnapshotV2,
  {},
);

export const runAsBannerStateConfigKey = defineModuleConfigKeys(
  platformModuleId.runAsBannerState,
  {
    cacheMaxSize: "cache.maxSize",
    cacheTtlSeconds: "cache.ttlSeconds",
  },
);

export const runAsBannerStateFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.runAsBannerState,
  {},
);

export const workflowRunsAdminConfigKey = defineModuleConfigKeys(
  platformModuleId.workflowRunsAdmin,
  {
    cacheMaxSize: "cache.maxSize",
    cacheTtlSeconds: "cache.ttlSeconds",
    listPageSizeMax: "list.pageSizeMax",
  },
);

export const workflowRunsAdminFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.workflowRunsAdmin,
  {},
);

export const notificationCenterAdminConfigKey = defineModuleConfigKeys(
  platformModuleId.notificationCenterAdmin,
  {
    cacheMaxSize: "cache.maxSize",
    cacheTtlSeconds: "cache.ttlSeconds",
    listPageSizeMax: "list.pageSizeMax",
  },
);

export const notificationCenterAdminFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.notificationCenterAdmin,
  {},
);

export const adminOperatorTestTokensConfigKey = defineModuleConfigKeys(
  platformModuleId.adminOperatorTestTokens,
  {
    tokenDefaultExpiryHours: "token.defaultExpiryHours",
    tokenMaxExpiryHours: "token.maxExpiryHours",
  },
);

export const adminOperatorTestTokensFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.adminOperatorTestTokens,
  {},
);
