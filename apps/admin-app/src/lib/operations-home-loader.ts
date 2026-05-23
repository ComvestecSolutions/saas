import type { AdminOperationsHomeRouteData } from "./operations-home-route-data";

/**
 * Loader for the Operations Home route (`/`). Consumes the v2
 * snapshot via the trusted request-context resolver so the
 * loader stays free of Valkey, Request, or Response shaping.
 *
 * The route component receives the discriminated-union route
 * data (`shell | stale-session | denied | error | ready`) and
 * surfaces `partialFailures` directly on the `ready` variant.
 */
export const loadAdminOperationsHomeLoaderData = async (
  loadRouteData: () => Promise<AdminOperationsHomeRouteData> = () =>
    import("./operations-home-route-server").then(
      ({ getAdminOperationsHomeData }) => getAdminOperationsHomeData(),
    ),
): Promise<AdminOperationsHomeRouteData> => loadRouteData();
