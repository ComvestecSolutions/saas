import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import type {
  AdminTenantWorkspaceV2LoaderInput,
  AdminTenantWorkspaceV2RouteData,
} from "./tenant-workspace-v2-route-data";
import {
  adminRequestServerMiddleware,
  createAdminRequestMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { adminTenantTargetScopes } from "./admin-tenant-target";
import { decodeSyncBoundary } from "./effect-boundary";
import {
  tanstackStartServerRuntime,
  type TanstackStartServerRuntime,
} from "./tanstack-start-server-runtime";

/**
 * Server function entrypoint for the Tenant workspace v2 route
 * (admin-app implementation plan §9 item 4 + Phase 2 Desk Core
 * cutover). Decodes the loader input at the framework boundary,
 * runs the route-data Effect, and surfaces the discriminated-
 * union state. The helper deliberately performs no Request /
 * Response shaping — that responsibility belongs to platform
 * HTTP transports.
 */

const AdminTenantWorkspaceV2LoaderInputSchema = Schema.Struct({
  tenantId: Schema.NonEmptyString,
  scope: Schema.optional(Schema.Literal(...adminTenantTargetScopes)),
  windowMinutes: Schema.optional(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
  ),
  membersLimit: Schema.optional(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
  ),
  recentActivityLimit: Schema.optional(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
  ),
});

type AdminTenantWorkspaceV2LoaderInputValue = Schema.Schema.Type<
  typeof AdminTenantWorkspaceV2LoaderInputSchema
>;

const decodeAdminTenantWorkspaceV2LoaderInput = decodeSyncBoundary(
  AdminTenantWorkspaceV2LoaderInputSchema,
);

const normalizeAdminTenantWorkspaceV2LoaderInput = (
  input: AdminTenantWorkspaceV2LoaderInputValue,
): AdminTenantWorkspaceV2LoaderInput => ({
  tenantId: input.tenantId,
  ...(input.scope === undefined ? {} : { scope: input.scope }),
  ...(input.windowMinutes === undefined
    ? {}
    : { windowMinutes: input.windowMinutes }),
  ...(input.membersLimit === undefined
    ? {}
    : { membersLimit: input.membersLimit }),
  ...(input.recentActivityLimit === undefined
    ? {}
    : { recentActivityLimit: input.recentActivityLimit }),
});

const loadAdminTenantWorkspaceV2Data = async (
  request: Request,
  environment: unknown,
  input: AdminTenantWorkspaceV2LoaderInput,
): Promise<AdminTenantWorkspaceV2RouteData> => {
  const { loadAdminTenantWorkspaceV2RouteDataFromRequest } =
    await import("./tenant-workspace-v2-route-data");

  return Effect.runPromise(
    loadAdminTenantWorkspaceV2RouteDataFromRequest(request, environment, input),
  );
};

export const createGetAdminTenantWorkspaceV2Data = (
  environment: unknown = process.env,
  tenantWorkspaceV2ServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  tenantWorkspaceV2ServerFn
    .createServerFn({ method: "GET" })
    .middleware([createAdminRequestMiddleware(tenantWorkspaceV2ServerFn)])
    .inputValidator((input: unknown) =>
      normalizeAdminTenantWorkspaceV2LoaderInput(
        decodeAdminTenantWorkspaceV2LoaderInput(input),
      ),
    )
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: AdminTenantWorkspaceV2LoaderInput;
      }) => loadAdminTenantWorkspaceV2Data(context.request, environment, data),
    );

export const getAdminTenantWorkspaceV2Data = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeAdminTenantWorkspaceV2LoaderInput(
      decodeAdminTenantWorkspaceV2LoaderInput(input),
    ),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminTenantWorkspaceV2LoaderInput;
    }) => loadAdminTenantWorkspaceV2Data(context.request, process.env, data),
  );
