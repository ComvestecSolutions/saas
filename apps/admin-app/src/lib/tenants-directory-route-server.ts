import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import type { AdminTenantsDirectoryRouteData } from "./tenants-directory-route-data";
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
 * Server function entrypoint for the `/r/tenants` directory
 * (admin-app implementation plan §9 — Phase 2 Desk Core
 * commit 3 cutover). Runs the route-data Effect and surfaces
 * the discriminated-union state. The helper deliberately
 * performs no Request/Response shaping — that responsibility
 * belongs to platform HTTP transports.
 */
const loadAdminTenantsDirectoryData = async (
  request: Request,
  environment: unknown,
): Promise<AdminTenantsDirectoryRouteData> => {
  const { loadAdminTenantsDirectoryRouteDataFromRequest } =
    await import("./tenants-directory-route-data");

  return Effect.runPromise(
    loadAdminTenantsDirectoryRouteDataFromRequest(request, environment),
  );
};

export const createGetAdminTenantsDirectoryData = (
  environment: unknown = process.env,
  tenantsDirectoryServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  tenantsDirectoryServerFn
    .createServerFn({ method: "GET" })
    .middleware([createAdminRequestMiddleware(tenantsDirectoryServerFn)])
    .handler(({ context }: { readonly context: AdminRequestContext }) =>
      loadAdminTenantsDirectoryData(context.request, environment),
    );

export const getAdminTenantsDirectoryData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .handler(({ context }: { readonly context: AdminRequestContext }) =>
    loadAdminTenantsDirectoryData(context.request, process.env),
  );
