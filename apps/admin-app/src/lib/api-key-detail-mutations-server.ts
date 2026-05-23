import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { platformScope } from "@comvestec/contracts";

import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
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

const decodeMutationInput = Schema.decodeUnknown(
  AdminWebhookApiKeyMutationInputSchema,
);

const resolveApiKeyMutationInput = async (
  request: Request,
  data: unknown,
): Promise<
  Readonly<{
    sessionId: string;
    input: AdminWebhookApiKeyMutationInput;
  }>
> => {
  const [sessionId, input] = await Promise.all([
    resolveAdminSessionIdFromRequest(request),
    Effect.runPromise(decodeMutationInput(data)),
  ]);

  return {
    sessionId,
    input,
  };
};

export const rotateAdminWebhookApiKey = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminWebhookApiKeyMutationInput) => input)
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: unknown;
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
  .inputValidator((input: AdminWebhookApiKeyMutationInput) => input)
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: unknown;
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
