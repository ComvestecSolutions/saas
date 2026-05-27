import type {
  AdminKeycloakUserDetailInput,
  AdminKeycloakUserDetailRouteData,
} from "./keycloak-user-detail-route-data";

export const loadAdminKeycloakUserDetailLoaderData = async (
  input: AdminKeycloakUserDetailInput,
  loadRouteData: (
    next: AdminKeycloakUserDetailInput,
  ) => Promise<AdminKeycloakUserDetailRouteData> = (next) =>
    import("./keycloak-user-detail-route-server").then(
      ({ getAdminKeycloakUserDetailData }) =>
        getAdminKeycloakUserDetailData({
          data: {
            userId: next.userId,
            tenantScope: next.tenant.scope,
            tenantScopeId: next.tenant.scopeId,
          },
        }) as Promise<AdminKeycloakUserDetailRouteData>,
    ),
): Promise<AdminKeycloakUserDetailRouteData> => loadRouteData(input);
