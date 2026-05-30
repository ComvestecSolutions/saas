import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  platformScope,
  type WebhookApiKeyTenantScope,
} from "@comvestec/contracts";
import type {
  AdminApiKeyDetailInput,
  AdminApiKeyDetailRouteData,
} from "./api-key-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for `/desk/api-key/$keyId` (admin-app
 * implementation plan §8.12 + §11 — Phase 5 commit 3). Decodes
 * the loader input at the framework boundary and runs the
 * route-data Effect on the server. No Request/Response shaping
 * lives here.
 *
 * Webhook api keys are owner-locked to tenant scopes
 * (`enterprise` / `organization` / `individual`); the decoder
 * narrows the wider `PlatformScope`-typed URL input to a
 * `WebhookApiKeyTenantScope` and throws if the URL carries a
 * non-tenant scope.
 */
const WebhookApiKeyTenantScopeSchema = Schema.Literal(
  platformScope.enterprise,
  platformScope.organization,
  platformScope.individual,
);

const AdminApiKeyDetailInputSchema = Schema.Struct({
  keyId: Schema.NonEmptyString,
  scope: WebhookApiKeyTenantScopeSchema,
  scopeId: Schema.NonEmptyString,
});

const loadAdminApiKeyDetailData = async (
  request: Request,
  environment: unknown,
  input: AdminApiKeyDetailInput,
): Promise<AdminApiKeyDetailRouteData> => {
  const { loadAdminApiKeyDetailRouteDataFromRequest } =
    await import("./api-key-detail-route-data");
  return Effect.runPromise(
    loadAdminApiKeyDetailRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminApiKeyDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(AdminApiKeyDetailInputSchema))
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminApiKeyDetailInput;
    }) => loadAdminApiKeyDetailData(context.request, process.env, data),
  );
