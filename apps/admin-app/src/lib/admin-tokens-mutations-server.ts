import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";

import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import {
  buildAdminActionReason,
  resolveTrustedAdminRequestContextFromRequest,
} from "./trusted-admin-request-context-server";

const IssueAdminOperatorTestTokenInputSchema = Schema.Struct({
  label: Schema.NonEmptyString,
  expiresAt: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
  reasonAttachmentText: Schema.NonEmptyString,
});

const RevokeAdminOperatorTestTokenInputSchema = Schema.Struct({
  tokenId: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
  reasonAttachmentText: Schema.NonEmptyString,
});

type IssueAdminOperatorTestTokenInput = Schema.Schema.Type<
  typeof IssueAdminOperatorTestTokenInputSchema
>;
type RevokeAdminOperatorTestTokenInput = Schema.Schema.Type<
  typeof RevokeAdminOperatorTestTokenInputSchema
>;

export type IssueAdminOperatorTestTokenServerResult = {
  readonly tokenId: string;
  readonly label: string;
  readonly tokenPrefix: string;
  readonly plaintextToken: string;
};

export type RevokeAdminOperatorTestTokenServerResult = {
  readonly tokenId: string;
};

export const issueAdminOperatorTestToken = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: IssueAdminOperatorTestTokenInput) => input)
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: unknown;
    }): Promise<IssueAdminOperatorTestTokenServerResult> => {
      const decoded = await Effect.runPromise(
        Schema.decodeUnknown(IssueAdminOperatorTestTokenInputSchema)(data),
      );
      const requestContext = await resolveTrustedAdminRequestContextFromRequest(
        context.request,
      );
      const { issueAdminOperatorTestTokenFromEnvironment } =
        await import("@comvestec/platform");
      const result = await Effect.runPromise(
        issueAdminOperatorTestTokenFromEnvironment(process.env, {
          requestContext: {
            ...requestContext,
            reason: buildAdminActionReason(
              decoded.reasonCatalogId,
              decoded.reasonAttachmentText,
            ),
          },
          label: decoded.label,
          expiresAt: decoded.expiresAt,
          reasonCatalogId: decoded.reasonCatalogId,
          reasonAttachmentText: decoded.reasonAttachmentText,
        }),
      );

      return {
        tokenId: result.summary.id,
        label: result.summary.label,
        tokenPrefix: result.summary.tokenPrefix,
        plaintextToken: result.plaintextToken,
      };
    },
  );

export const revokeAdminOperatorTestToken = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: RevokeAdminOperatorTestTokenInput) => input)
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: unknown;
    }): Promise<RevokeAdminOperatorTestTokenServerResult> => {
      const decoded = await Effect.runPromise(
        Schema.decodeUnknown(RevokeAdminOperatorTestTokenInputSchema)(data),
      );
      const requestContext = await resolveTrustedAdminRequestContextFromRequest(
        context.request,
      );
      const { revokeAdminOperatorTestTokenFromEnvironment } =
        await import("@comvestec/platform");

      await Effect.runPromise(
        revokeAdminOperatorTestTokenFromEnvironment(process.env, {
          requestContext: {
            ...requestContext,
            reason: buildAdminActionReason(
              decoded.reasonCatalogId,
              decoded.reasonAttachmentText,
            ),
          },
          id: decoded.tokenId,
          reasonCatalogId: decoded.reasonCatalogId,
        }),
      );

      return {
        tokenId: decoded.tokenId,
      };
    },
  );
