import { Effect, ParseResult, Schema } from "effect";
import { BillingPlanCreateRequestSchema } from "@comvestec/contracts";
import {
  runSubscriberJourneyFromEnvironment,
  type SubscriberJourneyService,
} from "./subscriber-journey";

type AdminBillingServiceRunner = <A, E>(
  use: (service: SubscriberJourneyService) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | ParseResult.ParseError>;

type JsonRequestErrorTag =
  | "AdminBillingJsonInvalidError"
  | "AdminBillingJsonRequestParseError";

type JsonRequestError = {
  readonly _tag: JsonRequestErrorTag;
};

export const adminBillingApiBasePath = "/api/admin/billing";

export const adminBillingApiPath = {
  createManagedPlan: `${adminBillingApiBasePath}/plans`,
} as const;

const createJsonResponse = (
  body: unknown,
  status = 200,
  headers?: HeadersInit,
) =>
  Response.json(body, {
    status,
    ...(headers !== undefined ? { headers } : {}),
  });

const parseRequestJson = (request: Request) =>
  Effect.tryPromise({
    try: () => request.json(),
    catch: () =>
      ({
        _tag: "AdminBillingJsonInvalidError",
      }) satisfies JsonRequestError,
  });

const readRequestJson = <A, R = never>(
  request: Request,
  decode: (payload: unknown) => Effect.Effect<A, ParseResult.ParseError, R>,
): Effect.Effect<A, JsonRequestError, R> =>
  parseRequestJson(request).pipe(
    Effect.flatMap((payload) =>
      decode(payload).pipe(
        Effect.mapError(
          () =>
            ({
              _tag: "AdminBillingJsonRequestParseError",
            }) satisfies JsonRequestError,
        ),
      ),
    ),
  );

const buildErrorResponse = (error: unknown) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    typeof error._tag === "string"
  ) {
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
      case "PolarCatalogMetadataError":
        return createJsonResponse(
          {
            error:
              "Provider payload could not be mapped to the platform contract.",
          },
          422,
        );
      case "KeycloakAdapterRequestError":
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

const runRequest = <A, E>(
  effect: Effect.Effect<A, E>,
  onSuccess: (value: A) => Response,
) =>
  effect.pipe(
    Effect.match({
      onFailure: buildErrorResponse,
      onSuccess,
    }),
  );

const methodNotAllowedResponse = () =>
  createJsonResponse({ error: "Method not allowed." }, 405, {
    Allow: "POST",
  });

const notFoundResponse = () =>
  createJsonResponse({ error: "Admin billing route not found." }, 404);

export const createAdminBillingHttpHandler =
  (runWithService: AdminBillingServiceRunner) => (request: Request) => {
    const url = new URL(request.url);

    if (request.method !== "POST") {
      return Effect.succeed(
        url.pathname.startsWith(adminBillingApiBasePath)
          ? methodNotAllowedResponse()
          : notFoundResponse(),
      );
    }

    switch (url.pathname) {
      case adminBillingApiPath.createManagedPlan:
        return runRequest(
          readRequestJson(
            request,
            Schema.decodeUnknown(BillingPlanCreateRequestSchema),
          ).pipe(
            Effect.flatMap((input) =>
              runWithService((service) =>
                service.createManagedBillingPlan(input),
              ),
            ),
          ),
          (result) => createJsonResponse(result, 202),
        );
      default:
        return Effect.succeed(notFoundResponse());
    }
  };

export const handleAdminBillingHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createAdminBillingHttpHandler((use) =>
    runSubscriberJourneyFromEnvironment(environment, use),
  )(request);
