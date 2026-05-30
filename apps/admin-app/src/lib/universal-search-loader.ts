import type {
  AdminUniversalSearchInput,
  AdminUniversalSearchRouteData,
} from "./universal-search-route-data";
import { getAdminUniversalSearchData } from "./universal-search-route-server";

/**
 * Loader for the universal omnibar (admin-app implementation
 * plan §9 — Phase 2 Desk Core commit 7, item 11). Consumes
 * the route-server entrypoint so the loader stays free of
 * Request/Response or Valkey shaping. Mirrors the `/desk/tenants`,
 * `/desk/tenant/$tenantId`, and `/desk/audit` v2 loader trios.
 */
export const loadAdminUniversalSearchLoaderData = async (
  input: AdminUniversalSearchInput,
  loadRouteData: (
    input: AdminUniversalSearchInput,
  ) => Promise<AdminUniversalSearchRouteData> = (next) =>
    getAdminUniversalSearchData({
      data: next,
    }) as Promise<AdminUniversalSearchRouteData>,
): Promise<AdminUniversalSearchRouteData> => loadRouteData(input);
