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

const loadAdminTenantWorkspaceData = async (
  request: Request,
  environment: unknown,
  tenantId: string,
) => {
  const { loadAdminTenantWorkspaceRouteDataFromRequest } =
    await import("./tenant-workspace-route-data");

  return Effect.runPromise(
    loadAdminTenantWorkspaceRouteDataFromRequest(
      request,
      environment,
      tenantId,
    ),
  );
};

export const createGetAdminTenantWorkspaceData = (
  environment: unknown = process.env,
  tenantWorkspaceServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  tenantWorkspaceServerFn
    .createServerFn({ method: "GET" })
    .middleware([createAdminRequestMiddleware(tenantWorkspaceServerFn)])
    .inputValidator((input: { readonly tenantId: string }) => input)
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: { readonly tenantId: string };
      }) =>
        loadAdminTenantWorkspaceData(
          context.request,
          environment,
          data.tenantId,
        ),
    );

export const getAdminTenantWorkspaceData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: { readonly tenantId: string }) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: { readonly tenantId: string };
    }) =>
      loadAdminTenantWorkspaceData(context.request, process.env, data.tenantId),
  );
