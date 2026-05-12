import { Effect, ParseResult, Schema } from "effect";
import {
  PlatformModuleIdSchema,
  type WorkflowJobRepairGapCancelRequest,
  type WorkflowJobRepairGapListRequest,
  type WorkflowJobRepairGapReplayRequest,
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
  runWorkflowJobsFromEnvironment,
  type WorkflowJobsProjectionConfigurationError,
  type WorkflowJobsServiceApi,
} from "./workflow-jobs";

type WorkflowJobsServiceRunner = <A, E>(
  use: (service: WorkflowJobsServiceApi) => Effect.Effect<A, E>,
) => Effect.Effect<
  A,
  | E
  | WorkflowJobsProjectionConfigurationError
  | ParseResult.ParseError
  | { readonly _tag: "SubscriberJourneyRuntimeError"; readonly cause: unknown }
  | { readonly _tag: "PostgresAdapterConnectionError" }
>;

export const workflowJobsApiBasePath = "/api/admin/workflow-jobs";

export const workflowJobsApiPath = {
  listRepairGaps: `${workflowJobsApiBasePath}/repair-gaps`,
  replayRepairGap: `${workflowJobsApiBasePath}/repair-gaps/replays`,
  cancelRepairGap: `${workflowJobsApiBasePath}/repair-gaps/cancellations`,
} as const;

export const ListWorkflowJobRepairGapsHttpQuerySchema = Schema.Struct({
  sourceModuleId: PlatformModuleIdSchema,
  inspectionReason: Schema.optional(Schema.NonEmptyString),
});

export const CancelWorkflowJobRepairGapHttpRequestSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  inspectionReason: Schema.optional(Schema.NonEmptyString),
});

export const ReplayWorkflowJobRepairGapHttpRequestSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
  inspectionReason: Schema.optional(Schema.NonEmptyString),
});

const normalizeInspectionReason = (inspectionReason: string | undefined) => {
  const trimmedInspectionReason = inspectionReason?.trim();

  return trimmedInspectionReason !== undefined &&
    trimmedInspectionReason.length > 0
    ? trimmedInspectionReason
    : undefined;
};

const buildErrorResponse = (
  error: unknown,
  operation: "list" | "replay" | "cancel",
) => {
  if (isTaggedError(error)) {
    switch (error._tag) {
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
      case "WorkflowJobsAccessDeniedError":
        return createJsonResponse(
          {
            error:
              operation === "cancel"
                ? "Workflow job repair-gap cancellation is not allowed for this session."
                : operation === "replay"
                  ? "Workflow job repair-gap replay is not allowed for this session."
                  : "Workflow job repair-gap inspection is not allowed for this session.",
          },
          403,
        );
      case "BearerTokenMissingError":
        return createJsonResponse(
          { error: "Keycloak bearer token is required." },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "WorkflowJobsProjectionConfigurationError":
      case "WorkflowJobsWorkflowExecutionUnavailableError":
        return createJsonResponse(
          { error: "Workflow job request failed." },
          500,
        );
      case "WorkflowJobsWorkflowExecutionIdentityMismatchError":
        return createJsonResponse(
          {
            error:
              "Operator identity and Convex token provenance did not match.",
          },
          403,
        );
      case "WorkflowJobsRepairGapNotFoundError":
        return createJsonResponse(
          { error: "Requested workflow repair gap was not found." },
          404,
        );
      case "WorkflowJobsRepairGapReplayUnavailableError":
        return createJsonResponse(
          {
            error: "Workflow repair gap is no longer eligible for replay.",
          },
          409,
        );
      case "WorkflowJobsRepairGapCancelUnavailableError":
        return createJsonResponse(
          {
            error:
              "Workflow repair gap is no longer eligible for cancellation.",
          },
          409,
        );
      case "SubscriberJourneyRuntimeError":
      case "AuditLogPostgresRepositoryPersistenceError":
      case "AuthorizationDelegatedCheckError":
      case "KeycloakAdapterRequestError":
      case "WorkflowJobsPostgresRepositoryQueryError":
      case "ValkeyAdapterOperationError":
      case "PostgresAdapterConnectionError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
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
    }
  }

  return createJsonResponse({ error: "Workflow job request failed." }, 500);
};

const buildListWorkflowJobRepairGapsRequest = (request: Request) => {
  const url = new URL(request.url);
  const inspectionReason = normalizeInspectionReason(
    url.searchParams.get("inspectionReason") ?? undefined,
  );

  return extractRequiredSubscriberJourneySessionIdFromHeader(request).pipe(
    Effect.flatMap((sessionId) =>
      Schema.decodeUnknown(ListWorkflowJobRepairGapsHttpQuerySchema)({
        sourceModuleId: url.searchParams.get("sourceModuleId"),
        ...(inspectionReason === undefined ? {} : { inspectionReason }),
      }).pipe(
        Effect.map(
          (query) =>
            ({
              sessionId,
              ...query,
            }) satisfies WorkflowJobRepairGapListRequest,
        ),
      ),
    ),
  );
};

const buildCancelWorkflowJobRepairGapRequest = (
  request: Request,
  body: Schema.Schema.Type<typeof CancelWorkflowJobRepairGapHttpRequestSchema>,
) =>
  extractAuthenticatedWorkflowExecutionContextFromHeaders(request).pipe(
    Effect.map((context) => {
      const inspectionReason = normalizeInspectionReason(body.inspectionReason);

      return {
        ...context,
        jobId: body.jobId,
        ...(inspectionReason === undefined ? {} : { inspectionReason }),
      } satisfies WorkflowJobRepairGapCancelRequest;
    }),
  );

const buildReplayWorkflowJobRepairGapRequest = (
  request: Request,
  body: Schema.Schema.Type<typeof ReplayWorkflowJobRepairGapHttpRequestSchema>,
) =>
  extractAuthenticatedWorkflowExecutionContextFromHeaders(request).pipe(
    Effect.map((context) => {
      const inspectionReason = normalizeInspectionReason(body.inspectionReason);

      return {
        ...context,
        jobId: body.jobId,
        ...(inspectionReason === undefined ? {} : { inspectionReason }),
      } satisfies WorkflowJobRepairGapReplayRequest;
    }),
  );

export const createWorkflowJobsHttpHandler =
  (runWithService: WorkflowJobsServiceRunner) => (request: Request) => {
    const url = new URL(request.url);

    switch (url.pathname) {
      case workflowJobsApiPath.listRepairGaps:
        if (request.method !== "GET") {
          return Effect.succeed(createMethodNotAllowedResponse(["GET"]));
        }

        return matchHttpEffect({
          effect: buildListWorkflowJobRepairGapsRequest(request).pipe(
            Effect.flatMap((input) =>
              runWithService((service) => service.listRepairGaps(input)),
            ),
          ),
          onSuccess: (result) => createJsonResponse(result),
          onFailure: (error) => buildErrorResponse(error, "list"),
        });
      case workflowJobsApiPath.cancelRepairGap:
        if (request.method !== "POST") {
          return Effect.succeed(createMethodNotAllowedResponse(["POST"]));
        }

        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "ParseError",
            decode: Schema.decodeUnknown(
              CancelWorkflowJobRepairGapHttpRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((body) =>
              buildCancelWorkflowJobRepairGapRequest(request, body),
            ),
            Effect.flatMap((input) =>
              runWithService((service) => service.cancelRepairGap(input)),
            ),
          ),
          onSuccess: (result) => createJsonResponse(result),
          onFailure: (error) => buildErrorResponse(error, "cancel"),
        });
      case workflowJobsApiPath.replayRepairGap:
        if (request.method !== "POST") {
          return Effect.succeed(createMethodNotAllowedResponse(["POST"]));
        }

        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "ParseError",
            decode: Schema.decodeUnknown(
              ReplayWorkflowJobRepairGapHttpRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((body) =>
              buildReplayWorkflowJobRepairGapRequest(request, body),
            ),
            Effect.flatMap((input) =>
              runWithService((service) => service.replayRepairGap(input)),
            ),
          ),
          onSuccess: (result) => createJsonResponse(result),
          onFailure: (error) => buildErrorResponse(error, "replay"),
        });
      default:
        return Effect.succeed(
          createNotFoundResponse("Workflow jobs route not found."),
        );
    }
  };

export const handleWorkflowJobsHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createWorkflowJobsHttpHandler((use) =>
    runWorkflowJobsFromEnvironment(environment, use),
  )(request);
