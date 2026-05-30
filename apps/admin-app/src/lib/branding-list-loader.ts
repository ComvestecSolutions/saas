import type {
  AdminBrandingListInput,
  AdminBrandingListRouteData,
} from "./branding-list-route-data";

/**
 * Loader for the `/desk/branding` Branding & Domains v2 route
 * (admin-app implementation plan §8.10 + §11 — Phase 4 Domain
 * operator screens commit 2). Consumes the route-server
 * entrypoint so the loader stays free of Request/Response or
 * Valkey shaping. Mirrors the v2 loader-trio shape used by
 * `/desk/billing`, `/desk/invoice/$invoiceId`, and `/desk/meter/$meterId`.
 */
export const loadAdminBrandingListLoaderData = async (
  input: AdminBrandingListInput,
  loadRouteData: (
    next: AdminBrandingListInput,
  ) => Promise<AdminBrandingListRouteData> = (next) =>
    import("./branding-list-route-server").then(
      ({ getAdminBrandingListData }) =>
        getAdminBrandingListData({
          data: next,
        }) as Promise<AdminBrandingListRouteData>,
    ),
): Promise<AdminBrandingListRouteData> => loadRouteData(input);
