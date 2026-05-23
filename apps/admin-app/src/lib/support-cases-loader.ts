import type {
  AdminSupportCasesInput,
  AdminSupportCasesRouteData,
} from "./support-cases-route-data";

/**
 * Loader for the spec-canonical `/r/support` Support & Incident
 * v2 route (admin-app implementation plan §8.8 + §11 — Phase 5
 * Support / compliance / integrations operator screens commit
 * 1). Consumes the route-server entrypoint so the loader stays
 * free of Request/Response or Valkey shaping. Mirrors the v2
 * loader-trio shape used by `/r/billing`, `/r/branding`, and
 * `/r/access`.
 */
export const loadAdminSupportCasesLoaderData = async (
  input: AdminSupportCasesInput,
  loadRouteData: (
    next: AdminSupportCasesInput,
  ) => Promise<AdminSupportCasesRouteData> = (next) =>
    import("./support-cases-route-server").then(
      ({ getAdminSupportCasesData }) =>
        getAdminSupportCasesData({
          data: next,
        }) as Promise<AdminSupportCasesRouteData>,
    ),
): Promise<AdminSupportCasesRouteData> => loadRouteData(input);
