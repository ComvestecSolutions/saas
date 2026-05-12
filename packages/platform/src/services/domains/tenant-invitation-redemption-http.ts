import { Effect, ParseResult, Schema } from "effect";
import { RedeemTenantInvitationRequestSchema } from "@comvestec/contracts";
import { extractRequiredSubscriberJourneySessionIdFromHeader } from "../access/request-context-transport";
import {
  createJsonResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  isTaggedError,
  matchHttpEffect,
  readRequestJson,
} from "../communication/http-transport";
import {
  runTenantInvitationRedemptionFromEnvironment,
  type TenantInvitationRedemptionService,
  type TenantInvitationRedemptionServiceError,
} from "./tenant-invitation-redemption";

type TenantInvitationRedemptionServiceRunner = <A, E>(
  use: (service: TenantInvitationRedemptionService) => Effect.Effect<A, E>,
) => Effect.Effect<
  A,
  | E
  | ParseResult.ParseError
  | TenantInvitationRedemptionServiceError
  | { readonly _tag: "PostgresAdapterConnectionError" }
>;

type JsonRequestErrorTag =
  | "TenantInvitationRedemptionJsonInvalidError"
  | "TenantInvitationRedemptionJsonRequestParseError";

type JsonRequestError = {
  readonly _tag: JsonRequestErrorTag;
};

export const tenantInvitationRedemptionApiBasePath =
  "/api/tenant-management/invitations";

export const tenantInvitationRedemptionApiPath = {
  redeem: `${tenantInvitationRedemptionApiBasePath}/redeem`,
} as const;

export const RedeemTenantInvitationHttpRequestSchema =
  RedeemTenantInvitationRequestSchema;

const buildRedeemTenantInvitationRequest = (
  request: Request,
  body: Schema.Schema.Type<typeof RedeemTenantInvitationHttpRequestSchema>,
) =>
  extractRequiredSubscriberJourneySessionIdFromHeader(request).pipe(
    Effect.flatMap((sessionId) => {
      const invitationToken = body.invitationToken.trim();

      return invitationToken.length > 0
        ? Effect.succeed({
            sessionId,
            invitationToken,
          })
        : Effect.fail({
            _tag: "TenantInvitationRedemptionJsonRequestParseError",
          } satisfies JsonRequestError);
    }),
  );

const readTenantInvitationRedemptionRequestJson = <A, R = never>(input: {
  readonly request: Request;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError, R>;
}) =>
  readRequestJson({
    request: input.request,
    invalidJsonTag: "TenantInvitationRedemptionJsonInvalidError",
    decode: input.decode,
  }).pipe(
    Effect.mapError((cause) =>
      typeof cause === "object" &&
      cause !== null &&
      "_tag" in cause &&
      cause._tag === "ParseError"
        ? ({
            _tag: "TenantInvitationRedemptionJsonRequestParseError",
          } satisfies JsonRequestError)
        : cause,
    ),
  );

const buildErrorResponse = (error: unknown) => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "TenantInvitationRedemptionJsonInvalidError":
        return createJsonResponse(
          { error: "Request body must be valid JSON." },
          400,
        );
      case "TenantInvitationRedemptionJsonRequestParseError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "TenantInvitationRedemptionAuthenticationRequiredError":
        return createJsonResponse(
          {
            error:
              "Tenant invitation redemption requires a valid authenticated session.",
          },
          401,
        );
      case "IdentitySessionRequestContextNotFoundError":
      case "TenantInvitationRedemptionUnavailableError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "AuditLogPostgresRepositoryPersistenceError":
      case "KeycloakAdapterRequestError":
      case "OryKetoAdapterRequestError":
      case "PostgresAdapterConnectionError":
      case "TenantInvitationPostgresRepositoryPersistenceError":
      case "TenantInvitationPostgresRepositoryQueryError":
      case "ValkeyAdapterOperationError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
      case "ParseError":
        return createJsonResponse(
          { error: "Tenant invitation redemption request failed." },
          500,
        );
    }
  }

  return createJsonResponse(
    { error: "Tenant invitation redemption request failed." },
    500,
  );
};

export const createTenantInvitationRedemptionHttpHandler =
  (runWithService: TenantInvitationRedemptionServiceRunner) =>
  (request: Request) => {
    const url = new URL(request.url);

    switch (url.pathname) {
      case tenantInvitationRedemptionApiPath.redeem:
        if (request.method !== "POST") {
          return Effect.succeed(createMethodNotAllowedResponse(["POST"]));
        }

        return matchHttpEffect({
          effect: readTenantInvitationRedemptionRequestJson({
            request,
            decode: Schema.decodeUnknown(
              RedeemTenantInvitationHttpRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((body) =>
              buildRedeemTenantInvitationRequest(request, body),
            ),
            Effect.flatMap((input) =>
              runWithService((service) =>
                service.redeemTenantInvitation(input),
              ),
            ),
          ),
          onSuccess: (result) => createJsonResponse(result),
          onFailure: buildErrorResponse,
        });
      default:
        return Effect.succeed(
          createNotFoundResponse(
            "Tenant invitation redemption route not found.",
          ),
        );
    }
  };

export const handleTenantInvitationRedemptionHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createTenantInvitationRedemptionHttpHandler((use) =>
    runTenantInvitationRedemptionFromEnvironment(environment, use),
  )(request);
