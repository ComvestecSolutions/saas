import type {
  AdminGovernanceConfigV2Input,
  AdminGovernanceConfigV2RouteData,
} from "./governance-config-route-data";

/**
 * Loader for the `/desk/config` Runtime Config v2 route
 * (admin-app implementation plan §8.5 + §11 — Phase 3
 * Governance & access commit 1). Consumes the route-server
 * entrypoint so the loader stays free of Request/Response or
 * Valkey shaping. Mirrors the `/desk/tenants`,
 * `/desk/tenant/$tenantId`, `/desk/audit`, and omnibar v2 loader
 * trios.
 */
export const loadAdminGovernanceConfigV2LoaderData = async (
  input: AdminGovernanceConfigV2Input,
  loadRouteData: (
    input: AdminGovernanceConfigV2Input,
  ) => Promise<AdminGovernanceConfigV2RouteData> = (next) =>
    import("./governance-config-route-server").then(
      ({ getAdminGovernanceConfigV2Data }) =>
        getAdminGovernanceConfigV2Data({
          data: next,
        }) as Promise<AdminGovernanceConfigV2RouteData>,
    ),
): Promise<AdminGovernanceConfigV2RouteData> => loadRouteData(input);
