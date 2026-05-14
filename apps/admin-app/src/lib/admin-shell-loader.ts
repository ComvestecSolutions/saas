import type { AdminShellRouteData } from "./admin-shell-route-data";

export const loadAdminShellLoaderData = async (
  loadRouteData: () => Promise<AdminShellRouteData> = () =>
    import("./admin-shell-route-server").then(({ getAdminShellData }) =>
      getAdminShellData(),
    ),
): Promise<AdminShellRouteData> => loadRouteData();
