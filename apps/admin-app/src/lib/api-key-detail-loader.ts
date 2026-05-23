import type {
  AdminApiKeyDetailInput,
  AdminApiKeyDetailRouteData,
} from "./api-key-detail-route-data";

/**
 * Loader for the spec-canonical `/r/api-key/$keyId` Webhook API
 * Key Detail v2 route (admin-app implementation plan §8.12 +
 * §11 — Phase 5 Support / compliance / integrations operator
 * screens commit 3). Consumes the route-server entrypoint so
 * the loader stays free of Request/Response or Valkey shaping.
 * Mirrors the v2 loader-trio shape used by `/r/invoice`,
 * `/r/meter`, `/r/domain`, `/r/incident`, `/r/legal-hold`, and
 * `/r/delivery`.
 */
export const loadAdminApiKeyDetailLoaderData = async (
  input: AdminApiKeyDetailInput,
  loadRouteData: (
    next: AdminApiKeyDetailInput,
  ) => Promise<AdminApiKeyDetailRouteData> = (next) =>
    import("./api-key-detail-route-server").then(
      ({ getAdminApiKeyDetailData }) =>
        getAdminApiKeyDetailData({
          data: next,
        }) as Promise<AdminApiKeyDetailRouteData>,
    ),
): Promise<AdminApiKeyDetailRouteData> => loadRouteData(input);
