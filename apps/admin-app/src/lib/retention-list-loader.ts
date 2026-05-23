import type {
  AdminRetentionListInput,
  AdminRetentionListRouteData,
} from "./retention-list-route-data";

/**
 * Loader for the spec-canonical `/r/retention` Retention &
 * Legal-hold v2 route (admin-app implementation plan §8.11 +
 * §11 — Phase 5 Support / compliance / integrations operator
 * screens commit 2). Consumes the route-server entrypoint so
 * the loader stays free of Request/Response or Valkey shaping.
 * Mirrors the v2 loader-trio shape used by `/r/billing`,
 * `/r/branding`, and `/r/support`.
 */
export const loadAdminRetentionListLoaderData = async (
  input: AdminRetentionListInput,
  loadRouteData: (
    next: AdminRetentionListInput,
  ) => Promise<AdminRetentionListRouteData> = (next) =>
    import("./retention-list-route-server").then(
      ({ getAdminRetentionListData }) =>
        getAdminRetentionListData({
          data: next,
        }) as Promise<AdminRetentionListRouteData>,
    ),
): Promise<AdminRetentionListRouteData> => loadRouteData(input);
