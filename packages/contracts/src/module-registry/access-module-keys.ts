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
