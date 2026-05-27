/**
 * Keycloak role read module manifest (admin-app implementation plan
 * §9 item 10 — per-vendor read helpers).
 *
 * The slice exposes a read-only Keycloak realm-role detail surface
 * for operator troubleshooting. It carries no persistence and is
 * fronted by a bounded in-memory cache keyed by `(tenant, roleId)`.
 */
import {
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  featureFlagLifecycle,
  keycloakRoleReadConfigKey,
  keycloakRoleReadFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const keycloakRoleReadFields = defineModuleFields({
  roleId: "roleId",
  roleName: "roleName",
  description: "description",
  composite: "composite",
  clientRole: "clientRole",
  realm: "realm",
  compositeRoleId: "compositeRoles.roleId",
  compositeRoleName: "compositeRoles.roleName",
  compositeRoleDescription: "compositeRoles.description",
  compositeRoleComposite: "compositeRoles.composite",
  compositeRoleClientRole: "compositeRoles.clientRole",
  memberUserId: "members.userId",
  memberUsername: "members.username",
  memberEmail: "members.email",
  memberEnabled: "members.enabled",
});

export const keycloakRoleReadFieldClassifications =
  defineDataClassificationDeclarations(keycloakRoleReadFields, [
    {
      field: keycloakRoleReadFields.roleId,
      classification: dataClassification.internal,
    },
    {
      field: keycloakRoleReadFields.roleName,
      classification: dataClassification.internal,
    },
    {
      field: keycloakRoleReadFields.description,
      classification: dataClassification.internal,
    },
    {
      field: keycloakRoleReadFields.composite,
      classification: dataClassification.internal,
    },
    {
      field: keycloakRoleReadFields.clientRole,
      classification: dataClassification.internal,
    },
    {
      field: keycloakRoleReadFields.realm,
      classification: dataClassification.internal,
    },
    {
      field: keycloakRoleReadFields.compositeRoleId,
      classification: dataClassification.internal,
    },
    {
      field: keycloakRoleReadFields.compositeRoleName,
      classification: dataClassification.internal,
    },
    {
      field: keycloakRoleReadFields.compositeRoleDescription,
      classification: dataClassification.internal,
    },
    {
      field: keycloakRoleReadFields.compositeRoleComposite,
      classification: dataClassification.internal,
    },
    {
      field: keycloakRoleReadFields.compositeRoleClientRole,
      classification: dataClassification.internal,
    },
    {
      field: keycloakRoleReadFields.memberUserId,
      classification: dataClassification.internal,
    },
    {
      field: keycloakRoleReadFields.memberUsername,
      classification: dataClassification.internal,
    },
    {
      field: keycloakRoleReadFields.memberEmail,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: keycloakRoleReadFields.memberEnabled,
      classification: dataClassification.internal,
    },
  ]);

export const keycloakRoleReadManifest = defineModuleManifest({
  moduleId: platformModuleId.keycloakRoleRead,
  configKeys: [
    {
      key: keycloakRoleReadConfigKey.cacheMaxSize,
      description:
        "Bound on the in-memory per-(tenant, roleId) Keycloak role-detail cache used by the read path. Enforces oldest-eviction.",
      schema: configSchemaType.number,
      defaultValue: 256,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.keycloakRoleRead,
    },
    {
      key: keycloakRoleReadConfigKey.snapshotCacheTtlSeconds,
      description:
        "Bound on cached Keycloak role-detail freshness (seconds). Stale entries trigger a live re-fetch against the Keycloak admin API.",
      schema: configSchemaType.number,
      defaultValue: 60,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.keycloakRoleRead,
    },
  ],
  featureFlags: [
    {
      key: keycloakRoleReadFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.keycloakRoleRead,
      purpose:
        "Gate the read-only Keycloak role-read operator console surface.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Promote to default once the admin console consumes the live backend slice end to end.",
    },
  ],
  permissionScopes: [permissionScope.keycloakRoleRead],
  fieldClassifications: keycloakRoleReadFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(keycloakRoleReadFields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        keycloakRoleReadFields.roleId,
        keycloakRoleReadFields.roleName,
        keycloakRoleReadFields.description,
        keycloakRoleReadFields.composite,
        keycloakRoleReadFields.clientRole,
        keycloakRoleReadFields.realm,
      ],
      auditedFields: [],
    },
    {
      profile: projectionProfile.supportSafe,
      visibleFields: [
        keycloakRoleReadFields.roleId,
        keycloakRoleReadFields.roleName,
        keycloakRoleReadFields.description,
        keycloakRoleReadFields.composite,
        keycloakRoleReadFields.clientRole,
        keycloakRoleReadFields.realm,
        keycloakRoleReadFields.compositeRoleId,
        keycloakRoleReadFields.compositeRoleName,
        keycloakRoleReadFields.compositeRoleDescription,
        keycloakRoleReadFields.compositeRoleComposite,
        keycloakRoleReadFields.compositeRoleClientRole,
        keycloakRoleReadFields.memberUserId,
        keycloakRoleReadFields.memberUsername,
        keycloakRoleReadFields.memberEmail,
        keycloakRoleReadFields.memberEnabled,
      ],
      auditedFields: [keycloakRoleReadFields.memberEmail],
    },
  ]),
});
