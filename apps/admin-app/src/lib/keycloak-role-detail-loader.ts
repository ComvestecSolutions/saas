import type {
  AdminKeycloakRoleDetailInput,
  AdminKeycloakRoleDetailRouteData,
} from "./keycloak-role-detail-route-data";

export const loadAdminKeycloakRoleDetailLoaderData = async (
  input: AdminKeycloakRoleDetailInput,
  loadRouteData: (
    next: AdminKeycloakRoleDetailInput,
  ) => Promise<AdminKeycloakRoleDetailRouteData> = (next) =>
    import("./keycloak-role-detail-route-server").then(
      ({ getAdminKeycloakRoleDetailData }) =>
        getAdminKeycloakRoleDetailData({
          data: {
            roleId: next.roleId,
            tenantScope: next.tenant.scope,
            tenantScopeId: next.tenant.scopeId,
          },
        }) as Promise<AdminKeycloakRoleDetailRouteData>,
    ),
): Promise<AdminKeycloakRoleDetailRouteData> => loadRouteData(input);
