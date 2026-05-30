import type {
  AdminProfileInput,
  AdminProfileRouteData,
} from "./admin-profile-route-data";

/**
 * Loader for the spec-canonical `/admin/profile` admin-org
 * operator profile surface (admin-app implementation plan
 * §11 — Phase 7 admin-org screens commit 7b-1). Consumes the
 * route-server entrypoint so the loader stays free of
 * Request/Response or Valkey shaping. Mirrors the v2
 * loader-trio shape used by `/desk/notify/$id`,
 * `/desk/api-key/$keyId`, and `/desk/run/$id`.
 */
export const loadAdminProfileLoaderData = async (
  input: AdminProfileInput,
  loadRouteData: (next: AdminProfileInput) => Promise<AdminProfileRouteData> = (
    next,
  ) =>
    import("./admin-profile-route-server").then(
      ({ getAdminProfileData }) =>
        getAdminProfileData({ data: next }) as Promise<AdminProfileRouteData>,
    ),
): Promise<AdminProfileRouteData> => loadRouteData(input);
