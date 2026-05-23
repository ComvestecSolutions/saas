import { Schema } from "effect";
import { actorType } from "./actor-types";

export const adminManagedOperatorRoles = [
  actorType.platformOperator,
  actorType.supportOperator,
] as const;

export const AdminManagedOperatorRoleSchema = Schema.Literal(
  ...adminManagedOperatorRoles,
);

export type AdminManagedOperatorRole = Schema.Schema.Type<
  typeof AdminManagedOperatorRoleSchema
>;

export const AdminOperatorIdentitySchema = Schema.Struct({
  actorId: Schema.NonEmptyString,
  username: Schema.NonEmptyString,
  email: Schema.NonEmptyString,
  displayName: Schema.NonEmptyString,
  actorType: AdminManagedOperatorRoleSchema,
  enabled: Schema.Boolean,
});

export type AdminOperatorIdentity = Schema.Schema.Type<
  typeof AdminOperatorIdentitySchema
>;

export const AdminOperatorIdentityListSchema = Schema.Array(
  AdminOperatorIdentitySchema,
);

export type AdminOperatorIdentityList = Schema.Schema.Type<
  typeof AdminOperatorIdentityListSchema
>;

export const AdminOperatorProvisionRequestSchema = Schema.Struct({
  displayName: Schema.NonEmptyString,
  email: Schema.NonEmptyString,
  username: Schema.optional(Schema.NonEmptyString),
  actorType: AdminManagedOperatorRoleSchema,
  reason: Schema.NonEmptyString,
});

export type AdminOperatorProvisionRequest = Schema.Schema.Type<
  typeof AdminOperatorProvisionRequestSchema
>;

export const AdminOperatorCredentialHandoffSchema = Schema.Struct({
  signInUrl: Schema.NonEmptyString,
  temporaryPassword: Schema.NonEmptyString,
});

export type AdminOperatorCredentialHandoff = Schema.Schema.Type<
  typeof AdminOperatorCredentialHandoffSchema
>;

export const AdminOperatorProvisionResultSchema = Schema.Struct({
  operator: AdminOperatorIdentitySchema,
  updatedExisting: Schema.Boolean,
  credentialHandoff: AdminOperatorCredentialHandoffSchema,
});

export type AdminOperatorProvisionResult = Schema.Schema.Type<
  typeof AdminOperatorProvisionResultSchema
>;
