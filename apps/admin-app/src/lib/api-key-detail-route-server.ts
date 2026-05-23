import { Effect } from "effect";
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

/**
 * Server-function entrypoint for `/r/api-key/$keyId` (admin-app
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
export type AdminApiKeyDetailRawInput = {
  readonly keyId?: unknown;
  readonly scope?: unknown;
  readonly scopeId?: unknown;
};

const knownTenantScopes = new Set<string>([
  platformScope.enterprise,
  platformScope.organization,
  platformScope.individual,
]);

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`API key detail loader requires '${label}'.`);
  }
  return value;
};

const requireTenantScope = (value: unknown): WebhookApiKeyTenantScope => {
  if (typeof value !== "string" || !knownTenantScopes.has(value)) {
    throw new Error(
      "API key detail loader requires 'scope' to be a tenant platform scope (enterprise, organization, or individual).",
    );
  }
  return value as WebhookApiKeyTenantScope;
};

const decodeRawInput = (
  raw: AdminApiKeyDetailRawInput | undefined,
): AdminApiKeyDetailInput => {
  const safe = raw ?? {};
  return {
    keyId: requireString(safe.keyId, "keyId"),
    scope: requireTenantScope(safe.scope),
    scopeId: requireString(safe.scopeId, "scopeId"),
  };
};

const loadAdminApiKeyDetailData = async (
  request: Request,
  environment: unknown,
  raw: AdminApiKeyDetailRawInput | undefined,
): Promise<AdminApiKeyDetailRouteData> => {
  const { loadAdminApiKeyDetailRouteDataFromRequest } =
    await import("./api-key-detail-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminApiKeyDetailRouteDataFromRequest(request, environment, decoded),
  );
};

export const getAdminApiKeyDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminApiKeyDetailRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminApiKeyDetailRawInput | undefined;
    }) => loadAdminApiKeyDetailData(context.request, process.env, data),
  );
