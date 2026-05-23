import type { AdminTenantsDirectoryRouteData } from "./tenants-directory-route-data";

/**
 * Loader for the `/r/tenants` directory route. Consumes the
 * route-server entrypoint so the loader stays free of Request,
 * Response, or Valkey shaping. Mirrors the Capability snapshot
 * v2 + Tenant workspace v2 loader trio pattern.
 */
export const loadAdminTenantsDirectoryLoaderData = async (
  loadRouteData: () => Promise<AdminTenantsDirectoryRouteData> = () =>
    import("./tenants-directory-route-server").then(
      ({ getAdminTenantsDirectoryData }) => getAdminTenantsDirectoryData(),
    ),
): Promise<AdminTenantsDirectoryRouteData> => loadRouteData();
