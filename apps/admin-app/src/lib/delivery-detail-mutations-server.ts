import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";

import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { resolveTrustedAdminRequestContextFromRequest } from "./trusted-admin-request-context-server";

const RetryAdminWebhookDeliveryInputSchema = Schema.Struct({
  deliveryId: Schema.NonEmptyString,
  retryReasonCatalogId: Schema.NonEmptyString,
});

type RetryAdminWebhookDeliveryInput = Schema.Schema.Type<
  typeof RetryAdminWebhookDeliveryInputSchema
>;

export type RetryAdminWebhookDeliveryServerResult = {
  readonly deliveryId: string;
};

export const retryAdminWebhookDelivery = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: RetryAdminWebhookDeliveryInput) => input)
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: unknown;
    }): Promise<RetryAdminWebhookDeliveryServerResult> => {
      const decoded = await Effect.runPromise(
        Schema.decodeUnknown(RetryAdminWebhookDeliveryInputSchema)(data),
      );
      const requestContext = await resolveTrustedAdminRequestContextFromRequest(
        context.request,
      );
      const { retryOperatorWebhookDeliveryFromEnvironment } =
        await import("@comvestec/platform");

      await Effect.runPromise(
        retryOperatorWebhookDeliveryFromEnvironment(process.env, {
          requestContext,
          retry: {
            id: decoded.deliveryId,
            retryReasonCatalogId: decoded.retryReasonCatalogId,
          },
        }),
      );

      return {
        deliveryId: decoded.deliveryId,
      };
    },
  );
