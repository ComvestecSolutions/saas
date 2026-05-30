import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import type {
  AdminIncidentDetailInput,
  AdminIncidentDetailRouteData,
} from "./incident-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for `/desk/incident/$incidentId`
 * (admin-app implementation plan §8.8 + §11 — Phase 5 commit
 * 1). Decodes the loader input at the framework boundary and
 * runs the route-data Effect on the server. No Request/Response
 * shaping lives here.
 */
const AdminIncidentDetailInputSchema = Schema.Struct({
  incidentId: Schema.NonEmptyString,
});

const loadAdminIncidentDetailData = async (
  request: Request,
  environment: unknown,
  input: AdminIncidentDetailInput,
): Promise<AdminIncidentDetailRouteData> => {
  const { loadAdminIncidentDetailRouteDataFromRequest } =
    await import("./incident-detail-route-data");
  return Effect.runPromise(
    loadAdminIncidentDetailRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminIncidentDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(AdminIncidentDetailInputSchema))
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminIncidentDetailInput;
    }) => loadAdminIncidentDetailData(context.request, process.env, data),
  );
