import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import type {
  AdminAuditInput,
  AdminAuditRouteData,
} from "./admin-audit-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeEmptyInput } from "./effect-boundary";

/**
 * Server-function entrypoint for the spec-canonical
 * `/admin/audit` admin-organization-scoped audit feed surface
 * (admin-app implementation plan §11 — Phase 7 commit
 * 7b-2-audit). Decodes the loader input at the framework
 * boundary and runs the route-data Effect on the server.
 * No Request/Response shaping lives here.
 */
export type AdminAuditRawInput = Record<string, unknown> | undefined;

const loadAdminAuditData = async (
  request: Request,
  environment: unknown,
  _input: AdminAuditInput,
): Promise<AdminAuditRouteData> => {
  const { loadAdminAuditRouteDataFromRequest } =
    await import("./admin-audit-route-data");
  return Effect.runPromise(
    loadAdminAuditRouteDataFromRequest(request, environment),
  );
};

export const getAdminAuditData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeEmptyInput)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminAuditInput;
    }) => loadAdminAuditData(context.request, process.env, data),
  );
