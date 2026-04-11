import { Schema } from "effect";

const AuthorizationNamespaceConstantSchema = Schema.Struct({
  tenant: Schema.Literal("tenant"),
  organization: Schema.Literal("organization"),
  individual: Schema.Literal("individual"),
  module: Schema.Literal("module"),
  configKey: Schema.Literal("config-key"),
  featureFlag: Schema.Literal("feature-flag"),
  brandingProfile: Schema.Literal("branding-profile"),
  file: Schema.Literal("file"),
  auditEvent: Schema.Literal("audit-event"),
  supportCase: Schema.Literal("support-case"),
  billingEntitlement: Schema.Literal("billing-entitlement"),
});

export const authorizationNamespace = Schema.validateSync(
  AuthorizationNamespaceConstantSchema,
)({
  tenant: "tenant",
  organization: "organization",
  individual: "individual",
  module: "module",
  configKey: "config-key",
  featureFlag: "feature-flag",
  brandingProfile: "branding-profile",
  file: "file",
  auditEvent: "audit-event",
  supportCase: "support-case",
  billingEntitlement: "billing-entitlement",
} satisfies Schema.Schema.Type<typeof AuthorizationNamespaceConstantSchema>);

export const authorizationNamespaces = [
  authorizationNamespace.tenant,
  authorizationNamespace.organization,
  authorizationNamespace.individual,
  authorizationNamespace.module,
  authorizationNamespace.configKey,
  authorizationNamespace.featureFlag,
  authorizationNamespace.brandingProfile,
  authorizationNamespace.file,
  authorizationNamespace.auditEvent,
  authorizationNamespace.supportCase,
  authorizationNamespace.billingEntitlement,
] as const;

export const AuthorizationNamespaceSchema = Schema.Literal(
  ...authorizationNamespaces,
);

export type AuthorizationNamespace = Schema.Schema.Type<
  typeof AuthorizationNamespaceSchema
>;

const AuthorizationRelationConstantSchema = Schema.Struct({
  viewer: Schema.Literal("viewer"),
  editor: Schema.Literal("editor"),
  admin: Schema.Literal("admin"),
  owner: Schema.Literal("owner"),
  member: Schema.Literal("member"),
  impersonator: Schema.Literal("impersonator"),
  approver: Schema.Literal("approver"),
});

export const authorizationRelation = Schema.validateSync(
  AuthorizationRelationConstantSchema,
)({
  viewer: "viewer",
  editor: "editor",
  admin: "admin",
  owner: "owner",
  member: "member",
  impersonator: "impersonator",
  approver: "approver",
} satisfies Schema.Schema.Type<typeof AuthorizationRelationConstantSchema>);

export const authorizationRelations = [
  authorizationRelation.viewer,
  authorizationRelation.editor,
  authorizationRelation.admin,
  authorizationRelation.owner,
  authorizationRelation.member,
  authorizationRelation.impersonator,
  authorizationRelation.approver,
] as const;

export const AuthorizationRelationSchema = Schema.Literal(
  ...authorizationRelations,
);

export type AuthorizationRelation = Schema.Schema.Type<
  typeof AuthorizationRelationSchema
>;
