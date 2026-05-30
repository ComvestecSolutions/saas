import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { PlatformScopeSchema } from "@comvestec/contracts";
import type {
  AdminKeycloakRoleDetailInput,
  AdminKeycloakRoleDetailRouteData,
} from "./keycloak-role-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSyncBoundary } from "./effect-boundary";

const AdminKeycloakRoleDetailInputSchema = Schema.Struct({
  roleId: Schema.NonEmptyString,
  tenant: Schema.Struct({
    scope: PlatformScopeSchema,
    scopeId: Schema.NonEmptyString,
  }),
});

const loadAdminKeycloakRoleDetailData = async (
  request: Request,
  environment: unknown,
  input: AdminKeycloakRoleDetailInput,
): Promise<AdminKeycloakRoleDetailRouteData> => {
  const { loadAdminKeycloakRoleDetailRouteDataFromRequest } =
    await import("./keycloak-role-detail-route-data");

  return Effect.runPromise(
    loadAdminKeycloakRoleDetailRouteDataFromRequest(
      request,
      environment,
      input,
    ),
  );
};

export const getAdminKeycloakRoleDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(AdminKeycloakRoleDetailInputSchema))
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminKeycloakRoleDetailInput;
    }) => loadAdminKeycloakRoleDetailData(context.request, process.env, data),
  );
