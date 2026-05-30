import type {
  AdminBillingListInput,
  AdminBillingListRouteData,
} from "./billing-list-route-data";

/**
 * Loader for the `/desk/billing` Billing Operations v2 route
 * (admin-app implementation plan §8.10 + §11 — Phase 4 Domain
 * operator screens commit 1). Consumes the route-server
 * entrypoint so the loader stays free of Request/Response or
 * Valkey shaping. Mirrors the v2 loader-trio shape used by
 * `/desk/config`, `/desk/flag`, `/desk/access`, and `/desk/tenants`.
 */
export const loadAdminBillingListLoaderData = async (
  input: AdminBillingListInput,
  loadRouteData: (
    next: AdminBillingListInput,
  ) => Promise<AdminBillingListRouteData> = (next) =>
    import("./billing-list-route-server").then(
      ({ getAdminBillingListData }) =>
        getAdminBillingListData({
          data: next,
        }) as Promise<AdminBillingListRouteData>,
    ),
): Promise<AdminBillingListRouteData> => loadRouteData(input);
