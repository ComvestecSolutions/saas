import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import { PlatformScopeSchema } from "@comvestec/contracts";
import type {
  AdminDomainDetailInput,
  AdminDomainDetailRouteData,
} from "./domain-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for `/desk/domain/$hostname`
 * (admin-app implementation plan §8.10 + §11 — Phase 4 Domain
 * operator screens commit 2). Decodes the loader input at the
 * framework boundary and runs the route-data Effect on the
 * server. No Request/Response shaping lives here.
 */
const AdminDomainDetailInputSchema = Schema.Struct({
  hostname: Schema.NonEmptyString,
  tenant: Schema.Struct({
    scope: PlatformScopeSchema,
    scopeId: Schema.NonEmptyString,
  }),
});

const loadAdminDomainDetailData = async (
  request: Request,
  environment: unknown,
  input: AdminDomainDetailInput,
): Promise<AdminDomainDetailRouteData> => {
  const { loadAdminDomainDetailRouteDataFromRequest } =
    await import("./domain-detail-route-data");
  return Effect.runPromise(
    loadAdminDomainDetailRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminDomainDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(AdminDomainDetailInputSchema))
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminDomainDetailInput;
    }) => loadAdminDomainDetailData(context.request, process.env, data),
  );
