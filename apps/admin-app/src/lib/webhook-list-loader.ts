import type {
  AdminWebhookListInput,
  AdminWebhookListRouteData,
} from "./webhook-list-route-data";

/**
 * Loader for the spec-canonical `/desk/webhook` Webhook Endpoints
 * v2 route (admin-app implementation plan §8.12 + §11 — Phase 5
 * Support / compliance / integrations operator screens commit
 * 3). Consumes the route-server entrypoint so the loader stays
 * free of Request/Response or Valkey shaping. Mirrors the v2
 * loader-trio shape used by `/desk/billing`, `/desk/branding`,
 * `/desk/support`, and `/desk/retention`.
 */
export const loadAdminWebhookListLoaderData = async (
  input: AdminWebhookListInput,
  loadRouteData: (
    next: AdminWebhookListInput,
  ) => Promise<AdminWebhookListRouteData> = (next) =>
    import("./webhook-list-route-server").then(
      ({ getAdminWebhookListData }) =>
        getAdminWebhookListData({
          data: next,
        }) as Promise<AdminWebhookListRouteData>,
    ),
): Promise<AdminWebhookListRouteData> => loadRouteData(input);
