import type {
  AdminAuditInput,
  AdminAuditRouteData,
} from "./admin-audit-route-data";

/**
 * Loader for the spec-canonical `/admin/audit` admin-org-scoped
 * audit feed surface (admin-app implementation plan §11 —
 * Phase 7 admin-org screens commit 7b-2-audit). Consumes the
 * route-server entrypoint so the loader stays free of
 * Request/Response or Valkey shaping. Mirrors the v2 loader-trio
 * shape used across the Phase 6 / 7b-1 admin routes.
 */
export const loadAdminAuditLoaderData = async (
  input: AdminAuditInput,
  loadRouteData: (next: AdminAuditInput) => Promise<AdminAuditRouteData> = (
    next,
  ) =>
    import("./admin-audit-route-server").then(
      ({ getAdminAuditData }) =>
        getAdminAuditData({ data: next }) as Promise<AdminAuditRouteData>,
    ),
): Promise<AdminAuditRouteData> => loadRouteData(input);
