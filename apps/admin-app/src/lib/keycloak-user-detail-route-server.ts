import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { platformScope, type PlatformScope } from "@comvestec/contracts";
import type {
  AdminKeycloakUserDetailInput,
  AdminKeycloakUserDetailRouteData,
} from "./keycloak-user-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

export type AdminKeycloakUserDetailRawInput = {
  readonly userId?: unknown;
  readonly tenantScope?: unknown;
  readonly tenantScopeId?: unknown;
};

const knownPlatformScopes = new Set<string>(Object.values(platformScope));

const isPlatformScope = (value: unknown): value is PlatformScope =>
  typeof value === "string" && knownPlatformScopes.has(value);

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Keycloak user detail loader requires '${label}'.`);
  }
  return value;
};

const decodeRawInput = (
  raw: AdminKeycloakUserDetailRawInput | undefined,
): AdminKeycloakUserDetailInput => {
  const safe = raw ?? {};
  const userId = requireString(safe.userId, "userId");
  if (!isPlatformScope(safe.tenantScope)) {
    throw new Error(
      "Keycloak user detail loader requires a valid 'tenantScope'.",
    );
  }
  const tenantScopeId = requireString(safe.tenantScopeId, "tenantScopeId");

  return {
    userId,
    tenant: {
      scope: safe.tenantScope,
      scopeId: tenantScopeId,
    },
  };
};

const loadAdminKeycloakUserDetailData = async (
  request: Request,
  environment: unknown,
  raw: AdminKeycloakUserDetailRawInput | undefined,
): Promise<AdminKeycloakUserDetailRouteData> => {
  const { loadAdminKeycloakUserDetailRouteDataFromRequest } =
    await import("./keycloak-user-detail-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminKeycloakUserDetailRouteDataFromRequest(
      request,
      environment,
      decoded,
    ),
  );
};

export const getAdminKeycloakUserDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminKeycloakUserDetailRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminKeycloakUserDetailRawInput | undefined;
    }) => loadAdminKeycloakUserDetailData(context.request, process.env, data),
  );
