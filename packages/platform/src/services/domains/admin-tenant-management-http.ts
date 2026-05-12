import { Effect, ParseResult, Schema } from "effect";
import {
  AdminTenantInvitationIssueRequestSchema,
  AdminTenantInvitationQueryRequestSchema,
  AdminTenantInvitationRevokeRequestSchema,
  AdminTenantMembershipMutationRequestSchema,
  AdminTenantMembershipQueryRequestSchema,
  AdminTenantOnboardingReviewRequestSchema,
} from "@comvestec/contracts";
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
  type AdminTenantManagementService,
  type AdminTenantManagementServiceError,
  runAdminTenantManagementFromEnvironment,
} from "./admin-tenant-management";

export type { AdminTenantManagementService } from "./admin-tenant-management";

type AdminTenantManagementServiceRunner = <A, E>(
  use: (service: AdminTenantManagementService) => Effect.Effect<A, E>,
) => Effect.Effect<
  A,
  | E
  | AdminTenantManagementServiceError
  | ParseResult.ParseError
  | { readonly _tag: "PostgresAdapterConnectionError" }
>;

type JsonRequestErrorTag =
  | "AdminTenantManagementJsonInvalidError"
  | "AdminTenantManagementJsonRequestParseError";

type JsonRequestError = {
  readonly _tag: JsonRequestErrorTag;
};

export const adminTenantManagementApiBasePath = "/api/admin/tenant-management";

export const adminTenantManagementApiPath = {
  issueInvitation: `${adminTenantManagementApiBasePath}/invitations/issue`,
  queryInvitations: `${adminTenantManagementApiBasePath}/invitations/query`,
  revokeInvitation: `${adminTenantManagementApiBasePath}/invitations/revoke`,
  mutateMembership: `${adminTenantManagementApiBasePath}/memberships/mutate`,
  queryMemberships: `${adminTenantManagementApiBasePath}/memberships/query`,
  reviewOnboarding: `${adminTenantManagementApiBasePath}/onboarding/review`,
} as const;

export const IssueTenantInvitationHttpRequestSchema =
  AdminTenantInvitationIssueRequestSchema;

export const QueryTenantInvitationsHttpRequestSchema =
  AdminTenantInvitationQueryRequestSchema;

export const RevokeTenantInvitationHttpRequestSchema =
  AdminTenantInvitationRevokeRequestSchema;

export const MutateTenantMembershipHttpRequestSchema =
  AdminTenantMembershipMutationRequestSchema;

export const ReviewTenantOnboardingHttpRequestSchema =
  AdminTenantOnboardingReviewRequestSchema;

export const QueryTenantMembershipsHttpRequestSchema =
  AdminTenantMembershipQueryRequestSchema;

const buildIssueTenantInvitationRequest = (
  request: Request,
  body: Schema.Schema.Type<typeof IssueTenantInvitationHttpRequestSchema>,
) =>
  extractRequiredSubscriberJourneySessionIdFromHeader(request).pipe(
    Effect.flatMap((sessionId) => {
      const issueReason = body.issueReason.trim();
      const recipientEmail = body.recipientEmail.trim();

      return issueReason.length > 0 && recipientEmail.length > 0
        ? Effect.succeed({
            sessionId,
            tenant: body.tenant,
            recipientEmail,
            relation: body.relation,
            issueReason,
          })
        : Effect.fail({
            _tag: "AdminTenantManagementJsonRequestParseError",
          } satisfies JsonRequestError);
    }),
  );

const buildQueryTenantInvitationsRequest = (
  request: Request,
  body: Schema.Schema.Type<typeof QueryTenantInvitationsHttpRequestSchema>,
) =>
  extractRequiredSubscriberJourneySessionIdFromHeader(request).pipe(
    Effect.map((sessionId) => {
      const inspectionReason = normalizeInspectionReason(body.inspectionReason);

      return {
        sessionId,
        tenant: body.tenant,
        ...(inspectionReason === undefined ? {} : { inspectionReason }),
      };
    }),
  );

const buildRevokeTenantInvitationRequest = (
  request: Request,
  body: Schema.Schema.Type<typeof RevokeTenantInvitationHttpRequestSchema>,
) =>
  extractRequiredSubscriberJourneySessionIdFromHeader(request).pipe(
    Effect.flatMap((sessionId) => {
      const revocationReason = body.revocationReason.trim();

      return revocationReason.length > 0
        ? Effect.succeed({
            sessionId,
            tenant: body.tenant,
            invitationId: body.invitationId,
            revocationReason,
          })
        : Effect.fail({
            _tag: "AdminTenantManagementJsonRequestParseError",
          } satisfies JsonRequestError);
    }),
  );

const buildMutateTenantMembershipRequest = (
  request: Request,
  body: Schema.Schema.Type<typeof MutateTenantMembershipHttpRequestSchema>,
) =>
  extractRequiredSubscriberJourneySessionIdFromHeader(request).pipe(
    Effect.flatMap((sessionId) => {
      const mutationReason = body.mutationReason.trim();

      return mutationReason.length > 0
        ? Effect.succeed({
            sessionId,
            tenant: body.tenant,
            subject: body.subject,
            relation: body.relation,
            action: body.action,
            mutationReason,
          })
        : Effect.fail({
            _tag: "AdminTenantManagementJsonRequestParseError",
          } satisfies JsonRequestError);
    }),
  );

const readAdminTenantManagementRequestJson = <A, R = never>(input: {
  readonly request: Request;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError, R>;
}) =>
  readRequestJson({
    request: input.request,
    invalidJsonTag: "AdminTenantManagementJsonInvalidError",
    decode: input.decode,
  }).pipe(
    Effect.mapError((cause) =>
      typeof cause === "object" &&
      cause !== null &&
      "_tag" in cause &&
      cause._tag === "ParseError"
        ? ({
            _tag: "AdminTenantManagementJsonRequestParseError",
          } satisfies JsonRequestError)
        : cause,
    ),
  );

const normalizeInspectionReason = (inspectionReason: string | undefined) => {
  const trimmedInspectionReason = inspectionReason?.trim();

  return trimmedInspectionReason !== undefined &&
    trimmedInspectionReason.length > 0
    ? trimmedInspectionReason
    : undefined;
};

const buildErrorResponse = (input: {
  readonly error: unknown;
  readonly accessDeniedMessage: string;
}) => {
  if (isTaggedError(input.error)) {
    switch (input.error._tag) {
      case "AdminTenantManagementJsonInvalidError":
        return createJsonResponse(
          { error: "Request body must be valid JSON." },
          400,
        );
      case "AdminTenantManagementJsonRequestParseError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
        return createJsonResponse(
          {
            error:
              "Admin tenant management requests require a valid authenticated session.",
          },
          401,
        );
      case "AdminTenantManagementAccessDeniedError":
        return createJsonResponse({ error: input.accessDeniedMessage }, 403);
      case "AdminTenantManagementInvitationNotFoundError":
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "AuditLogPostgresRepositoryPersistenceError":
      case "AuthorizationDelegatedCheckError":
      case "RuntimeConfigModulePersistenceError":
      case "TenantInvitationPostgresRepositoryPersistenceError":
      case "TenantInvitationPostgresRepositoryQueryError":
      case "TenantOnboardingPostgresRepositoryQueryError":
      case "KeycloakAdapterRequestError":
      case "OryKetoAdapterRequestError":
      case "PostgresAdapterConnectionError":
      case "ValkeyAdapterOperationError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
      case "ParseError":
        return createJsonResponse(
          { error: "Admin tenant management request failed." },
          500,
        );
    }
  }

  return createJsonResponse(
    { error: "Admin tenant management request failed." },
    500,
  );
};

const buildReviewTenantOnboardingRequest = (
  request: Request,
  body: Schema.Schema.Type<typeof ReviewTenantOnboardingHttpRequestSchema>,
) =>
  extractRequiredSubscriberJourneySessionIdFromHeader(request).pipe(
    Effect.map((sessionId) => {
      const inspectionReason = normalizeInspectionReason(body.inspectionReason);

      return {
        sessionId,
        tenant: body.tenant,
        ...(inspectionReason === undefined ? {} : { inspectionReason }),
      };
    }),
  );

const buildQueryTenantMembershipsRequest = (
  request: Request,
  body: Schema.Schema.Type<typeof QueryTenantMembershipsHttpRequestSchema>,
) =>
  extractRequiredSubscriberJourneySessionIdFromHeader(request).pipe(
    Effect.map((sessionId) => {
      const inspectionReason = normalizeInspectionReason(body.inspectionReason);

      return {
        sessionId,
        tenant: body.tenant,
        ...(inspectionReason === undefined ? {} : { inspectionReason }),
      };
    }),
  );

export const createAdminTenantManagementHttpHandler =
  (runWithService: AdminTenantManagementServiceRunner) =>
  (request: Request) => {
    const url = new URL(request.url);

    switch (url.pathname) {
      case adminTenantManagementApiPath.issueInvitation:
        if (request.method !== "POST") {
          return Effect.succeed(createMethodNotAllowedResponse(["POST"]));
        }

        return matchHttpEffect({
          effect: readAdminTenantManagementRequestJson({
            request,
            decode: Schema.decodeUnknown(
              IssueTenantInvitationHttpRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((body) =>
              buildIssueTenantInvitationRequest(request, body),
            ),
            Effect.flatMap((input) =>
              runWithService((service) => service.issueTenantInvitation(input)),
            ),
          ),
          onSuccess: (result) => createJsonResponse(result),
          onFailure: (error) =>
            buildErrorResponse({
              error,
              accessDeniedMessage:
                "Tenant invitation issuance is not allowed for this session.",
            }),
        });
      case adminTenantManagementApiPath.queryInvitations:
        if (request.method !== "POST") {
          return Effect.succeed(createMethodNotAllowedResponse(["POST"]));
        }

        return matchHttpEffect({
          effect: readAdminTenantManagementRequestJson({
            request,
            decode: Schema.decodeUnknown(
              QueryTenantInvitationsHttpRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((body) =>
              buildQueryTenantInvitationsRequest(request, body),
            ),
            Effect.flatMap((input) =>
              runWithService((service) => service.listTenantInvitations(input)),
            ),
          ),
          onSuccess: (result) => createJsonResponse(result),
          onFailure: (error) =>
            buildErrorResponse({
              error,
              accessDeniedMessage:
                "Tenant invitation inspection is not allowed for this session.",
            }),
        });
      case adminTenantManagementApiPath.revokeInvitation:
        if (request.method !== "POST") {
          return Effect.succeed(createMethodNotAllowedResponse(["POST"]));
        }

        return matchHttpEffect({
          effect: readAdminTenantManagementRequestJson({
            request,
            decode: Schema.decodeUnknown(
              RevokeTenantInvitationHttpRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((body) =>
              buildRevokeTenantInvitationRequest(request, body),
            ),
            Effect.flatMap((input) =>
              runWithService((service) =>
                service.revokeTenantInvitation(input),
              ),
            ),
          ),
          onSuccess: (result) => createJsonResponse(result),
          onFailure: (error) =>
            buildErrorResponse({
              error,
              accessDeniedMessage:
                "Tenant invitation revocation is not allowed for this session.",
            }),
        });
      case adminTenantManagementApiPath.mutateMembership:
        if (request.method !== "POST") {
          return Effect.succeed(createMethodNotAllowedResponse(["POST"]));
        }

        return matchHttpEffect({
          effect: readAdminTenantManagementRequestJson({
            request,
            decode: Schema.decodeUnknown(
              MutateTenantMembershipHttpRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((body) =>
              buildMutateTenantMembershipRequest(request, body),
            ),
            Effect.flatMap((input) =>
              runWithService((service) =>
                service.mutateTenantMembership(input),
              ),
            ),
          ),
          onSuccess: (result) => createJsonResponse(result),
          onFailure: (error) =>
            buildErrorResponse({
              error,
              accessDeniedMessage:
                "Tenant membership mutation is not allowed for this session.",
            }),
        });
      case adminTenantManagementApiPath.queryMemberships:
        if (request.method !== "POST") {
          return Effect.succeed(createMethodNotAllowedResponse(["POST"]));
        }

        return matchHttpEffect({
          effect: readAdminTenantManagementRequestJson({
            request,
            decode: Schema.decodeUnknown(
              QueryTenantMembershipsHttpRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((body) =>
              buildQueryTenantMembershipsRequest(request, body),
            ),
            Effect.flatMap((input) =>
              runWithService((service) => service.listTenantMemberships(input)),
            ),
          ),
          onSuccess: (result) => createJsonResponse(result),
          onFailure: (error) =>
            buildErrorResponse({
              error,
              accessDeniedMessage:
                "Tenant membership inspection is not allowed for this session.",
            }),
        });
      case adminTenantManagementApiPath.reviewOnboarding:
        if (request.method !== "POST") {
          return Effect.succeed(createMethodNotAllowedResponse(["POST"]));
        }

        return matchHttpEffect({
          effect: readAdminTenantManagementRequestJson({
            request,
            decode: Schema.decodeUnknown(
              ReviewTenantOnboardingHttpRequestSchema,
            ),
          }).pipe(
            Effect.flatMap((body) =>
              buildReviewTenantOnboardingRequest(request, body),
            ),
            Effect.flatMap((input) =>
              runWithService((service) =>
                service.reviewTenantOnboarding(input),
              ),
            ),
          ),
          onSuccess: (result) => createJsonResponse(result),
          onFailure: (error) =>
            buildErrorResponse({
              error,
              accessDeniedMessage:
                "Tenant onboarding review is not allowed for this session.",
            }),
        });
      default:
        return Effect.succeed(
          createNotFoundResponse("Admin tenant management route not found."),
        );
    }
  };

export const handleAdminTenantManagementHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createAdminTenantManagementHttpHandler((use) =>
    runAdminTenantManagementFromEnvironment(environment, use),
  )(request);
