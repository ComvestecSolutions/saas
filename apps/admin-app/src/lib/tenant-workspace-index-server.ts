import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  adminRequestServerMiddleware,
  createAdminRequestMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import {
  tanstackStartServerRuntime,
  type TanstackStartServerRuntime,
} from "./tanstack-start-server-runtime";

const loadAdminTenantWorkspaceIndexData = async (
  request: Request,
  environment: unknown,
) => {
  const { loadAdminTenantWorkspaceIndexRouteDataFromRequest } =
    await import("./tenant-workspace-index-route-data");

  return Effect.runPromise(
    loadAdminTenantWorkspaceIndexRouteDataFromRequest(request, environment),
  );
};

export const createGetAdminTenantWorkspaceIndexData = (
  environment: unknown = process.env,
  tenantWorkspaceServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  tenantWorkspaceServerFn
    .createServerFn({ method: "GET" })
    .middleware([createAdminRequestMiddleware(tenantWorkspaceServerFn)])
    .handler(({ context }: { readonly context: AdminRequestContext }) =>
      loadAdminTenantWorkspaceIndexData(context.request, environment),
    );

export const getAdminTenantWorkspaceIndexData = createServerFn({
  method: "GET",
})
  .middleware([adminRequestServerMiddleware])
  .handler(({ context }: { readonly context: AdminRequestContext }) =>
    loadAdminTenantWorkspaceIndexData(context.request, process.env),
  );
