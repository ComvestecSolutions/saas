import type { AdminOperationsHomeRouteData } from "./operations-home-route-data";
import { getAdminOperationsHomeData } from "./operations-home-route-server";

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
    getAdminOperationsHomeData(),
): Promise<AdminOperationsHomeRouteData> => loadRouteData();
