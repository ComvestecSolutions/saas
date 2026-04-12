import {
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import {
  defineModuleConfigKeys,
  defineModuleFeatureFlags,
  defineModuleManifest,
} from "../../manifest-helpers";

export const billingAndMeteringConfigKey = defineModuleConfigKeys(
  platformModuleId.billingAndMetering,
  {
    meterFlushIntervalSeconds: "meter.flushIntervalSeconds",
    usageEnforcementMode: "usage.enforcementMode",
  },
);

export const billingAndMeteringFeatureFlag = defineModuleFeatureFlags(
  platformModuleId.billingAndMetering,
  {
    enabled: "enabled",
    quotaEnforcement: "quotaEnforcement",
  },
);

export const billingAndMeteringFields = defineModuleFields({
  plan: "plan",
  status: "status",
  currentPeriodEnd: "currentPeriodEnd",
  usage: "usage",
});

export const billingAndMeteringFieldClassifications =
  defineDataClassificationDeclarations(billingAndMeteringFields, [
    {
      field: billingAndMeteringFields.plan,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: billingAndMeteringFields.status,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: billingAndMeteringFields.currentPeriodEnd,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: billingAndMeteringFields.usage,
      classification: dataClassification.tenantConfidential,
    },
  ]);

export const billingAndMeteringManifest = defineModuleManifest({
  moduleId: platformModuleId.billingAndMetering,
  configKeys: [
    {
      key: billingAndMeteringConfigKey.meterFlushIntervalSeconds,
      description: "Seconds between meter event flushes to OpenMeter.",
      schema: configSchemaType.number,
      defaultValue: 30,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.billingAndMetering,
    },
    {
      key: billingAndMeteringConfigKey.usageEnforcementMode,
      description: "Quota enforcement mode: observe, throttle, or block.",
      schema: configSchemaType.string,
      defaultValue: "observe",
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.billingAndMetering,
    },
  ],
  featureFlags: [
    {
      key: billingAndMeteringFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.billingAndMetering,
      purpose: "Gate billing and metering module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      retirementPlan: "None — core module.",
    },
    {
      key: billingAndMeteringFeatureFlag.quotaEnforcement,
      description: "Enable automatic quota enforcement workflows.",
      owner: platformModuleId.billingAndMetering,
      purpose:
        "Gate automatic throttling or blocking when quotas are exhausted.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      retirementPlan:
        "Promote to default after support workflows and customer messaging are validated.",
    },
  ],
  permissionScopes: [permissionScope.billingRead, permissionScope.billingWrite],
  fieldClassifications: billingAndMeteringFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(billingAndMeteringFields, [
    {
      profile: projectionProfile.billing,
      visibleFields: [
        billingAndMeteringFields.plan,
        billingAndMeteringFields.status,
        billingAndMeteringFields.currentPeriodEnd,
        billingAndMeteringFields.usage,
      ],
      auditedFields: [],
    },
  ]),
});
