import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  PlatformAdapterServiceNameSchema,
  type PlatformAdapterServiceName,
} from "@comvestec/contracts";
import type {
  AdminVendorDetailInput,
  AdminVendorDetailRouteData,
} from "./vendor-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for `/desk/vendor/$service` (admin-app
 * implementation plan §8.15 + §11 — Phase 6 commit 6a). Decodes
 * the loader input at the framework boundary and runs the
 * route-data Effect on the server. No Request/Response shaping
 * lives here. The decoder narrows the URL-supplied service
 * name through the canonical
 * {@link platformAdapterServiceName} vocabulary so no raw
 * service-name literal leaks past the loader boundary.
 */
const AdminVendorDetailInputSchema = Schema.Struct({
  serviceName: PlatformAdapterServiceNameSchema,
});

const loadAdminVendorDetailData = async (
  request: Request,
  environment: unknown,
  input: AdminVendorDetailInput,
): Promise<AdminVendorDetailRouteData> => {
  const { loadAdminVendorDetailRouteDataFromRequest } =
    await import("./vendor-detail-route-data");
  return Effect.runPromise(
    loadAdminVendorDetailRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminVendorDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(AdminVendorDetailInputSchema))
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminVendorDetailInput;
    }) => loadAdminVendorDetailData(context.request, process.env, data),
  );
