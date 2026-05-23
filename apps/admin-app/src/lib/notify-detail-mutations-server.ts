import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";

import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { resolveTrustedAdminRequestContextFromRequest } from "./trusted-admin-request-context-server";

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
  .inputValidator((input: ResendAdminNotificationInput) => input)
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: unknown;
    }): Promise<ResendAdminNotificationServerResult> => {
      const decoded = await Effect.runPromise(
        Schema.decodeUnknown(ResendAdminNotificationInputSchema)(data),
      );
      const requestContext = await resolveTrustedAdminRequestContextFromRequest(
        context.request,
      );
      const { resendNotificationFromEnvironment } =
        await import("@comvestec/platform");
      const result = await Effect.runPromise(
        resendNotificationFromEnvironment(process.env, {
          requestContext,
          notificationId: decoded.notificationId,
          reason: decoded.reason,
          ...(decoded.reasonAttachmentText === undefined
            ? {}
            : { reasonAttachmentText: decoded.reasonAttachmentText }),
        }),
      );

      return {
        accepted: result.accepted,
        notificationId: result.notificationId,
        resendNotificationId: result.resendNotificationId ?? null,
      };
    },
  );
