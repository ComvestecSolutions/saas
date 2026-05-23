import {
  adminWorkspacesConfigKey,
  adminWorkspacesFeatureFlag,
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

export const adminWorkspacesFields = defineModuleFields({
  id: "id",
  ownerSubjectId: "ownerSubjectId",
  name: "name",
  serializedLayout: "serializedLayout",
  position: "position",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
});

export const adminWorkspacesFieldClassifications =
  defineDataClassificationDeclarations(adminWorkspacesFields, [
    {
      field: adminWorkspacesFields.id,
      classification: dataClassification.internal,
    },
    {
      field: adminWorkspacesFields.ownerSubjectId,
      classification: dataClassification.internal,
    },
    {
      field: adminWorkspacesFields.name,
      classification: dataClassification.internal,
    },
    {
      field: adminWorkspacesFields.serializedLayout,
      classification: dataClassification.internal,
    },
    {
      field: adminWorkspacesFields.position,
      classification: dataClassification.internal,
    },
    {
      field: adminWorkspacesFields.createdAt,
      classification: dataClassification.internal,
    },
    {
      field: adminWorkspacesFields.updatedAt,
      classification: dataClassification.internal,
    },
  ]);

export const adminWorkspacesManifest = defineModuleManifest({
  moduleId: platformModuleId.adminWorkspaces,
  configKeys: [
    {
      key: adminWorkspacesConfigKey.maxWorkspacesPerUser,
      description:
        "Soft cap on the number of workspaces a single operator may persist. Surfaced to the admin app so the UI can warn before hitting the cap.",
      schema: configSchemaType.number,
      defaultValue: 20,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.adminWorkspaces,
    },
  ],
  featureFlags: [
    {
      key: adminWorkspacesFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.adminWorkspaces,
      purpose: "Gate the admin-workspaces module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "None — core operator-desk capability tied to per-user workspace tabs.",
    },
  ],
  permissionScopes: [
    permissionScope.adminWorkspacesRead,
    permissionScope.adminWorkspacesWrite,
    permissionScope.adminWorkspacesDelete,
    permissionScope.adminWorkspacesReorder,
  ],
  fieldClassifications: adminWorkspacesFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(adminWorkspacesFields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        adminWorkspacesFields.id,
        adminWorkspacesFields.name,
        adminWorkspacesFields.position,
        adminWorkspacesFields.updatedAt,
      ],
      auditedFields: [],
    },
    {
      profile: projectionProfile.admin,
      visibleFields: [
        adminWorkspacesFields.id,
        adminWorkspacesFields.ownerSubjectId,
        adminWorkspacesFields.name,
        adminWorkspacesFields.serializedLayout,
        adminWorkspacesFields.position,
        adminWorkspacesFields.createdAt,
        adminWorkspacesFields.updatedAt,
      ],
      auditedFields: [],
    },
  ]),
});
