import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { platformScope, type PlatformScope } from "@comvestec/contracts";
import type {
  AdminDomainDetailInput,
  AdminDomainDetailRouteData,
} from "./domain-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Server-function entrypoint for `/desk/domain/$hostname`
 * (admin-app implementation plan §8.10 + §11 — Phase 4 Domain
 * operator screens commit 2). Decodes the loader input at the
 * framework boundary and runs the route-data Effect on the
 * server. No Request/Response shaping lives here.
 */
export type AdminDomainDetailRawInput = {
  readonly hostname?: unknown;
  readonly tenantScope?: unknown;
  readonly tenantScopeId?: unknown;
};

const knownPlatformScopes = new Set<string>(Object.values(platformScope));

const isPlatformScope = (value: unknown): value is PlatformScope =>
  typeof value === "string" && knownPlatformScopes.has(value);

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Domain detail loader requires '${label}'.`);
  }
  return value;
};

const decodeRawInput = (
  raw: AdminDomainDetailRawInput | undefined,
): AdminDomainDetailInput => {
  const safe = raw ?? {};
  const hostname = requireString(safe.hostname, "hostname");
  if (!isPlatformScope(safe.tenantScope)) {
    throw new Error("Domain detail loader requires a valid 'tenantScope'.");
  }
  const tenantScopeId = requireString(safe.tenantScopeId, "tenantScopeId");
  return {
    hostname,
    tenant: { scope: safe.tenantScope, scopeId: tenantScopeId },
  };
};

const loadAdminDomainDetailData = async (
  request: Request,
  environment: unknown,
  raw: AdminDomainDetailRawInput | undefined,
): Promise<AdminDomainDetailRouteData> => {
  const { loadAdminDomainDetailRouteDataFromRequest } =
    await import("./domain-detail-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminDomainDetailRouteDataFromRequest(request, environment, decoded),
  );
};

export const getAdminDomainDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminDomainDetailRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminDomainDetailRawInput | undefined;
    }) => loadAdminDomainDetailData(context.request, process.env, data),
  );
