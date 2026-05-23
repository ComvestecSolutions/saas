import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import type {
  AdminIncidentDetailInput,
  AdminIncidentDetailRouteData,
} from "./incident-detail-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Server-function entrypoint for `/r/incident/$incidentId`
 * (admin-app implementation plan §8.8 + §11 — Phase 5 commit
 * 1). Decodes the loader input at the framework boundary and
 * runs the route-data Effect on the server. No Request/Response
 * shaping lives here.
 */
export type AdminIncidentDetailRawInput = {
  readonly incidentId?: unknown;
};

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Incident detail loader requires '${label}'.`);
  }
  return value;
};

const decodeRawInput = (
  raw: AdminIncidentDetailRawInput | undefined,
): AdminIncidentDetailInput => {
  const safe = raw ?? {};
  return {
    incidentId: requireString(safe.incidentId, "incidentId"),
  };
};

const loadAdminIncidentDetailData = async (
  request: Request,
  environment: unknown,
  raw: AdminIncidentDetailRawInput | undefined,
): Promise<AdminIncidentDetailRouteData> => {
  const { loadAdminIncidentDetailRouteDataFromRequest } =
    await import("./incident-detail-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminIncidentDetailRouteDataFromRequest(request, environment, decoded),
  );
};

export const getAdminIncidentDetailData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminIncidentDetailRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminIncidentDetailRawInput | undefined;
    }) => loadAdminIncidentDetailData(context.request, process.env, data),
  );
