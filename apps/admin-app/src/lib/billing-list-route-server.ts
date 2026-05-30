import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { platformScope, type PlatformScope } from "@comvestec/contracts";
import type {
  AdminBillingListInput,
  AdminBillingListRouteData,
  AdminBillingListTenantTarget,
} from "./billing-list-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Server-function entrypoint for the `/desk/billing` Billing
 * Operations v2 surface (admin-app implementation plan §8.10 +
 * §11 — Phase 4 Domain operator screens commit 1). Decodes the
 * loader input at the framework boundary and runs the
 * route-data Effect on the server. No Request/Response shaping
 * here — that belongs in platform HTTP adapters.
 */
export type AdminBillingListRawInput = {
  readonly tenantTargets?: unknown;
  readonly selectedTenantId?: unknown;
};

const knownPlatformScopes = new Set<string>(Object.values(platformScope));

const isPlatformScope = (value: unknown): value is PlatformScope =>
  typeof value === "string" && knownPlatformScopes.has(value);

const decodeTenantTarget = (
  value: unknown,
): AdminBillingListTenantTarget | undefined => {
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
): readonly AdminBillingListTenantTarget[] => {
  if (!Array.isArray(value)) return [];
  const decoded: AdminBillingListTenantTarget[] = [];
  for (const entry of value) {
    const target = decodeTenantTarget(entry);
    if (target !== undefined) decoded.push(target);
  }
  return decoded;
};

const decodeOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const decodeRawInput = (
  raw: AdminBillingListRawInput | undefined,
): AdminBillingListInput => {
  const safe = raw ?? {};
  const tenantTargets = decodeTenantTargets(safe.tenantTargets);
  const selectedTenantId = decodeOptionalString(safe.selectedTenantId);
  return {
    tenantTargets,
    ...(selectedTenantId === undefined ? {} : { selectedTenantId }),
  };
};

const loadAdminBillingListData = async (
  request: Request,
  environment: unknown,
  raw: AdminBillingListRawInput | undefined,
): Promise<AdminBillingListRouteData> => {
  const { loadAdminBillingListRouteDataFromRequest } =
    await import("./billing-list-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminBillingListRouteDataFromRequest(request, environment, decoded),
  );
};

export const getAdminBillingListData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminBillingListRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminBillingListRawInput | undefined;
    }) => loadAdminBillingListData(context.request, process.env, data),
  );
