import {
  adminOrganizationConfigKey,
  adminOrganizationFeatureFlag,
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

export const adminOrganizationFields = defineModuleFields({
  id: "id",
  email: "email",
  displayName: "displayName",
  role: "role",
  status: "status",
  invitedAt: "invitedAt",
  acceptedAt: "acceptedAt",
  lastActiveAt: "lastActiveAt",
  createdBy: "createdBy",
  updatedAt: "updatedAt",
  archivedAt: "archivedAt",
  invitationId: "invitation.invitationId",
  invitationEmail: "invitation.email",
  invitationRole: "invitation.invitedRole",
  invitationStatus: "invitation.status",
  invitationIssuedAt: "invitation.issuedAt",
  invitationExpiresAt: "invitation.expiresAt",
});

export const adminOrganizationFieldClassifications =
  defineDataClassificationDeclarations(adminOrganizationFields, [
    {
      field: adminOrganizationFields.id,
      classification: dataClassification.internal,
    },
    {
      field: adminOrganizationFields.email,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: adminOrganizationFields.displayName,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: adminOrganizationFields.role,
      classification: dataClassification.internal,
    },
    {
      field: adminOrganizationFields.status,
      classification: dataClassification.internal,
    },
    {
      field: adminOrganizationFields.invitedAt,
      classification: dataClassification.internal,
    },
    {
      field: adminOrganizationFields.acceptedAt,
      classification: dataClassification.internal,
    },
    {
      field: adminOrganizationFields.lastActiveAt,
      classification: dataClassification.internal,
    },
    {
      field: adminOrganizationFields.createdBy,
      classification: dataClassification.internal,
    },
    {
      field: adminOrganizationFields.updatedAt,
      classification: dataClassification.internal,
    },
    {
      field: adminOrganizationFields.archivedAt,
      classification: dataClassification.internal,
    },
    {
      field: adminOrganizationFields.invitationId,
      classification: dataClassification.internal,
    },
    {
      field: adminOrganizationFields.invitationEmail,
      classification: dataClassification.regulatedSensitive,
    },
    {
      field: adminOrganizationFields.invitationRole,
      classification: dataClassification.internal,
    },
    {
      field: adminOrganizationFields.invitationStatus,
      classification: dataClassification.internal,
    },
    {
      field: adminOrganizationFields.invitationIssuedAt,
      classification: dataClassification.internal,
    },
    {
      field: adminOrganizationFields.invitationExpiresAt,
      classification: dataClassification.internal,
    },
  ]);

export const adminOrganizationManifest = defineModuleManifest({
  moduleId: platformModuleId.adminOrganization,
  configKeys: [
    {
      key: adminOrganizationConfigKey.invitationExpiryHours,
      description: "Hours before an admin-organization invitation expires.",
      schema: configSchemaType.number,
      defaultValue: 72,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.adminOrganization,
    },
    {
      key: adminOrganizationConfigKey.invitationTtlMinutes,
      description:
        "Minutes before an admin-organization invitation expires. Authoritative TTL consumed by the platform service; the operator environment supplies the value at runtime (ADMIN_ORGANIZATION_INVITATION_TTL_MINUTES) with no in-service fallback.",
      schema: configSchemaType.number,
      defaultValue: 72 * 60,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.adminOrganization,
    },
    {
      key: adminOrganizationConfigKey.minimumOwnerCount,
      description:
        "Minimum number of admin-owner members that must always exist. Role-change and removal that would violate this invariant are rejected.",
      schema: configSchemaType.number,
      defaultValue: 1,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.adminOrganization,
    },
  ],
  featureFlags: [
    {
      key: adminOrganizationFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.adminOrganization,
      purpose: "Gate the admin-organization module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan: "None — core admin governance module.",
    },
    {
      key: adminOrganizationFeatureFlag.selfServiceInvitations,
      description:
        "Allow admin-owner / admin-admin members to issue invitations from the admin app without operator escalation.",
      owner: platformModuleId.adminOrganization,
      purpose:
        "Eliminate shell-script staffing once the first admin-owner is seeded.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [adminOrganizationFeatureFlag.enabled],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan: "None — primary invitation path.",
    },
  ],
  permissionScopes: [
    permissionScope.adminOrganizationRead,
    permissionScope.adminOrganizationInvite,
    permissionScope.adminOrganizationManageMembers,
    permissionScope.adminOrganizationChangeRole,
    permissionScope.adminOrganizationRemoveMember,
  ],
  fieldClassifications: adminOrganizationFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(adminOrganizationFields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        adminOrganizationFields.id,
        adminOrganizationFields.role,
        adminOrganizationFields.status,
      ],
      auditedFields: [],
    },
    {
      profile: projectionProfile.admin,
      visibleFields: [
        adminOrganizationFields.id,
        adminOrganizationFields.email,
        adminOrganizationFields.displayName,
        adminOrganizationFields.role,
        adminOrganizationFields.status,
        adminOrganizationFields.invitedAt,
        adminOrganizationFields.acceptedAt,
        adminOrganizationFields.lastActiveAt,
        adminOrganizationFields.createdBy,
        adminOrganizationFields.updatedAt,
        adminOrganizationFields.archivedAt,
        adminOrganizationFields.invitationId,
        adminOrganizationFields.invitationEmail,
        adminOrganizationFields.invitationRole,
        adminOrganizationFields.invitationStatus,
        adminOrganizationFields.invitationIssuedAt,
        adminOrganizationFields.invitationExpiresAt,
      ],
      auditedFields: [
        adminOrganizationFields.email,
        adminOrganizationFields.displayName,
        adminOrganizationFields.invitationEmail,
      ],
    },
    {
      profile: projectionProfile.supportSafe,
      visibleFields: [
        adminOrganizationFields.id,
        adminOrganizationFields.role,
        adminOrganizationFields.status,
        adminOrganizationFields.invitedAt,
        adminOrganizationFields.acceptedAt,
        adminOrganizationFields.lastActiveAt,
        adminOrganizationFields.invitationId,
        adminOrganizationFields.invitationRole,
        adminOrganizationFields.invitationStatus,
        adminOrganizationFields.invitationIssuedAt,
        adminOrganizationFields.invitationExpiresAt,
      ],
      auditedFields: [],
    },
  ]),
});
