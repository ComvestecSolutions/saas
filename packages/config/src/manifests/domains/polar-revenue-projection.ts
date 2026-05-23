/**
 * Polar revenue projection module manifest (admin-app
 * implementation plan §9 item 7 — read-only, admin-only — and
 * the billing console surface in `specs/02-apps/admin-app/spec.md`).
 *
 * Five platform-scope config keys back the owner-locked
 * invariants the platform service enforces above persistence:
 *
 *   - `snapshotIntervalMinutes` (default 60) sets the cadence at
 *     which the dispatcher recomputes per-tenant snapshots from
 *     the Polar adapter.
 *   - `historyRetentionDays` (default 365) bounds how long
 *     superseded snapshots are retained. Older rows are pruned by
 *     the retention sweep.
 *   - `polarApiBaseUrl` (default sentinel; required env) is the
 *     Polar adapter endpoint the service decodes from
 *     `POLAR_API_BASE_URL` at the env boundary with no local
 *     fallback synthesis (security invariant: no synthesized
 *     localhost URLs).
 *   - `polarApiKey` (default sentinel; required env) is the Polar
 *     API key the service decodes from `POLAR_API_KEY` at the env
 *     boundary with no local fallback synthesis. Classified
 *     `secret` and never surfaced through the projection layer.
 *   - `cacheMaxSize` (default 1024) bounds the in-memory
 *     latest-per-tenant snapshot cache; oldest-eviction is
 *     enforced (backend instructions security invariant #5).
 *
 * Field classifications:
 *
 *   - `subscriptionMrr`, `expansion`, `contraction`,
 *     `projectedNextPeriodRevenue`, `churnRate`,
 *     `activeSubscriptionCount` → `derived-analytics` (the entire
 *     projection is a derived view, not raw billing source).
 *   - `sourcePolarAccountId` → `tenant-confidential` (links the
 *     tenant to its upstream Polar account).
 *   - every other field → `internal`.
 *
 * Two projection profiles are published: `summary` for the
 * billing console list (per-tenant MRR + projected next-period
 * revenue + computedAt) and `billing` for the full record used by
 * the admin-only detail view.
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
  polarRevenueProjectionConfigKey,
  polarRevenueProjectionFeatureFlag,
  projectionProfile,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const polarRevenueProjectionFields = defineModuleFields({
  id: "id",
  tenant: "tenant",
  billingPeriodStart: "billingPeriodStart",
  billingPeriodEnd: "billingPeriodEnd",
  subscriptionMrr: "subscriptionMrr",
  churnRate: "churnRate",
  expansion: "expansion",
  contraction: "contraction",
  projectedNextPeriodRevenue: "projectedNextPeriodRevenue",
  activeSubscriptionCount: "activeSubscriptionCount",
  sourcePolarAccountId: "sourcePolarAccountId",
  computedAt: "computedAt",
  correlationId: "correlationId",
});

export const polarRevenueProjectionFieldClassifications =
  defineDataClassificationDeclarations(polarRevenueProjectionFields, [
    {
      field: polarRevenueProjectionFields.id,
      classification: dataClassification.internal,
    },
    {
      field: polarRevenueProjectionFields.tenant,
      classification: dataClassification.internal,
    },
    {
      field: polarRevenueProjectionFields.billingPeriodStart,
      classification: dataClassification.internal,
    },
    {
      field: polarRevenueProjectionFields.billingPeriodEnd,
      classification: dataClassification.internal,
    },
    {
      field: polarRevenueProjectionFields.subscriptionMrr,
      classification: dataClassification.derivedAnalytics,
    },
    {
      field: polarRevenueProjectionFields.churnRate,
      classification: dataClassification.derivedAnalytics,
    },
    {
      field: polarRevenueProjectionFields.expansion,
      classification: dataClassification.derivedAnalytics,
    },
    {
      field: polarRevenueProjectionFields.contraction,
      classification: dataClassification.derivedAnalytics,
    },
    {
      field: polarRevenueProjectionFields.projectedNextPeriodRevenue,
      classification: dataClassification.derivedAnalytics,
    },
    {
      field: polarRevenueProjectionFields.activeSubscriptionCount,
      classification: dataClassification.derivedAnalytics,
    },
    {
      field: polarRevenueProjectionFields.sourcePolarAccountId,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: polarRevenueProjectionFields.computedAt,
      classification: dataClassification.internal,
    },
    {
      field: polarRevenueProjectionFields.correlationId,
      classification: dataClassification.internal,
    },
  ]);

export const polarRevenueProjectionManifest = defineModuleManifest({
  moduleId: platformModuleId.polarRevenueProjection,
  configKeys: [
    {
      key: polarRevenueProjectionConfigKey.snapshotIntervalMinutes,
      description:
        "Cadence (minutes) at which the dispatcher recomputes per-tenant Polar revenue snapshots. Bounded by the platform service.",
      schema: configSchemaType.number,
      defaultValue: 60,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.polarRevenueProjection,
    },
    {
      key: polarRevenueProjectionConfigKey.historyRetentionDays,
      description:
        "Retention bound (days) for superseded snapshot rows. Rows older than the bound are pruned by the retention sweep.",
      schema: configSchemaType.number,
      defaultValue: 365,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.polarRevenueProjection,
    },
    {
      key: polarRevenueProjectionConfigKey.polarApiBaseUrl,
      description:
        "Polar API base URL the service uses to compute snapshots. Decoded at the env boundary from POLAR_API_BASE_URL with no local fallback synthesis.",
      schema: configSchemaType.string,
      defaultValue: "",
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.polarRevenueProjection,
    },
    {
      key: polarRevenueProjectionConfigKey.polarApiKey,
      description:
        "Polar API key the service uses to authenticate snapshot reads. Decoded at the env boundary from POLAR_API_KEY with no local fallback synthesis. Classified secret; never surfaced through the projection layer.",
      schema: configSchemaType.string,
      defaultValue: "",
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.polarRevenueProjection,
    },
    {
      key: polarRevenueProjectionConfigKey.cacheMaxSize,
      description:
        "Bound on the in-memory latest-per-tenant snapshot cache used by the read path. Enforces oldest-eviction (security invariant #5).",
      schema: configSchemaType.number,
      defaultValue: 1024,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.polarRevenueProjection,
    },
  ],
  featureFlags: [
    {
      key: polarRevenueProjectionFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.polarRevenueProjection,
      purpose:
        "Gate the read-only Polar revenue projection admin console + backfill action.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Enable once the snapshot dispatcher is wired against live Polar credentials and the admin console renders the surface end-to-end.",
    },
    {
      key: polarRevenueProjectionFeatureFlag.backfillEnabled,
      description:
        "Gate the operator-initiated backfill mutation surface separately from snapshot reads, so the read-only console can ship before backfill is enabled.",
      owner: platformModuleId.polarRevenueProjection,
      purpose:
        "Allow rollout of the read-only console without exposing the only mutation surface (backfillRequested) until the dispatcher and audit trail are verified end-to-end.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [polarRevenueProjectionFeatureFlag.enabled],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Promote to default once operator-initiated backfill has been validated against live Polar credentials with audit-trail evidence.",
    },
  ],
  permissionScopes: [
    permissionScope.polarRevenueProjectionRead,
    permissionScope.polarRevenueProjectionBackfill,
  ],
  fieldClassifications: polarRevenueProjectionFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(
    polarRevenueProjectionFields,
    [
      {
        profile: projectionProfile.summary,
        visibleFields: [
          polarRevenueProjectionFields.id,
          polarRevenueProjectionFields.tenant,
          polarRevenueProjectionFields.billingPeriodStart,
          polarRevenueProjectionFields.billingPeriodEnd,
          polarRevenueProjectionFields.subscriptionMrr,
          polarRevenueProjectionFields.projectedNextPeriodRevenue,
          polarRevenueProjectionFields.computedAt,
        ],
        auditedFields: [],
      },
      {
        profile: projectionProfile.billing,
        visibleFields: [
          polarRevenueProjectionFields.id,
          polarRevenueProjectionFields.tenant,
          polarRevenueProjectionFields.billingPeriodStart,
          polarRevenueProjectionFields.billingPeriodEnd,
          polarRevenueProjectionFields.subscriptionMrr,
          polarRevenueProjectionFields.churnRate,
          polarRevenueProjectionFields.expansion,
          polarRevenueProjectionFields.contraction,
          polarRevenueProjectionFields.projectedNextPeriodRevenue,
          polarRevenueProjectionFields.activeSubscriptionCount,
          polarRevenueProjectionFields.sourcePolarAccountId,
          polarRevenueProjectionFields.computedAt,
          polarRevenueProjectionFields.correlationId,
        ],
        auditedFields: [polarRevenueProjectionFields.sourcePolarAccountId],
      },
    ],
  ),
});
