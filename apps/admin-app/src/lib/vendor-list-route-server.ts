import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import type {
  AdminVendorListInput,
  AdminVendorListRouteData,
} from "./vendor-list-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeEmptyInput } from "./effect-boundary";

/**
 * Server-function entrypoint for the spec-canonical `/desk/vendors`
 * Vendor Health v2 list surface (admin-app implementation plan
 * §8.15 + §11 — Phase 6 commit 6a). Decodes the (empty) loader
 * input at the framework boundary and runs the route-data
 * Effect on the server. No Request/Response shaping lives here.
 */
const loadAdminVendorListData = async (
  request: Request,
  environment: unknown,
  input: AdminVendorListInput,
): Promise<AdminVendorListRouteData> => {
  const { loadAdminVendorListRouteDataFromRequest } =
    await import("./vendor-list-route-data");

  return Effect.runPromise(
    loadAdminVendorListRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminVendorListData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeEmptyInput)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminVendorListInput;
    }) => loadAdminVendorListData(context.request, process.env, data),
  );
