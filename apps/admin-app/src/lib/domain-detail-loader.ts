import type {
  AdminDomainDetailInput,
  AdminDomainDetailRouteData,
} from "./domain-detail-route-data";

/**
 * Loader for `/r/domain/$hostname` (admin-app implementation
 * plan §8.10 + §11 — Phase 4 Domain operator screens commit 2).
 * Consumes the route-server entrypoint so the loader stays free
 * of Request/Response or Valkey shaping. Mirrors the v2
 * loader-trio shape used by `/r/billing`, `/r/invoice`, and
 * `/r/meter`.
 */
export const loadAdminDomainDetailLoaderData = async (
  input: AdminDomainDetailInput,
  loadRouteData: (
    next: AdminDomainDetailInput,
  ) => Promise<AdminDomainDetailRouteData> = (next) =>
    import("./domain-detail-route-server").then(
      ({ getAdminDomainDetailData }) =>
        getAdminDomainDetailData({
          data: next,
        }) as Promise<AdminDomainDetailRouteData>,
    ),
): Promise<AdminDomainDetailRouteData> => loadRouteData(input);
