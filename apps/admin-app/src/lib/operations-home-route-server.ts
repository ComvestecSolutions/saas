import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import type {
  AdminOperationsHomeRouteData,
  AdminOperationsHomeRouteLoaderInput,
} from "./operations-home-route-data";
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
 * Server function entrypoint for the Operations Home v2 route
 * (admin-app implementation plan §9 item 3). Decodes the
 * loader input at the framework boundary, runs the route-data
 * Effect, and surfaces the discriminated-union state. The
 * helper deliberately performs no Request/Response shaping —
 * that responsibility belongs to platform HTTP transports.
 */

const AdminOperationsHomeRouteLoaderInputSchema = Schema.Struct({
  windowMinutes: Schema.optional(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
  ),
  recentAuditLimit: Schema.optional(
    Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
  ),
});

type AdminOperationsHomeRouteLoaderInputValue = Schema.Schema.Type<
  typeof AdminOperationsHomeRouteLoaderInputSchema
>;

const normalizeAdminOperationsHomeLoaderInput = (
  input: AdminOperationsHomeRouteLoaderInputValue | undefined,
): AdminOperationsHomeRouteLoaderInput =>
  input === undefined
    ? {}
    : {
        ...(input.windowMinutes === undefined
          ? {}
          : { windowMinutes: input.windowMinutes }),
        ...(input.recentAuditLimit === undefined
          ? {}
          : { recentAuditLimit: input.recentAuditLimit }),
      };

const loadAdminOperationsHomeData = async (
  request: Request,
  environment: unknown,
  input: AdminOperationsHomeRouteLoaderInput = {},
): Promise<AdminOperationsHomeRouteData> => {
  const { loadAdminOperationsHomeRouteDataFromRequest } =
    await import("./operations-home-route-data");

  return Effect.runPromise(
    loadAdminOperationsHomeRouteDataFromRequest(request, environment, input),
  );
};

export const createGetAdminOperationsHomeData = (
  environment: unknown = process.env,
  operationsHomeServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  operationsHomeServerFn
    .createServerFn({ method: "GET" })
    .middleware([createAdminRequestMiddleware(operationsHomeServerFn)])
    .inputValidator(
      (input: AdminOperationsHomeRouteLoaderInputValue | undefined) =>
        normalizeAdminOperationsHomeLoaderInput(input),
    )
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: AdminOperationsHomeRouteLoaderInput;
      }) => loadAdminOperationsHomeData(context.request, environment, data),
    );

export const getAdminOperationsHomeData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(
    (input: AdminOperationsHomeRouteLoaderInputValue | undefined) =>
      normalizeAdminOperationsHomeLoaderInput(input),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminOperationsHomeRouteLoaderInput;
    }) => loadAdminOperationsHomeData(context.request, process.env, data),
  );
