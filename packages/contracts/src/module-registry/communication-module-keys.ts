import {
  defineModuleConfigKeys,
  defineModuleFeatureFlags,
} from "./key-factories";
import { platformModuleId } from "./modules";

export const emailDeliveryConfigKey = defineModuleConfigKeys(
  platformModuleId.emailDelivery,
  {
    rateLimitPerMinute: "rateLimitPerMinute",
  },
);

export const emailDeliveryFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.emailDelivery,
  {},
);

export const notificationCenterConfigKey = defineModuleConfigKeys(
  platformModuleId.notificationCenter,
  {
    digestIntervalMinutes: "digest.intervalMinutes",
  },
);

export const notificationCenterFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.notificationCenter,
  {},
);

export const webhooksApiAccessConfigKey = defineModuleConfigKeys(
  platformModuleId.webhooksApiAccess,
  {
    deliveryMaxRetries: "delivery.maxRetries",
  },
);

export const webhooksApiAccessFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.webhooksApiAccess,
  {},
);

export const operatorWebhookDeliveryConfigKey = defineModuleConfigKeys(
  platformModuleId.operatorWebhookDelivery,
  {
    maxAttempts: "delivery.maxAttempts",
    backoffBaseSeconds: "delivery.backoffBaseSeconds",
    replayGuardWindowMinutes: "delivery.replayGuardWindowMinutes",
    signatureFreshnessSeconds: "delivery.signatureFreshnessSeconds",
    responseBodySnippetMaxBytes: "delivery.responseBodySnippetMaxBytes",
    cacheMaxSize: "cache.maxSize",
  },
);

export const operatorWebhookDeliveryFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.operatorWebhookDelivery,
  {},
);
