import type {
  AdminMeterDetailInput,
  AdminMeterDetailRouteData,
} from "./meter-detail-route-data";

/**
 * Loader for `/r/meter/$meterId` (admin-app implementation
 * plan §8.10 + §11 — Phase 4 Domain operator screens commit 1).
 * Consumes the route-server entrypoint so the loader stays free
 * of Request/Response or Valkey shaping.
 */
export const loadAdminMeterDetailLoaderData = async (
  input: AdminMeterDetailInput,
  loadRouteData: (
    next: AdminMeterDetailInput,
  ) => Promise<AdminMeterDetailRouteData> = (next) =>
    import("./meter-detail-route-server").then(
      ({ getAdminMeterDetailData }) =>
        getAdminMeterDetailData({
          data: next,
        }) as Promise<AdminMeterDetailRouteData>,
    ),
): Promise<AdminMeterDetailRouteData> => loadRouteData(input);
