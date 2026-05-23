/**
 * Postal mail log read module manifest (admin-app implementation
 * plan §9 item 10 — per-vendor read helpers, batch B vendor #2).
 *
 * Three platform-scope config keys back the owner-locked
 * invariants the platform service enforces above the upstream
 * Postal API:
 *
 *   - `cacheMaxSize` (default 256) bounds the in-memory
 *     per-`(tenant, kind, key)` mail-log-entry cache;
 *     oldest-eviction is enforced (backend instructions security
 *     invariant #5).
 *   - `snapshotCacheTtlSeconds` (default 60) bounds freshness for
 *     cached entries; stale entries trigger a live re-fetch
 *     against the Postal API.
 *   - `defaultListLimit` (default 25) caps `listByRecipient` /
 *     `listByStatus` result sizes when the caller omits an
 *     explicit limit.
 *
 * Field classifications mirror the spec in admin-app implementation
 * plan §9 item 10:
 *
 *   - `fromAddress`, `toAddress`, `subject`, `bounceReason` →
 *     `tenant-confidential`.
 *   - `messageId`, `status`, `sentAt`, `deliveredAt`,
 *     `lastEventAt` → `internal`.
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
  permissionScope,
  platformModuleId,
  platformScope,
  postalMailLogReadConfigKey,
  postalMailLogReadFeatureFlag,
  projectionProfile,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const postalMailLogReadFields = defineModuleFields({
  messageId: "messageId",
  fromAddress: "fromAddress",
  toAddress: "toAddress",
  subject: "subject",
  status: "status",
  sentAt: "sentAt",
  deliveredAt: "deliveredAt",
  bounceReason: "bounceReason",
  lastEventAt: "lastEventAt",
});

export const postalMailLogReadFieldClassifications =
  defineDataClassificationDeclarations(postalMailLogReadFields, [
    {
      field: postalMailLogReadFields.messageId,
      classification: dataClassification.internal,
    },
    {
      field: postalMailLogReadFields.fromAddress,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: postalMailLogReadFields.toAddress,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: postalMailLogReadFields.subject,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: postalMailLogReadFields.status,
      classification: dataClassification.internal,
    },
    {
      field: postalMailLogReadFields.sentAt,
      classification: dataClassification.internal,
    },
    {
      field: postalMailLogReadFields.deliveredAt,
      classification: dataClassification.internal,
    },
    {
      field: postalMailLogReadFields.bounceReason,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: postalMailLogReadFields.lastEventAt,
      classification: dataClassification.internal,
    },
  ]);

export const postalMailLogReadManifest = defineModuleManifest({
  moduleId: platformModuleId.postalMailLogRead,
  configKeys: [
    {
      key: postalMailLogReadConfigKey.cacheMaxSize,
      description:
        "Bound on the in-memory per-(tenant, kind, key) Postal mail-log-entry cache used by the read path. Enforces oldest-eviction (security invariant #5).",
      schema: configSchemaType.number,
      defaultValue: 256,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.postalMailLogRead,
    },
    {
      key: postalMailLogReadConfigKey.snapshotCacheTtlSeconds,
      description:
        "Bound on cached Postal mail-log-entry freshness (seconds). Stale entries trigger a live re-fetch against the Postal API.",
      schema: configSchemaType.number,
      defaultValue: 60,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.postalMailLogRead,
    },
    {
      key: postalMailLogReadConfigKey.defaultListLimit,
      description:
        "Default cap on listByRecipient / listByStatus result sizes when the caller omits an explicit limit.",
      schema: configSchemaType.number,
      defaultValue: 25,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.postalMailLogRead,
    },
  ],
  featureFlags: [
    {
      key: postalMailLogReadFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.postalMailLogRead,
      purpose:
        "Gate the read-only Postal mail-log-read operator console surface.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Promote to default once the admin console renders the surface end-to-end against live Postal credentials with audit-trail evidence.",
    },
  ],
  permissionScopes: [permissionScope.postalMailLogRead],
  fieldClassifications: postalMailLogReadFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(postalMailLogReadFields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        postalMailLogReadFields.messageId,
        postalMailLogReadFields.status,
        postalMailLogReadFields.sentAt,
        postalMailLogReadFields.deliveredAt,
        postalMailLogReadFields.lastEventAt,
      ],
      auditedFields: [],
    },
    {
      profile: projectionProfile.supportSafe,
      visibleFields: [
        postalMailLogReadFields.messageId,
        postalMailLogReadFields.fromAddress,
        postalMailLogReadFields.toAddress,
        postalMailLogReadFields.subject,
        postalMailLogReadFields.status,
        postalMailLogReadFields.sentAt,
        postalMailLogReadFields.deliveredAt,
        postalMailLogReadFields.bounceReason,
        postalMailLogReadFields.lastEventAt,
      ],
      auditedFields: [
        postalMailLogReadFields.fromAddress,
        postalMailLogReadFields.toAddress,
        postalMailLogReadFields.subject,
        postalMailLogReadFields.bounceReason,
      ],
    },
  ]),
});
