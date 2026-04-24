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
  workflowJobsConfigKey,
  workflowJobsFeatureFlag,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const workflowJobsFields = defineModuleFields({
  jobId: "jobId",
  tenantScope: "tenantScope",
  tenantScopeId: "tenantScopeId",
  status: "status",
  attempts: "attempts",
  scheduledAt: "scheduledAt",
  completedAt: "completedAt",
  gapReason: "gapReason",
  lastError: "lastError",
  payload: "payload",
  definition: "definition",
  executionLogs: "executionLogs",
});

export const workflowJobsFieldClassifications =
  defineDataClassificationDeclarations(workflowJobsFields, [
    {
      field: workflowJobsFields.payload,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: workflowJobsFields.executionLogs,
      classification: dataClassification.internal,
    },
    {
      field: workflowJobsFields.definition,
      classification: dataClassification.internal,
    },
    {
      field: workflowJobsFields.jobId,
      classification: dataClassification.internal,
    },
    {
      field: workflowJobsFields.tenantScope,
      classification: dataClassification.internal,
    },
    {
      field: workflowJobsFields.tenantScopeId,
      classification: dataClassification.internal,
    },
    {
      field: workflowJobsFields.status,
      classification: dataClassification.internal,
    },
    {
      field: workflowJobsFields.attempts,
      classification: dataClassification.internal,
    },
    {
      field: workflowJobsFields.scheduledAt,
      classification: dataClassification.internal,
    },
    {
      field: workflowJobsFields.completedAt,
      classification: dataClassification.internal,
    },
    {
      field: workflowJobsFields.gapReason,
      classification: dataClassification.internal,
    },
    {
      field: workflowJobsFields.lastError,
      classification: dataClassification.internal,
    },
  ]);

export const workflowJobsManifest = defineModuleManifest({
  moduleId: platformModuleId.workflowJobs,
  configKeys: [
    {
      key: workflowJobsConfigKey.retryMaxAttempts,
      description:
        "Whole-number post-primary automatic recovery budget before an unresolved reconciliation job is blocked for operator intervention.",
      schema: configSchemaType.number,
      defaultValue: 3,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.workflowJobs,
    },
    {
      key: workflowJobsConfigKey.reconciliationDeadlineSeconds,
      description:
        "Delay before a scheduled reconciliation deadline evaluates billing drift.",
      schema: configSchemaType.number,
      defaultValue: 300,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.workflowJobs,
    },
    {
      key: workflowJobsConfigKey.reconciliationSweepIntervalMinutes,
      description:
        "Minutes between targeted follow-up attempts and stale-running reclaim checks for unresolved reconciliation jobs.",
      schema: configSchemaType.number,
      defaultValue: 15,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.workflowJobs,
    },
    {
      key: workflowJobsConfigKey.claimTimeoutSeconds,
      description:
        "Seconds before a stale-running reconciliation job is reclaimed for recovery handling.",
      schema: configSchemaType.number,
      defaultValue: 900,
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
  fieldClassifications: workflowJobsFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(workflowJobsFields, [
    {
      profile: projectionProfile.admin,
      visibleFields: [
        workflowJobsFields.jobId,
        workflowJobsFields.tenantScope,
        workflowJobsFields.tenantScopeId,
        workflowJobsFields.status,
        workflowJobsFields.attempts,
        workflowJobsFields.scheduledAt,
        workflowJobsFields.completedAt,
        workflowJobsFields.gapReason,
        workflowJobsFields.lastError,
      ],
      auditedFields: [workflowJobsFields.lastError],
    },
    {
      profile: projectionProfile.summary,
      visibleFields: [
        workflowJobsFields.jobId,
        workflowJobsFields.status,
        workflowJobsFields.gapReason,
      ],
      auditedFields: [],
    },
  ]),
});
