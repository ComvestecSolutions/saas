import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { platformScope, type PlatformScope } from "@comvestec/contracts";
import type {
  AdminRetentionListInput,
  AdminRetentionListRouteData,
} from "./retention-list-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Server-function entrypoint for the spec-canonical
 * `/r/retention` Retention & Legal-hold v2 surface (admin-app
 * implementation plan §8.11 + §11 — Phase 5 commit 2). Decodes
 * the loader input at the framework boundary and runs the
 * route-data Effect on the server. No Request/Response shaping
 * lives here — that belongs in platform HTTP adapters.
 */
export type AdminRetentionListRawInput = {
  readonly scope?: unknown;
  readonly scopeId?: unknown;
  readonly selectedHoldId?: unknown;
};

const knownPlatformScopes = new Set<string>(Object.values(platformScope));

const decodePlatformScope = (value: unknown): PlatformScope | undefined =>
  typeof value === "string" && knownPlatformScopes.has(value)
    ? (value as PlatformScope)
    : undefined;

const decodeOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const decodeRawInput = (
  raw: AdminRetentionListRawInput | undefined,
): AdminRetentionListInput => {
  const safe = raw ?? {};
  const scope = decodePlatformScope(safe.scope);
  const scopeId = decodeOptionalString(safe.scopeId);
  const selectedHoldId = decodeOptionalString(safe.selectedHoldId);
  return {
    ...(scope === undefined ? {} : { scope }),
    ...(scopeId === undefined ? {} : { scopeId }),
    ...(selectedHoldId === undefined ? {} : { selectedHoldId }),
  };
};

const loadAdminRetentionListData = async (
  request: Request,
  environment: unknown,
  raw: AdminRetentionListRawInput | undefined,
): Promise<AdminRetentionListRouteData> => {
  const { loadAdminRetentionListRouteDataFromRequest } =
    await import("./retention-list-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminRetentionListRouteDataFromRequest(request, environment, decoded),
  );
};

export const getAdminRetentionListData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminRetentionListRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminRetentionListRawInput | undefined;
    }) => loadAdminRetentionListData(context.request, process.env, data),
  );
