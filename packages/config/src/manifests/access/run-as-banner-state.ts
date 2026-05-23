/**
 * Run-as / acting-as banner state module manifest (admin-app
 * implementation plan §9 item 14). The platform service composes
 * the existing manual-break-glass repository to derive the banner
 * envelope for the current actor and emits one audit event per
 * `queried` / `released` call. Two config keys back the short-TTL
 * cache; one implicit `enabled` feature flag gates module
 * visibility.
 *
 *   - `cache.maxSize` (default 256) bounds the in-memory per-actor
 *     banner cache via insertion-order eviction (backend
 *     instructions security invariant #5).
 *   - `cache.ttlSeconds` (default 5) bounds cached banner
 *     freshness; the banner is rendered on every Operator Desk
 *     page so a short TTL keeps the displayed `secondsRemaining`
 *     in sync with the underlying grant's `expiresAt`.
 *
 * Fields:
 *
 *   - `active`, `releasable`, `actingAsActorId`, `actingAsActorType`,
 *     `grantId`, `reasonId`, `grantedAt`, `expiresAt`,
 *     `secondsRemaining` are `internal` — the banner reflects
 *     already-decided platform capability state, not tenant data.
 *   - `reasonText` and `reasonAttachmentText` are
 *     `regulated-sensitive` because operators may capture
 *     incident-ticket urls / customer references in the
 *     attachment text. Field-security rules already restrict
 *     `regulated-sensitive` to `platform-operator` /
 *     `support-operator`.
 *
 * One projection profile (`summary`): the shell renders the
 * banner directly off `active`, `releasable`, `actingAsActorId`,
 * `actingAsActorType`, `grantId`, `grantedAt`, `expiresAt`, and
 * `secondsRemaining`. The reason text + attachment are intentionally
 * omitted from the projection so the banner-render path stays free
 * of regulated-sensitive labels.
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
  runAsBannerStateConfigKey,
  runAsBannerStateFeatureFlag,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const runAsBannerStateFields = defineModuleFields({
  active: "active",
  grantId: "grantId",
  actingAsActorId: "actingAsActorId",
  actingAsActorType: "actingAsActorType",
  reasonId: "reasonId",
  reasonText: "reasonText",
  reasonAttachmentText: "reasonAttachmentText",
  grantedAt: "grantedAt",
  expiresAt: "expiresAt",
  secondsRemaining: "secondsRemaining",
  releasable: "releasable",
});

export const runAsBannerStateFieldClassifications =
  defineDataClassificationDeclarations(runAsBannerStateFields, [
    {
      field: runAsBannerStateFields.active,
      classification: dataClassification.internal,
    },
    {
      field: runAsBannerStateFields.grantId,
      classification: dataClassification.internal,
    },
    {
      field: runAsBannerStateFields.actingAsActorId,
      classification: dataClassification.internal,
    },
    {
      field: runAsBannerStateFields.actingAsActorType,
      classification: dataClassification.internal,
    },
    {
      field: runAsBannerStateFields.reasonId,
      classification: dataClassification.internal,
    },
    {
      field: runAsBannerStateFields.reasonText,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: runAsBannerStateFields.reasonAttachmentText,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: runAsBannerStateFields.grantedAt,
      classification: dataClassification.internal,
    },
    {
      field: runAsBannerStateFields.expiresAt,
      classification: dataClassification.internal,
    },
    {
      field: runAsBannerStateFields.secondsRemaining,
      classification: dataClassification.internal,
    },
    {
      field: runAsBannerStateFields.releasable,
      classification: dataClassification.internal,
    },
  ]);

export const runAsBannerStateManifest = defineModuleManifest({
  moduleId: platformModuleId.runAsBannerState,
  configKeys: [
    {
      key: runAsBannerStateConfigKey.cacheMaxSize,
      description:
        "Bound on the in-memory per-actor run-as banner state cache. Insertion-order eviction enforces backend instructions security invariant #5.",
      schema: configSchemaType.number,
      defaultValue: 256,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.runAsBannerState,
    },
    {
      key: runAsBannerStateConfigKey.cacheTtlSeconds,
      description:
        "Bound on cached run-as banner state freshness (seconds). Short TTL keeps the displayed secondsRemaining in sync with the underlying grant's expiresAt.",
      schema: configSchemaType.number,
      defaultValue: 5,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.runAsBannerState,
    },
  ],
  featureFlags: [
    {
      key: runAsBannerStateFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.runAsBannerState,
      purpose:
        "Gate the Operator Desk run-as / acting-as banner state surface that derives the current actor's active break-glass grant and renders the one-click release affordance.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Promote to default once the Operator Desk shell consumes the banner end-to-end and the release flow has lived in production behind audit-trail evidence for one release window.",
    },
  ],
  permissionScopes: [permissionScope.runAsBannerStateRead],
  fieldClassifications: runAsBannerStateFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(runAsBannerStateFields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        runAsBannerStateFields.active,
        runAsBannerStateFields.releasable,
        runAsBannerStateFields.grantId,
        runAsBannerStateFields.actingAsActorId,
        runAsBannerStateFields.actingAsActorType,
        runAsBannerStateFields.reasonId,
        runAsBannerStateFields.grantedAt,
        runAsBannerStateFields.expiresAt,
        runAsBannerStateFields.secondsRemaining,
      ],
      auditedFields: [],
    },
  ]),
});
