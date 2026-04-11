import {
  configSchemaType,
  permissionScope,
  platformModuleId,
  platformScope,
} from "@comvestec/contracts";
import {
  defineModuleConfigKeys,
  defineModuleFeatureFlags,
  defineModuleManifest,
} from "../../manifest-helpers";

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
    enabled: "enabled",
    errorTrackingEnabled: "errorTrackingEnabled",
    sloDashboards: "sloDashboards",
  },
);

export const observabilityManifest = defineModuleManifest({
  moduleId: platformModuleId.observability,
  configKeys: [
    {
      key: observabilityConfigKey.tracesSampleRate,
      description: "Fraction of traces to sample (0.0–1.0).",
      schema: configSchemaType.number,
      defaultValue: 0.1,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.observability,
    },
    {
      key: observabilityConfigKey.sloErrorBudgetAlertWindowMinutes,
      description: "Rolling window for SLO burn-rate alerting.",
      schema: configSchemaType.number,
      defaultValue: 60,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.observability,
    },
  ],
  featureFlags: [
    {
      key: observabilityFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.observability,
      purpose: "Gate observability module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      retirementPlan: "None — core module.",
    },
    {
      key: observabilityFeatureFlag.errorTrackingEnabled,
      description: "Enable platform error capture.",
      owner: platformModuleId.observability,
      purpose: "Toggle GlitchTip-backed error tracking.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      retirementPlan:
        "Promote to default once GlitchTip rollout and retention policy are validated.",
    },
    {
      key: observabilityFeatureFlag.sloDashboards,
      description: "Enable SLO dashboard provisioning.",
      owner: platformModuleId.observability,
      purpose: "Provision operator SLO dashboards and burn-rate views.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      retirementPlan:
        "Promote to default once SLO definitions and alert routing are validated.",
    },
  ],
  permissionScopes: [permissionScope.observationRead],
  fieldClassifications: [],
  projectionProfiles: [],
});
