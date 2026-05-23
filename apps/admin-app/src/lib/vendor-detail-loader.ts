import type {
  AdminVendorDetailInput,
  AdminVendorDetailRouteData,
} from "./vendor-detail-route-data";

/**
 * Loader for the spec-canonical `/r/vendor/$service` Vendor
 * Detail v2 route (admin-app implementation plan §8.15 + §11 —
 * Phase 6 vendor + workflow operator screens commit 6a).
 * Consumes the route-server entrypoint so the loader stays
 * free of Request/Response or Valkey shaping. Mirrors the v2
 * loader-trio shape used by `/r/incident/$incidentId`,
 * `/r/legal-hold/$holdId`, `/r/delivery/$deliveryId`, and
 * `/r/api-key/$keyId`.
 */
export const loadAdminVendorDetailLoaderData = async (
  input: AdminVendorDetailInput,
  loadRouteData: (
    next: AdminVendorDetailInput,
  ) => Promise<AdminVendorDetailRouteData> = (next) =>
    import("./vendor-detail-route-server").then(
      ({ getAdminVendorDetailData }) =>
        getAdminVendorDetailData({
          data: next,
        }) as Promise<AdminVendorDetailRouteData>,
    ),
): Promise<AdminVendorDetailRouteData> => loadRouteData(input);
