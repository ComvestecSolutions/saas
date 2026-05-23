import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";

import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { resolveTrustedAdminRequestContextFromRequest } from "./trusted-admin-request-context-server";

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
  .inputValidator((input: ReplayAdminWorkflowRunInput) => input)
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: unknown;
    }): Promise<ReplayAdminWorkflowRunServerResult> => {
      const decoded = await Effect.runPromise(
        Schema.decodeUnknown(ReplayAdminWorkflowRunInputSchema)(data),
      );
      const requestContext = await resolveTrustedAdminRequestContextFromRequest(
        context.request,
      );
      const { replayWorkflowRunFromEnvironment } =
        await import("@comvestec/platform");
      const result = await Effect.runPromise(
        replayWorkflowRunFromEnvironment(process.env, {
          requestContext,
          runId: decoded.runId,
          reason: decoded.reason,
          ...(decoded.reasonAttachmentText === undefined
            ? {}
            : { reasonAttachmentText: decoded.reasonAttachmentText }),
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
  .inputValidator((input: CancelAdminWorkflowRunInput) => input)
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: unknown;
    }): Promise<CancelAdminWorkflowRunServerResult> => {
      const decoded = await Effect.runPromise(
        Schema.decodeUnknown(CancelAdminWorkflowRunInputSchema)(data),
      );
      const requestContext = await resolveTrustedAdminRequestContextFromRequest(
        context.request,
      );
      const { cancelWorkflowRunFromEnvironment } =
        await import("@comvestec/platform");
      const result = await Effect.runPromise(
        cancelWorkflowRunFromEnvironment(process.env, {
          requestContext,
          runId: decoded.runId,
          reason: decoded.reason,
          ...(decoded.reasonAttachmentText === undefined
            ? {}
            : { reasonAttachmentText: decoded.reasonAttachmentText }),
        }),
      );

      return {
        accepted: result.accepted,
        runId: result.runId,
      };
    },
  );
