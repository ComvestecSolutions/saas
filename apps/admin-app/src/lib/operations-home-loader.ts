import type { AdminTenantRepairRouteData } from "./tenant-repair-route-data";

/**
 * Loader for the Operations Home route (`/`).
 *
 * Reuses the existing tenant-repair route data shape: the summary is shown as
 * posture cards and the `jobs` field is ignored at this route level (repair
 * workflow lives at `/repair-operations`).
 */
export const loadAdminOperationsHomeLoaderData = async (
  loadRouteData: () => Promise<AdminTenantRepairRouteData> = () =>
    import("./tenant-repair-route-server").then(
      ({ getAdminTenantRepairData }) => getAdminTenantRepairData(),
    ),
): Promise<AdminTenantRepairRouteData> => loadRouteData();
