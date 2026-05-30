import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { platformScope, type PlatformScope } from "@comvestec/contracts";
import type {
  AdminInvoiceDetailInput,
  AdminInvoiceDetailRouteData,
} from "./invoice-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Server-function entrypoint for `/desk/invoice/$invoiceId`
 * (admin-app implementation plan §8.10 + §11 — Phase 4 Domain
 * operator screens commit 1). Decodes the loader input at the
 * framework boundary and runs the route-data Effect on the
 * server. No Request/Response shaping here.
 */
export type AdminInvoiceDetailRawInput = {
  readonly invoiceId?: unknown;
  readonly tenantScope?: unknown;
  readonly tenantScopeId?: unknown;
  readonly customerId?: unknown;
};

const knownPlatformScopes = new Set<string>(Object.values(platformScope));

const isPlatformScope = (value: unknown): value is PlatformScope =>
  typeof value === "string" && knownPlatformScopes.has(value);

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invoice detail loader requires '${label}'.`);
  }
  return value;
};

const decodeRawInput = (
  raw: AdminInvoiceDetailRawInput | undefined,
): AdminInvoiceDetailInput => {
  const safe = raw ?? {};
  const invoiceId = requireString(safe.invoiceId, "invoiceId");
  if (!isPlatformScope(safe.tenantScope)) {
    throw new Error("Invoice detail loader requires a valid 'tenantScope'.");
  }
  const tenantScopeId = requireString(safe.tenantScopeId, "tenantScopeId");
  const customerId = requireString(safe.customerId, "customerId");
  return {
    invoiceId,
    tenant: { scope: safe.tenantScope, scopeId: tenantScopeId },
    customerId,
  };
};

const loadAdminInvoiceDetailData = async (
  request: Request,
  environment: unknown,
  raw: AdminInvoiceDetailRawInput | undefined,
): Promise<AdminInvoiceDetailRouteData> => {
  const { loadAdminInvoiceDetailRouteDataFromRequest } =
    await import("./invoice-detail-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminInvoiceDetailRouteDataFromRequest(request, environment, decoded),
  );
};

export const getAdminInvoiceDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminInvoiceDetailRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminInvoiceDetailRawInput | undefined;
    }) => loadAdminInvoiceDetailData(context.request, process.env, data),
  );
