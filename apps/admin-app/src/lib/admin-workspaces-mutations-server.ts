import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";

import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSyncBoundary } from "./effect-boundary";
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
  .inputValidator(decodeSyncBoundary(CreateAdminWorkspaceInputSchema))
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: CreateAdminWorkspaceInput;
    }): Promise<CreateAdminWorkspaceServerResult> => {
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
              data.reasonId,
              data.reasonAttachmentText,
            ),
          },
          ownerSubjectId: data.ownerSubjectId,
          name: data.name,
          serializedLayout: data.serializedLayout,
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
  .inputValidator(decodeSyncBoundary(DeleteAdminWorkspaceInputSchema))
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: DeleteAdminWorkspaceInput;
    }): Promise<DeleteAdminWorkspaceServerResult> => {
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
              data.reasonId,
              data.reasonAttachmentText,
            ),
          },
          ownerSubjectId: data.ownerSubjectId,
          id: data.workspaceId,
        }),
      );

      return {
        workspaceId: data.workspaceId,
      };
    },
  );
