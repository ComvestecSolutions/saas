import type {
  AdminLegalHoldDetailInput,
  AdminLegalHoldDetailRouteData,
} from "./legal-hold-detail-route-data";

/**
 * Loader for the spec-canonical `/desk/legal-hold/$holdId` Legal
 * Hold Detail v2 route (admin-app implementation plan §8.11 +
 * §11 — Phase 5 Support / compliance / integrations operator
 * screens commit 2). Consumes the route-server entrypoint so
 * the loader stays free of Request/Response or Valkey shaping.
 * Mirrors the v2 loader-trio shape used by `/desk/invoice`,
 * `/desk/meter`, `/desk/domain`, and `/desk/incident`.
 */
export const loadAdminLegalHoldDetailLoaderData = async (
  input: AdminLegalHoldDetailInput,
  loadRouteData: (
    next: AdminLegalHoldDetailInput,
  ) => Promise<AdminLegalHoldDetailRouteData> = (next) =>
    import("./legal-hold-detail-route-server").then(
      ({ getAdminLegalHoldDetailData }) =>
        getAdminLegalHoldDetailData({
          data: next,
        }) as Promise<AdminLegalHoldDetailRouteData>,
    ),
): Promise<AdminLegalHoldDetailRouteData> => loadRouteData(input);
