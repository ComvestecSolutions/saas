import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";

import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { resolveAdminSessionIdFromRequest } from "./trusted-admin-request-context-server";

const ReleaseAdminLegalHoldInputSchema = Schema.Struct({
  legalHoldId: Schema.NonEmptyString,
});

type ReleaseAdminLegalHoldInput = Schema.Schema.Type<
  typeof ReleaseAdminLegalHoldInputSchema
>;

export type ReleaseAdminLegalHoldServerResult = {
  readonly legalHoldId: string;
};

export const releaseAdminLegalHold = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: ReleaseAdminLegalHoldInput) => input)
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: unknown;
    }): Promise<ReleaseAdminLegalHoldServerResult> => {
      const decoded = await Effect.runPromise(
        Schema.decodeUnknown(ReleaseAdminLegalHoldInputSchema)(data),
      );
      const sessionId = await resolveAdminSessionIdFromRequest(context.request);
      const { releaseRetentionLegalHoldFromSessionId } =
        await import("@comvestec/platform");

      await Effect.runPromise(
        releaseRetentionLegalHoldFromSessionId(process.env, {
          sessionId,
          legalHoldId: decoded.legalHoldId,
        }),
      );

      return {
        legalHoldId: decoded.legalHoldId,
      };
    },
  );
