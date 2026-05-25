import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { AdminMemberRoleSchema, type AdminMember } from "@comvestec/contracts";

import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import {
  buildAdminActionReason,
  resolveTrustedAdminRequestContextFromRequest,
} from "./trusted-admin-request-context-server";

const InviteAdminMemberInputSchema = Schema.Struct({
  email: Schema.NonEmptyString,
  invitedRole: AdminMemberRoleSchema,
  reasonId: Schema.NonEmptyString,
  reasonAttachmentText: Schema.NonEmptyString,
});

const RemoveAdminMemberInputSchema = Schema.Struct({
  memberId: Schema.NonEmptyString,
  reasonId: Schema.NonEmptyString,
  reasonAttachmentText: Schema.NonEmptyString,
});

type InviteAdminMemberInput = Schema.Schema.Type<
  typeof InviteAdminMemberInputSchema
>;
type RemoveAdminMemberInput = Schema.Schema.Type<
  typeof RemoveAdminMemberInputSchema
>;

export const resolveInvitingAdminMember = (
  members: readonly AdminMember[],
  actorId: string,
): AdminMember => {
  const invitingMember = members.find(
    (member) => member.keycloakSubjectId === actorId,
  );

  if (invitingMember === undefined) {
    throw new Error(
      `Current admin actor ${actorId} is not registered as an admin member.`,
    );
  }

  return invitingMember;
};

export type InviteAdminMemberServerResult = {
  readonly memberId: string;
  readonly invitationId: string;
  readonly email: string;
  readonly invitationToken: string;
};

export type RemoveAdminMemberServerResult = {
  readonly memberId: string;
};

export const inviteAdminMember = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: InviteAdminMemberInput) => input)
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: unknown;
    }): Promise<InviteAdminMemberServerResult> => {
      const decoded = await Effect.runPromise(
        Schema.decodeUnknown(InviteAdminMemberInputSchema)(data),
      );
      const requestContext = await resolveTrustedAdminRequestContextFromRequest(
        context.request,
      );
      const actorId = requestContext.actorId;

      if (actorId === undefined) {
        throw new Error("Current admin session is missing an actor id.");
      }

      const {
        inviteMemberFromEnvironment,
        listAdminOrganizationMembersFromEnvironment,
      } = await import("@comvestec/platform");
      const members = await Effect.runPromise(
        listAdminOrganizationMembersFromEnvironment(process.env, {
          requestContext,
        }),
      );
      const invitingMember = resolveInvitingAdminMember(members, actorId);
      const result = await Effect.runPromise(
        inviteMemberFromEnvironment(process.env, {
          requestContext: {
            ...requestContext,
            reason: buildAdminActionReason(
              decoded.reasonId,
              decoded.reasonAttachmentText,
            ),
          },
          email: decoded.email,
          invitedRole: decoded.invitedRole,
          invitedBy: invitingMember.id,
          invitedByDisplayName: invitingMember.displayName,
        }),
      );

      return {
        memberId: result.invitation.invitationId,
        invitationId: result.invitation.invitationId,
        email: result.invitation.email,
        invitationToken: result.invitationToken,
      };
    },
  );

export const removeAdminMember = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: RemoveAdminMemberInput) => input)
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: unknown;
    }): Promise<RemoveAdminMemberServerResult> => {
      const decoded = await Effect.runPromise(
        Schema.decodeUnknown(RemoveAdminMemberInputSchema)(data),
      );
      const requestContext = await resolveTrustedAdminRequestContextFromRequest(
        context.request,
      );
      const { removeMemberFromEnvironment } =
        await import("@comvestec/platform");

      await Effect.runPromise(
        removeMemberFromEnvironment(process.env, {
          requestContext: {
            ...requestContext,
            reason: buildAdminActionReason(
              decoded.reasonId,
              decoded.reasonAttachmentText,
            ),
          },
          memberId: decoded.memberId,
        }),
      );

      return {
        memberId: decoded.memberId,
      };
    },
  );
