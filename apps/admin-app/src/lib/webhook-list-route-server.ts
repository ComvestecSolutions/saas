import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { platformScope, type PlatformScope } from "@comvestec/contracts";
import type {
  AdminWebhookListInput,
  AdminWebhookListRouteData,
} from "./webhook-list-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Server-function entrypoint for the spec-canonical `/r/webhook`
 * Webhook Endpoints v2 surface (admin-app implementation plan
 * §8.12 + §11 — Phase 5 commit 3). Decodes the loader input at
 * the framework boundary and runs the route-data Effect on the
 * server. No Request/Response shaping lives here — that belongs
 * in platform HTTP adapters.
 */
export type AdminWebhookListRawInput = {
  readonly scope?: unknown;
  readonly scopeId?: unknown;
  readonly selectedDeliveryId?: unknown;
};

const knownPlatformScopes = new Set<string>(Object.values(platformScope));

const decodePlatformScope = (value: unknown): PlatformScope | undefined =>
  typeof value === "string" && knownPlatformScopes.has(value)
    ? (value as PlatformScope)
    : undefined;

const decodeOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const decodeRawInput = (
  raw: AdminWebhookListRawInput | undefined,
): AdminWebhookListInput => {
  const safe = raw ?? {};
  const scope = decodePlatformScope(safe.scope);
  const scopeId = decodeOptionalString(safe.scopeId);
  const selectedDeliveryId = decodeOptionalString(safe.selectedDeliveryId);
  return {
    ...(scope === undefined ? {} : { scope }),
    ...(scopeId === undefined ? {} : { scopeId }),
    ...(selectedDeliveryId === undefined ? {} : { selectedDeliveryId }),
  };
};

const loadAdminWebhookListData = async (
  request: Request,
  environment: unknown,
  raw: AdminWebhookListRawInput | undefined,
): Promise<AdminWebhookListRouteData> => {
  const { loadAdminWebhookListRouteDataFromRequest } =
    await import("./webhook-list-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminWebhookListRouteDataFromRequest(request, environment, decoded),
  );
};

export const getAdminWebhookListData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminWebhookListRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminWebhookListRawInput | undefined;
    }) => loadAdminWebhookListData(context.request, process.env, data),
  );
