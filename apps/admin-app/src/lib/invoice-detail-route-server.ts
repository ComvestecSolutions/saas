import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { PlatformScopeSchema } from "@comvestec/contracts";
import type {
  AdminInvoiceDetailInput,
  AdminInvoiceDetailRouteData,
} from "./invoice-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for `/desk/invoice/$invoiceId`
 * (admin-app implementation plan §8.10 + §11 — Phase 4 Domain
 * operator screens commit 1). Decodes the loader input at the
 * framework boundary and runs the route-data Effect on the
 * server. No Request/Response shaping here.
 */
const AdminInvoiceDetailInputSchema = Schema.Struct({
  invoiceId: Schema.NonEmptyString,
  tenant: Schema.Struct({
    scope: PlatformScopeSchema,
    scopeId: Schema.NonEmptyString,
  }),
  customerId: Schema.NonEmptyString,
});

const loadAdminInvoiceDetailData = async (
  request: Request,
  environment: unknown,
  input: AdminInvoiceDetailInput,
): Promise<AdminInvoiceDetailRouteData> => {
  const { loadAdminInvoiceDetailRouteDataFromRequest } =
    await import("./invoice-detail-route-data");
  return Effect.runPromise(
    loadAdminInvoiceDetailRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminInvoiceDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(AdminInvoiceDetailInputSchema))
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminInvoiceDetailInput;
    }) => loadAdminInvoiceDetailData(context.request, process.env, data),
  );
