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

/**
 * Server-function entrypoint for the spec-canonical `/r/vendors`
 * Vendor Health v2 list surface (admin-app implementation plan
 * §8.15 + §11 — Phase 6 commit 6a). Decodes the (empty) loader
 * input at the framework boundary and runs the route-data
 * Effect on the server. No Request/Response shaping lives here.
 */
export type AdminVendorListRawInput = Record<string, never>;

const decodeRawInput = (
  _raw: AdminVendorListRawInput | undefined,
): AdminVendorListInput => ({});

const loadAdminVendorListData = async (
  request: Request,
  environment: unknown,
  raw: AdminVendorListRawInput | undefined,
): Promise<AdminVendorListRouteData> => {
  const { loadAdminVendorListRouteDataFromRequest } =
    await import("./vendor-list-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminVendorListRouteDataFromRequest(request, environment, decoded),
  );
};

export const getAdminVendorListData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminVendorListRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminVendorListRawInput | undefined;
    }) => loadAdminVendorListData(context.request, process.env, data),
  );
