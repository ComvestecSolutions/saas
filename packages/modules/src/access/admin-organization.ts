import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  adminMemberRole,
  AdminMemberRoleSchema,
  ResolvedAdminCapabilitiesSchema,
  type AdminMemberRole,
  type ResolvedAdminCapabilities,
} from "@comvestec/contracts";

export {
  adminMemberRole,
  adminMemberStatus,
  adminMemberInvitationStatus,
  AdminMemberRoleSchema,
  AdminMemberStatusSchema,
  AdminMemberInvitationStatusSchema,
  AdminMemberSchema,
  AdminMemberInvitationSchema,
  AdminInvitationNotificationPayloadSchema,
  ResolvedAdminCapabilitiesSchema,
} from "@comvestec/contracts";
export type {
  AdminMemberRole,
  AdminMemberStatus,
  AdminMemberInvitationStatus,
  AdminMember,
  AdminMemberInvitation,
  AdminInvitationNotificationPayload,
  ResolvedAdminCapabilities,
} from "@comvestec/contracts";

/**
 * Subset of the platform actor capability snapshot consumed by the
 * admin-organization capability join. The full snapshot (capability
 * snapshot v2, §9 item 13 of the admin-app implementation plan) is
 * deferred to a follow-up slice; this typed shim narrows to the
 * capabilities the join actually needs today.
 */
export const PlatformActorCapabilitySnapshotSchema = Schema.Struct({
  hasPrivilegedAccess: Schema.Boolean,
  canImpersonate: Schema.Boolean,
  canRevealSecrets: Schema.Boolean,
  canReadAudit: Schema.Boolean,
});

export type PlatformActorCapabilitySnapshot = Schema.Schema.Type<
  typeof PlatformActorCapabilitySnapshotSchema
>;

/**
 * Pure capability join (ADR-023 §Capability resolution).
 *
 * Joins an admin-org role with the platform actor capability snapshot
 * for the current request. The admin app consumes the returned
 * envelope as the single authoritative capability surface — no
 * client-side role math. Exported for the future capability snapshot
 * v2 (§9 item 13 of the admin-app implementation plan) to compose
 * with the broader platform capability projection.
 */
export const joinAdminRoleWithPlatformCapabilities = (
  role: AdminMemberRole,
  snapshot: PlatformActorCapabilitySnapshot,
): ResolvedAdminCapabilities => {
  switch (role) {
    case adminMemberRole.adminOwner:
      return {
        role,
        canManageMembers: true,
        canInviteMembers: true,
        canChangeMemberRole: true,
        canRemoveMember: true,
        canReadAudit: true,
        canManageRuntimeConfig: true,
        canManageBilling: true,
        canReadBilling: true,
        canManageRetention: true,
        canImpersonate: snapshot.canImpersonate,
        canRevealSecrets: snapshot.canRevealSecrets,
        canMutate: true,
      };
    case adminMemberRole.adminAdmin:
      return {
        role,
        canManageMembers: true,
        canInviteMembers: true,
        canChangeMemberRole: true,
        canRemoveMember: false,
        canReadAudit: true,
        canManageRuntimeConfig: true,
        canManageBilling: true,
        canReadBilling: true,
        canManageRetention: true,
        canImpersonate: snapshot.canImpersonate,
        canRevealSecrets: snapshot.canRevealSecrets,
        canMutate: true,
      };
    case adminMemberRole.adminOperator:
      return {
        role,
        canManageMembers: false,
        canInviteMembers: false,
        canChangeMemberRole: false,
        canRemoveMember: false,
        canReadAudit: true,
        canManageRuntimeConfig: true,
        canManageBilling: false,
        canReadBilling: true,
        canManageRetention: false,
        canImpersonate: snapshot.canImpersonate,
        canRevealSecrets:
          snapshot.canRevealSecrets && snapshot.hasPrivilegedAccess,
        canMutate: true,
      };
    case adminMemberRole.supportReviewer:
      return {
        role,
        canManageMembers: false,
        canInviteMembers: false,
        canChangeMemberRole: false,
        canRemoveMember: false,
        canReadAudit: true,
        canManageRuntimeConfig: false,
        canManageBilling: false,
        canReadBilling: false,
        canManageRetention: false,
        canImpersonate: false,
        canRevealSecrets: false,
        canMutate: false,
      };
    case adminMemberRole.billingOnly:
      return {
        role,
        canManageMembers: false,
        canInviteMembers: false,
        canChangeMemberRole: false,
        canRemoveMember: false,
        canReadAudit: false,
        canManageRuntimeConfig: false,
        canManageBilling: true,
        canReadBilling: true,
        canManageRetention: false,
        canImpersonate: false,
        canRevealSecrets: false,
        canMutate: true,
      };
    case adminMemberRole.compliance:
      return {
        role,
        canManageMembers: false,
        canInviteMembers: false,
        canChangeMemberRole: false,
        canRemoveMember: false,
        canReadAudit: true,
        canManageRuntimeConfig: false,
        canManageBilling: false,
        canReadBilling: true,
        canManageRetention: true,
        canImpersonate: false,
        canRevealSecrets: false,
        canMutate: true,
      };
    case adminMemberRole.viewer:
    default:
      return {
        role,
        canManageMembers: false,
        canInviteMembers: false,
        canChangeMemberRole: false,
        canRemoveMember: false,
        canReadAudit: false,
        canManageRuntimeConfig: false,
        canManageBilling: false,
        canReadBilling: false,
        canManageRetention: false,
        canImpersonate: false,
        canRevealSecrets: false,
        canMutate: false,
      };
  }
};

const ResolveCapabilitiesInputSchema = Schema.Struct({
  role: AdminMemberRoleSchema,
  snapshot: PlatformActorCapabilitySnapshotSchema,
});

export type ResolveAdminCapabilitiesInput = Schema.Schema.Type<
  typeof ResolveCapabilitiesInputSchema
>;

export type AdminOrganizationModuleService = {
  /**
   * Boundary-decoded form of `joinAdminRoleWithPlatformCapabilities`.
   * Use this from runtime paths; the pure function above is for
   * pre-validated inputs (tests, internal composition).
   */
  readonly resolveCapabilities: (
    input: ResolveAdminCapabilitiesInput,
  ) => Effect.Effect<ResolvedAdminCapabilities, ParseResult.ParseError>;
};

export class AdminOrganizationModule extends Context.Tag(
  "AdminOrganizationModule",
)<AdminOrganizationModule, AdminOrganizationModuleService>() {}

export const makeAdminOrganizationModule = () =>
  Effect.succeed<AdminOrganizationModuleService>({
    resolveCapabilities: (input) =>
      Schema.decodeUnknown(ResolveCapabilitiesInputSchema)(input).pipe(
        Effect.flatMap((decoded) =>
          Schema.decodeUnknown(ResolvedAdminCapabilitiesSchema)(
            joinAdminRoleWithPlatformCapabilities(
              decoded.role,
              decoded.snapshot,
            ),
          ),
        ),
      ),
  });

export const AdminOrganizationModuleLive = Layer.effect(
  AdminOrganizationModule,
  makeAdminOrganizationModule(),
);
