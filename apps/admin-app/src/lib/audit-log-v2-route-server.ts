import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import type { AdminAuditLogV2RouteData } from "./audit-log-v2-route-data";
import type { AdminAuditLogV2RawSearch } from "./audit-log-v2-search";
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
  rawSearch: AdminAuditLogV2RawSearch,
): Promise<AdminAuditLogV2RouteData> => {
  const [
    { loadAdminAuditLogV2RouteDataFromRequest },
    { decodeAuditLogV2Search },
  ] = await Promise.all([
    import("./audit-log-v2-route-data"),
    import("./audit-log-v2-search"),
  ]);

  const filters = decodeAuditLogV2Search(rawSearch);

  return Effect.runPromise(
    loadAdminAuditLogV2RouteDataFromRequest(request, environment, filters),
  );
};

const runAdminAuditLogV2Export = async (
  request: Request,
  environment: unknown,
  rawSearch: AdminAuditLogV2RawSearch,
) => {
  const {
    exportAdminAuditEventsFromEnvironment,
    extractRequiredSubscriberJourneySessionId,
  } = await import("@comvestec/platform");
  const { decodeAuditLogV2Search, toAuditExportFilter } =
    await import("./audit-log-v2-search");

  const filters = decodeAuditLogV2Search(rawSearch);

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

const normalizeRawSearch = (
  raw: AdminAuditLogV2RawSearch | undefined,
): AdminAuditLogV2RawSearch => raw ?? {};

export const getAdminAuditLogV2Data = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminAuditLogV2RawSearch | undefined) =>
    normalizeRawSearch(input),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminAuditLogV2RawSearch;
    }) => loadAdminAuditLogV2Data(context.request, process.env, data),
  );

export const getAdminAuditLogV2Export = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminAuditLogV2RawSearch | undefined) =>
    normalizeRawSearch(input),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminAuditLogV2RawSearch;
    }) => runAdminAuditLogV2Export(context.request, process.env, data),
  );
