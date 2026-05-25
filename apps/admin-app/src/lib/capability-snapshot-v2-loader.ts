import type { AdminCapabilitySnapshotV2RouteData } from "./capability-snapshot-v2-route-data";
import { getAdminCapabilitySnapshotV2Data } from "./capability-snapshot-v2-route-server";

/**
 * Loader for the Capability snapshot v2 shell refresh. Consumes
 * the v2 snapshot via the trusted request-context resolver so
 * the loader stays free of Valkey, Request, or Response
 * shaping. Mirrors the Operations Home loader pattern; the
 * Phase 2 commit 2 posture board reads the discriminated-union
 * route data directly.
 */
export const loadAdminCapabilitySnapshotV2LoaderData = async (
  loadRouteData: () => Promise<AdminCapabilitySnapshotV2RouteData> = () =>
    getAdminCapabilitySnapshotV2Data(),
): Promise<AdminCapabilitySnapshotV2RouteData> => loadRouteData();
