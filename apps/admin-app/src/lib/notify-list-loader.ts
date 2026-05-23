import type {
  AdminNotifyListInput,
  AdminNotifyListRouteData,
} from "./notify-list-route-data";

/**
 * Loader for the spec-canonical `/r/notify` Notification Center
 * v2 list route (admin-app implementation plan §8.16 + §11 —
 * Phase 6 vendor + workflow operator screens commit 6b).
 * Consumes the route-server entrypoint so the loader stays free
 * of Request/Response or Valkey shaping. Mirrors the v2
 * loader-trio shape used by `/r/vendors`, `/r/webhook`,
 * `/r/retention`, and `/r/support`.
 */
export const loadAdminNotifyListLoaderData = async (
  input: AdminNotifyListInput,
  loadRouteData: (
    next: AdminNotifyListInput,
  ) => Promise<AdminNotifyListRouteData> = (next) =>
    import("./notify-list-route-server").then(
      ({ getAdminNotifyListData }) =>
        getAdminNotifyListData({
          data: {
            ...next.filters,
            pageSize: next.pageSize,
            ...(next.pageToken === undefined
              ? {}
              : { pageToken: next.pageToken }),
          },
        }) as Promise<AdminNotifyListRouteData>,
    ),
): Promise<AdminNotifyListRouteData> => loadRouteData(input);
