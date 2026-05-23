import { Schema } from "effect";

/**
 * Admin-organization role vocabulary per ADR-023.
 *
 * The seven roles govern who can do what inside the internal
 * admin org that runs the SaaS platform. They are **not** platform
 * actor types; the capability join (see `admin-organization` module)
 * fuses an admin role with the request's platform actor capability
 * snapshot to produce a single resolved capability surface.
 */
const AdminMemberRoleConstantSchema = Schema.Struct({
  adminOwner: Schema.Literal("admin-owner"),
  adminAdmin: Schema.Literal("admin-admin"),
  adminOperator: Schema.Literal("admin-operator"),
  supportReviewer: Schema.Literal("support-reviewer"),
  billingOnly: Schema.Literal("billing-only"),
  compliance: Schema.Literal("compliance"),
  viewer: Schema.Literal("viewer"),
});

export const adminMemberRole = Schema.validateSync(
  AdminMemberRoleConstantSchema,
)({
  adminOwner: "admin-owner",
  adminAdmin: "admin-admin",
  adminOperator: "admin-operator",
  supportReviewer: "support-reviewer",
  billingOnly: "billing-only",
  compliance: "compliance",
  viewer: "viewer",
} satisfies Schema.Schema.Type<typeof AdminMemberRoleConstantSchema>);

export const adminMemberRoles = [
  adminMemberRole.adminOwner,
  adminMemberRole.adminAdmin,
  adminMemberRole.adminOperator,
  adminMemberRole.supportReviewer,
  adminMemberRole.billingOnly,
  adminMemberRole.compliance,
  adminMemberRole.viewer,
] as const;

export const AdminMemberRoleSchema = Schema.Literal(...adminMemberRoles);

export type AdminMemberRole = Schema.Schema.Type<typeof AdminMemberRoleSchema>;

/**
 * Member lifecycle status. `pending` is set on invite issue (no row
 * yet exists; surfaced through `AdminMemberInvitation`), `active` is
 * set once a successful OIDC sign-in handoff lands, and `archived`
 * is set on removal.
 */
const AdminMemberStatusConstantSchema = Schema.Struct({
  active: Schema.Literal("active"),
  archived: Schema.Literal("archived"),
});

export const adminMemberStatus = Schema.validateSync(
  AdminMemberStatusConstantSchema,
)({
  active: "active",
  archived: "archived",
} satisfies Schema.Schema.Type<typeof AdminMemberStatusConstantSchema>);

export const adminMemberStatuses = [
  adminMemberStatus.active,
  adminMemberStatus.archived,
] as const;

export const AdminMemberStatusSchema = Schema.Literal(...adminMemberStatuses);

export type AdminMemberStatus = Schema.Schema.Type<
  typeof AdminMemberStatusSchema
>;

const AdminMemberInvitationStatusConstantSchema = Schema.Struct({
  pending: Schema.Literal("pending"),
  redeemed: Schema.Literal("redeemed"),
  revoked: Schema.Literal("revoked"),
  expired: Schema.Literal("expired"),
});

export const adminMemberInvitationStatus = Schema.validateSync(
  AdminMemberInvitationStatusConstantSchema,
)({
  pending: "pending",
  redeemed: "redeemed",
  revoked: "revoked",
  expired: "expired",
} satisfies Schema.Schema.Type<
  typeof AdminMemberInvitationStatusConstantSchema
>);

export const adminMemberInvitationStatuses = [
  adminMemberInvitationStatus.pending,
  adminMemberInvitationStatus.redeemed,
  adminMemberInvitationStatus.revoked,
  adminMemberInvitationStatus.expired,
] as const;

export const AdminMemberInvitationStatusSchema = Schema.Literal(
  ...adminMemberInvitationStatuses,
);

export type AdminMemberInvitationStatus = Schema.Schema.Type<
  typeof AdminMemberInvitationStatusSchema
>;

export const AdminMemberSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  keycloakSubjectId: Schema.optional(Schema.NonEmptyString),
  email: Schema.NonEmptyString,
  displayName: Schema.NonEmptyString,
  role: AdminMemberRoleSchema,
  status: AdminMemberStatusSchema,
  invitedAt: Schema.NonEmptyString,
  acceptedAt: Schema.optional(Schema.NonEmptyString),
  lastActiveAt: Schema.optional(Schema.NonEmptyString),
  createdBy: Schema.NonEmptyString,
  updatedAt: Schema.NonEmptyString,
  archivedAt: Schema.optional(Schema.NonEmptyString),
});

export type AdminMember = Schema.Schema.Type<typeof AdminMemberSchema>;

export const AdminMemberInvitationSchema = Schema.Struct({
  invitationId: Schema.NonEmptyString,
  email: Schema.NonEmptyString,
  invitedRole: AdminMemberRoleSchema,
  invitedBy: Schema.NonEmptyString,
  tokenHash: Schema.NonEmptyString,
  status: AdminMemberInvitationStatusSchema,
  issuedAt: Schema.NonEmptyString,
  expiresAt: Schema.NonEmptyString,
  acceptedAt: Schema.optional(Schema.NonEmptyString),
  revokedAt: Schema.optional(Schema.NonEmptyString),
  revokedBy: Schema.optional(Schema.NonEmptyString),
  correlationId: Schema.optional(Schema.NonEmptyString),
});

export type AdminMemberInvitation = Schema.Schema.Type<
  typeof AdminMemberInvitationSchema
>;

/**
 * Payload schema for the Novu admin-organization invitation
 * workflow. Body / subject content lives in the Novu console; this
 * shape is the contract the platform service emits.
 */
export const AdminInvitationNotificationPayloadSchema = Schema.Struct({
  invitationId: Schema.NonEmptyString,
  recipientEmail: Schema.NonEmptyString,
  invitedRole: AdminMemberRoleSchema,
  invitedByDisplayName: Schema.NonEmptyString,
  acceptUrl: Schema.NonEmptyString,
  expiresAt: Schema.NonEmptyString,
});

export type AdminInvitationNotificationPayload = Schema.Schema.Type<
  typeof AdminInvitationNotificationPayloadSchema
>;

/**
 * Resolved capability surface produced by joining the admin-org
 * role with the platform actor's capability snapshot. The admin app
 * consumes this single envelope rather than performing role math
 * client-side (ADR-023 §Capability resolution).
 */
export const ResolvedAdminCapabilitiesSchema = Schema.Struct({
  role: AdminMemberRoleSchema,
  canManageMembers: Schema.Boolean,
  canInviteMembers: Schema.Boolean,
  canChangeMemberRole: Schema.Boolean,
  canRemoveMember: Schema.Boolean,
  canReadAudit: Schema.Boolean,
  canManageRuntimeConfig: Schema.Boolean,
  canManageBilling: Schema.Boolean,
  canReadBilling: Schema.Boolean,
  canManageRetention: Schema.Boolean,
  canImpersonate: Schema.Boolean,
  canRevealSecrets: Schema.Boolean,
  canMutate: Schema.Boolean,
});

export type ResolvedAdminCapabilities = Schema.Schema.Type<
  typeof ResolvedAdminCapabilitiesSchema
>;
