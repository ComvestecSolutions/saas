/**
 * Manual break-glass module manifest (admin-app implementation
 * plan §9 item 5 + `specs/02-apps/admin-app/spec.md` Break-glass +
 * RunAsBanner).
 *
 * - `maxTtlMinutes` and `maxActiveGrantsPerSupportOperator` are the
 *   two boundary-decoded operator-config knobs the service enforces
 *   on every issue call (typed errors `BreakGlassTtlExceeded` and
 *   `BreakGlassActiveLimitExceeded`). `cacheMaxSize` bounds the
 *   in-memory current-grant cache that powers `RunAsBanner`
 *   lookups; oldest-eviction is enforced and tested explicitly
 *   (backend instructions security invariant #5).
 * - The `enabled` feature flag is the module visibility gate.
 * - `reasonNarrative` is operator-supplied free text and is
 *   classified `regulated-sensitive` so field-security redacts it
 *   for non-platform/support operator projections. All other fields
 *   are `internal`.
 * - Two projection profiles are published: `summary` for the desk
 *   `RunAsBanner` (id, status, expiresAt, targetTenant only) and
 *   `admin` for the full record including reason narrative.
 */
import {
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  featureFlagLifecycle,
  manualBreakGlassConfigKey,
  manualBreakGlassFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const manualBreakGlassFields = defineModuleFields({
  id: "id",
  grantedTo: "grantedTo",
  grantedBy: "grantedBy",
  targetTenant: "targetTenant",
  reasonCatalogId: "reasonCatalogId",
  reasonNarrative: "reasonNarrative",
  issuedAt: "issuedAt",
  expiresAt: "expiresAt",
  status: "status",
  releasedAt: "releasedAt",
  releasedBy: "releasedBy",
  releaseReasonCatalogId: "releaseReasonCatalogId",
  correlationId: "correlationId",
});

export const manualBreakGlassFieldClassifications =
  defineDataClassificationDeclarations(manualBreakGlassFields, [
    {
      field: manualBreakGlassFields.id,
      classification: dataClassification.internal,
    },
    {
      field: manualBreakGlassFields.grantedTo,
      classification: dataClassification.internal,
    },
    {
      field: manualBreakGlassFields.grantedBy,
      classification: dataClassification.internal,
    },
    {
      field: manualBreakGlassFields.targetTenant,
      classification: dataClassification.internal,
    },
    {
      field: manualBreakGlassFields.reasonCatalogId,
      classification: dataClassification.internal,
    },
    {
      field: manualBreakGlassFields.reasonNarrative,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: manualBreakGlassFields.issuedAt,
      classification: dataClassification.internal,
    },
    {
      field: manualBreakGlassFields.expiresAt,
      classification: dataClassification.internal,
    },
    {
      field: manualBreakGlassFields.status,
      classification: dataClassification.internal,
    },
    {
      field: manualBreakGlassFields.releasedAt,
      classification: dataClassification.internal,
    },
    {
      field: manualBreakGlassFields.releasedBy,
      classification: dataClassification.internal,
    },
    {
      field: manualBreakGlassFields.releaseReasonCatalogId,
      classification: dataClassification.internal,
    },
    {
      field: manualBreakGlassFields.correlationId,
      classification: dataClassification.internal,
    },
  ]);

export const manualBreakGlassManifest = defineModuleManifest({
  moduleId: platformModuleId.manualBreakGlass,
  configKeys: [
    {
      key: manualBreakGlassConfigKey.maxTtlMinutes,
      description:
        "Maximum allowed lifetime in minutes for a single manual break-glass grant. Operator-supplied expiresAt values exceeding this ceiling are rejected with BreakGlassTtlExceeded.",
      schema: configSchemaType.number,
      defaultValue: 60,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.manualBreakGlass,
    },
    {
      key: manualBreakGlassConfigKey.maxActiveGrantsPerSupportOperator,
      description:
        "Soft cap on how many simultaneously-active grants a single support operator may hold. Issue calls exceeding this cap are rejected with BreakGlassActiveLimitExceeded.",
      schema: configSchemaType.number,
      defaultValue: 3,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.manualBreakGlass,
    },
    {
      key: manualBreakGlassConfigKey.cacheMaxSize,
      description:
        "Bound on the in-memory cache that backs currentBreakGlassContextForActor lookups. Enforces oldest-eviction (security invariant #5).",
      schema: configSchemaType.number,
      defaultValue: 256,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.manualBreakGlass,
    },
  ],
  featureFlags: [
    {
      key: manualBreakGlassFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.manualBreakGlass,
      purpose: "Gate the manual-break-glass grant/release surface.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "None — core RunAsBanner + operator desk capability, retained while support-operator workflows exist.",
    },
  ],
  permissionScopes: [
    permissionScope.manualBreakGlassIssue,
    permissionScope.manualBreakGlassRelease,
    permissionScope.manualBreakGlassRead,
  ],
  fieldClassifications: manualBreakGlassFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(manualBreakGlassFields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        manualBreakGlassFields.id,
        manualBreakGlassFields.status,
        manualBreakGlassFields.expiresAt,
        manualBreakGlassFields.targetTenant,
      ],
      auditedFields: [],
    },
    {
      profile: projectionProfile.admin,
      visibleFields: [
        manualBreakGlassFields.id,
        manualBreakGlassFields.grantedTo,
        manualBreakGlassFields.grantedBy,
        manualBreakGlassFields.targetTenant,
        manualBreakGlassFields.reasonCatalogId,
        manualBreakGlassFields.reasonNarrative,
        manualBreakGlassFields.issuedAt,
        manualBreakGlassFields.expiresAt,
        manualBreakGlassFields.status,
        manualBreakGlassFields.releasedAt,
        manualBreakGlassFields.releasedBy,
        manualBreakGlassFields.releaseReasonCatalogId,
        manualBreakGlassFields.correlationId,
      ],
      auditedFields: [manualBreakGlassFields.reasonNarrative],
    },
  ]),
});
