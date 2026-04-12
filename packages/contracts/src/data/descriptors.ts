import { Schema } from "effect";
import {
  permissionScope,
  PermissionScopeSchema,
} from "../access/permission-scopes";
import {
  type DataClassification,
  DataClassificationSchema,
} from "./data-classifications";
import {
  projectionProfile,
  ProjectionProfileSchema,
  type ProjectionProfile,
} from "./projection-profiles";

export type ModuleFieldMap = Record<string, string>;

export type ModuleField<TFields extends ModuleFieldMap> =
  TFields[keyof TFields] & string;

export type TypedProjectionDescriptor<TField extends string> = {
  readonly profile: ProjectionProfile;
  readonly visibleFields: readonly TField[];
  readonly auditedFields: readonly TField[];
};

export type TypedDataClassificationDeclaration<TField extends string> = {
  readonly field: TField;
  readonly classification: DataClassification;
};

const ModuleFieldSchema = Schema.NonEmptyString;

const ModuleFieldMapSchema = Schema.Record({
  key: Schema.NonEmptyString,
  value: ModuleFieldSchema,
});

export const PermissionDescriptorSchema = Schema.Struct({
  scope: PermissionScopeSchema,
  description: Schema.NonEmptyString,
  assignableBy: Schema.Array(PermissionScopeSchema),
});

export type PermissionDescriptor = Schema.Schema.Type<
  typeof PermissionDescriptorSchema
>;

export const ProjectionDescriptorSchema = Schema.Struct({
  profile: ProjectionProfileSchema,
  visibleFields: Schema.Array(ModuleFieldSchema),
  auditedFields: Schema.Array(ModuleFieldSchema),
});

export type ProjectionDescriptor = Schema.Schema.Type<
  typeof ProjectionDescriptorSchema
>;

export const DataClassificationDeclarationSchema = Schema.Struct({
  field: ModuleFieldSchema,
  classification: DataClassificationSchema,
});

export type DataClassificationDeclaration = Schema.Schema.Type<
  typeof DataClassificationDeclarationSchema
>;

export const PermissionDescriptorListSchema = Schema.Array(
  PermissionDescriptorSchema,
);

export const ProjectionDescriptorListSchema = Schema.Array(
  ProjectionDescriptorSchema,
);

export const DataClassificationDeclarationListSchema = Schema.Array(
  DataClassificationDeclarationSchema,
);

export const defineModuleFields = <const TFields extends ModuleFieldMap>(
  fields: TFields,
): TFields =>
  Schema.validateSync(ModuleFieldMapSchema)(fields) as unknown as TFields;

export const defineProjectionDescriptors = <
  const TFields extends ModuleFieldMap,
  const TDescriptors extends readonly TypedProjectionDescriptor<
    ModuleField<TFields>
  >[],
>(
  _fields: TFields,
  descriptors: TDescriptors,
): TDescriptors =>
  Schema.validateSync(ProjectionDescriptorListSchema)(
    descriptors,
  ) as unknown as TDescriptors;

export const defineDataClassificationDeclarations = <
  const TFields extends ModuleFieldMap,
  const TDeclarations extends readonly TypedDataClassificationDeclaration<
    ModuleField<TFields>
  >[],
>(
  _fields: TFields,
  declarations: TDeclarations,
): TDeclarations =>
  Schema.validateSync(DataClassificationDeclarationListSchema)(
    declarations,
  ) as unknown as TDeclarations;

const baseProjectionFields = defineModuleFields({
  id: "id",
  name: "name",
  status: "status",
  createdAt: "createdAt",
  email: "email",
});

export const corePermissionDescriptors = Schema.validateSync(
  PermissionDescriptorListSchema,
)([
  {
    scope: permissionScope.tenantRead,
    description: "Read tenant-scoped resources.",
    assignableBy: [permissionScope.tenantWrite],
  },
  {
    scope: permissionScope.configWrite,
    description: "Change runtime configuration and feature state.",
    assignableBy: [permissionScope.supportImpersonate],
  },
  {
    scope: permissionScope.auditRead,
    description: "Inspect audit trails and sensitive read events.",
    assignableBy: [permissionScope.supportImpersonate],
  },
  {
    scope: permissionScope.brandingManage,
    description:
      "Manage tenant branding, branded sender identity, and custom-domain settings.",
    assignableBy: [permissionScope.supportImpersonate],
  },
] satisfies readonly PermissionDescriptor[]);

export const baseProjectionDescriptors = defineProjectionDescriptors(
  baseProjectionFields,
  [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        baseProjectionFields.id,
        baseProjectionFields.name,
        baseProjectionFields.status,
      ],
      auditedFields: [],
    },
    {
      profile: projectionProfile.supportSafe,
      visibleFields: [
        baseProjectionFields.id,
        baseProjectionFields.name,
        baseProjectionFields.status,
        baseProjectionFields.createdAt,
      ],
      auditedFields: [baseProjectionFields.email],
    },
  ],
);
