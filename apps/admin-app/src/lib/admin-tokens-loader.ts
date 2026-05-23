import type {
  AdminTokensInput,
  AdminTokensRouteData,
} from "./admin-tokens-route-data";

/**
 * Loader for the spec-canonical `/admin/tokens` admin-operator-
 * test-tokens roster surface (admin-app implementation plan §11
 * — Phase 7 commit 7b-2-tokens). Consumes the route-server
 * entrypoint so the loader stays free of Request/Response or
 * Valkey shaping. Mirrors the v2 loader-trio shape used across
 * the Phase 7b-1 / 7b-2-audit admin routes.
 */
export const loadAdminTokensLoaderData = async (
  input: AdminTokensInput,
  loadRouteData: (next: AdminTokensInput) => Promise<AdminTokensRouteData> = (
    next,
  ) =>
    import("./admin-tokens-route-server").then(
      ({ getAdminTokensData }) =>
        getAdminTokensData({ data: next }) as Promise<AdminTokensRouteData>,
    ),
): Promise<AdminTokensRouteData> => loadRouteData(input);
