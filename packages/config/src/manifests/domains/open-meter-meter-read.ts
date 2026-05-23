/**
 * OpenMeter meter read module manifest (admin-app implementation
 * plan §9 item 10 — per-vendor read helpers, batch A vendor #3).
 *
 * Three platform-scope config keys back the owner-locked
 * invariants the platform service enforces above the upstream
 * OpenMeter API:
 *
 *   - `cacheMaxSize` (default 256) bounds the in-memory
 *     per-`(tenant, kind, key)` meter-summary cache; oldest-eviction
 *     is enforced (backend instructions security invariant #5).
 *   - `snapshotCacheTtlSeconds` (default 60) bounds freshness for
 *     cached summaries; stale entries trigger a live re-fetch
 *     against the OpenMeter API.
 *   - `defaultListLimit` (default 25) caps `listAll` /
 *     `listByEventType` result sizes when the caller omits an
 *     explicit limit.
 *
 * Field classifications: ALL meter definition fields are operator
 * vocabulary, not tenant PII, so every field is `internal`. Two
 * projection profiles are published: `summary` exposes every field
 * (operator console list view) and `supportSafe` is identical
 * because there is no tenant-confidential PII to gate.
 */
import {
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  featureFlagLifecycle,
  openMeterMeterReadConfigKey,
  openMeterMeterReadFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const openMeterMeterReadFields = defineModuleFields({
  meterSlug: "meterSlug",
  displayName: "displayName",
  aggregation: "aggregation",
  eventType: "eventType",
  valueProperty: "valueProperty",
  createdAt: "createdAt",
});

export const openMeterMeterReadFieldClassifications =
  defineDataClassificationDeclarations(openMeterMeterReadFields, [
    {
      field: openMeterMeterReadFields.meterSlug,
      classification: dataClassification.internal,
    },
    {
      field: openMeterMeterReadFields.displayName,
      classification: dataClassification.internal,
    },
    {
      field: openMeterMeterReadFields.aggregation,
      classification: dataClassification.internal,
    },
    {
      field: openMeterMeterReadFields.eventType,
      classification: dataClassification.internal,
    },
    {
      field: openMeterMeterReadFields.valueProperty,
      classification: dataClassification.internal,
    },
    {
      field: openMeterMeterReadFields.createdAt,
      classification: dataClassification.internal,
    },
  ]);

export const openMeterMeterReadManifest = defineModuleManifest({
  moduleId: platformModuleId.openMeterMeterRead,
  configKeys: [
    {
      key: openMeterMeterReadConfigKey.cacheMaxSize,
      description:
        "Bound on the in-memory per-(tenant, kind, key) OpenMeter meter-summary cache used by the read path. Enforces oldest-eviction (security invariant #5).",
      schema: configSchemaType.number,
      defaultValue: 256,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.openMeterMeterRead,
    },
    {
      key: openMeterMeterReadConfigKey.snapshotCacheTtlSeconds,
      description:
        "Bound on cached OpenMeter meter-summary freshness (seconds). Stale entries trigger a live re-fetch against the OpenMeter API.",
      schema: configSchemaType.number,
      defaultValue: 60,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.openMeterMeterRead,
    },
    {
      key: openMeterMeterReadConfigKey.defaultListLimit,
      description:
        "Default cap on listAll / listByEventType result sizes when the caller omits an explicit limit.",
      schema: configSchemaType.number,
      defaultValue: 25,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.openMeterMeterRead,
    },
  ],
  featureFlags: [
    {
      key: openMeterMeterReadFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.openMeterMeterRead,
      purpose:
        "Gate the read-only OpenMeter meter-read operator console surface.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Promote to default once the admin console renders the surface end-to-end against live OpenMeter credentials with audit-trail evidence.",
    },
  ],
  permissionScopes: [permissionScope.openMeterMeterRead],
  fieldClassifications: openMeterMeterReadFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(openMeterMeterReadFields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        openMeterMeterReadFields.meterSlug,
        openMeterMeterReadFields.displayName,
        openMeterMeterReadFields.aggregation,
        openMeterMeterReadFields.eventType,
        openMeterMeterReadFields.valueProperty,
        openMeterMeterReadFields.createdAt,
      ],
      auditedFields: [],
    },
    {
      profile: projectionProfile.supportSafe,
      visibleFields: [
        openMeterMeterReadFields.meterSlug,
        openMeterMeterReadFields.displayName,
        openMeterMeterReadFields.aggregation,
        openMeterMeterReadFields.eventType,
        openMeterMeterReadFields.valueProperty,
        openMeterMeterReadFields.createdAt,
      ],
      auditedFields: [],
    },
  ]),
});
