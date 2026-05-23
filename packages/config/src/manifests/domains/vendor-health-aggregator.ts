/**
 * Vendor-health aggregator module manifest (admin-app
 * implementation plan §9 item 9 — admin/support-operator only).
 * Mirrors the polar-revenue-projection + open-meter-usage-query
 * manifest shapes, but the aggregate is **read-only** and is
 * recomputed live against every adapter healthcheck identified by
 * `platformAdapterServiceName.*` — there is NO snapshot table for
 * this module, only an in-memory cache bounded by `cacheMaxSize`.
 *
 * Two platform-scope config keys back the owner-locked invariants
 * the platform service enforces above persistence:
 *
 *   - `snapshotCacheTtlSeconds` (default 30) bounds the in-memory
 *     cache freshness window: callers within the TTL receive the
 *     cached aggregate; older entries trigger a recompute.
 *   - `cacheMaxSize` (default 32) bounds the size of the snapshot
 *     cache; insertion-order eviction enforces the
 *     bounded-collection security invariant. Most operator
 *     workloads share the same cache key but operators sharding
 *     across multiple windows can size accordingly.
 *
 * The `enabled` feature flag is auto-injected by
 * `defineModuleFeatureFlags`.
 *
 * Field classifications follow the existing aggregate-v2 modules
 * (operations-home / tenant-workspace): every read-side field is
 * `internal` because no row in the aggregate carries
 * tenant-confidential or regulated content — the aggregate is a
 * platform-operator view over upstream adapter posture, not a
 * tenant data surface. The summary projection profile masks the
 * optional `message` field used for failure narratives.
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
  vendorHealthAggregatorConfigKey,
  vendorHealthAggregatorFeatureFlag,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const vendorHealthAggregatorFields = defineModuleFields({
  serviceName: "serviceName",
  status: "status",
  version: "version",
  latencyMs: "latencyMs",
  lastCheckedAt: "lastCheckedAt",
  lastIncidentAt: "lastIncidentAt",
  message: "message",
});

export const vendorHealthAggregatorFieldClassifications =
  defineDataClassificationDeclarations(vendorHealthAggregatorFields, [
    {
      field: vendorHealthAggregatorFields.serviceName,
      classification: dataClassification.internal,
    },
    {
      field: vendorHealthAggregatorFields.status,
      classification: dataClassification.internal,
    },
    {
      field: vendorHealthAggregatorFields.version,
      classification: dataClassification.internal,
    },
    {
      field: vendorHealthAggregatorFields.latencyMs,
      classification: dataClassification.internal,
    },
    {
      field: vendorHealthAggregatorFields.lastCheckedAt,
      classification: dataClassification.internal,
    },
    {
      field: vendorHealthAggregatorFields.lastIncidentAt,
      classification: dataClassification.internal,
    },
    {
      field: vendorHealthAggregatorFields.message,
      classification: dataClassification.internal,
    },
  ]);

export const vendorHealthAggregatorManifest = defineModuleManifest({
  moduleId: platformModuleId.vendorHealthAggregator,
  configKeys: [
    {
      key: vendorHealthAggregatorConfigKey.snapshotCacheTtlSeconds,
      description:
        "Freshness window (seconds) used by the read path to serve the cached aggregate before triggering a recompute against every adapter healthcheck.",
      schema: configSchemaType.number,
      defaultValue: 30,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.vendorHealthAggregator,
    },
    {
      key: vendorHealthAggregatorConfigKey.cacheMaxSize,
      description:
        "Bound on the in-memory snapshot cache used by the read path. Enforces oldest-eviction (security invariant #5).",
      schema: configSchemaType.number,
      defaultValue: 32,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.vendorHealthAggregator,
    },
  ],
  featureFlags: [
    {
      key: vendorHealthAggregatorFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.vendorHealthAggregator,
      purpose:
        "Gate the admin-only vendor-health aggregator console + the operator desk vendor card.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Enable once every adapter exposes a healthcheck Effect and the admin console renders the aggregate end-to-end.",
    },
  ],
  permissionScopes: [permissionScope.vendorHealthAggregatorRead],
  fieldClassifications: vendorHealthAggregatorFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(
    vendorHealthAggregatorFields,
    [
      {
        profile: projectionProfile.summary,
        visibleFields: [
          vendorHealthAggregatorFields.serviceName,
          vendorHealthAggregatorFields.status,
          vendorHealthAggregatorFields.version,
          vendorHealthAggregatorFields.latencyMs,
          vendorHealthAggregatorFields.lastCheckedAt,
          vendorHealthAggregatorFields.lastIncidentAt,
        ],
        auditedFields: [],
      },
      {
        profile: projectionProfile.detail,
        visibleFields: [
          vendorHealthAggregatorFields.serviceName,
          vendorHealthAggregatorFields.status,
          vendorHealthAggregatorFields.version,
          vendorHealthAggregatorFields.latencyMs,
          vendorHealthAggregatorFields.lastCheckedAt,
          vendorHealthAggregatorFields.lastIncidentAt,
          vendorHealthAggregatorFields.message,
        ],
        auditedFields: [],
      },
    ],
  ),
});
