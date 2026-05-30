import type { AdminAuditLogV2RouteData } from "./audit-log-v2-route-data";
import type { AdminAuditLogV2RawSearch } from "./audit-log-v2-search";

/**
 * Loader for the `/desk/audit` route (admin-app implementation
 * plan §9 — Phase 2 Desk Core commit 6). Consumes the
 * route-server entrypoint so the loader stays free of
 * Request/Response or Valkey shaping. Mirrors the `/desk/tenants`
 * and `/desk/tenant/$tenantId` v2 loader trio.
 */
export const loadAdminAuditLogV2LoaderData = async (
  rawSearch: AdminAuditLogV2RawSearch,
  loadRouteData: (
    rawSearch: AdminAuditLogV2RawSearch,
  ) => Promise<AdminAuditLogV2RouteData> = (input) =>
    import("./audit-log-v2-route-server").then(
      ({ getAdminAuditLogV2Data }) =>
        getAdminAuditLogV2Data({
          data: input,
        }) as Promise<AdminAuditLogV2RouteData>,
    ),
): Promise<AdminAuditLogV2RouteData> => loadRouteData(rawSearch);
