import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";

import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { resolveTrustedAdminRequestContextFromRequest } from "./trusted-admin-request-context-server";
import { decodeSyncBoundary } from "./effect-boundary";

const ResendAdminNotificationInputSchema = Schema.Struct({
  notificationId: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  reasonAttachmentText: Schema.optional(Schema.NonEmptyString),
});

type ResendAdminNotificationInput = Schema.Schema.Type<
  typeof ResendAdminNotificationInputSchema
>;

export type ResendAdminNotificationServerResult = {
  readonly accepted: boolean;
  readonly notificationId: string;
  readonly resendNotificationId: string | null;
};

export const resendAdminNotification = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(ResendAdminNotificationInputSchema))
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: ResendAdminNotificationInput;
    }): Promise<ResendAdminNotificationServerResult> => {
      const requestContext = await resolveTrustedAdminRequestContextFromRequest(
        context.request,
      );
      const { resendNotificationFromEnvironment } =
        await import("@comvestec/platform");
      const result = await Effect.runPromise(
        resendNotificationFromEnvironment(process.env, {
          requestContext,
          notificationId: data.notificationId,
          reason: data.reason,
          ...(data.reasonAttachmentText === undefined
            ? {}
            : { reasonAttachmentText: data.reasonAttachmentText }),
        }),
      );

      return {
        accepted: result.accepted,
        notificationId: result.notificationId,
        resendNotificationId: result.resendNotificationId ?? null,
      };
    },
  );
