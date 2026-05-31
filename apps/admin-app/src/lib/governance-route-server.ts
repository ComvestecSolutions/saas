import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  AuthorizationNamespaceSchema,
  AuthorizationRelationSchema,
  PlatformModuleIdSchema,
  platformModuleId,
  type PlatformModuleId,
} from "@comvestec/contracts";
import type { AdminAccessControlLoaderInput } from "./access-control-route-data";
import {
  adminRequestServerMiddleware,
  createAdminRequestMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSchemaOrUndefined, decodeSyncBoundary } from "./effect-boundary";
import {
  tanstackStartServerRuntime,
  type TanstackStartServerRuntime,
} from "./tanstack-start-server-runtime";

const AdminAccessControlLoaderInputBoundarySchema = Schema.Union(
  Schema.Undefined,
  Schema.Struct({
    namespace: Schema.optional(Schema.Unknown),
    object: Schema.optional(Schema.Unknown),
    relation: Schema.optional(Schema.Unknown),
    subject: Schema.optional(Schema.Unknown),
    detailSubject: Schema.optional(Schema.Unknown),
    page: Schema.optional(Schema.Unknown),
  }),
);

const AdminAuditLogLoaderInputBoundarySchema = Schema.Union(
  Schema.Undefined,
  Schema.Struct({
    moduleId: Schema.optional(Schema.Unknown),
  }),
);

type AdminAccessControlLoaderInputBoundary = Schema.Schema.Type<
  typeof AdminAccessControlLoaderInputBoundarySchema
>;

type AdminAuditLogLoaderInputBoundary = Schema.Schema.Type<
  typeof AdminAuditLogLoaderInputBoundarySchema
>;

const decodeAdminAccessControlLoaderInputBoundary = decodeSyncBoundary(
  AdminAccessControlLoaderInputBoundarySchema,
);
const decodeAdminAuditLogLoaderInputBoundary = decodeSyncBoundary(
  AdminAuditLogLoaderInputBoundarySchema,
);
const decodeNamespace = decodeSchemaOrUndefined(AuthorizationNamespaceSchema);
const decodeRelation = decodeSchemaOrUndefined(AuthorizationRelationSchema);
const decodeNonEmptyString = decodeSchemaOrUndefined(Schema.NonEmptyString);
const decodeFiniteNumber = decodeSchemaOrUndefined(
  Schema.Number.pipe(Schema.finite()),
);
const decodeModuleId = decodeSchemaOrUndefined(PlatformModuleIdSchema);

const normalizePage = (value: unknown): number | undefined => {
  const page = decodeFiniteNumber(value);

  if (page === undefined) {
    return undefined;
  }

  const truncated = Math.trunc(page);
  return truncated >= 1 ? truncated : undefined;
};

const normalizeAdminAccessControlLoaderInput = (
  input: AdminAccessControlLoaderInputBoundary,
): AdminAccessControlLoaderInput => {
  const safe = input ?? {};
  const namespace = decodeNamespace(safe.namespace);
  const object = decodeNonEmptyString(safe.object);
  const relation = decodeRelation(safe.relation);
  const subject = decodeNonEmptyString(safe.subject);
  const detailSubject = decodeNonEmptyString(safe.detailSubject);
  const page = normalizePage(safe.page);

  return {
    ...(namespace === undefined ? {} : { namespace }),
    ...(object === undefined ? {} : { object }),
    ...(relation === undefined ? {} : { relation }),
    ...(subject === undefined ? {} : { subject }),
    ...(detailSubject === undefined ? {} : { detailSubject }),
    ...(page === undefined ? {} : { page }),
  };
};

const normalizeAdminAuditLogLoaderInput = (
  input: AdminAuditLogLoaderInputBoundary,
): { readonly moduleId?: PlatformModuleId } => {
  const moduleId = decodeModuleId(input?.moduleId);

  return moduleId === undefined ? {} : { moduleId };
};

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
  input: AdminAccessControlLoaderInput = {},
) => {
  const { loadAdminAccessControlRouteDataFromRequest } =
    await import("./access-control-route-data");

  return Effect.runPromise(
    loadAdminAccessControlRouteDataFromRequest(request, environment, input),
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
    .inputValidator((input: unknown) =>
      normalizeAdminAccessControlLoaderInput(
        decodeAdminAccessControlLoaderInputBoundary(input),
      ),
    )
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: AdminAccessControlLoaderInput;
      }) => loadAdminAccessControlData(context.request, environment, data),
    );

export const createGetAdminAuditLogData = (
  environment: unknown = process.env,
  governanceServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  governanceServerFn
    .createServerFn({ method: "GET" })
    .middleware([createAdminRequestMiddleware(governanceServerFn)])
    .inputValidator((input: unknown) =>
      normalizeAdminAuditLogLoaderInput(
        decodeAdminAuditLogLoaderInputBoundary(input),
      ),
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
  .inputValidator((input: unknown) =>
    normalizeAdminAccessControlLoaderInput(
      decodeAdminAccessControlLoaderInputBoundary(input),
    ),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminAccessControlLoaderInput;
    }) => loadAdminAccessControlData(context.request, process.env, data),
  );

export const getAdminAuditLogData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeAdminAuditLogLoaderInput(
      decodeAdminAuditLogLoaderInputBoundary(input),
    ),
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
