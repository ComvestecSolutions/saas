/**
 * Capability snapshot v2 module manifest (admin-app implementation
 * plan §9 item 13). The platform service composes
 * `AdminOrganizationService` (for the admin-org role join),
 * `AuditLogModule` (for snapshot-derive + cache-invalidation
 * events), and an injected `FieldSecurityPort` (Context.Tag) above
 * the bounded result cache. Two config keys back the cache, one
 * implicit `enabled` feature flag gates module visibility.
 *
 *   - `cache.maxSize` (default 256) bounds the in-memory
 *     per-actor snapshot cache via insertion-order eviction
 *     (backend instructions security invariant #5).
 *   - `cache.ttlSeconds` (default 30) bounds cached snapshot
 *     freshness; stale entries trigger a live re-derivation
 *     including a fresh `AdminOrganizationService` lookup.
 *
 * Fields:
 *
 *   - `actorId`, `actorType`, `adminOrgRole`, `derivedAt`,
 *     `correlationId` are `internal` — the Operator Desk
 *     consumes them on every page render but they are not
 *     tenant-confidential.
 *   - `navigationMap` and `highRiskAffordances` are `internal`;
 *     they reflect already-decided platform capability, not the
 *     tenant data behind them.
 *   - `permissions` and `scopes` are `internal`; they describe
 *     the actor's surface area only.
 *
 * One projection profile (`summary`): the shell-side render
 * shape that omits raw `permissions` / `scopes` so the operator
 * console renders directly off the derived `navigationMap` +
 * `highRiskAffordances`. The platform service ALWAYS calls the
 * injected `FieldSecurityPort` over navigation-map labels before
 * the envelope leaves the boundary so any tenant-id-bearing
 * label can be redacted for support actors with a regulated
 * scope.
 */
import {
  capabilitySnapshotV2ConfigKey,
  capabilitySnapshotV2FeatureFlag,
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
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const capabilitySnapshotV2Fields = defineModuleFields({
  actorId: "actorId",
  actorType: "actorType",
  scopes: "scopes",
  permissions: "permissions",
  adminOrgRole: "adminOrgRole",
  navigationMap: "navigationMap",
  highRiskAffordances: "highRiskAffordances",
  derivedAt: "derivedAt",
  correlationId: "correlationId",
});

export const capabilitySnapshotV2FieldClassifications =
  defineDataClassificationDeclarations(capabilitySnapshotV2Fields, [
    {
      field: capabilitySnapshotV2Fields.actorId,
      classification: dataClassification.internal,
    },
    {
      field: capabilitySnapshotV2Fields.actorType,
      classification: dataClassification.internal,
    },
    {
      field: capabilitySnapshotV2Fields.scopes,
      classification: dataClassification.internal,
    },
    {
      field: capabilitySnapshotV2Fields.permissions,
      classification: dataClassification.internal,
    },
    {
      field: capabilitySnapshotV2Fields.adminOrgRole,
      classification: dataClassification.internal,
    },
    {
      field: capabilitySnapshotV2Fields.navigationMap,
      classification: dataClassification.internal,
    },
    {
      field: capabilitySnapshotV2Fields.highRiskAffordances,
      classification: dataClassification.internal,
    },
    {
      field: capabilitySnapshotV2Fields.derivedAt,
      classification: dataClassification.internal,
    },
    {
      field: capabilitySnapshotV2Fields.correlationId,
      classification: dataClassification.internal,
    },
  ]);

export const capabilitySnapshotV2Manifest = defineModuleManifest({
  moduleId: platformModuleId.capabilitySnapshotV2,
  configKeys: [
    {
      key: capabilitySnapshotV2ConfigKey.cacheMaxSize,
      description:
        "Bound on the in-memory per-actor capability-snapshot cache. Insertion-order eviction enforces backend instructions security invariant #5.",
      schema: configSchemaType.number,
      defaultValue: 256,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.capabilitySnapshotV2,
    },
    {
      key: capabilitySnapshotV2ConfigKey.cacheTtlSeconds,
      description:
        "Bound on cached capability-snapshot freshness (seconds). Stale entries trigger a live re-derivation including a fresh AdminOrganizationService role lookup.",
      schema: configSchemaType.number,
      defaultValue: 30,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.capabilitySnapshotV2,
    },
  ],
  featureFlags: [
    {
      key: capabilitySnapshotV2FeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.capabilitySnapshotV2,
      purpose:
        "Gate the operator-only capability snapshot v2 surface that the Operator Desk shell consumes for navigation-map + high-risk-affordance derivation.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Promote to default once Operator Desk surfaces consume the snapshot end-to-end and the per-key navigation matrix has lived in production behind audit-trail evidence for one release window.",
    },
  ],
  permissionScopes: [permissionScope.capabilitySnapshotV2Read],
  fieldClassifications: capabilitySnapshotV2FieldClassifications,
  projectionProfiles: defineProjectionDescriptors(capabilitySnapshotV2Fields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        capabilitySnapshotV2Fields.actorId,
        capabilitySnapshotV2Fields.actorType,
        capabilitySnapshotV2Fields.adminOrgRole,
        capabilitySnapshotV2Fields.navigationMap,
        capabilitySnapshotV2Fields.highRiskAffordances,
        capabilitySnapshotV2Fields.derivedAt,
        capabilitySnapshotV2Fields.correlationId,
      ],
      auditedFields: [],
    },
  ]),
});
