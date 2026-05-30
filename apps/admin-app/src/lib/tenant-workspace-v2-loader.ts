import type {
  AdminTenantWorkspaceV2LoaderInput,
  AdminTenantWorkspaceV2RouteData,
} from "./tenant-workspace-v2-route-data";
import { getAdminTenantWorkspaceV2Data } from "./tenant-workspace-v2-route-server";

/**
 * Loader for the Tenant workspace v2 route (`/desk/tenant/<id>`).
 * Consumes the v2 snapshot via the trusted request-context
 * resolver so the loader stays free of Valkey, Request, or
 * Response shaping. The route component receives the
 * discriminated-union route data (`shell | stale-session |
 * denied | error | ready`) and surfaces `partialFailures`
 * directly on the `ready` variant.
 */
export const loadAdminTenantWorkspaceV2LoaderData = async (
  input: AdminTenantWorkspaceV2LoaderInput,
  loadRouteData: (
    currentInput: AdminTenantWorkspaceV2LoaderInput,
  ) => Promise<AdminTenantWorkspaceV2RouteData> = (currentInput) =>
    getAdminTenantWorkspaceV2Data({ data: currentInput }),
): Promise<AdminTenantWorkspaceV2RouteData> => loadRouteData(input);
