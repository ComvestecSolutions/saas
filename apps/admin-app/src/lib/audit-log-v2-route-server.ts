import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import type {
  AdminAuditLogV2Filters,
  AdminAuditLogV2RouteData,
} from "./audit-log-v2-route-data";
import {
  decodeAuditLogV2Search,
  toAuditExportFilter,
} from "./audit-log-v2-search";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Server-function entrypoint for `/desk/audit` (admin-app
 * implementation plan §9 — Phase 2 Desk Core commit 6). Mirrors
 * the `/desk/tenants` and `/desk/tenant/$tenantId` v2 trio: runs the
 * route-data Effect on the server, decodes the URL filter
 * payload at the framework edge, and surfaces the
 * discriminated-union state. Performs no Request/Response
 * shaping — transport shaping is owned by platform HTTP
 * adapters.
 *
 * Two server-fns are exposed:
 *
 *   - `getAdminAuditLogV2Data` — discriminated-union loader fed
 *     by `loadAdminAuditLogV2RouteDataFromRequest`.
 *   - `getAdminAuditLogV2Export` — calls
 *     `exportAdminAuditEventsFromEnvironment` so the route can
 *     trigger an operator-initiated JSON export from the same
 *     filter envelope.
 */
const loadAdminAuditLogV2Data = async (
  request: Request,
  environment: unknown,
  filters: AdminAuditLogV2Filters,
): Promise<AdminAuditLogV2RouteData> => {
  const { loadAdminAuditLogV2RouteDataFromRequest } =
    await import("./audit-log-v2-route-data");

  return Effect.runPromise(
    loadAdminAuditLogV2RouteDataFromRequest(request, environment, filters),
  );
};

const runAdminAuditLogV2Export = async (
  request: Request,
  environment: unknown,
  filters: AdminAuditLogV2Filters,
) => {
  const {
    exportAdminAuditEventsFromEnvironment,
    extractRequiredSubscriberJourneySessionId,
  } = await import("@comvestec/platform");

  return Effect.runPromise(
    extractRequiredSubscriberJourneySessionId(request).pipe(
      Effect.flatMap((sessionId) =>
        exportAdminAuditEventsFromEnvironment(environment, {
          sessionId,
          filter: toAuditExportFilter(filters),
        }),
      ),
    ),
  );
};

export const getAdminAuditLogV2Data = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) => decodeAuditLogV2Search(input))
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminAuditLogV2Filters;
    }) => loadAdminAuditLogV2Data(context.request, process.env, data),
  );

export const getAdminAuditLogV2Export = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) => decodeAuditLogV2Search(input))
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminAuditLogV2Filters;
    }) => runAdminAuditLogV2Export(context.request, process.env, data),
  );
