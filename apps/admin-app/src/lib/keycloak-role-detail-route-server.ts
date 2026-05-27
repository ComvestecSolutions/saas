import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { platformScope, type PlatformScope } from "@comvestec/contracts";
import type {
  AdminKeycloakRoleDetailInput,
  AdminKeycloakRoleDetailRouteData,
} from "./keycloak-role-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

export type AdminKeycloakRoleDetailRawInput = {
  readonly roleId?: unknown;
  readonly tenantScope?: unknown;
  readonly tenantScopeId?: unknown;
};

const knownPlatformScopes = new Set<string>(Object.values(platformScope));

const isPlatformScope = (value: unknown): value is PlatformScope =>
  typeof value === "string" && knownPlatformScopes.has(value);

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Keycloak role detail loader requires '${label}'.`);
  }

  return value;
};

const decodeRawInput = (
  raw: AdminKeycloakRoleDetailRawInput | undefined,
): AdminKeycloakRoleDetailInput => {
  const safe = raw ?? {};
  const roleId = requireString(safe.roleId, "roleId");
  if (!isPlatformScope(safe.tenantScope)) {
    throw new Error(
      "Keycloak role detail loader requires a valid 'tenantScope'.",
    );
  }
  const tenantScopeId = requireString(safe.tenantScopeId, "tenantScopeId");

  return {
    roleId,
    tenant: {
      scope: safe.tenantScope,
      scopeId: tenantScopeId,
    },
  };
};

const loadAdminKeycloakRoleDetailData = async (
  request: Request,
  environment: unknown,
  raw: AdminKeycloakRoleDetailRawInput | undefined,
): Promise<AdminKeycloakRoleDetailRouteData> => {
  const { loadAdminKeycloakRoleDetailRouteDataFromRequest } =
    await import("./keycloak-role-detail-route-data");
  const decoded = decodeRawInput(raw);

  return Effect.runPromise(
    loadAdminKeycloakRoleDetailRouteDataFromRequest(
      request,
      environment,
      decoded,
    ),
  );
};

export const getAdminKeycloakRoleDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminKeycloakRoleDetailRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminKeycloakRoleDetailRawInput | undefined;
    }) => loadAdminKeycloakRoleDetailData(context.request, process.env, data),
  );
