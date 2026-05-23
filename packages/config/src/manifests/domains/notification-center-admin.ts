/**
 * Notification center admin envelope module manifest (admin-app
 * implementation plan §9 item 16 — final Phase 1 backend gap).
 * The platform service composes an injected
 * {@link NotificationCenterPort} that wraps the Novu admin
 * surface; the canonical reason-catalog + field-security +
 * bounded-cache + bounded-pagination invariants live ABOVE the
 * port at
 * `packages/platform/src/services/domains/notification-center-admin-service.ts`.
 * Three config keys back the manifest:
 *
 *   - `cache.maxSize` (default 256) bounds the in-memory list
 *     cache via insertion-order eviction (backend instructions
 *     security invariant #5).
 *   - `cache.ttlSeconds` (default 5) bounds cached list freshness
 *     so the admin console never renders stale delivery status.
 *   - `list.pageSizeMax` (default 100) caps any `pageSize`
 *     request against the operator-tunable upper bound.
 *
 * Field classifications:
 *
 *   - `recipientProjection`, `subjectProjection`,
 *     `payloadProjection`, `providerMetadata`, and `lastError` are
 *     `regulated-sensitive` because Novu envelopes regularly
 *     contain tenant-recipient identifiers, subject lines, and
 *     vendor metadata that may include regulated detail.
 *   - The remaining fields (`notificationId`, `channel`,
 *     `status`, `createdAt`, `deliveredAt`,
 *     `auditCorrelationId`) are `internal` — already-decided
 *     platform metadata.
 *
 * Two projection profiles:
 *
 *   - `summary` is the list-card projection (drops
 *     `payloadProjection`, `providerMetadata`,
 *     `auditCorrelationId`).
 *   - `detail` is the drill-down projection (includes every
 *     field).
 */
import {
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  featureFlagLifecycle,
  notificationCenterAdminConfigKey,
  notificationCenterAdminFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const notificationCenterAdminFields = defineModuleFields({
  notificationId: "notificationId",
  channel: "channel",
  status: "status",
  recipientProjection: "recipientProjection",
  subjectProjection: "subjectProjection",
  createdAt: "createdAt",
  deliveredAt: "deliveredAt",
  lastError: "lastError",
  payloadProjection: "payloadProjection",
  providerMetadata: "providerMetadata",
  auditCorrelationId: "auditCorrelationId",
});

export const notificationCenterAdminFieldClassifications =
  defineDataClassificationDeclarations(notificationCenterAdminFields, [
    {
      field: notificationCenterAdminFields.notificationId,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterAdminFields.channel,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterAdminFields.status,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterAdminFields.recipientProjection,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: notificationCenterAdminFields.subjectProjection,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: notificationCenterAdminFields.createdAt,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterAdminFields.deliveredAt,
      classification: dataClassification.internal,
    },
    {
      field: notificationCenterAdminFields.lastError,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: notificationCenterAdminFields.payloadProjection,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: notificationCenterAdminFields.providerMetadata,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: notificationCenterAdminFields.auditCorrelationId,
      classification: dataClassification.internal,
    },
  ]);

export const notificationCenterAdminManifest = defineModuleManifest({
  moduleId: platformModuleId.notificationCenterAdmin,
  configKeys: [
    {
      key: notificationCenterAdminConfigKey.cacheMaxSize,
      description:
        "Bound on the in-memory notification-center-admin list cache. Insertion-order eviction enforces backend instructions security invariant #5.",
      schema: configSchemaType.number,
      defaultValue: 256,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.notificationCenterAdmin,
    },
    {
      key: notificationCenterAdminConfigKey.cacheTtlSeconds,
      description:
        "Bound on cached notification-center-admin list freshness (seconds). Short TTL keeps the Operator Desk aligned with the underlying Novu delivery state.",
      schema: configSchemaType.number,
      defaultValue: 5,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.notificationCenterAdmin,
    },
    {
      key: notificationCenterAdminConfigKey.listPageSizeMax,
      description:
        "Upper bound on the notification-center-admin list pageSize parameter. The service rejects any request whose decoded pageSize exceeds this value.",
      schema: configSchemaType.number,
      defaultValue: 100,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.notificationCenterAdmin,
    },
  ],
  featureFlags: [
    {
      key: notificationCenterAdminFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.notificationCenterAdmin,
      purpose:
        "Gate the Operator Desk notification-center admin envelope (list + detail + resend) that projects Novu delivery state to operators.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Promote to default once the Operator Desk shell consumes the envelope end-to-end and the resend flow has lived in production behind audit-trail evidence for one release window.",
    },
  ],
  permissionScopes: [
    permissionScope.notificationCenterAdminRead,
    permissionScope.notificationCenterAdminWrite,
  ],
  fieldClassifications: notificationCenterAdminFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(
    notificationCenterAdminFields,
    [
      {
        profile: projectionProfile.summary,
        visibleFields: [
          notificationCenterAdminFields.notificationId,
          notificationCenterAdminFields.channel,
          notificationCenterAdminFields.status,
          notificationCenterAdminFields.recipientProjection,
          notificationCenterAdminFields.subjectProjection,
          notificationCenterAdminFields.createdAt,
          notificationCenterAdminFields.deliveredAt,
          notificationCenterAdminFields.lastError,
        ],
        auditedFields: [],
      },
      {
        profile: projectionProfile.detail,
        visibleFields: [
          notificationCenterAdminFields.notificationId,
          notificationCenterAdminFields.channel,
          notificationCenterAdminFields.status,
          notificationCenterAdminFields.recipientProjection,
          notificationCenterAdminFields.subjectProjection,
          notificationCenterAdminFields.createdAt,
          notificationCenterAdminFields.deliveredAt,
          notificationCenterAdminFields.lastError,
          notificationCenterAdminFields.payloadProjection,
          notificationCenterAdminFields.providerMetadata,
          notificationCenterAdminFields.auditCorrelationId,
        ],
        auditedFields: [],
      },
    ],
  ),
});
