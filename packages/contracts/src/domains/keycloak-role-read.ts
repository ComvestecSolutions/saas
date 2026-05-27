import { Schema } from "effect";

import { PlatformScopeSchema } from "../access/platform-scopes";

export const KeycloakRoleReadTargetTenantSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type KeycloakRoleReadTargetTenant = Schema.Schema.Type<
  typeof KeycloakRoleReadTargetTenantSchema
>;

export const KeycloakRoleCompositeSummarySchema = Schema.Struct({
  roleId: Schema.NonEmptyString,
  roleName: Schema.NonEmptyString,
  description: Schema.optional(Schema.NonEmptyString),
  composite: Schema.Boolean,
  clientRole: Schema.Boolean,
});

export type KeycloakRoleCompositeSummary = Schema.Schema.Type<
  typeof KeycloakRoleCompositeSummarySchema
>;

export const KeycloakRoleMemberSummarySchema = Schema.Struct({
  userId: Schema.NonEmptyString,
  username: Schema.NonEmptyString,
  email: Schema.optional(Schema.NonEmptyString),
  enabled: Schema.Boolean,
});

export type KeycloakRoleMemberSummary = Schema.Schema.Type<
  typeof KeycloakRoleMemberSummarySchema
>;

export const KeycloakRoleDetailSchema = Schema.Struct({
  roleId: Schema.NonEmptyString,
  roleName: Schema.NonEmptyString,
  description: Schema.optional(Schema.NonEmptyString),
  composite: Schema.Boolean,
  clientRole: Schema.Boolean,
  realm: Schema.NonEmptyString,
  compositeRoles: Schema.Array(KeycloakRoleCompositeSummarySchema),
  members: Schema.Array(KeycloakRoleMemberSummarySchema),
});

export type KeycloakRoleDetail = Schema.Schema.Type<
  typeof KeycloakRoleDetailSchema
>;

export const KeycloakRoleGetByIdInputSchema = Schema.Struct({
  tenant: KeycloakRoleReadTargetTenantSchema,
  roleId: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
});

export type KeycloakRoleGetByIdInput = Schema.Schema.Type<
  typeof KeycloakRoleGetByIdInputSchema
>;
