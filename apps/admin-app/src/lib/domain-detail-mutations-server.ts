import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  customDomainLifecycleState,
  platformScope,
} from "@comvestec/contracts";

import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSyncBoundary } from "./effect-boundary";
import { resolveAdminSessionIdFromRequest } from "./trusted-admin-request-context-server";

const VerifyAdminCustomDomainInputSchema = Schema.Struct({
  hostname: Schema.NonEmptyString,
  scope: Schema.Literal(platformScope.enterprise, platformScope.organization),
  scopeId: Schema.NonEmptyString,
  reasonId: Schema.NonEmptyString,
  approvalNotes: Schema.NonEmptyString,
});

type VerifyAdminCustomDomainInput = Schema.Schema.Type<
  typeof VerifyAdminCustomDomainInputSchema
>;

export type VerifyAdminCustomDomainServerResult = {
  readonly hostname: string;
};

const buildApprovalNotes = (input: VerifyAdminCustomDomainInput): string =>
  `Reason: ${input.reasonId}\n${input.approvalNotes.trim()}`;

export const verifyAdminCustomDomain = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(VerifyAdminCustomDomainInputSchema))
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: VerifyAdminCustomDomainInput;
    }): Promise<VerifyAdminCustomDomainServerResult> => {
      const sessionId = await resolveAdminSessionIdFromRequest(context.request);
      const { transitionCustomDomainVerificationFromSessionId } =
        await import("@comvestec/platform");

      await Effect.runPromise(
        transitionCustomDomainVerificationFromSessionId(process.env, {
          sessionId,
          scope: data.scope,
          scopeId: data.scopeId,
          lifecycleState: customDomainLifecycleState.active,
          approvalNotes: buildApprovalNotes(data),
        }),
      );

      return {
        hostname: data.hostname,
      };
    },
  );
