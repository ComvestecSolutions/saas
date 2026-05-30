import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  platformScope,
  type OpenMeterUsageQueryGranularity,
  type PlatformScope,
} from "@comvestec/contracts";
import type {
  AdminMeterDetailInput,
  AdminMeterDetailRouteData,
  AdminMeterDetailWindow,
} from "./meter-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Server-function entrypoint for `/desk/meter/$meterId` (admin-app
 * implementation plan §8.10 + §11 — Phase 4 Domain operator
 * screens commit 1). Decodes the loader input at the framework
 * boundary and runs the route-data Effect on the server. No
 * Request/Response shaping here.
 */
export type AdminMeterDetailRawInput = {
  readonly meterSlug?: unknown;
  readonly tenantScope?: unknown;
  readonly tenantScopeId?: unknown;
  readonly subject?: unknown;
  readonly granularity?: unknown;
  readonly windowFrom?: unknown;
  readonly windowTo?: unknown;
};

const knownPlatformScopes = new Set<string>(Object.values(platformScope));
const knownGranularities = new Set<string>(["MINUTE", "HOUR", "DAY", "MONTH"]);

const isPlatformScope = (value: unknown): value is PlatformScope =>
  typeof value === "string" && knownPlatformScopes.has(value);

const isGranularity = (
  value: unknown,
): value is OpenMeterUsageQueryGranularity =>
  typeof value === "string" && knownGranularities.has(value);

const decodeOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const decodeWindow = (
  rawFrom: unknown,
  rawTo: unknown,
): AdminMeterDetailWindow | undefined => {
  const from = decodeOptionalString(rawFrom);
  const to = decodeOptionalString(rawTo);
  if (from === undefined || to === undefined) return undefined;
  return { from, to };
};

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Meter detail loader requires '${label}'.`);
  }
  return value;
};

const decodeRawInput = (
  raw: AdminMeterDetailRawInput | undefined,
): AdminMeterDetailInput => {
  const safe = raw ?? {};
  const meterSlug = requireString(safe.meterSlug, "meterSlug");
  if (!isPlatformScope(safe.tenantScope)) {
    throw new Error("Meter detail loader requires a valid 'tenantScope'.");
  }
  const tenantScopeId = requireString(safe.tenantScopeId, "tenantScopeId");
  const subject = decodeOptionalString(safe.subject);
  const granularity = isGranularity(safe.granularity)
    ? safe.granularity
    : undefined;
  const window = decodeWindow(safe.windowFrom, safe.windowTo);
  return {
    meterSlug,
    tenant: { scope: safe.tenantScope, scopeId: tenantScopeId },
    ...(subject === undefined ? {} : { subject }),
    ...(granularity === undefined ? {} : { granularity }),
    ...(window === undefined ? {} : { window }),
  };
};

const loadAdminMeterDetailData = async (
  request: Request,
  environment: unknown,
  raw: AdminMeterDetailRawInput | undefined,
): Promise<AdminMeterDetailRouteData> => {
  const { loadAdminMeterDetailRouteDataFromRequest } =
    await import("./meter-detail-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminMeterDetailRouteDataFromRequest(request, environment, decoded),
  );
};

export const getAdminMeterDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminMeterDetailRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminMeterDetailRawInput | undefined;
    }) => loadAdminMeterDetailData(context.request, process.env, data),
  );
