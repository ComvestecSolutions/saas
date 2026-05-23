/**
 * Keycloak user read module manifest (admin-app implementation
 * plan §9 item 10 — per-vendor read helpers, batch A vendor #1).
 *
 * Three platform-scope config keys back the owner-locked
 * invariants the platform service enforces above the upstream
 * Keycloak admin API:
 *
 *   - `cacheMaxSize` (default 256) bounds the in-memory
 *     per-`(tenant, kind, key)` user-summary cache; oldest-eviction
 *     is enforced (backend instructions security invariant #5).
 *   - `snapshotCacheTtlSeconds` (default 60) bounds freshness for
 *     cached summaries; stale entries trigger a live re-fetch
 *     against the Keycloak admin API.
 *   - `defaultListLimit` (default 25) caps `listByEmail` /
 *     `listByUsername` result sizes when the caller omits an
 *     explicit limit.
 *
 * Field classifications mirror the spec in admin-app implementation
 * plan §9 item 10:
 *
 *   - `email`, `firstName`, `lastName` → `tenant-confidential`.
 *   - `userId`, `username`, `realm`, `enabled`, `emailVerified`,
 *     `createdAt`, `requiredActions` → `internal`.
 *   - `lastLogin` → `derived-analytics` (a usage signal derived
 *     from upstream session events, not part of the raw record).
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
  keycloakUserReadConfigKey,
  keycloakUserReadFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const keycloakUserReadFields = defineModuleFields({
  userId: "userId",
  username: "username",
  email: "email",
  firstName: "firstName",
  lastName: "lastName",
  enabled: "enabled",
  emailVerified: "emailVerified",
  createdAt: "createdAt",
  lastLogin: "lastLogin",
  requiredActions: "requiredActions",
  realm: "realm",
});

export const keycloakUserReadFieldClassifications =
  defineDataClassificationDeclarations(keycloakUserReadFields, [
    {
      field: keycloakUserReadFields.userId,
      classification: dataClassification.internal,
    },
    {
      field: keycloakUserReadFields.username,
      classification: dataClassification.internal,
    },
    {
      field: keycloakUserReadFields.email,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: keycloakUserReadFields.firstName,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: keycloakUserReadFields.lastName,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: keycloakUserReadFields.enabled,
      classification: dataClassification.internal,
    },
    {
      field: keycloakUserReadFields.emailVerified,
      classification: dataClassification.internal,
    },
    {
      field: keycloakUserReadFields.createdAt,
      classification: dataClassification.internal,
    },
    {
      field: keycloakUserReadFields.lastLogin,
      classification: dataClassification.derivedAnalytics,
    },
    {
      field: keycloakUserReadFields.requiredActions,
      classification: dataClassification.internal,
    },
    {
      field: keycloakUserReadFields.realm,
      classification: dataClassification.internal,
    },
  ]);

export const keycloakUserReadManifest = defineModuleManifest({
  moduleId: platformModuleId.keycloakUserRead,
  configKeys: [
    {
      key: keycloakUserReadConfigKey.cacheMaxSize,
      description:
        "Bound on the in-memory per-(tenant, kind, key) Keycloak user-summary cache used by the read path. Enforces oldest-eviction (security invariant #5).",
      schema: configSchemaType.number,
      defaultValue: 256,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.keycloakUserRead,
    },
    {
      key: keycloakUserReadConfigKey.snapshotCacheTtlSeconds,
      description:
        "Bound on cached Keycloak user-summary freshness (seconds). Stale entries trigger a live re-fetch against the Keycloak admin API.",
      schema: configSchemaType.number,
      defaultValue: 60,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.keycloakUserRead,
    },
    {
      key: keycloakUserReadConfigKey.defaultListLimit,
      description:
        "Default cap on listByEmail / listByUsername result sizes when the caller omits an explicit limit.",
      schema: configSchemaType.number,
      defaultValue: 25,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.keycloakUserRead,
    },
  ],
  featureFlags: [
    {
      key: keycloakUserReadFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.keycloakUserRead,
      purpose:
        "Gate the read-only Keycloak user-read operator console surface.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Promote to default once the admin console renders the surface end-to-end against live Keycloak credentials with audit-trail evidence.",
    },
  ],
  permissionScopes: [permissionScope.keycloakUserRead],
  fieldClassifications: keycloakUserReadFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(keycloakUserReadFields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        keycloakUserReadFields.userId,
        keycloakUserReadFields.username,
        keycloakUserReadFields.enabled,
        keycloakUserReadFields.emailVerified,
        keycloakUserReadFields.createdAt,
        keycloakUserReadFields.realm,
      ],
      auditedFields: [],
    },
    {
      profile: projectionProfile.supportSafe,
      visibleFields: [
        keycloakUserReadFields.userId,
        keycloakUserReadFields.username,
        keycloakUserReadFields.email,
        keycloakUserReadFields.firstName,
        keycloakUserReadFields.lastName,
        keycloakUserReadFields.enabled,
        keycloakUserReadFields.emailVerified,
        keycloakUserReadFields.createdAt,
        keycloakUserReadFields.lastLogin,
        keycloakUserReadFields.requiredActions,
        keycloakUserReadFields.realm,
      ],
      auditedFields: [
        keycloakUserReadFields.email,
        keycloakUserReadFields.firstName,
        keycloakUserReadFields.lastName,
      ],
    },
  ]),
});
