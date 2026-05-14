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

const loadAdminShellData = async (request: Request, environment: unknown) => {
  const { loadAdminShellRouteDataFromRequest } =
    await import("./admin-shell-route-data");

  return Effect.runPromise(
    loadAdminShellRouteDataFromRequest(request, environment),
  );
};

export const createGetAdminShellData = (
  environment: unknown = process.env,
  adminShellServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  adminShellServerFn
    .createServerFn({ method: "GET" })
    .middleware([createAdminRequestMiddleware(adminShellServerFn)])
    .handler(({ context }: { readonly context: AdminRequestContext }) =>
      loadAdminShellData(context.request, environment),
    );

export const getAdminShellData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .handler(({ context }: { readonly context: AdminRequestContext }) =>
    loadAdminShellData(context.request, process.env),
  );
