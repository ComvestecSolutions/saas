import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  SupportOperationsBreakGlassIncidentStatusSchema,
  SupportOperationsCaseStatusSchema,
  SupportOperationsImpersonationSessionStatusSchema,
} from "@comvestec/contracts";
import type {
  AdminSupportCasesInput,
  AdminSupportCasesRouteData,
} from "./support-cases-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSchemaOrUndefined, decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for the spec-canonical `/desk/support`
 * Support & Incident v2 surface (admin-app implementation plan
 * §8.8 + §11 — Phase 5 commit 1). Decodes the loader input at
 * the framework boundary and runs the route-data Effect on the
 * server. No Request/Response shaping lives here — that belongs
 * in platform HTTP adapters.
 */
const AdminSupportCasesRawInputSchema = Schema.Union(
  Schema.Undefined,
  Schema.Struct({
    caseStatus: Schema.optional(Schema.Unknown),
    incidentStatus: Schema.optional(Schema.Unknown),
    impersonationStatus: Schema.optional(Schema.Unknown),
    selectedIncidentId: Schema.optional(Schema.Unknown),
  }),
);

type AdminSupportCasesRawInput = Schema.Schema.Type<
  typeof AdminSupportCasesRawInputSchema
>;

const decodeAdminSupportCasesRawInput = decodeSyncBoundary(
  AdminSupportCasesRawInputSchema,
);
const decodeCaseStatus = decodeSchemaOrUndefined(
  SupportOperationsCaseStatusSchema,
);
const decodeIncidentStatus = decodeSchemaOrUndefined(
  SupportOperationsBreakGlassIncidentStatusSchema,
);
const decodeImpersonationStatus = decodeSchemaOrUndefined(
  SupportOperationsImpersonationSessionStatusSchema,
);
const decodeOptionalString = decodeSchemaOrUndefined(Schema.NonEmptyString);

const normalizeAdminSupportCasesInput = (
  raw: AdminSupportCasesRawInput,
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
  input: AdminSupportCasesInput,
): Promise<AdminSupportCasesRouteData> => {
  const { loadAdminSupportCasesRouteDataFromRequest } =
    await import("./support-cases-route-data");

  return Effect.runPromise(
    loadAdminSupportCasesRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminSupportCasesData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeAdminSupportCasesInput(decodeAdminSupportCasesRawInput(input)),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminSupportCasesInput;
    }) => loadAdminSupportCasesData(context.request, process.env, data),
  );
