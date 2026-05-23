import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { platformScope, type PlatformScope } from "@comvestec/contracts";
import type {
  AdminBrandingListInput,
  AdminBrandingListRouteData,
  AdminBrandingListTenantTarget,
} from "./branding-list-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Server-function entrypoint for the `/r/branding` Branding &
 * Domains v2 surface (admin-app implementation plan §8.10 + §11
 * — Phase 4 Domain operator screens commit 2). Decodes the
 * loader input at the framework boundary and runs the
 * route-data Effect on the server. No Request/Response shaping
 * lives here — that belongs in platform HTTP adapters.
 */
export type AdminBrandingListRawInput = {
  readonly tenantTargets?: unknown;
  readonly selectedTenantId?: unknown;
};

const knownPlatformScopes = new Set<string>(Object.values(platformScope));

const isPlatformScope = (value: unknown): value is PlatformScope =>
  typeof value === "string" && knownPlatformScopes.has(value);

const decodeTenantTarget = (
  value: unknown,
): AdminBrandingListTenantTarget | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as { scope?: unknown; scopeId?: unknown };
  if (!isPlatformScope(candidate.scope)) return undefined;
  if (typeof candidate.scopeId !== "string" || candidate.scopeId.length === 0) {
    return undefined;
  }
  return { scope: candidate.scope, scopeId: candidate.scopeId };
};

const decodeTenantTargets = (
  value: unknown,
): readonly AdminBrandingListTenantTarget[] => {
  if (!Array.isArray(value)) return [];
  const decoded: AdminBrandingListTenantTarget[] = [];
  for (const entry of value) {
    const target = decodeTenantTarget(entry);
    if (target !== undefined) decoded.push(target);
  }
  return decoded;
};

const decodeOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const decodeRawInput = (
  raw: AdminBrandingListRawInput | undefined,
): AdminBrandingListInput => {
  const safe = raw ?? {};
  const tenantTargets = decodeTenantTargets(safe.tenantTargets);
  const selectedTenantId = decodeOptionalString(safe.selectedTenantId);
  return {
    tenantTargets,
    ...(selectedTenantId === undefined ? {} : { selectedTenantId }),
  };
};

const loadAdminBrandingListData = async (
  request: Request,
  environment: unknown,
  raw: AdminBrandingListRawInput | undefined,
): Promise<AdminBrandingListRouteData> => {
  const { loadAdminBrandingListRouteDataFromRequest } =
    await import("./branding-list-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminBrandingListRouteDataFromRequest(request, environment, decoded),
  );
};

export const getAdminBrandingListData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminBrandingListRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminBrandingListRawInput | undefined;
    }) => loadAdminBrandingListData(context.request, process.env, data),
  );
