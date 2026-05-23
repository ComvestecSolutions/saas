import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";

import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import {
  buildAdminActionReason,
  resolveTrustedAdminRequestContextFromRequest,
} from "./trusted-admin-request-context-server";

const CreateAdminWorkspaceInputSchema = Schema.Struct({
  ownerSubjectId: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  serializedLayout: Schema.NonEmptyString,
  reasonId: Schema.NonEmptyString,
  reasonAttachmentText: Schema.NonEmptyString,
});

const DeleteAdminWorkspaceInputSchema = Schema.Struct({
  ownerSubjectId: Schema.NonEmptyString,
  workspaceId: Schema.NonEmptyString,
  reasonId: Schema.NonEmptyString,
  reasonAttachmentText: Schema.NonEmptyString,
});

type CreateAdminWorkspaceInput = Schema.Schema.Type<
  typeof CreateAdminWorkspaceInputSchema
>;
type DeleteAdminWorkspaceInput = Schema.Schema.Type<
  typeof DeleteAdminWorkspaceInputSchema
>;

export type CreateAdminWorkspaceServerResult = {
  readonly workspaceId: string;
  readonly name: string;
};

export type DeleteAdminWorkspaceServerResult = {
  readonly workspaceId: string;
};

export const createAdminWorkspace = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: CreateAdminWorkspaceInput) => input)
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: unknown;
    }): Promise<CreateAdminWorkspaceServerResult> => {
      const decoded = await Effect.runPromise(
        Schema.decodeUnknown(CreateAdminWorkspaceInputSchema)(data),
      );
      const requestContext = await resolveTrustedAdminRequestContextFromRequest(
        context.request,
      );
      const { createWorkspaceFromEnvironment } =
        await import("@comvestec/platform");
      const result = await Effect.runPromise(
        createWorkspaceFromEnvironment(process.env, {
          requestContext: {
            ...requestContext,
            reason: buildAdminActionReason(
              decoded.reasonId,
              decoded.reasonAttachmentText,
            ),
          },
          ownerSubjectId: decoded.ownerSubjectId,
          name: decoded.name,
          serializedLayout: decoded.serializedLayout,
        }),
      );

      return {
        workspaceId: result.id,
        name: result.name,
      };
    },
  );

export const deleteAdminWorkspace = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: DeleteAdminWorkspaceInput) => input)
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: unknown;
    }): Promise<DeleteAdminWorkspaceServerResult> => {
      const decoded = await Effect.runPromise(
        Schema.decodeUnknown(DeleteAdminWorkspaceInputSchema)(data),
      );
      const requestContext = await resolveTrustedAdminRequestContextFromRequest(
        context.request,
      );
      const { deleteWorkspaceFromEnvironment } =
        await import("@comvestec/platform");

      await Effect.runPromise(
        deleteWorkspaceFromEnvironment(process.env, {
          requestContext: {
            ...requestContext,
            reason: buildAdminActionReason(
              decoded.reasonId,
              decoded.reasonAttachmentText,
            ),
          },
          ownerSubjectId: decoded.ownerSubjectId,
          id: decoded.workspaceId,
        }),
      );

      return {
        workspaceId: decoded.workspaceId,
      };
    },
  );
