import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { PlatformScopeSchema } from "@comvestec/contracts";
import type {
  AdminLegalHoldDetailInput,
  AdminLegalHoldDetailRouteData,
} from "./legal-hold-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for `/desk/legal-hold/$holdId`
 * (admin-app implementation plan §8.11 + §11 — Phase 5 commit
 * 2). Decodes the loader input at the framework boundary and
 * runs the route-data Effect on the server. No
 * Request/Response shaping lives here.
 */
const AdminLegalHoldDetailInputSchema = Schema.Struct({
  holdId: Schema.NonEmptyString,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

const loadAdminLegalHoldDetailData = async (
  request: Request,
  environment: unknown,
  input: AdminLegalHoldDetailInput,
): Promise<AdminLegalHoldDetailRouteData> => {
  const { loadAdminLegalHoldDetailRouteDataFromRequest } =
    await import("./legal-hold-detail-route-data");
  return Effect.runPromise(
    loadAdminLegalHoldDetailRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminLegalHoldDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(AdminLegalHoldDetailInputSchema))
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminLegalHoldDetailInput;
    }) => loadAdminLegalHoldDetailData(context.request, process.env, data),
  );
