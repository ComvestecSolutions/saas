import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  supportOperationsBreakGlassIncidentStatus,
  supportOperationsCaseStatus,
  supportOperationsImpersonationSessionStatus,
  type SupportOperationsBreakGlassIncidentStatus,
  type SupportOperationsCaseStatus,
  type SupportOperationsImpersonationSessionStatus,
} from "@comvestec/contracts";
import type {
  AdminSupportCasesInput,
  AdminSupportCasesRouteData,
} from "./support-cases-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";

/**
 * Server-function entrypoint for the spec-canonical `/desk/support`
 * Support & Incident v2 surface (admin-app implementation plan
 * §8.8 + §11 — Phase 5 commit 1). Decodes the loader input at
 * the framework boundary and runs the route-data Effect on the
 * server. No Request/Response shaping lives here — that belongs
 * in platform HTTP adapters.
 */
export type AdminSupportCasesRawInput = {
  readonly caseStatus?: unknown;
  readonly incidentStatus?: unknown;
  readonly impersonationStatus?: unknown;
  readonly selectedIncidentId?: unknown;
};

const knownCaseStatuses = new Set<string>(
  Object.values(supportOperationsCaseStatus),
);
const knownIncidentStatuses = new Set<string>(
  Object.values(supportOperationsBreakGlassIncidentStatus),
);
const knownImpersonationStatuses = new Set<string>(
  Object.values(supportOperationsImpersonationSessionStatus),
);

const decodeCaseStatus = (
  value: unknown,
): SupportOperationsCaseStatus | undefined =>
  typeof value === "string" && knownCaseStatuses.has(value)
    ? (value as SupportOperationsCaseStatus)
    : undefined;

const decodeIncidentStatus = (
  value: unknown,
): SupportOperationsBreakGlassIncidentStatus | undefined =>
  typeof value === "string" && knownIncidentStatuses.has(value)
    ? (value as SupportOperationsBreakGlassIncidentStatus)
    : undefined;

const decodeImpersonationStatus = (
  value: unknown,
): SupportOperationsImpersonationSessionStatus | undefined =>
  typeof value === "string" && knownImpersonationStatuses.has(value)
    ? (value as SupportOperationsImpersonationSessionStatus)
    : undefined;

const decodeOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const decodeRawInput = (
  raw: AdminSupportCasesRawInput | undefined,
): AdminSupportCasesInput => {
  const safe = raw ?? {};
  const caseStatus = decodeCaseStatus(safe.caseStatus);
  const incidentStatus = decodeIncidentStatus(safe.incidentStatus);
  const impersonationStatus = decodeImpersonationStatus(
    safe.impersonationStatus,
  );
  const selectedIncidentId = decodeOptionalString(safe.selectedIncidentId);
  return {
    ...(caseStatus === undefined ? {} : { caseStatus }),
    ...(incidentStatus === undefined ? {} : { incidentStatus }),
    ...(impersonationStatus === undefined ? {} : { impersonationStatus }),
    ...(selectedIncidentId === undefined ? {} : { selectedIncidentId }),
  };
};

const loadAdminSupportCasesData = async (
  request: Request,
  environment: unknown,
  raw: AdminSupportCasesRawInput | undefined,
): Promise<AdminSupportCasesRouteData> => {
  const { loadAdminSupportCasesRouteDataFromRequest } =
    await import("./support-cases-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminSupportCasesRouteDataFromRequest(request, environment, decoded),
  );
};

export const getAdminSupportCasesData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminSupportCasesRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminSupportCasesRawInput | undefined;
    }) => loadAdminSupportCasesData(context.request, process.env, data),
  );
