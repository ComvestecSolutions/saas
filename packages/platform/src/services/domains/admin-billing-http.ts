import { Effect, ParseResult, Schema } from "effect";
import {
  IsoTimestampSchema,
  type BillingRepairGapReplayRequest,
  type BillingReconciliationManualRunRequest,
  BillingPlanCreateRequestSchema,
  BillingRepairGapListRequestSchema,
} from "@comvestec/contracts";
import { extractSubscriberJourneySessionId } from "../access/request-context-transport";
import {
  createJsonResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  isTaggedError,
  matchHttpEffect,
  readRequestJson,
  readRequestQuery,
} from "../communication/http-transport";
import {
  type AdminBillingProjectionConfigurationError,
  runAdminBillingFromEnvironment,
  type AdminBillingService,
} from "./admin-billing";

export type { AdminBillingService } from "./admin-billing";

type AdminBillingServiceRunner = <A, E>(
  use: (service: AdminBillingService) => Effect.Effect<A, E>,
) => Effect.Effect<
  A,
  | E
  | AdminBillingProjectionConfigurationError
  | ParseResult.ParseError
  | { readonly _tag: "PostgresAdapterConnectionError" }
>;

type JsonRequestErrorTag =
  | "AdminBillingJsonInvalidError"
  | "AdminBillingJsonRequestParseError"
  | "AdminBillingSessionIdMissingError"
  | "AdminBillingBearerTokenMissingError";

type JsonRequestError = {
  readonly _tag: JsonRequestErrorTag;
};

export const adminBillingApiBasePath = "/api/admin/billing";

export const adminBillingApiPath = {
  createManagedPlan: `${adminBillingApiBasePath}/plans`,
  listRepairGaps: `${adminBillingApiBasePath}/repair-gaps`,
  replayRepairGap: `${adminBillingApiBasePath}/repair-gaps/replays`,
  runManualReconciliation: `${adminBillingApiBasePath}/reconciliation/runs`,
} as const;

export const RunManualBillingReconciliationHttpRequestSchema = Schema.Struct({
  now: Schema.optional(IsoTimestampSchema),
});

export const ReplayBillingRepairGapHttpRequestSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
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
      case "AdminBillingSessionIdMissingError":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "AdminBillingBearerTokenMissingError":
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

const extractBearerToken = (request: Request) => {
  const authorizationHeader = request.headers.get("authorization")?.trim();

  if (authorizationHeader === undefined) {
    return Effect.succeed<string | undefined>(undefined);
  }

  const [scheme, ...tokenSegments] = authorizationHeader.split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer") {
    return Effect.succeed<string | undefined>(undefined);
  }

  const token = tokenSegments.join(" ").trim();

  return Effect.succeed<string | undefined>(
    token.length === 0 ? undefined : token,
  );
};

const extractAuthenticatedWorkflowExecutionContext = (request: Request) =>
  Effect.gen(function* () {
    const sessionId = yield* extractSubscriberJourneySessionId(request);
    const convexAuthToken = yield* extractBearerToken(request);

    if (sessionId === undefined) {
      return yield* Effect.fail({
        _tag: "AdminBillingSessionIdMissingError",
      } satisfies JsonRequestError);
    }

    if (convexAuthToken === undefined || convexAuthToken.length === 0) {
      return yield* Effect.fail({
        _tag: "AdminBillingBearerTokenMissingError",
      } satisfies JsonRequestError);
    }

    return {
      sessionId,
      convexAuthToken,
    };
  });

const buildManualBillingReconciliationRequest = (
  request: Request,
  body: Schema.Schema.Type<
    typeof RunManualBillingReconciliationHttpRequestSchema
  >,
): Effect.Effect<BillingReconciliationManualRunRequest, JsonRequestError> =>
  extractAuthenticatedWorkflowExecutionContext(request).pipe(
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
): Effect.Effect<BillingRepairGapReplayRequest, JsonRequestError> =>
  extractAuthenticatedWorkflowExecutionContext(request).pipe(
    Effect.map(
      (context) =>
        ({
          ...context,
          jobId: body.jobId,
        }) satisfies BillingRepairGapReplayRequest,
    ),
  );

export const createAdminBillingHttpHandler =
  (runWithService: AdminBillingServiceRunner) => (request: Request) => {
    const url = new URL(request.url);

    switch (url.pathname) {
      case adminBillingApiPath.listRepairGaps:
        if (request.method !== "GET") {
          return Effect.succeed(createMethodNotAllowedResponse(["GET"]));
        }

        return matchHttpEffect({
          effect: readRequestQuery({
            url,
            decode: Schema.decodeUnknown(BillingRepairGapListRequestSchema),
          }).pipe(
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
            decode: Schema.decodeUnknown(BillingPlanCreateRequestSchema),
          }).pipe(
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
