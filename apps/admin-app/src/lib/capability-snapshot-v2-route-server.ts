import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import type { AdminCapabilitySnapshotV2RouteData } from "./capability-snapshot-v2-route-data";
import {
  adminRequestServerMiddleware,
  createAdminRequestMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import {
  tanstackStartServerRuntime,
  type TanstackStartServerRuntime,
} from "./tanstack-start-server-runtime";

/**
 * Server function entrypoint for the Capability snapshot v2
 * shell refresh (admin-app implementation plan §9 item 13 +
 * Phase 2 Desk Core cutover). Runs the route-data Effect and
 * surfaces the discriminated-union state. The helper
 * deliberately performs no Request/Response shaping — that
 * responsibility belongs to platform HTTP transports.
 */
const loadAdminCapabilitySnapshotV2Data = async (
  request: Request,
  environment: unknown,
): Promise<AdminCapabilitySnapshotV2RouteData> => {
  const { loadAdminCapabilitySnapshotV2RouteDataFromRequest } =
    await import("./capability-snapshot-v2-route-data");

  return Effect.runPromise(
    loadAdminCapabilitySnapshotV2RouteDataFromRequest(request, environment),
  );
};

export const createGetAdminCapabilitySnapshotV2Data = (
  environment: unknown = process.env,
  capabilitySnapshotServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  capabilitySnapshotServerFn
    .createServerFn({ method: "GET" })
    .middleware([createAdminRequestMiddleware(capabilitySnapshotServerFn)])
    .handler(({ context }: { readonly context: AdminRequestContext }) =>
      loadAdminCapabilitySnapshotV2Data(context.request, environment),
    );

export const getAdminCapabilitySnapshotV2Data = createServerFn({
  method: "GET",
})
  .middleware([adminRequestServerMiddleware])
  .handler(({ context }: { readonly context: AdminRequestContext }) =>
    loadAdminCapabilitySnapshotV2Data(context.request, process.env),
  );
