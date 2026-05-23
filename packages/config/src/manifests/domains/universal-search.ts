/**
 * Universal search module manifest (admin-app implementation
 * plan §9 item 11). Five platform-scope config keys back the
 * owner-locked invariants the platform service enforces above
 * the Meilisearch adapter (`platformAdapterServiceName.meilisearch`):
 *
 *   - `perFacetLimitDefault` (default 5) is the per-bucket top-K
 *     when the caller omits `perFacetLimit`. Keeps the omnibar
 *     fast under burst.
 *   - `perFacetLimitMax` (default 20) is the hard ceiling
 *     enforced at the SERVICE layer regardless of what the
 *     caller asks for (defense in depth above the contract's
 *     1..50 boundary).
 *   - `cacheMaxSize` (default 256) bounds the in-memory result
 *     cache; insertion-order eviction enforces backend
 *     instructions security invariant #5.
 *   - `cacheTtlSeconds` (default 30) bounds cached result
 *     freshness; stale entries trigger a live re-search.
 *   - `indexFreshnessThresholdSeconds` (default 600) is the
 *     threshold `isIndexFresh` uses to flip the result envelope's
 *     `indexFreshness.isFresh` so the omnibar can warn operators
 *     when results are computed against a stale index.
 *
 * Two feature flags:
 *
 *   - `enabled` (implicit): module visibility.
 *   - `reindexEnabled`: gate on the operator-only reindex action
 *     so the underlying Meilisearch reindex can be held off in
 *     production until the per-facet index swap is documented.
 *
 * Field classifications:
 *
 *   - `label`, `subtitle`, `permalink` are `internal` — the
 *     omnibar surfaces them inside the operator console but they
 *     are not tenant-confidential.
 *   - `metadataDigest` is `tenant-confidential` — even a hashed
 *     digest can leak per-tenant signal (presence + ordering),
 *     so support operators see it only via the field-security
 *     pass.
 *
 * One projection profile (`summary`): the omnibar render shape.
 * `metadataDigest` is masked from the summary projection to
 * keep the redaction default conservative; the platform service
 * still applies field-security at the row level before any
 * entry leaves the service boundary.
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
  universalSearchConfigKey,
  universalSearchFeatureFlag,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const universalSearchFields = defineModuleFields({
  label: "label",
  subtitle: "subtitle",
  permalink: "permalink",
  metadataDigest: "metadataDigest",
});

export const universalSearchFieldClassifications =
  defineDataClassificationDeclarations(universalSearchFields, [
    {
      field: universalSearchFields.label,
      classification: dataClassification.internal,
    },
    {
      field: universalSearchFields.subtitle,
      classification: dataClassification.internal,
    },
    {
      field: universalSearchFields.permalink,
      classification: dataClassification.internal,
    },
    {
      field: universalSearchFields.metadataDigest,
      classification: dataClassification.tenantConfidential,
    },
  ]);

export const universalSearchManifest = defineModuleManifest({
  moduleId: platformModuleId.universalSearch,
  configKeys: [
    {
      key: universalSearchConfigKey.perFacetLimitDefault,
      description:
        "Default per-facet top-K when the caller omits perFacetLimit on a universal-search query.",
      schema: configSchemaType.number,
      defaultValue: 5,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.universalSearch,
    },
    {
      key: universalSearchConfigKey.perFacetLimitMax,
      description:
        "Hard ceiling enforced at the platform service for the per-facet top-K, regardless of caller-provided perFacetLimit. Defense in depth above the contract 1..50 boundary.",
      schema: configSchemaType.number,
      defaultValue: 20,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.universalSearch,
    },
    {
      key: universalSearchConfigKey.cacheMaxSize,
      description:
        "Bound on the in-memory universal-search result cache; insertion-order eviction enforces backend instructions security invariant #5.",
      schema: configSchemaType.number,
      defaultValue: 256,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.universalSearch,
    },
    {
      key: universalSearchConfigKey.cacheTtlSeconds,
      description:
        "Bound on cached universal-search result freshness (seconds). Stale entries trigger a live re-search against the per-facet Meilisearch indexes.",
      schema: configSchemaType.number,
      defaultValue: 30,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.universalSearch,
    },
    {
      key: universalSearchConfigKey.indexFreshnessThresholdSeconds,
      description:
        "Threshold the platform service uses to flip indexFreshness.isFresh on the result envelope so the omnibar can warn operators when results are computed against a stale index.",
      schema: configSchemaType.number,
      defaultValue: 600,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.universalSearch,
    },
  ],
  featureFlags: [
    {
      key: universalSearchFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.universalSearch,
      purpose:
        "Gate the operator-only universal omnibar search surface end-to-end.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Promote to default once every facet has a live per-facet Meilisearch index and the admin omnibar consumes the surface end-to-end with audit-trail evidence.",
    },
    {
      key: universalSearchFeatureFlag.reindexEnabled,
      description:
        "Operator-only reindex action availability. Gate on so the per-facet Meilisearch reindex can be held off in production until the per-facet swap is documented.",
      owner: platformModuleId.universalSearch,
      purpose:
        "Allow platform-operator-initiated reindex of the per-facet universal-search Meilisearch indexes.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [universalSearchFeatureFlag.enabled],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Promote to default once the per-facet Meilisearch reindex orchestration is hardened with rate-budget + lock evidence.",
    },
  ],
  permissionScopes: [permissionScope.universalSearchRead],
  fieldClassifications: universalSearchFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(universalSearchFields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        universalSearchFields.label,
        universalSearchFields.subtitle,
        universalSearchFields.permalink,
      ],
      auditedFields: [],
    },
  ]),
});
