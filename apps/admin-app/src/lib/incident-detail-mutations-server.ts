import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";

import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSyncBoundary } from "./effect-boundary";
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
  .inputValidator(decodeSyncBoundary(ReleaseAdminBreakGlassGrantInputSchema))
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: ReleaseAdminBreakGlassGrantInput;
    }): Promise<ReleaseAdminBreakGlassGrantServerResult> => {
      const requestContext = await resolveTrustedAdminRequestContextFromRequest(
        context.request,
      );
      const { releaseBreakGlassGrantFromEnvironment } =
        await import("@comvestec/platform");

      await Effect.runPromise(
        releaseBreakGlassGrantFromEnvironment(process.env, {
          requestContext,
          release: {
            id: data.caseId,
            releaseReasonCatalogId: data.releaseReasonCatalogId,
          },
        }),
      );

      return {
        caseId: data.caseId,
      };
    },
  );
