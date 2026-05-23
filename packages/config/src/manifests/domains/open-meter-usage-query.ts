/**
 * OpenMeter usage query module manifest (admin-app implementation
 * plan §9 item 8 — admin-only). Mirrors the polar-revenue-projection
 * manifest shape, scoped to the OpenMeter adapter via
 * `platformAdapterServiceName.openmeter`.
 *
 * Three platform-scope config keys back the owner-locked
 * invariants the platform service enforces above persistence:
 *
 *   - `queryCacheTtlSeconds` (default 60) bounds the freshness
 *     window used to flip `isFresh` on the read path.
 *   - `maxWindowDays` (default 31) caps the inclusive
 *     `(window.to − window.from)` span the service will accept
 *     before refusing the query at the boundary.
 *   - `cacheMaxSize` (default 1024) bounds the in-memory
 *     latest-per-tenant-meter snapshot cache; oldest-eviction is
 *     enforced (backend instructions security invariant #5).
 *
 * The OpenMeter API base URL + API key are decoded at the env
 * boundary by the env-bound runtime (`OPENMETER_API_BASE_URL` +
 * `OPENMETER_API_KEY`) with no local fallback synthesis — they
 * live with the adapter, not on the manifest, mirroring how the
 * other adapter-backed modules declare credentials.
 *
 * Field classifications:
 *
 *   - `aggregated` → `derived-analytics` (bucketed usage values
 *     are a service-computed view, not raw upstream events).
 *   - `subject` → `tenant-confidential` (links the tenant to the
 *     upstream OpenMeter subject identifier).
 *   - every other field → `internal`.
 *
 * Two projection profiles are published: `summary` for the meters
 * console list (tenant + meter + window + computedAt) and
 * `billing` for the full record used by the admin-only detail view.
 */
import {
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  featureFlagLifecycle,
  openMeterUsageQueryConfigKey,
  openMeterUsageQueryFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const openMeterUsageQueryFields = defineModuleFields({
  id: "id",
  tenant: "tenant",
  subject: "subject",
  meterSlug: "meterSlug",
  window: "window",
  granularity: "granularity",
  aggregated: "aggregated",
  computedAt: "computedAt",
  correlationId: "correlationId",
});

export const openMeterUsageQueryFieldClassifications =
  defineDataClassificationDeclarations(openMeterUsageQueryFields, [
    {
      field: openMeterUsageQueryFields.id,
      classification: dataClassification.internal,
    },
    {
      field: openMeterUsageQueryFields.tenant,
      classification: dataClassification.internal,
    },
    {
      field: openMeterUsageQueryFields.subject,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: openMeterUsageQueryFields.meterSlug,
      classification: dataClassification.internal,
    },
    {
      field: openMeterUsageQueryFields.window,
      classification: dataClassification.internal,
    },
    {
      field: openMeterUsageQueryFields.granularity,
      classification: dataClassification.internal,
    },
    {
      field: openMeterUsageQueryFields.aggregated,
      classification: dataClassification.derivedAnalytics,
    },
    {
      field: openMeterUsageQueryFields.computedAt,
      classification: dataClassification.internal,
    },
    {
      field: openMeterUsageQueryFields.correlationId,
      classification: dataClassification.internal,
    },
  ]);

export const openMeterUsageQueryManifest = defineModuleManifest({
  moduleId: platformModuleId.openMeterUsageQuery,
  configKeys: [
    {
      key: openMeterUsageQueryConfigKey.queryCacheTtlSeconds,
      description:
        "Freshness window (seconds) used by the read path to flip `isFresh` on cached snapshots.",
      schema: configSchemaType.number,
      defaultValue: 60,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.openMeterUsageQuery,
    },
    {
      key: openMeterUsageQueryConfigKey.maxWindowDays,
      description:
        "Maximum inclusive (window.to − window.from) span the service will accept before refusing the query at the boundary.",
      schema: configSchemaType.number,
      defaultValue: 31,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.openMeterUsageQuery,
    },
    {
      key: openMeterUsageQueryConfigKey.cacheMaxSize,
      description:
        "Bound on the in-memory latest-per-tenant-meter snapshot cache used by the read path. Enforces oldest-eviction (security invariant #5).",
      schema: configSchemaType.number,
      defaultValue: 1024,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.openMeterUsageQuery,
    },
  ],
  featureFlags: [
    {
      key: openMeterUsageQueryFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.openMeterUsageQuery,
      purpose:
        "Gate the admin-only OpenMeter usage query console + backfill action.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Enable once the usage-aggregation dispatcher is wired against live OpenMeter credentials and the admin console renders the surface end-to-end.",
    },
  ],
  permissionScopes: [
    permissionScope.openMeterUsageQueryRead,
    permissionScope.openMeterUsageQueryBackfill,
  ],
  fieldClassifications: openMeterUsageQueryFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(openMeterUsageQueryFields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        openMeterUsageQueryFields.id,
        openMeterUsageQueryFields.tenant,
        openMeterUsageQueryFields.meterSlug,
        openMeterUsageQueryFields.window,
        openMeterUsageQueryFields.granularity,
        openMeterUsageQueryFields.computedAt,
      ],
      auditedFields: [],
    },
    {
      profile: projectionProfile.billing,
      visibleFields: [
        openMeterUsageQueryFields.id,
        openMeterUsageQueryFields.tenant,
        openMeterUsageQueryFields.subject,
        openMeterUsageQueryFields.meterSlug,
        openMeterUsageQueryFields.window,
        openMeterUsageQueryFields.granularity,
        openMeterUsageQueryFields.aggregated,
        openMeterUsageQueryFields.computedAt,
        openMeterUsageQueryFields.correlationId,
      ],
      auditedFields: [openMeterUsageQueryFields.subject],
    },
  ]),
});
