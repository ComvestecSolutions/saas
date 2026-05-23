import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { platformScope, type PlatformScope } from "@comvestec/contracts";
import type {
  AdminDeliveryDetailInput,
  AdminDeliveryDetailRouteData,
} from "./delivery-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Server-function entrypoint for `/r/delivery/$deliveryId`
 * (admin-app implementation plan §8.12 + §11 — Phase 5 commit
 * 3). Decodes the loader input at the framework boundary and
 * runs the route-data Effect on the server. No
 * Request/Response shaping lives here.
 */
export type AdminDeliveryDetailRawInput = {
  readonly deliveryId?: unknown;
  readonly scope?: unknown;
  readonly scopeId?: unknown;
};

const knownPlatformScopes = new Set<string>(Object.values(platformScope));

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Delivery detail loader requires '${label}'.`);
  }
  return value;
};

const decodePlatformScope = (value: unknown): PlatformScope | undefined =>
  typeof value === "string" && knownPlatformScopes.has(value)
    ? (value as PlatformScope)
    : undefined;

const decodeOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const decodeRawInput = (
  raw: AdminDeliveryDetailRawInput | undefined,
): AdminDeliveryDetailInput => {
  const safe = raw ?? {};
  const deliveryId = requireString(safe.deliveryId, "deliveryId");
  const scope = decodePlatformScope(safe.scope);
  const scopeId = decodeOptionalString(safe.scopeId);
  return {
    deliveryId,
    ...(scope === undefined ? {} : { scope }),
    ...(scopeId === undefined ? {} : { scopeId }),
  };
};

const loadAdminDeliveryDetailData = async (
  request: Request,
  environment: unknown,
  raw: AdminDeliveryDetailRawInput | undefined,
): Promise<AdminDeliveryDetailRouteData> => {
  const { loadAdminDeliveryDetailRouteDataFromRequest } =
    await import("./delivery-detail-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminDeliveryDetailRouteDataFromRequest(request, environment, decoded),
  );
};

export const getAdminDeliveryDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminDeliveryDetailRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminDeliveryDetailRawInput | undefined;
    }) => loadAdminDeliveryDetailData(context.request, process.env, data),
  );
