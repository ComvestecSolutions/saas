import type { AdminTenantWorkspaceIndexRouteData } from "./tenant-workspace-index-route-data";

export const loadAdminTenantWorkspaceIndexLoaderData =
  async (): Promise<AdminTenantWorkspaceIndexRouteData> =>
    import("./tenant-workspace-index-server").then(
      ({ getAdminTenantWorkspaceIndexData }) =>
        getAdminTenantWorkspaceIndexData(),
    );
