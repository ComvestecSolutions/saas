import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";

import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { resolveTrustedAdminRequestContextFromRequest } from "./trusted-admin-request-context-server";
import { decodeSyncBoundary } from "./effect-boundary";

const ReplayAdminWorkflowRunInputSchema = Schema.Struct({
  runId: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  reasonAttachmentText: Schema.optional(Schema.NonEmptyString),
});

const CancelAdminWorkflowRunInputSchema = Schema.Struct({
  runId: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  reasonAttachmentText: Schema.optional(Schema.NonEmptyString),
});

type ReplayAdminWorkflowRunInput = Schema.Schema.Type<
  typeof ReplayAdminWorkflowRunInputSchema
>;

type CancelAdminWorkflowRunInput = Schema.Schema.Type<
  typeof CancelAdminWorkflowRunInputSchema
>;

export type ReplayAdminWorkflowRunServerResult = {
  readonly accepted: boolean;
  readonly runId: string;
  readonly replayRunId: string | null;
};

export type CancelAdminWorkflowRunServerResult = {
  readonly accepted: boolean;
  readonly runId: string;
};

export const replayAdminWorkflowRun = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(ReplayAdminWorkflowRunInputSchema))
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: ReplayAdminWorkflowRunInput;
    }): Promise<ReplayAdminWorkflowRunServerResult> => {
      const requestContext = await resolveTrustedAdminRequestContextFromRequest(
        context.request,
      );
      const { replayWorkflowRunFromEnvironment } =
        await import("@comvestec/platform");
      const result = await Effect.runPromise(
        replayWorkflowRunFromEnvironment(process.env, {
          requestContext,
          runId: data.runId,
          reason: data.reason,
          ...(data.reasonAttachmentText === undefined
            ? {}
            : { reasonAttachmentText: data.reasonAttachmentText }),
        }),
      );

      return {
        accepted: result.accepted,
        runId: result.runId,
        replayRunId: result.replayRunId ?? null,
      };
    },
  );

export const cancelAdminWorkflowRun = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(CancelAdminWorkflowRunInputSchema))
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: CancelAdminWorkflowRunInput;
    }): Promise<CancelAdminWorkflowRunServerResult> => {
      const requestContext = await resolveTrustedAdminRequestContextFromRequest(
        context.request,
      );
      const { cancelWorkflowRunFromEnvironment } =
        await import("@comvestec/platform");
      const result = await Effect.runPromise(
        cancelWorkflowRunFromEnvironment(process.env, {
          requestContext,
          runId: data.runId,
          reason: data.reason,
          ...(data.reasonAttachmentText === undefined
            ? {}
            : { reasonAttachmentText: data.reasonAttachmentText }),
        }),
      );

      return {
        accepted: result.accepted,
        runId: result.runId,
      };
    },
  );
