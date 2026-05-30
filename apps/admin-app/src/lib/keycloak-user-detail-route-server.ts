import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { PlatformScopeSchema } from "@comvestec/contracts";
import type {
  AdminKeycloakUserDetailInput,
  AdminKeycloakUserDetailRouteData,
} from "./keycloak-user-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSyncBoundary } from "./effect-boundary";

const AdminKeycloakUserDetailInputSchema = Schema.Struct({
  userId: Schema.NonEmptyString,
  tenant: Schema.Struct({
    scope: PlatformScopeSchema,
    scopeId: Schema.NonEmptyString,
  }),
});

const loadAdminKeycloakUserDetailData = async (
  request: Request,
  environment: unknown,
  input: AdminKeycloakUserDetailInput,
): Promise<AdminKeycloakUserDetailRouteData> => {
  const { loadAdminKeycloakUserDetailRouteDataFromRequest } =
    await import("./keycloak-user-detail-route-data");
  return Effect.runPromise(
    loadAdminKeycloakUserDetailRouteDataFromRequest(
      request,
      environment,
      input,
    ),
  );
};

export const getAdminKeycloakUserDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(AdminKeycloakUserDetailInputSchema))
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminKeycloakUserDetailInput;
    }) => loadAdminKeycloakUserDetailData(context.request, process.env, data),
  );
