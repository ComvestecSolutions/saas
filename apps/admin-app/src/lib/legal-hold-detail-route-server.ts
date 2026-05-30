import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { platformScope, type PlatformScope } from "@comvestec/contracts";
import type {
  AdminLegalHoldDetailInput,
  AdminLegalHoldDetailRouteData,
} from "./legal-hold-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Server-function entrypoint for `/desk/legal-hold/$holdId`
 * (admin-app implementation plan §8.11 + §11 — Phase 5 commit
 * 2). Decodes the loader input at the framework boundary and
 * runs the route-data Effect on the server. No
 * Request/Response shaping lives here.
 */
export type AdminLegalHoldDetailRawInput = {
  readonly holdId?: unknown;
  readonly scope?: unknown;
  readonly scopeId?: unknown;
};

const knownPlatformScopes = new Set<string>(Object.values(platformScope));

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Legal hold detail loader requires '${label}'.`);
  }
  return value;
};

const requirePlatformScope = (value: unknown): PlatformScope => {
  if (typeof value !== "string" || !knownPlatformScopes.has(value)) {
    throw new Error(
      "Legal hold detail loader requires a known 'scope' platform scope.",
    );
  }
  return value as PlatformScope;
};

const decodeRawInput = (
  raw: AdminLegalHoldDetailRawInput | undefined,
): AdminLegalHoldDetailInput => {
  const safe = raw ?? {};
  return {
    holdId: requireString(safe.holdId, "holdId"),
    scope: requirePlatformScope(safe.scope),
    scopeId: requireString(safe.scopeId, "scopeId"),
  };
};

const loadAdminLegalHoldDetailData = async (
  request: Request,
  environment: unknown,
  raw: AdminLegalHoldDetailRawInput | undefined,
): Promise<AdminLegalHoldDetailRouteData> => {
  const { loadAdminLegalHoldDetailRouteDataFromRequest } =
    await import("./legal-hold-detail-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminLegalHoldDetailRouteDataFromRequest(request, environment, decoded),
  );
};

export const getAdminLegalHoldDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminLegalHoldDetailRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminLegalHoldDetailRawInput | undefined;
    }) => loadAdminLegalHoldDetailData(context.request, process.env, data),
  );
