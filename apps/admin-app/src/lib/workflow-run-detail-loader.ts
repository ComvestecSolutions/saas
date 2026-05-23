import type {
  AdminWorkflowRunDetailInput,
  AdminWorkflowRunDetailRouteData,
} from "./workflow-run-detail-route-data";

/**
 * Loader for the spec-canonical `/r/run/$id` Workflow Run Detail
 * v2 route (admin-app implementation plan §8.14 + §11 — Phase 6
 * vendor + workflow operator screens commit 6b). Consumes the
 * route-server entrypoint so the loader stays free of
 * Request/Response or Valkey shaping. Mirrors the v2 loader-trio
 * shape used by `/r/incident/$incidentId`,
 * `/r/legal-hold/$holdId`, `/r/delivery/$deliveryId`, and
 * `/r/api-key/$keyId`.
 */
export const loadAdminWorkflowRunDetailLoaderData = async (
  input: AdminWorkflowRunDetailInput,
  loadRouteData: (
    next: AdminWorkflowRunDetailInput,
  ) => Promise<AdminWorkflowRunDetailRouteData> = (next) =>
    import("./workflow-run-detail-route-server").then(
      ({ getAdminWorkflowRunDetailData }) =>
        getAdminWorkflowRunDetailData({
          data: next,
        }) as Promise<AdminWorkflowRunDetailRouteData>,
    ),
): Promise<AdminWorkflowRunDetailRouteData> => loadRouteData(input);
