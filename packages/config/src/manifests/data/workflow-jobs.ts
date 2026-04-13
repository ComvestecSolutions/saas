import {
  configSchemaType,
  permissionScope,
  platformModuleId,
  platformScope,
  workflowJobsConfigKey,
  workflowJobsFeatureFlag,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const workflowJobsManifest = defineModuleManifest({
  moduleId: platformModuleId.workflowJobs,
  configKeys: [
    {
      key: workflowJobsConfigKey.retryMaxAttempts,
      description: "Maximum retry attempts before dead-letter.",
      schema: configSchemaType.number,
      defaultValue: 3,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.workflowJobs,
    },
  ],
  featureFlags: [
    {
      key: workflowJobsFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.workflowJobs,
      purpose: "Gate workflow jobs module.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      retirementPlan:
        "Promote to default once Convex-native job orchestration is validated.",
    },
  ],
  permissionScopes: [permissionScope.workflowManage],
  fieldClassifications: [],
  projectionProfiles: [],
});
