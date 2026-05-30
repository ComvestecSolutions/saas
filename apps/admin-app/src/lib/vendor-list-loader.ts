import type {
  AdminVendorListInput,
  AdminVendorListRouteData,
} from "./vendor-list-route-data";

/**
 * Loader for the spec-canonical `/desk/vendors` Vendor Health v2
 * list route (admin-app implementation plan §8.15 + §11 —
 * Phase 6 vendor + workflow operator screens commit 6a).
 * Consumes the route-server entrypoint so the loader stays
 * free of Request/Response or Valkey shaping. Mirrors the v2
 * loader-trio shape used by `/desk/billing`, `/desk/branding`,
 * `/desk/support`, `/desk/retention`, and `/desk/webhook`.
 */
export const loadAdminVendorListLoaderData = async (
  input: AdminVendorListInput,
  loadRouteData: (
    next: AdminVendorListInput,
  ) => Promise<AdminVendorListRouteData> = (next) =>
    import("./vendor-list-route-server").then(
      ({ getAdminVendorListData }) =>
        getAdminVendorListData({
          data: next,
        }) as Promise<AdminVendorListRouteData>,
    ),
): Promise<AdminVendorListRouteData> => loadRouteData(input);
