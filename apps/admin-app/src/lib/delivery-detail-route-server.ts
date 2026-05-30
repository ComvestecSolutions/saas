import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { PlatformScopeSchema } from "@comvestec/contracts";
import type {
  AdminDeliveryDetailInput,
  AdminDeliveryDetailRouteData,
} from "./delivery-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for `/desk/delivery/$deliveryId`
 * (admin-app implementation plan §8.12 + §11 — Phase 5 commit
 * 3). Decodes the loader input at the framework boundary and
 * runs the route-data Effect on the server. No
 * Request/Response shaping lives here.
 */
const AdminDeliveryDetailInputSchema = Schema.Struct({
  deliveryId: Schema.NonEmptyString,
  scope: Schema.optional(PlatformScopeSchema),
  scopeId: Schema.optional(Schema.NonEmptyString),
});

type AdminDeliveryDetailInputValue = Schema.Schema.Type<
  typeof AdminDeliveryDetailInputSchema
>;

const normalizeAdminDeliveryDetailInput = (
  input: AdminDeliveryDetailInputValue,
): AdminDeliveryDetailInput => ({
  deliveryId: input.deliveryId,
  ...(input.scope === undefined ? {} : { scope: input.scope }),
  ...(input.scopeId === undefined ? {} : { scopeId: input.scopeId }),
});

const loadAdminDeliveryDetailData = async (
  request: Request,
  environment: unknown,
  input: AdminDeliveryDetailInput,
): Promise<AdminDeliveryDetailRouteData> => {
  const { loadAdminDeliveryDetailRouteDataFromRequest } =
    await import("./delivery-detail-route-data");
  return Effect.runPromise(
    loadAdminDeliveryDetailRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminDeliveryDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeAdminDeliveryDetailInput(
      decodeSyncBoundary(AdminDeliveryDetailInputSchema)(input),
    ),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminDeliveryDetailInput;
    }) => loadAdminDeliveryDetailData(context.request, process.env, data),
  );
