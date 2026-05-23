import type {
  AdminGovernanceAccessV2Input,
  AdminGovernanceAccessV2RouteData,
} from "./governance-access-route-data";

/**
 * Loader for the `/r/access` Access Control v2 route
 * (admin-app implementation plan §8.7 + §11 — Phase 3
 * Governance & access commit 1). Consumes the route-server
 * entrypoint so the loader stays free of Request/Response or
 * Valkey shaping. Mirrors the `/r/config` and `/r/flag` v2
 * loader trios.
 */
export const loadAdminGovernanceAccessV2LoaderData = async (
  input: AdminGovernanceAccessV2Input,
  loadRouteData: (
    input: AdminGovernanceAccessV2Input,
  ) => Promise<AdminGovernanceAccessV2RouteData> = (next) =>
    import("./governance-access-route-server").then(
      ({ getAdminGovernanceAccessV2Data }) =>
        getAdminGovernanceAccessV2Data({
          data: next,
        }) as Promise<AdminGovernanceAccessV2RouteData>,
    ),
): Promise<AdminGovernanceAccessV2RouteData> => loadRouteData(input);
