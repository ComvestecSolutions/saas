import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  OpenMeterUsageQueryGranularitySchema,
  PlatformScopeSchema,
} from "@comvestec/contracts";
import type {
  AdminMeterDetailInput,
  AdminMeterDetailRouteData,
} from "./meter-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for `/desk/meter/$meterId` (admin-app
 * implementation plan §8.10 + §11 — Phase 4 Domain operator
 * screens commit 1). Decodes the loader input at the framework
 * boundary and runs the route-data Effect on the server. No
 * Request/Response shaping here.
 */
const AdminMeterDetailInputSchema = Schema.Struct({
  meterSlug: Schema.NonEmptyString,
  tenant: Schema.Struct({
    scope: PlatformScopeSchema,
    scopeId: Schema.NonEmptyString,
  }),
  subject: Schema.optional(Schema.NonEmptyString),
  granularity: Schema.optional(OpenMeterUsageQueryGranularitySchema),
  window: Schema.optional(
    Schema.Struct({
      from: Schema.NonEmptyString,
      to: Schema.NonEmptyString,
    }),
  ),
});

type AdminMeterDetailInputValue = Schema.Schema.Type<
  typeof AdminMeterDetailInputSchema
>;

const normalizeAdminMeterDetailInput = (
  input: AdminMeterDetailInputValue,
): AdminMeterDetailInput => ({
  meterSlug: input.meterSlug,
  tenant: input.tenant,
  ...(input.subject === undefined ? {} : { subject: input.subject }),
  ...(input.granularity === undefined
    ? {}
    : { granularity: input.granularity }),
  ...(input.window === undefined ? {} : { window: input.window }),
});

const loadAdminMeterDetailData = async (
  request: Request,
  environment: unknown,
  input: AdminMeterDetailInput,
): Promise<AdminMeterDetailRouteData> => {
  const { loadAdminMeterDetailRouteDataFromRequest } =
    await import("./meter-detail-route-data");
  return Effect.runPromise(
    loadAdminMeterDetailRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminMeterDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeAdminMeterDetailInput(
      decodeSyncBoundary(AdminMeterDetailInputSchema)(input),
    ),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminMeterDetailInput;
    }) => loadAdminMeterDetailData(context.request, process.env, data),
  );
