import type {
  AdminNotifyDetailInput,
  AdminNotifyDetailRouteData,
} from "./notify-detail-route-data";

/**
 * Loader for the spec-canonical `/desk/notify/$id` Notification
 * Center v2 detail route (admin-app implementation plan §8.16 +
 * §11 — Phase 6 vendor + workflow operator screens commit 6c).
 * Consumes the route-server entrypoint so the loader stays free
 * of Request/Response or Valkey shaping. Mirrors the v2
 * loader-trio shape used by `/desk/run/$id`,
 * `/desk/incident/$incidentId`, `/desk/legal-hold/$holdId`,
 * `/desk/delivery/$deliveryId`, and `/desk/api-key/$keyId`.
 */
export const loadAdminNotifyDetailLoaderData = async (
  input: AdminNotifyDetailInput,
  loadRouteData: (
    next: AdminNotifyDetailInput,
  ) => Promise<AdminNotifyDetailRouteData> = (next) =>
    import("./notify-detail-route-server").then(
      ({ getAdminNotifyDetailData }) =>
        getAdminNotifyDetailData({
          data: next,
        }) as Promise<AdminNotifyDetailRouteData>,
    ),
): Promise<AdminNotifyDetailRouteData> => loadRouteData(input);
