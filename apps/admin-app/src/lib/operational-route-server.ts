import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
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

type ScopeSelectionInput = {
  readonly scope?: string | undefined;
  readonly scopeId?: string | undefined;
};

type NormalizedScopeSelectionInput = {
  readonly scope: string | undefined;
  readonly scopeId: string;
};

const ScopeSelectionInputBoundarySchema = Schema.Union(
  Schema.Undefined,
  Schema.Struct({
    scope: Schema.optional(Schema.Unknown),
    scopeId: Schema.optional(Schema.Unknown),
  }),
);

type ScopeSelectionInputBoundary = Schema.Schema.Type<
  typeof ScopeSelectionInputBoundarySchema
>;

const decodeScopeSelectionInputBoundary = decodeSyncBoundary(
  ScopeSelectionInputBoundarySchema,
);
const decodeScopeSelectionString = decodeSchemaOrUndefined(Schema.String);

export const normalizeScopeSelectionInput = (
  input: ScopeSelectionInputBoundary,
): NormalizedScopeSelectionInput => ({
  scope: decodeScopeSelectionString(input?.scope),
  scopeId: decodeScopeSelectionString(input?.scopeId) ?? "",
});

export const hasCompleteScopeSelection = (
  input: NormalizedScopeSelectionInput,
): input is { readonly scope: string; readonly scopeId: string } =>
  typeof input.scope === "string" &&
  input.scope.length > 0 &&
  input.scopeId.length > 0;

const loadAdminSupportOperationsData = async (
  request: Request,
  environment: unknown,
) => {
  const { loadAdminSupportOperationsRouteDataFromRequest } =
    await import("./support-operations-route-data");

  return Effect.runPromise(
    loadAdminSupportOperationsRouteDataFromRequest(request, environment),
  );
};

const loadAdminBrandingData = async (
  request: Request,
  environment: unknown,
  scope: string,
  scopeId: string,
) => {
  const { loadAdminBrandingRouteDataFromRequest } =
    await import("./branding-route-data");

  return Effect.runPromise(
    loadAdminBrandingRouteDataFromRequest(request, environment, scope, scopeId),
  );
};

const loadAdminBillingData = async (request: Request, environment: unknown) => {
  const { loadAdminBillingRouteDataFromRequest } =
    await import("./billing-route-data");

  return Effect.runPromise(
    loadAdminBillingRouteDataFromRequest(request, environment),
  );
};

const loadAdminComplianceRetentionData = async (
  request: Request,
  environment: unknown,
  scope: string,
  scopeId: string,
) => {
  const { loadAdminComplianceRetentionRouteDataFromRequest } =
    await import("./compliance-retention-route-data");

  return Effect.runPromise(
    loadAdminComplianceRetentionRouteDataFromRequest(
      request,
      environment,
      scope,
      scopeId,
    ),
  );
};

const loadAdminWebhooksApiAccessData = async (
  request: Request,
  environment: unknown,
  scope: string,
  scopeId: string,
) => {
  const { loadAdminWebhooksApiAccessRouteDataFromRequest } =
    await import("./webhooks-api-access-route-data");

  return Effect.runPromise(
    loadAdminWebhooksApiAccessRouteDataFromRequest(
      request,
      environment,
      scope,
      scopeId,
    ),
  );
};

export const createGetAdminSupportOperationsData = (
  environment: unknown = process.env,
  operationalServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  operationalServerFn
    .createServerFn({ method: "GET" })
    .middleware([createAdminRequestMiddleware(operationalServerFn)])
    .handler(({ context }: { readonly context: AdminRequestContext }) =>
      loadAdminSupportOperationsData(context.request, environment),
    );

export const createGetAdminBrandingData = (
  environment: unknown = process.env,
  operationalServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  operationalServerFn
    .createServerFn({ method: "GET" })
    .middleware([createAdminRequestMiddleware(operationalServerFn)])
    .inputValidator((input: unknown) =>
      normalizeScopeSelectionInput(decodeScopeSelectionInputBoundary(input)),
    )
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: NormalizedScopeSelectionInput;
      }) =>
        hasCompleteScopeSelection(data)
          ? loadAdminBrandingData(
              context.request,
              environment,
              data.scope,
              data.scopeId,
            )
          : Promise.resolve({ kind: "no-scope" as const }),
    );

export const createGetAdminBillingData = (
  environment: unknown = process.env,
  operationalServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  operationalServerFn
    .createServerFn({ method: "GET" })
    .middleware([createAdminRequestMiddleware(operationalServerFn)])
    .handler(({ context }: { readonly context: AdminRequestContext }) =>
      loadAdminBillingData(context.request, environment),
    );

export const createGetAdminComplianceRetentionData = (
  environment: unknown = process.env,
  operationalServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  operationalServerFn
    .createServerFn({ method: "GET" })
    .middleware([createAdminRequestMiddleware(operationalServerFn)])
    .inputValidator((input: unknown) =>
      normalizeScopeSelectionInput(decodeScopeSelectionInputBoundary(input)),
    )
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: NormalizedScopeSelectionInput;
      }) =>
        hasCompleteScopeSelection(data)
          ? loadAdminComplianceRetentionData(
              context.request,
              environment,
              data.scope,
              data.scopeId,
            )
          : Promise.resolve({ kind: "no-scope" as const }),
    );

export const createGetAdminWebhooksApiAccessData = (
  environment: unknown = process.env,
  operationalServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  operationalServerFn
    .createServerFn({ method: "GET" })
    .middleware([createAdminRequestMiddleware(operationalServerFn)])
    .inputValidator((input: unknown) =>
      normalizeScopeSelectionInput(decodeScopeSelectionInputBoundary(input)),
    )
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: NormalizedScopeSelectionInput;
      }) =>
        hasCompleteScopeSelection(data)
          ? loadAdminWebhooksApiAccessData(
              context.request,
              environment,
              data.scope,
              data.scopeId,
            )
          : Promise.resolve({ kind: "no-scope" as const }),
    );

export const getAdminSupportOperationsData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .handler(({ context }: { readonly context: AdminRequestContext }) =>
    loadAdminSupportOperationsData(context.request, process.env),
  );

export const getAdminBrandingData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeScopeSelectionInput(decodeScopeSelectionInputBoundary(input)),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: NormalizedScopeSelectionInput;
    }) =>
      hasCompleteScopeSelection(data)
        ? loadAdminBrandingData(
            context.request,
            process.env,
            data.scope,
            data.scopeId,
          )
        : Promise.resolve({ kind: "no-scope" as const }),
  );

export const getAdminBillingData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .handler(({ context }: { readonly context: AdminRequestContext }) =>
    loadAdminBillingData(context.request, process.env),
  );

export const getAdminComplianceRetentionData = createServerFn({
  method: "GET",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeScopeSelectionInput(decodeScopeSelectionInputBoundary(input)),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: NormalizedScopeSelectionInput;
    }) =>
      hasCompleteScopeSelection(data)
        ? loadAdminComplianceRetentionData(
            context.request,
            process.env,
            data.scope,
            data.scopeId,
          )
        : Promise.resolve({ kind: "no-scope" as const }),
  );

export const getAdminWebhooksApiAccessData = createServerFn({
  method: "GET",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeScopeSelectionInput(decodeScopeSelectionInputBoundary(input)),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: NormalizedScopeSelectionInput;
    }) =>
      hasCompleteScopeSelection(data)
        ? loadAdminWebhooksApiAccessData(
            context.request,
            process.env,
            data.scope,
            data.scopeId,
          )
        : Promise.resolve({ kind: "no-scope" as const }),
  );
