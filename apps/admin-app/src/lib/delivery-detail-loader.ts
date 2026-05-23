import type {
  AdminDeliveryDetailInput,
  AdminDeliveryDetailRouteData,
} from "./delivery-detail-route-data";

/**
 * Loader for the spec-canonical `/r/delivery/$deliveryId`
 * Webhook Delivery Detail v2 route (admin-app implementation
 * plan §8.12 + §11 — Phase 5 Support / compliance /
 * integrations operator screens commit 3). Consumes the
 * route-server entrypoint so the loader stays free of
 * Request/Response or Valkey shaping. Mirrors the v2 loader-trio
 * shape used by `/r/invoice`, `/r/meter`, `/r/domain`,
 * `/r/incident`, and `/r/legal-hold`.
 */
export const loadAdminDeliveryDetailLoaderData = async (
  input: AdminDeliveryDetailInput,
  loadRouteData: (
    next: AdminDeliveryDetailInput,
  ) => Promise<AdminDeliveryDetailRouteData> = (next) =>
    import("./delivery-detail-route-server").then(
      ({ getAdminDeliveryDetailData }) =>
        getAdminDeliveryDetailData({
          data: next,
        }) as Promise<AdminDeliveryDetailRouteData>,
    ),
): Promise<AdminDeliveryDetailRouteData> => loadRouteData(input);
