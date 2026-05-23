import type { AdminCapabilitySnapshotV2RouteData } from "./capability-snapshot-v2-route-data";
import type { AdminOperationsHomeRouteData } from "./operations-home-route-data";

/**
 * Combined Desk Center loader (admin-app implementation plan
 * §9 items 3 + 13 + Phase 2 Desk Core commit 2). The Desk
 * Center posture board at `/` consumes BOTH the Operations
 * Home aggregate v2 (KPI tiles, alerts, recent audit, pending
 * approvals, vendor posture) AND the capability snapshot v2
 * (navigation map, high-risk affordances, cache-freshness pill)
 * in a single typed envelope so the route component never has
 * to thread two loader unions through its own discriminator.
 *
 * Both child unions still degrade independently: any
 * non-`ready` variant from either source surfaces as the
 * combined union's `shell | stale-session | denied | error`
 * variants, with capability snapshot taking precedence when
 * both fail (its failure is more diagnostic for the operator
 * shell). The `ready` variant carries both projected
 * snapshots untouched so the posture board renders the live
 * `fromCache`, `partialFailures`, and `navigationMap` arrays
 * directly.
 */
export type AdminDeskCenterLoaderData =
  | { readonly kind: "shell" }
  | { readonly kind: "stale-session" }
  | { readonly kind: "denied"; readonly reason: string }
  | {
      readonly kind: "error";
      readonly title: string;
      readonly description: string;
    }
  | {
      readonly kind: "ready";
      readonly operationsHome: Extract<
        AdminOperationsHomeRouteData,
        { readonly kind: "ready" }
      >;
      readonly capabilitySnapshot: Extract<
        AdminCapabilitySnapshotV2RouteData,
        { readonly kind: "ready" }
      >;
    };

export const loadAdminDeskCenterLoaderData = async (
  loadOperationsHome: () => Promise<AdminOperationsHomeRouteData> = () =>
    import("./operations-home-loader").then(
      ({ loadAdminOperationsHomeLoaderData }) =>
        loadAdminOperationsHomeLoaderData(),
    ),
  loadCapabilitySnapshot: () => Promise<AdminCapabilitySnapshotV2RouteData> = () =>
    import("./capability-snapshot-v2-loader").then(
      ({ loadAdminCapabilitySnapshotV2LoaderData }) =>
        loadAdminCapabilitySnapshotV2LoaderData(),
    ),
): Promise<AdminDeskCenterLoaderData> => {
  const [operations, capability] = await Promise.all([
    loadOperationsHome(),
    loadCapabilitySnapshot(),
  ]);

  if (capability.kind !== "ready") {
    return capability;
  }
  if (operations.kind !== "ready") {
    return operations;
  }

  return {
    kind: "ready",
    operationsHome: operations,
    capabilitySnapshot: capability,
  };
};
