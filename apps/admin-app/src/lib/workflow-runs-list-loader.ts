import type {
  AdminWorkflowRunsListInput,
  AdminWorkflowRunsListRouteData,
} from "./workflow-runs-list-route-data";

/**
 * Loader for the spec-canonical `/r/runs` Workflow Runs v2 list
 * route (admin-app implementation plan §8.14 + §11 — Phase 6
 * vendor + workflow operator screens commit 6b). Consumes the
 * route-server entrypoint so the loader stays free of
 * Request/Response or Valkey shaping. Mirrors the v2 loader-trio
 * shape used by `/r/vendors`, `/r/webhook`, `/r/retention`, and
 * `/r/notify`.
 */
export const loadAdminWorkflowRunsListLoaderData = async (
  input: AdminWorkflowRunsListInput,
  loadRouteData: (
    next: AdminWorkflowRunsListInput,
  ) => Promise<AdminWorkflowRunsListRouteData> = (next) =>
    import("./workflow-runs-list-route-server").then(
      ({ getAdminWorkflowRunsListData }) =>
        getAdminWorkflowRunsListData({
          data: {
            ...next.filters,
            pageSize: next.pageSize,
            ...(next.pageToken === undefined
              ? {}
              : { pageToken: next.pageToken }),
          },
        }) as Promise<AdminWorkflowRunsListRouteData>,
    ),
): Promise<AdminWorkflowRunsListRouteData> => loadRouteData(input);
