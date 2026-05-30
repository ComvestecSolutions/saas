import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { platformScope } from "@comvestec/contracts";

import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSyncBoundary } from "./effect-boundary";
import { resolveAdminSessionIdFromRequest } from "./trusted-admin-request-context-server";

const WebhookApiKeyScopeSchema = Schema.Literal(
  platformScope.enterprise,
  platformScope.organization,
  platformScope.individual,
);

const AdminWebhookApiKeyMutationInputSchema = Schema.Struct({
  apiKeyId: Schema.NonEmptyString,
  scope: WebhookApiKeyScopeSchema,
  scopeId: Schema.NonEmptyString,
});

type AdminWebhookApiKeyMutationInput = Schema.Schema.Type<
  typeof AdminWebhookApiKeyMutationInputSchema
>;

export type AdminWebhookApiKeyMutationServerResult = {
  readonly apiKeyId: string;
};

const resolveApiKeyMutationInput = async (
  request: Request,
  input: AdminWebhookApiKeyMutationInput,
): Promise<
  Readonly<{
    sessionId: string;
    input: AdminWebhookApiKeyMutationInput;
  }>
> => {
  const [sessionId, resolvedInput] = await Promise.all([
    resolveAdminSessionIdFromRequest(request),
    Promise.resolve(input),
  ]);

  return {
    sessionId,
    input: resolvedInput,
  };
};

export const rotateAdminWebhookApiKey = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(AdminWebhookApiKeyMutationInputSchema))
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminWebhookApiKeyMutationInput;
    }): Promise<AdminWebhookApiKeyMutationServerResult> => {
      const { rotateWebhookApiKeyFromSessionId } =
        await import("@comvestec/platform");
      const { sessionId, input } = await resolveApiKeyMutationInput(
        context.request,
        data,
      );

      await Effect.runPromise(
        rotateWebhookApiKeyFromSessionId(process.env, {
          sessionId,
          apiKeyId: input.apiKeyId,
          scope: input.scope,
          scopeId: input.scopeId,
        }),
      );

      return {
        apiKeyId: input.apiKeyId,
      };
    },
  );

export const revokeAdminWebhookApiKey = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(AdminWebhookApiKeyMutationInputSchema))
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminWebhookApiKeyMutationInput;
    }): Promise<AdminWebhookApiKeyMutationServerResult> => {
      const { revokeWebhookApiKeyFromSessionId } =
        await import("@comvestec/platform");
      const { sessionId, input } = await resolveApiKeyMutationInput(
        context.request,
        data,
      );

      await Effect.runPromise(
        revokeWebhookApiKeyFromSessionId(process.env, {
          sessionId,
          apiKeyId: input.apiKeyId,
          scope: input.scope,
          scopeId: input.scopeId,
        }),
      );

      return {
        apiKeyId: input.apiKeyId,
      };
    },
  );
