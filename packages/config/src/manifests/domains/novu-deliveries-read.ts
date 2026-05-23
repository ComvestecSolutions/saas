/**
 * Novu deliveries read module manifest (admin-app implementation
 * plan §9 item 10 — per-vendor read helpers, batch B vendor #1).
 *
 * Three platform-scope config keys back the owner-locked
 * invariants the platform service enforces above the upstream
 * Novu API:
 *
 *   - `cacheMaxSize` (default 256) bounds the in-memory
 *     per-`(tenant, kind, key)` delivery-summary cache;
 *     oldest-eviction is enforced (backend instructions security
 *     invariant #5).
 *   - `snapshotCacheTtlSeconds` (default 60) bounds freshness for
 *     cached summaries; stale entries trigger a live re-fetch
 *     against the Novu API.
 *   - `defaultListLimit` (default 25) caps `listByRecipient` /
 *     `listByChannel` result sizes when the caller omits an
 *     explicit limit.
 *
 * Field classifications mirror the spec in admin-app implementation
 * plan §9 item 10:
 *
 *   - `subscriberId`, `payloadDigest` → `tenant-confidential`.
 *   - `deliveryId`, `channel`, `status`, `sentAt`, `deliveredAt`,
 *     `openedAt`, `templateId`, `templateName`, `errorMessage` →
 *     `internal`.
 *
 * Two projection profiles are published: `summary` masks the
 * tenant-confidential PII columns (operator console list view) and
 * `supportSafe` exposes them for the support-operator detail view
 * with the PII fields explicitly audited.
 */
import {
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  featureFlagLifecycle,
  novuDeliveriesReadConfigKey,
  novuDeliveriesReadFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const novuDeliveriesReadFields = defineModuleFields({
  deliveryId: "deliveryId",
  subscriberId: "subscriberId",
  channel: "channel",
  status: "status",
  sentAt: "sentAt",
  deliveredAt: "deliveredAt",
  openedAt: "openedAt",
  templateId: "templateId",
  templateName: "templateName",
  payloadDigest: "payloadDigest",
  errorMessage: "errorMessage",
});

export const novuDeliveriesReadFieldClassifications =
  defineDataClassificationDeclarations(novuDeliveriesReadFields, [
    {
      field: novuDeliveriesReadFields.deliveryId,
      classification: dataClassification.internal,
    },
    {
      field: novuDeliveriesReadFields.subscriberId,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: novuDeliveriesReadFields.channel,
      classification: dataClassification.internal,
    },
    {
      field: novuDeliveriesReadFields.status,
      classification: dataClassification.internal,
    },
    {
      field: novuDeliveriesReadFields.sentAt,
      classification: dataClassification.internal,
    },
    {
      field: novuDeliveriesReadFields.deliveredAt,
      classification: dataClassification.internal,
    },
    {
      field: novuDeliveriesReadFields.openedAt,
      classification: dataClassification.internal,
    },
    {
      field: novuDeliveriesReadFields.templateId,
      classification: dataClassification.internal,
    },
    {
      field: novuDeliveriesReadFields.templateName,
      classification: dataClassification.internal,
    },
    {
      field: novuDeliveriesReadFields.payloadDigest,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: novuDeliveriesReadFields.errorMessage,
      classification: dataClassification.internal,
    },
  ]);

export const novuDeliveriesReadManifest = defineModuleManifest({
  moduleId: platformModuleId.novuDeliveriesRead,
  configKeys: [
    {
      key: novuDeliveriesReadConfigKey.cacheMaxSize,
      description:
        "Bound on the in-memory per-(tenant, kind, key) Novu delivery-summary cache used by the read path. Enforces oldest-eviction (security invariant #5).",
      schema: configSchemaType.number,
      defaultValue: 256,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.novuDeliveriesRead,
    },
    {
      key: novuDeliveriesReadConfigKey.snapshotCacheTtlSeconds,
      description:
        "Bound on cached Novu delivery-summary freshness (seconds). Stale entries trigger a live re-fetch against the Novu API.",
      schema: configSchemaType.number,
      defaultValue: 60,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.novuDeliveriesRead,
    },
    {
      key: novuDeliveriesReadConfigKey.defaultListLimit,
      description:
        "Default cap on listByRecipient / listByChannel result sizes when the caller omits an explicit limit.",
      schema: configSchemaType.number,
      defaultValue: 25,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.novuDeliveriesRead,
    },
  ],
  featureFlags: [
    {
      key: novuDeliveriesReadFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.novuDeliveriesRead,
      purpose:
        "Gate the read-only Novu deliveries-read operator console surface.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Promote to default once the admin console renders the surface end-to-end against live Novu credentials with audit-trail evidence.",
    },
  ],
  permissionScopes: [permissionScope.novuDeliveriesRead],
  fieldClassifications: novuDeliveriesReadFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(novuDeliveriesReadFields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        novuDeliveriesReadFields.deliveryId,
        novuDeliveriesReadFields.channel,
        novuDeliveriesReadFields.status,
        novuDeliveriesReadFields.sentAt,
        novuDeliveriesReadFields.deliveredAt,
        novuDeliveriesReadFields.openedAt,
        novuDeliveriesReadFields.templateId,
        novuDeliveriesReadFields.templateName,
        novuDeliveriesReadFields.errorMessage,
      ],
      auditedFields: [],
    },
    {
      profile: projectionProfile.supportSafe,
      visibleFields: [
        novuDeliveriesReadFields.deliveryId,
        novuDeliveriesReadFields.subscriberId,
        novuDeliveriesReadFields.channel,
        novuDeliveriesReadFields.status,
        novuDeliveriesReadFields.sentAt,
        novuDeliveriesReadFields.deliveredAt,
        novuDeliveriesReadFields.openedAt,
        novuDeliveriesReadFields.templateId,
        novuDeliveriesReadFields.templateName,
        novuDeliveriesReadFields.payloadDigest,
        novuDeliveriesReadFields.errorMessage,
      ],
      auditedFields: [
        novuDeliveriesReadFields.subscriberId,
        novuDeliveriesReadFields.payloadDigest,
      ],
    },
  ]),
});
