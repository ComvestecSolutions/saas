import type {
  AdminGovernanceFlagV2Input,
  AdminGovernanceFlagV2RouteData,
} from "./governance-flag-route-data";

/**
 * Loader for the `/desk/flag` Feature Flags v2 route (admin-app
 * implementation plan §8.6 + §11 — Phase 3 Governance &
 * access commit 1). Consumes the route-server entrypoint so
 * the loader stays free of Request/Response or Valkey
 * shaping. Mirrors the `/desk/config` and other v2 loader trios.
 */
export const loadAdminGovernanceFlagV2LoaderData = async (
  input: AdminGovernanceFlagV2Input,
  loadRouteData: (
    input: AdminGovernanceFlagV2Input,
  ) => Promise<AdminGovernanceFlagV2RouteData> = (next) =>
    import("./governance-flag-route-server").then(
      ({ getAdminGovernanceFlagV2Data }) =>
        getAdminGovernanceFlagV2Data({
          data: next,
        }) as Promise<AdminGovernanceFlagV2RouteData>,
    ),
): Promise<AdminGovernanceFlagV2RouteData> => loadRouteData(input);
