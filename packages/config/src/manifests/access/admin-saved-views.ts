import {
  adminSavedViewsConfigKey,
  adminSavedViewsFeatureFlag,
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

export const adminSavedViewsFields = defineModuleFields({
  id: "id",
  ownerSubjectId: "ownerSubjectId",
  name: "name",
  resourceKind: "resourceKind",
  serializedView: "serializedView",
  pinned: "pinned",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
  lastUsedAt: "lastUsedAt",
});

export const adminSavedViewsFieldClassifications =
  defineDataClassificationDeclarations(adminSavedViewsFields, [
    {
      field: adminSavedViewsFields.id,
      classification: dataClassification.internal,
    },
    {
      field: adminSavedViewsFields.ownerSubjectId,
      classification: dataClassification.internal,
    },
    {
      field: adminSavedViewsFields.name,
      classification: dataClassification.internal,
    },
    {
      field: adminSavedViewsFields.resourceKind,
      classification: dataClassification.internal,
    },
    {
      field: adminSavedViewsFields.serializedView,
      classification: dataClassification.internal,
    },
    {
      field: adminSavedViewsFields.pinned,
      classification: dataClassification.internal,
    },
    {
      field: adminSavedViewsFields.createdAt,
      classification: dataClassification.internal,
    },
    {
      field: adminSavedViewsFields.updatedAt,
      classification: dataClassification.internal,
    },
    {
      field: adminSavedViewsFields.lastUsedAt,
      classification: dataClassification.internal,
    },
  ]);

export const adminSavedViewsManifest = defineModuleManifest({
  moduleId: platformModuleId.adminSavedViews,
  configKeys: [
    {
      key: adminSavedViewsConfigKey.maxViewsPerUser,
      description:
        "Soft cap on the number of saved views a single operator may persist. Surfaced to the admin app so the UI can warn before hitting the cap.",
      schema: configSchemaType.number,
      defaultValue: 100,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.adminSavedViews,
    },
  ],
  featureFlags: [
    {
      key: adminSavedViewsFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.adminSavedViews,
      purpose: "Gate the admin-saved-views module.",
      defaultEnabled: true,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "None — core operator-desk capability tied to per-user list bookmarks.",
    },
  ],
  permissionScopes: [
    permissionScope.adminSavedViewsRead,
    permissionScope.adminSavedViewsWrite,
    permissionScope.adminSavedViewsDelete,
  ],
  fieldClassifications: adminSavedViewsFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(adminSavedViewsFields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        adminSavedViewsFields.id,
        adminSavedViewsFields.name,
        adminSavedViewsFields.updatedAt,
      ],
      auditedFields: [],
    },
    {
      profile: projectionProfile.admin,
      visibleFields: [
        adminSavedViewsFields.id,
        adminSavedViewsFields.ownerSubjectId,
        adminSavedViewsFields.name,
        adminSavedViewsFields.resourceKind,
        adminSavedViewsFields.serializedView,
        adminSavedViewsFields.pinned,
        adminSavedViewsFields.createdAt,
        adminSavedViewsFields.updatedAt,
        adminSavedViewsFields.lastUsedAt,
      ],
      auditedFields: [],
    },
  ]),
});
