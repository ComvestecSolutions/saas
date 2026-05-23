import type {
  AdminWorkspacesInput,
  AdminWorkspacesRouteData,
} from "./admin-workspaces-route-data";

/**
 * Loader for the spec-canonical `/admin/workspaces` admin-org
 * workspace tabs surface (admin-app implementation plan §11 —
 * Phase 7 commit 7b-1).
 */
export const loadAdminWorkspacesLoaderData = async (
  input: AdminWorkspacesInput,
  loadRouteData: (
    next: AdminWorkspacesInput,
  ) => Promise<AdminWorkspacesRouteData> = (next) =>
    import("./admin-workspaces-route-server").then(
      ({ getAdminWorkspacesData }) =>
        getAdminWorkspacesData({
          data: next,
        }) as Promise<AdminWorkspacesRouteData>,
    ),
): Promise<AdminWorkspacesRouteData> => loadRouteData(input);
