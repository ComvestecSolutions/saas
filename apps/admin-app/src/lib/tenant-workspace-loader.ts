import type { AdminTenantWorkspaceRouteData } from "./tenant-workspace-route-data";

export const loadAdminTenantWorkspaceLoaderData = async (
  tenantId: string,
  loadRouteData: (id: string) => Promise<AdminTenantWorkspaceRouteData> = (
    id,
  ) =>
    import("./tenant-workspace-route-server").then(
      ({ getAdminTenantWorkspaceData }) =>
        getAdminTenantWorkspaceData({ data: { tenantId: id } }),
    ),
): Promise<AdminTenantWorkspaceRouteData> => loadRouteData(tenantId);
