import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  platformAdapterServiceName,
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
export type AdminVendorDetailRawInput = {
  readonly serviceName?: unknown;
};

const knownServiceNames = new Set<string>(
  Object.values(platformAdapterServiceName),
);

const requireServiceName = (value: unknown): PlatformAdapterServiceName => {
  if (typeof value !== "string" || !knownServiceNames.has(value)) {
    throw new Error(
      "Vendor detail loader requires 'serviceName' to be a known platformAdapterServiceName.",
    );
  }
  return value as PlatformAdapterServiceName;
};

const decodeRawInput = (
  raw: AdminVendorDetailRawInput | undefined,
): AdminVendorDetailInput => ({
  serviceName: requireServiceName(raw?.serviceName),
});

const loadAdminVendorDetailData = async (
  request: Request,
  environment: unknown,
  raw: AdminVendorDetailRawInput | undefined,
): Promise<AdminVendorDetailRouteData> => {
  const { loadAdminVendorDetailRouteDataFromRequest } =
    await import("./vendor-detail-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminVendorDetailRouteDataFromRequest(request, environment, decoded),
  );
};

export const getAdminVendorDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminVendorDetailRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminVendorDetailRawInput | undefined;
    }) => loadAdminVendorDetailData(context.request, process.env, data),
  );
