import {
  billingAndMeteringConfigKey,
  billingAndMeteringFeatureFlag,
  billingEnforcementMode,
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
import { defineModuleManifest } from "../../manifest-helpers";

export const billingAndMeteringFields = defineModuleFields({
  plan: "plan",
  billingInterval: "billingInterval",
  status: "status",
  currentPeriodEnd: "currentPeriodEnd",
  prices: "prices",
  includedEntitlements: "includedEntitlements",
  meteredEntitlements: "meteredEntitlements",
  rateLimits: "rateLimits",
  invoiceHistory: "invoiceHistory",
  usage: "usage",
});

export const billingAndMeteringFieldClassifications =
  defineDataClassificationDeclarations(billingAndMeteringFields, [
    {
      field: billingAndMeteringFields.plan,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: billingAndMeteringFields.billingInterval,
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
      field: billingAndMeteringFields.prices,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: billingAndMeteringFields.includedEntitlements,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: billingAndMeteringFields.meteredEntitlements,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: billingAndMeteringFields.rateLimits,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: billingAndMeteringFields.invoiceHistory,
      classification: dataClassification.regulatedSensitive,
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
      description:
        "Default enforcement mode for metered or rate-limited entitlements: observe, rate-limit, or block.",
      schema: configSchemaType.string,
      defaultValue: billingEnforcementMode.observe,
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
        "Gate automatic rate limiting or blocking when constrained entitlements are exhausted.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      retirementPlan:
        "Promote to default after support workflows and customer messaging are validated.",
    },
    {
      key: billingAndMeteringFeatureFlag.apiRequests,
      description:
        "Enable billable API request access for metered or rate-limited plans.",
      owner: platformModuleId.billingAndMetering,
      purpose:
        "Declare the API request capability so billing entitlements and usage meters only reference manifest-owned feature flags.",
      defaultEnabled: false,
      billable: true,
      allowedScopes: [platformScope.platform],
      retirementPlan: "None — commercial capability declaration.",
    },
  ],
  permissionScopes: [permissionScope.billingRead, permissionScope.billingWrite],
  fieldClassifications: billingAndMeteringFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(billingAndMeteringFields, [
    {
      profile: projectionProfile.billing,
      visibleFields: [
        billingAndMeteringFields.plan,
        billingAndMeteringFields.billingInterval,
        billingAndMeteringFields.status,
        billingAndMeteringFields.currentPeriodEnd,
        billingAndMeteringFields.usage,
      ],
      auditedFields: [],
    },
    {
      profile: projectionProfile.admin,
      visibleFields: [
        billingAndMeteringFields.plan,
        billingAndMeteringFields.billingInterval,
        billingAndMeteringFields.status,
        billingAndMeteringFields.currentPeriodEnd,
        billingAndMeteringFields.prices,
        billingAndMeteringFields.includedEntitlements,
        billingAndMeteringFields.meteredEntitlements,
        billingAndMeteringFields.rateLimits,
        billingAndMeteringFields.usage,
        billingAndMeteringFields.invoiceHistory,
      ],
      auditedFields: [
        billingAndMeteringFields.includedEntitlements,
        billingAndMeteringFields.meteredEntitlements,
        billingAndMeteringFields.rateLimits,
        billingAndMeteringFields.invoiceHistory,
      ],
    },
    {
      profile: projectionProfile.summary,
      visibleFields: [
        billingAndMeteringFields.plan,
        billingAndMeteringFields.billingInterval,
        billingAndMeteringFields.status,
      ],
      auditedFields: [],
    },
  ]),
});
