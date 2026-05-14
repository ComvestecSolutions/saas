import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { platformModuleId, type PlatformModuleId } from "@comvestec/contracts";
import {
  adminRequestServerMiddleware,
  createAdminRequestMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import {
  tanstackStartServerRuntime,
  type TanstackStartServerRuntime,
} from "./tanstack-start-server-runtime";

const loadAdminRuntimeConfigData = async (
  request: Request,
  environment: unknown,
) => {
  const { loadAdminRuntimeConfigRouteDataFromRequest } =
    await import("./runtime-config-route-data");

  return Effect.runPromise(
    loadAdminRuntimeConfigRouteDataFromRequest(request, environment),
  );
};

const loadAdminFeatureFlagsData = async (
  request: Request,
  environment: unknown,
) => {
  const { loadAdminFeatureFlagsRouteDataFromRequest } =
    await import("./feature-flags-route-data");

  return Effect.runPromise(
    loadAdminFeatureFlagsRouteDataFromRequest(request, environment),
  );
};

const loadAdminAccessControlData = async (
  request: Request,
  environment: unknown,
) => {
  const { loadAdminAccessControlRouteDataFromRequest } =
    await import("./access-control-route-data");

  return Effect.runPromise(
    loadAdminAccessControlRouteDataFromRequest(request, environment),
  );
};

const loadAdminAuditLogData = async (
  request: Request,
  environment: unknown,
  moduleId: PlatformModuleId,
) => {
  const { loadAdminAuditLogRouteDataFromRequest } =
    await import("./audit-log-route-data");

  return Effect.runPromise(
    loadAdminAuditLogRouteDataFromRequest(request, environment, moduleId),
  );
};

export const createGetAdminRuntimeConfigData = (
  environment: unknown = process.env,
  governanceServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  governanceServerFn
    .createServerFn({ method: "GET" })
    .middleware([createAdminRequestMiddleware(governanceServerFn)])
    .handler(({ context }: { readonly context: AdminRequestContext }) =>
      loadAdminRuntimeConfigData(context.request, environment),
    );

export const createGetAdminFeatureFlagsData = (
  environment: unknown = process.env,
  governanceServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  governanceServerFn
    .createServerFn({ method: "GET" })
    .middleware([createAdminRequestMiddleware(governanceServerFn)])
    .handler(({ context }: { readonly context: AdminRequestContext }) =>
      loadAdminFeatureFlagsData(context.request, environment),
    );

export const createGetAdminAccessControlData = (
  environment: unknown = process.env,
  governanceServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  governanceServerFn
    .createServerFn({ method: "GET" })
    .middleware([createAdminRequestMiddleware(governanceServerFn)])
    .handler(({ context }: { readonly context: AdminRequestContext }) =>
      loadAdminAccessControlData(context.request, environment),
    );

export const createGetAdminAuditLogData = (
  environment: unknown = process.env,
  governanceServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  governanceServerFn
    .createServerFn({ method: "GET" })
    .middleware([createAdminRequestMiddleware(governanceServerFn)])
    .inputValidator(
      (input: { readonly moduleId?: PlatformModuleId } | undefined) =>
        input ?? {},
    )
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: { readonly moduleId?: PlatformModuleId };
      }) =>
        loadAdminAuditLogData(
          context.request,
          environment,
          data.moduleId ?? platformModuleId.auditLog,
        ),
    );

export const getAdminRuntimeConfigData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .handler(({ context }: { readonly context: AdminRequestContext }) =>
    loadAdminRuntimeConfigData(context.request, process.env),
  );

export const getAdminFeatureFlagsData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .handler(({ context }: { readonly context: AdminRequestContext }) =>
    loadAdminFeatureFlagsData(context.request, process.env),
  );

export const getAdminAccessControlData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .handler(({ context }: { readonly context: AdminRequestContext }) =>
    loadAdminAccessControlData(context.request, process.env),
  );

export const getAdminAuditLogData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(
    (input: { readonly moduleId?: PlatformModuleId } | undefined) =>
      input ?? {},
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: { readonly moduleId?: PlatformModuleId };
    }) =>
      loadAdminAuditLogData(
        context.request,
        process.env,
        data.moduleId ?? platformModuleId.auditLog,
      ),
  );
