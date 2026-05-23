import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";

import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { resolveTrustedAdminRequestContextFromRequest } from "./trusted-admin-request-context-server";

const ReleaseAdminBreakGlassGrantInputSchema = Schema.Struct({
  caseId: Schema.NonEmptyString,
  releaseReasonCatalogId: Schema.NonEmptyString,
});

type ReleaseAdminBreakGlassGrantInput = Schema.Schema.Type<
  typeof ReleaseAdminBreakGlassGrantInputSchema
>;

export type ReleaseAdminBreakGlassGrantServerResult = {
  readonly caseId: string;
};

export const releaseAdminBreakGlassGrant = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: ReleaseAdminBreakGlassGrantInput) => input)
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: unknown;
    }): Promise<ReleaseAdminBreakGlassGrantServerResult> => {
      const decoded = await Effect.runPromise(
        Schema.decodeUnknown(ReleaseAdminBreakGlassGrantInputSchema)(data),
      );
      const requestContext = await resolveTrustedAdminRequestContextFromRequest(
        context.request,
      );
      const { releaseBreakGlassGrantFromEnvironment } =
        await import("@comvestec/platform");

      await Effect.runPromise(
        releaseBreakGlassGrantFromEnvironment(process.env, {
          requestContext,
          release: {
            id: decoded.caseId,
            releaseReasonCatalogId: decoded.releaseReasonCatalogId,
          },
        }),
      );

      return {
        caseId: decoded.caseId,
      };
    },
  );
