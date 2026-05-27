import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { reasonCatalogId } from "@comvestec/contracts";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { resolveTrustedAdminRequestContextFromRequest } from "./trusted-admin-request-context-server";

const ReleaseAdminRunAsGrantInputSchema = Schema.Struct({
  grantId: Schema.NonEmptyString,
  reasonId: Schema.Literal(reasonCatalogId.runAsBannerStateRelease),
  reasonAttachmentText: Schema.NonEmptyString,
});

export type ReleaseAdminRunAsGrantInput = Schema.Schema.Type<
  typeof ReleaseAdminRunAsGrantInputSchema
>;

export type ReleaseAdminRunAsGrantServerResult = {
  readonly grantId: string;
};

export const releaseAdminRunAsGrant = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: ReleaseAdminRunAsGrantInput) => input)
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: unknown;
    }): Promise<ReleaseAdminRunAsGrantServerResult> => {
      const decoded = await Effect.runPromise(
        Schema.decodeUnknown(ReleaseAdminRunAsGrantInputSchema)(data),
      );
      const requestContext = await resolveTrustedAdminRequestContextFromRequest(
        context.request,
      );
      const { releaseRunAsGrantFromEnvironment } =
        await import("@comvestec/platform");

      await Effect.runPromise(
        releaseRunAsGrantFromEnvironment(process.env, {
          requestContext,
          grantId: decoded.grantId,
          reason: decoded.reasonId,
          reasonAttachmentText: decoded.reasonAttachmentText,
        }),
      );

      return {
        grantId: decoded.grantId,
      };
    },
  );
