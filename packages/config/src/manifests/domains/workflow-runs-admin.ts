/**
 * Workflow runs admin envelope module manifest (admin-app
 * implementation plan §9 item 15). The platform service composes
 * an injected workflow-jobs admin port to project + replay/cancel
 * workflow runs, with the canonical reason-catalog +
 * field-security + bounded-cache + bounded-pagination invariants
 * enforced ABOVE the port. Three config keys back the manifest:
 *
 *   - `cache.maxSize` (default 256) bounds the in-memory list
 *     cache via insertion-order eviction (backend instructions
 *     security invariant #5).
 *   - `cache.ttlSeconds` (default 5) bounds cached list freshness
 *     so the admin console never renders stale run status.
 *   - `list.pageSizeMax` (default 100) caps any `pageSize` request
 *     against the operator-tunable upper bound.
 *
 * Field classifications:
 *
 *   - `payloadProjection` is `regulated-sensitive` because
 *     workflow payloads frequently capture tenant inputs that
 *     could include regulated identifiers.
 *   - `lastError` is `regulated-sensitive` because vendor error
 *     messages may include redactable secrets in their detail.
 *   - The remaining fields (`runId`, `moduleId`, `workflowKey`,
 *     `status`, `queuedAt`, `startedAt`, `finishedAt`,
 *     `durationMs`, `attempt`, `auditCorrelationId`) are
 *     `internal` — already-decided platform metadata.
 *
 * Two projection profiles:
 *
 *   - `summary` is the list-card projection (drops
 *     `payloadProjection`).
 *   - `detail` is the drill-down projection (includes
 *     `payloadProjection`).
 */
import {
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  featureFlagLifecycle,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
  workflowRunsAdminConfigKey,
  workflowRunsAdminFeatureFlag,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const workflowRunsAdminFields = defineModuleFields({
  runId: "runId",
  moduleId: "moduleId",
  workflowKey: "workflowKey",
  status: "status",
  queuedAt: "queuedAt",
  startedAt: "startedAt",
  finishedAt: "finishedAt",
  durationMs: "durationMs",
  attempt: "attempt",
  lastError: "lastError",
  payloadProjection: "payloadProjection",
  auditCorrelationId: "auditCorrelationId",
});

export const workflowRunsAdminFieldClassifications =
  defineDataClassificationDeclarations(workflowRunsAdminFields, [
    {
      field: workflowRunsAdminFields.runId,
      classification: dataClassification.internal,
    },
    {
      field: workflowRunsAdminFields.moduleId,
      classification: dataClassification.internal,
    },
    {
      field: workflowRunsAdminFields.workflowKey,
      classification: dataClassification.internal,
    },
    {
      field: workflowRunsAdminFields.status,
      classification: dataClassification.internal,
    },
    {
      field: workflowRunsAdminFields.queuedAt,
      classification: dataClassification.internal,
    },
    {
      field: workflowRunsAdminFields.startedAt,
      classification: dataClassification.internal,
    },
    {
      field: workflowRunsAdminFields.finishedAt,
      classification: dataClassification.internal,
    },
    {
      field: workflowRunsAdminFields.durationMs,
      classification: dataClassification.internal,
    },
    {
      field: workflowRunsAdminFields.attempt,
      classification: dataClassification.internal,
    },
    {
      field: workflowRunsAdminFields.lastError,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: workflowRunsAdminFields.payloadProjection,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: workflowRunsAdminFields.auditCorrelationId,
      classification: dataClassification.internal,
    },
  ]);

export const workflowRunsAdminManifest = defineModuleManifest({
  moduleId: platformModuleId.workflowRunsAdmin,
  configKeys: [
    {
      key: workflowRunsAdminConfigKey.cacheMaxSize,
      description:
        "Bound on the in-memory workflow-runs-admin list cache. Insertion-order eviction enforces backend instructions security invariant #5.",
      schema: configSchemaType.number,
      defaultValue: 256,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.workflowRunsAdmin,
    },
    {
      key: workflowRunsAdminConfigKey.cacheTtlSeconds,
      description:
        "Bound on cached workflow-runs-admin list freshness (seconds). Short TTL keeps the operator console aligned with the underlying workflow engine.",
      schema: configSchemaType.number,
      defaultValue: 5,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.workflowRunsAdmin,
    },
    {
      key: workflowRunsAdminConfigKey.listPageSizeMax,
      description:
        "Upper bound on the workflow-runs-admin list pageSize parameter. The service rejects any request whose decoded pageSize exceeds this value.",
      schema: configSchemaType.number,
      defaultValue: 100,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.workflowRunsAdmin,
    },
  ],
  featureFlags: [
    {
      key: workflowRunsAdminFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.workflowRunsAdmin,
      purpose:
        "Gate the Operator Desk workflow-runs admin envelope (list + detail + replay + cancel) that projects workflow-jobs runs to operators.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Promote to default once the Operator Desk shell consumes the envelope end-to-end and the replay + cancel flows have lived in production behind audit-trail evidence for one release window.",
    },
  ],
  permissionScopes: [
    permissionScope.workflowRunsAdminRead,
    permissionScope.workflowRunsAdminWrite,
  ],
  fieldClassifications: workflowRunsAdminFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(workflowRunsAdminFields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        workflowRunsAdminFields.runId,
        workflowRunsAdminFields.moduleId,
        workflowRunsAdminFields.workflowKey,
        workflowRunsAdminFields.status,
        workflowRunsAdminFields.queuedAt,
        workflowRunsAdminFields.startedAt,
        workflowRunsAdminFields.finishedAt,
        workflowRunsAdminFields.durationMs,
        workflowRunsAdminFields.attempt,
        workflowRunsAdminFields.lastError,
      ],
      auditedFields: [],
    },
    {
      profile: projectionProfile.detail,
      visibleFields: [
        workflowRunsAdminFields.runId,
        workflowRunsAdminFields.moduleId,
        workflowRunsAdminFields.workflowKey,
        workflowRunsAdminFields.status,
        workflowRunsAdminFields.queuedAt,
        workflowRunsAdminFields.startedAt,
        workflowRunsAdminFields.finishedAt,
        workflowRunsAdminFields.durationMs,
        workflowRunsAdminFields.attempt,
        workflowRunsAdminFields.lastError,
        workflowRunsAdminFields.payloadProjection,
        workflowRunsAdminFields.auditCorrelationId,
      ],
      auditedFields: [],
    },
  ]),
});
