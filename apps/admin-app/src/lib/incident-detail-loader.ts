import type {
  AdminIncidentDetailInput,
  AdminIncidentDetailRouteData,
} from "./incident-detail-route-data";

/**
 * Loader for the spec-canonical `/r/incident/$incidentId`
 * Break-glass Incident Detail v2 route (admin-app implementation
 * plan §8.8 + §11 — Phase 5 Support / compliance / integrations
 * operator screens commit 1). Consumes the route-server
 * entrypoint so the loader stays free of Request/Response or
 * Valkey shaping. Mirrors the v2 loader-trio shape used by
 * `/r/invoice`, `/r/meter`, and `/r/domain`.
 */
export const loadAdminIncidentDetailLoaderData = async (
  input: AdminIncidentDetailInput,
  loadRouteData: (
    next: AdminIncidentDetailInput,
  ) => Promise<AdminIncidentDetailRouteData> = (next) =>
    import("./incident-detail-route-server").then(
      ({ getAdminIncidentDetailData }) =>
        getAdminIncidentDetailData({
          data: next,
        }) as Promise<AdminIncidentDetailRouteData>,
    ),
): Promise<AdminIncidentDetailRouteData> => loadRouteData(input);
