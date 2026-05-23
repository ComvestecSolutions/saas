/**
 * Operator webhook delivery envelope module manifest (admin-app
 * implementation plan §9 item 6 + `specs/02-apps/admin-app/spec.md`
 * operator webhook console surface).
 *
 * Six platform-scope config keys back the owner-locked invariants
 * the platform service enforces above persistence:
 *
 * - `maxAttempts` (default 6) bounds total dispatch attempts per
 *   delivery row. Beyond it, status transitions to `exhausted`.
 * - `backoffBaseSeconds` (default 30) seeds the exponential backoff
 *   `backoffBaseSeconds * 2^(attemptCount - 1)`.
 * - `replayGuardWindowMinutes` (default 1440 = 24h) is the window in
 *   which a duplicate `(subscriptionId, payloadHash)` short-circuits
 *   to the existing delivery row (idempotency key).
 * - `signatureFreshnessSeconds` (default 300 = 5min) bounds how old
 *   a signature timestamp may be when the operator signature
 *   inspector recomputes; older timestamps fail the inspector check.
 * - `responseBodySnippetMaxBytes` (default 4096) caps the persisted
 *   response-body snippet so the attempt log does not become a
 *   storage hazard.
 * - `cacheMaxSize` (default 1024) bounds the in-memory recent-
 *   delivery cache used by the replay-guard lookup; oldest-eviction
 *   is enforced (backend instructions security invariant #5).
 *
 * Field classifications:
 *
 * - `signature` -> `secret` (always redacted by field-security; the
 *   operator signature inspector recomputes it on demand instead of
 *   reading the column directly through the projection layer)
 * - `requestBody` + `lastResponseBodySnippet` -> `tenant-confidential`
 *   (operators see them; non-operator projections redact)
 * - all other fields -> `internal`
 *
 * Two projection profiles are published: `summary` for the desk
 * delivery list (id, status, eventType, attemptCount, nextAttemptAt,
 * subscriptionId) and `admin` for the full record (signature
 * inspector + body inspector).
 */
import {
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  featureFlagLifecycle,
  operatorWebhookDeliveryConfigKey,
  operatorWebhookDeliveryFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const operatorWebhookDeliveryFields = defineModuleFields({
  id: "id",
  subscriptionId: "subscriptionId",
  targetTenant: "targetTenant",
  eventType: "eventType",
  requestUrl: "requestUrl",
  requestMethod: "requestMethod",
  requestBody: "requestBody",
  payloadHash: "payloadHash",
  signature: "signature",
  signatureTimestamp: "signatureTimestamp",
  status: "status",
  attemptCount: "attemptCount",
  enqueuedAt: "enqueuedAt",
  nextAttemptAt: "nextAttemptAt",
  lastAttemptAt: "lastAttemptAt",
  lastResponseStatus: "lastResponseStatus",
  lastResponseBodySnippet: "lastResponseBodySnippet",
  lastErrorMessage: "lastErrorMessage",
  replayOfDeliveryId: "replayOfDeliveryId",
  correlationId: "correlationId",
});

export const operatorWebhookDeliveryFieldClassifications =
  defineDataClassificationDeclarations(operatorWebhookDeliveryFields, [
    {
      field: operatorWebhookDeliveryFields.id,
      classification: dataClassification.internal,
    },
    {
      field: operatorWebhookDeliveryFields.subscriptionId,
      classification: dataClassification.internal,
    },
    {
      field: operatorWebhookDeliveryFields.targetTenant,
      classification: dataClassification.internal,
    },
    {
      field: operatorWebhookDeliveryFields.eventType,
      classification: dataClassification.internal,
    },
    {
      field: operatorWebhookDeliveryFields.requestUrl,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: operatorWebhookDeliveryFields.requestMethod,
      classification: dataClassification.internal,
    },
    {
      field: operatorWebhookDeliveryFields.requestBody,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: operatorWebhookDeliveryFields.payloadHash,
      classification: dataClassification.internal,
    },
    {
      field: operatorWebhookDeliveryFields.signature,
      classification: dataClassification.secret,
    },
    {
      field: operatorWebhookDeliveryFields.signatureTimestamp,
      classification: dataClassification.internal,
    },
    {
      field: operatorWebhookDeliveryFields.status,
      classification: dataClassification.internal,
    },
    {
      field: operatorWebhookDeliveryFields.attemptCount,
      classification: dataClassification.internal,
    },
    {
      field: operatorWebhookDeliveryFields.enqueuedAt,
      classification: dataClassification.internal,
    },
    {
      field: operatorWebhookDeliveryFields.nextAttemptAt,
      classification: dataClassification.internal,
    },
    {
      field: operatorWebhookDeliveryFields.lastAttemptAt,
      classification: dataClassification.internal,
    },
    {
      field: operatorWebhookDeliveryFields.lastResponseStatus,
      classification: dataClassification.internal,
    },
    {
      field: operatorWebhookDeliveryFields.lastResponseBodySnippet,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: operatorWebhookDeliveryFields.lastErrorMessage,
      classification: dataClassification.internal,
    },
    {
      field: operatorWebhookDeliveryFields.replayOfDeliveryId,
      classification: dataClassification.internal,
    },
    {
      field: operatorWebhookDeliveryFields.correlationId,
      classification: dataClassification.internal,
    },
  ]);

export const operatorWebhookDeliveryManifest = defineModuleManifest({
  moduleId: platformModuleId.operatorWebhookDelivery,
  configKeys: [
    {
      key: operatorWebhookDeliveryConfigKey.maxAttempts,
      description:
        "Maximum dispatch attempts per delivery row before status transitions to 'exhausted'. Bounded by the platform service enforcement of OperatorWebhookDeliveryAttemptBudgetExceeded.",
      schema: configSchemaType.number,
      defaultValue: 6,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.operatorWebhookDelivery,
    },
    {
      key: operatorWebhookDeliveryConfigKey.backoffBaseSeconds,
      description:
        "Base seconds for exponential backoff between dispatch attempts (backoffBaseSeconds * 2^(attemptCount - 1)).",
      schema: configSchemaType.number,
      defaultValue: 30,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.operatorWebhookDelivery,
    },
    {
      key: operatorWebhookDeliveryConfigKey.replayGuardWindowMinutes,
      description:
        "Window in minutes within which a duplicate (subscriptionId, payloadHash) enqueue short-circuits to the existing delivery row (idempotency key). Default 1440 = 24h.",
      schema: configSchemaType.number,
      defaultValue: 1440,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.operatorWebhookDelivery,
    },
    {
      key: operatorWebhookDeliveryConfigKey.signatureFreshnessSeconds,
      description:
        "Maximum age in seconds a signature timestamp may have when the operator signature inspector recomputes; older timestamps fail the inspector check.",
      schema: configSchemaType.number,
      defaultValue: 300,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.operatorWebhookDelivery,
    },
    {
      key: operatorWebhookDeliveryConfigKey.responseBodySnippetMaxBytes,
      description:
        "Cap in bytes on the persisted response-body snippet. Longer responses are truncated before persistence.",
      schema: configSchemaType.number,
      defaultValue: 4096,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.operatorWebhookDelivery,
    },
    {
      key: operatorWebhookDeliveryConfigKey.cacheMaxSize,
      description:
        "Bound on the in-memory recent-delivery cache used by replay-guard. Enforces oldest-eviction (security invariant #5).",
      schema: configSchemaType.number,
      defaultValue: 1024,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.operatorWebhookDelivery,
    },
  ],
  featureFlags: [
    {
      key: operatorWebhookDeliveryFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.operatorWebhookDelivery,
      purpose:
        "Gate the operator-facing webhook delivery envelope (dispatch + retry + replay + signature inspector).",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Enable once outbound delivery infrastructure is stable and the operator console wires the desk surface.",
    },
  ],
  permissionScopes: [
    permissionScope.operatorWebhookDeliveryRead,
    permissionScope.operatorWebhookDeliveryReplay,
    permissionScope.operatorWebhookDeliveryRetry,
    permissionScope.operatorWebhookDeliveryCancel,
  ],
  fieldClassifications: operatorWebhookDeliveryFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(
    operatorWebhookDeliveryFields,
    [
      {
        profile: projectionProfile.summary,
        visibleFields: [
          operatorWebhookDeliveryFields.id,
          operatorWebhookDeliveryFields.subscriptionId,
          operatorWebhookDeliveryFields.eventType,
          operatorWebhookDeliveryFields.status,
          operatorWebhookDeliveryFields.attemptCount,
          operatorWebhookDeliveryFields.enqueuedAt,
          operatorWebhookDeliveryFields.nextAttemptAt,
          operatorWebhookDeliveryFields.lastAttemptAt,
          operatorWebhookDeliveryFields.lastResponseStatus,
          operatorWebhookDeliveryFields.targetTenant,
        ],
        auditedFields: [],
      },
      {
        profile: projectionProfile.admin,
        visibleFields: [
          operatorWebhookDeliveryFields.id,
          operatorWebhookDeliveryFields.subscriptionId,
          operatorWebhookDeliveryFields.targetTenant,
          operatorWebhookDeliveryFields.eventType,
          operatorWebhookDeliveryFields.requestUrl,
          operatorWebhookDeliveryFields.requestMethod,
          operatorWebhookDeliveryFields.requestBody,
          operatorWebhookDeliveryFields.payloadHash,
          operatorWebhookDeliveryFields.signatureTimestamp,
          operatorWebhookDeliveryFields.status,
          operatorWebhookDeliveryFields.attemptCount,
          operatorWebhookDeliveryFields.enqueuedAt,
          operatorWebhookDeliveryFields.nextAttemptAt,
          operatorWebhookDeliveryFields.lastAttemptAt,
          operatorWebhookDeliveryFields.lastResponseStatus,
          operatorWebhookDeliveryFields.lastResponseBodySnippet,
          operatorWebhookDeliveryFields.lastErrorMessage,
          operatorWebhookDeliveryFields.replayOfDeliveryId,
          operatorWebhookDeliveryFields.correlationId,
        ],
        auditedFields: [
          operatorWebhookDeliveryFields.requestBody,
          operatorWebhookDeliveryFields.lastResponseBodySnippet,
        ],
      },
    ],
  ),
});
