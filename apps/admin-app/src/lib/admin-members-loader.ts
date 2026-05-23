import type {
  AdminMembersInput,
  AdminMembersRouteData,
} from "./admin-members-route-data";

/**
 * Loader for the spec-canonical `/admin/members` admin-org
 * member roster (admin-app implementation plan §11 — Phase 7
 * commit 7b-1).
 */
export const loadAdminMembersLoaderData = async (
  input: AdminMembersInput,
  loadRouteData: (next: AdminMembersInput) => Promise<AdminMembersRouteData> = (
    next,
  ) =>
    import("./admin-members-route-server").then(
      ({ getAdminMembersData }) =>
        getAdminMembersData({ data: next }) as Promise<AdminMembersRouteData>,
    ),
): Promise<AdminMembersRouteData> => loadRouteData(input);
