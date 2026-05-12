import { Effect, ParseResult, Schema } from "effect";
import {
  type AdminBillingExplanationRequest,
  BillingPlanCreateInputSchema,
  TenantContextSchema,
  type BillingRepairGapCancelRequest,
  type BillingRepairGapListRequest,
  type BillingPlanCreateRequest,
  IsoTimestampSchema,
  type BillingRepairGapReplayRequest,
  type BillingReconciliationManualRunRequest,
} from "@comvestec/contracts";
import {
  extractAuthenticatedWorkflowExecutionContextFromHeaders,
  extractRequiredSubscriberJourneySessionIdFromHeader,
} from "../access/request-context-transport";
import {
  createJsonResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  isTaggedError,
  matchHttpEffect,
  readRequestJson,
} from "../communication/http-transport";
import {
  type AdminBillingRuntimeError,
  runAdminBillingFromEnvironment,
  type AdminBillingService,
} from "./admin-billing";

export type { AdminBillingService } from "./admin-billing";

type AdminBillingServiceRunner = <A, E>(
  use: (service: AdminBillingService) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | AdminBillingRuntimeError | ParseResult.ParseError>;

type JsonRequestErrorTag =
  | "AdminBillingJsonInvalidError"
  | "AdminBillingJsonRequestParseError";

type JsonRequestError = {
  readonly _tag: JsonRequestErrorTag;
};

export const adminBillingApiBasePath = "/api/admin/billing";

export const adminBillingApiPath = {
  createManagedPlan: `${adminBillingApiBasePath}/plans`,
  inspectBillingState: `${adminBillingApiBasePath}/inspections`,
  listRepairGaps: `${adminBillingApiBasePath}/repair-gaps`,
  cancelRepairGap: `${adminBillingApiBasePath}/repair-gaps/cancellations`,
  replayRepairGap: `${adminBillingApiBasePath}/repair-gaps/replays`,
  runManualReconciliation: `${adminBillingApiBasePath}/reconciliation/runs`,
} as const;

export const RunManualBillingReconciliationHttpRequestSchema = Schema.Struct({
  now: Schema.optional(IsoTimestampSchema),
});

export const ReplayBillingRepairGapHttpRequestSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  inspectionReason: Schema.optional(Schema.NonEmptyString),
});

export const CancelBillingRepairGapHttpRequestSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  inspectionReason: Schema.optional(Schema.NonEmptyString),
});

export const CreateManagedBillingPlanHttpRequestSchema = Schema.Struct({
  plan: BillingPlanCreateInputSchema,
});

export const InspectBillingStateHttpRequestSchema = Schema.Struct({
  tenant: TenantContextSchema,
  inspectionReason: Schema.optional(Schema.NonEmptyString),
});

const buildErrorResponse = (error: unknown) => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "AdminBillingJsonInvalidError":
        return createJsonResponse(
          { error: "Request body must be valid JSON." },
          400,
        );
      case "AdminBillingJsonRequestParseError":
      case "ParseError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "BearerTokenMissingError":
        return createJsonResponse(
          { error: "Keycloak bearer token is required." },
          401,
        );
      case "AdminBillingProjectionConfigurationError":
      case "AdminBillingWorkflowExecutionUnavailableError":
        return createJsonResponse(
          { error: "Admin billing request failed." },
          500,
        );
      case "AdminBillingWorkflowExecutionIdentityMismatchError":
        return createJsonResponse(
          {
            error:
              "Operator identity and Convex token provenance did not match.",
          },
          403,
        );
      case "AdminBillingRepairGapNotFoundError":
        return createJsonResponse(
          { error: "Requested billing repair gap was not found." },
          404,
        );
      case "AdminBillingRepairGapReplayUnavailableError":
        return createJsonResponse(
          { error: "Billing repair gap is no longer eligible for replay." },
          409,
        );
      case "AdminBillingRepairGapCancelUnavailableError":
        return createJsonResponse(
          {
            error: "Billing repair gap is no longer eligible for cancellation.",
          },
          409,
        );
      case "ManagedBillingPlanAccessDeniedError":
        return createJsonResponse(
          { error: "Billing plan management is not allowed for this session." },
          403,
        );
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "AuditLogPostgresRepositoryPersistenceError":
      case "AuthorizationDelegatedCheckError":
      case "BillingStatePostgresRepositoryQueryError":
      case "WorkflowJobsPostgresRepositoryQueryError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
      case "PolarCatalogMetadataError":
        return createJsonResponse(
          {
            error:
              "Provider payload could not be mapped to the platform contract.",
          },
          422,
        );
      case "ConvexAdapterRequestError":
        if ((error as { readonly status?: number }).status === 401) {
          return createJsonResponse(
            {
              error:
                "Keycloak bearer token is no longer valid for Convex execution.",
            },
            401,
          );
        }

        if ((error as { readonly status?: number }).status === 403) {
          return createJsonResponse(
            {
              error:
                "Convex denied the operator identity for this workflow execution.",
            },
            403,
          );
        }

        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
      case "KeycloakAdapterRequestError":
      case "KeycloakPasswordGrantIdTokenMissingError":
      case "PolarAdapterRequestError":
      case "ValkeyAdapterOperationError":
      case "PostgresAdapterConnectionError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
    }
  }

  return createJsonResponse({ error: "Admin billing request failed." }, 500);
};

const buildAccessDeniedResponse = (message: string) => (error: unknown) => {
  if (
    isTaggedError(error) &&
    error._tag === "ManagedBillingPlanAccessDeniedError"
  ) {
    return createJsonResponse({ error: message }, 403);
  }

  return buildErrorResponse(error);
};

const normalizeInspectionReason = (inspectionReason: string | undefined) => {
  const trimmedInspectionReason = inspectionReason?.trim();

  return trimmedInspectionReason !== undefined &&
    trimmedInspectionReason.length > 0
    ? trimmedInspectionReason
    : undefined;
};

const buildManualBillingReconciliationRequest = (
  request: Request,
  body: Schema.Schema.Type<
    typeof RunManualBillingReconciliationHttpRequestSchema
  >,
) =>
  extractAuthenticatedWorkflowExecutionContextFromHeaders(request).pipe(
    Effect.map(
      (context) =>
        ({
          ...context,
          ...(body.now !== undefined ? { now: body.now } : {}),
        }) satisfies BillingReconciliationManualRunRequest,
    ),
  );

const buildBillingRepairGapReplayRequest = (
  request: Request,
  body: Schema.Schema.Type<typeof ReplayBillingRepairGapHttpRequestSchema>,
) =>
  extractAuthenticatedWorkflowExecutionContextFromHeaders(request).pipe(
    Effect.map((context) => {
      const inspectionReason = normalizeInspectionReason(body.inspectionReason);

      return {
        ...context,
        jobId: body.jobId,
        ...(inspectionReason === undefined ? {} : { inspectionReason }),
      } satisfies BillingRepairGapReplayRequest;
    }),
  );

const buildBillingRepairGapCancelRequest = (
  request: Request,
  body: Schema.Schema.Type<typeof CancelBillingRepairGapHttpRequestSchema>,
) =>
  extractAuthenticatedWorkflowExecutionContextFromHeaders(request).pipe(
    Effect.map((context) => {
      const inspectionReason = normalizeInspectionReason(body.inspectionReason);

      return {
        ...context,
        jobId: body.jobId,
        ...(inspectionReason === undefined ? {} : { inspectionReason }),
      } satisfies BillingRepairGapCancelRequest;
    }),
  );

const buildCreateManagedBillingPlanRequest = (
  request: Request,
  body: Schema.Schema.Type<typeof CreateManagedBillingPlanHttpRequestSchema>,
) =>
  extractRequiredSubscriberJourneySessionIdFromHeader(request).pipe(
    Effect.map(
      (sessionId) =>
        ({
          sessionId,
          plan: body.plan,
        }) satisfies BillingPlanCreateRequest,
    ),
  );

const buildInspectBillingStateRequest = (
  request: Request,
  body: Schema.Schema.Type<typeof InspectBillingStateHttpRequestSchema>,
) =>
  extractRequiredSubscriberJourneySessionIdFromHeader(request).pipe(
    Effect.map((sessionId) => {
      const inspectionReason = normalizeInspectionReason(body.inspectionReason);

      return {
        sessionId,
        tenant: body.tenant,
        ...(inspectionReason === undefined ? {} : { inspectionReason }),
      } satisfies AdminBillingExplanationRequest;
    }),
  );

const buildListBillingRepairGapsRequest = (request: Request) => {
  const inspectionReason = normalizeInspectionReason(
    new URL(request.url).searchParams.get("inspectionReason") ?? undefined,
  );

  return extractRequiredSubscriberJourneySessionIdFromHeader(request).pipe(
    Effect.map(
      (sessionId) =>
        ({
          sessionId,
          ...(inspectionReason === undefined ? {} : { inspectionReason }),
        }) satisfies BillingRepairGapListRequest,
    ),
  );
};

export const createAdminBillingHttpHandler =
  (runWithService: AdminBillingServiceRunner) => (request: Request) => {
    const url = new URL(request.url);

    switch (url.pathname) {
      case adminBillingApiPath.inspectBillingState:
        if (request.method !== "POST") {
          return Effect.succeed(createMethodNotAllowedResponse(["POST"]));
        }

        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "AdminBillingJsonInvalidError",
            decode: Schema.decodeUnknown(InspectBillingStateHttpRequestSchema),
          }).pipe(
            Effect.flatMap((body) =>
              buildInspectBillingStateRequest(request, body),
            ),
            Effect.flatMap((input) =>
              runWithService((service) => service.inspectBillingState(input)),
            ),
          ),
          onSuccess: (result) => createJsonResponse(result),
          onFailure: buildAccessDeniedResponse(
            "Billing state inspection is not allowed for this session.",
          ),
        });
      case adminBillingApiPath.listRepairGaps:
        if (request.method !== "GET") {
          return Effect.succeed(createMethodNotAllowedResponse(["GET"]));
        }

        return matchHttpEffect({
          effect: buildListBillingRepairGapsRequest(request).pipe(
            Effect.flatMap((input) =>
              runWithService((service) => service.listBillingRepairGaps(input)),
            ),
          ),
          onSuccess: (result) => createJsonResponse(result),
          onFailure: buildAccessDeniedResponse(
            "Billing repair gap inspection is not allowed for this session.",
          ),
        });
      case adminBillingApiPath.createManagedPlan:
        if (request.method !== "POST") {
          return Effect.succeed(createMethodNotAllowedResponse(["POST"]));
        }

        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "AdminBillingJsonInvalidError",
            decode: Schema.decodeUnknown(
              CreateManagedBillingPlanHttpRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((body) =>
              buildCreateManagedBillingPlanRequest(request, body),
            ),
            Effect.flatMap((input) =>
              runWithService((service) =>
                service.createManagedBillingPlan(input),
              ),
            ),
          ),
          onSuccess: (result) => createJsonResponse(result, 202),
          onFailure: buildAccessDeniedResponse(
            "Billing plan management is not allowed for this session.",
          ),
        });
      case adminBillingApiPath.cancelRepairGap:
        if (request.method !== "POST") {
          return Effect.succeed(createMethodNotAllowedResponse(["POST"]));
        }

        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "AdminBillingJsonInvalidError",
            decode: Schema.decodeUnknown(
              CancelBillingRepairGapHttpRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((body) =>
              buildBillingRepairGapCancelRequest(request, body),
            ),
            Effect.flatMap((input) =>
              runWithService((service) =>
                service.cancelBillingRepairGap(input),
              ),
            ),
          ),
          onSuccess: (result) => createJsonResponse(result),
          onFailure: buildAccessDeniedResponse(
            "Billing repair cancellation is not allowed for this session.",
          ),
        });
      case adminBillingApiPath.replayRepairGap:
        if (request.method !== "POST") {
          return Effect.succeed(createMethodNotAllowedResponse(["POST"]));
        }

        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "AdminBillingJsonInvalidError",
            decode: Schema.decodeUnknown(
              ReplayBillingRepairGapHttpRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((body) =>
              buildBillingRepairGapReplayRequest(request, body),
            ),
            Effect.flatMap((input) =>
              runWithService((service) =>
                service.replayBillingRepairGap(input),
              ),
            ),
          ),
          onSuccess: (result) => createJsonResponse(result),
          onFailure: buildAccessDeniedResponse(
            "Billing repair replay is not allowed for this session.",
          ),
        });
      case adminBillingApiPath.runManualReconciliation:
        if (request.method !== "POST") {
          return Effect.succeed(createMethodNotAllowedResponse(["POST"]));
        }

        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "AdminBillingJsonInvalidError",
            decode: Schema.decodeUnknown(
              RunManualBillingReconciliationHttpRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((body) =>
              buildManualBillingReconciliationRequest(request, body),
            ),
            Effect.flatMap((input) =>
              runWithService((service) =>
                service.runManualBillingReconciliation(input),
              ),
            ),
          ),
          onSuccess: (result) => createJsonResponse(result),
          onFailure: buildAccessDeniedResponse(
            "Manual billing reconciliation is not allowed for this session.",
          ),
        });
      default:
        return Effect.succeed(
          createNotFoundResponse("Admin billing route not found."),
        );
    }
  };

export const handleAdminBillingHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createAdminBillingHttpHandler((use) =>
    runAdminBillingFromEnvironment(environment, use),
  )(request);
