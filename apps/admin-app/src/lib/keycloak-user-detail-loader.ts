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
          data: next,
        }) as Promise<AdminKeycloakUserDetailRouteData>,
    ),
): Promise<AdminKeycloakUserDetailRouteData> => loadRouteData(input);
