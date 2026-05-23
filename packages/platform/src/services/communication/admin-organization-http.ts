import { Effect, ParseResult, Schema } from "effect";
import {
  AdminMemberRoleSchema,
  RequestContextSchema,
  type RequestContext,
} from "@comvestec/contracts";
import {
  resolveIdentitySessionRequestContext,
  type IdentitySessionRequestContextNotFoundError,
} from "@comvestec/modules";
import {
  makeValkeyAdapter,
  type ValkeyAdapterOperationError,
} from "../../adapters";
import { extractRequiredSubscriberJourneySessionIdFromHeader } from "../access/request-context-transport";
import {
  type AdminOrganizationRuntimeError,
  type AdminOrganizationServiceImpl,
  runAdminOrganizationFromEnvironment,
} from "../access/admin-organization-service";
import {
  createJsonResponse,
  createMethodNotAllowedResponse,
  createNotFoundResponse,
  isTaggedError,
  matchHttpEffect,
  readRequestJson,
} from "./http-transport";

// ---------------------------------------------------------------------------
// Path table (local — registry advertises only owned endpoints)
// ---------------------------------------------------------------------------

export const adminOrganizationApiBasePath = "/api/admin-organization";

export const adminOrganizationApiPath = {
  listMembers: `${adminOrganizationApiBasePath}/members`,
  inviteMember: `${adminOrganizationApiBasePath}/invitations`,
  redeemInvitation: `${adminOrganizationApiBasePath}/invitations/redeem`,
  memberRoleByMemberIdTemplate: `${adminOrganizationApiBasePath}/members/:id/role`,
  memberByMemberIdTemplate: `${adminOrganizationApiBasePath}/members/:id`,
  capabilitiesBySubjectIdTemplate: `${adminOrganizationApiBasePath}/capabilities/:subjectId`,
} as const;

const memberRoleByMemberIdPathPrefix = `${adminOrganizationApiBasePath}/members/`;
const memberRoleByMemberIdPathSuffix = "/role";
const capabilitiesBySubjectIdPathPrefix = `${adminOrganizationApiBasePath}/capabilities/`;

type AdminOrganizationRouteMatch =
  | { readonly kind: "listMembers" }
  | { readonly kind: "inviteMember" }
  | { readonly kind: "redeemInvitation" }
  | { readonly kind: "changeMemberRole"; readonly memberId: string }
  | { readonly kind: "removeMember"; readonly memberId: string }
  | { readonly kind: "resolveCapabilities"; readonly subjectId: string };

const matchAdminOrganizationRoute = (
  pathname: string,
): AdminOrganizationRouteMatch | undefined => {
  if (pathname === adminOrganizationApiPath.listMembers) {
    return { kind: "listMembers" };
  }
  if (pathname === adminOrganizationApiPath.inviteMember) {
    return { kind: "inviteMember" };
  }
  if (pathname === adminOrganizationApiPath.redeemInvitation) {
    return { kind: "redeemInvitation" };
  }
  if (
    pathname.startsWith(memberRoleByMemberIdPathPrefix) &&
    pathname.endsWith(memberRoleByMemberIdPathSuffix)
  ) {
    const memberId = pathname.slice(
      memberRoleByMemberIdPathPrefix.length,
      pathname.length - memberRoleByMemberIdPathSuffix.length,
    );
    if (memberId.length > 0 && !memberId.includes("/")) {
      return { kind: "changeMemberRole", memberId };
    }
  }
  if (pathname.startsWith(memberRoleByMemberIdPathPrefix)) {
    const tail = pathname.slice(memberRoleByMemberIdPathPrefix.length);
    if (tail.length > 0 && !tail.includes("/")) {
      return { kind: "removeMember", memberId: tail };
    }
  }
  if (pathname.startsWith(capabilitiesBySubjectIdPathPrefix)) {
    const subjectId = pathname.slice(capabilitiesBySubjectIdPathPrefix.length);
    if (subjectId.length > 0 && !subjectId.includes("/")) {
      return { kind: "resolveCapabilities", subjectId };
    }
  }
  return undefined;
};

const methodForRoute = (
  match: AdminOrganizationRouteMatch,
): readonly string[] => {
  switch (match.kind) {
    case "listMembers":
      return ["GET"];
    case "inviteMember":
      return ["POST"];
    case "redeemInvitation":
      return ["POST"];
    case "changeMemberRole":
      return ["PATCH"];
    case "removeMember":
      return ["DELETE"];
    case "resolveCapabilities":
      return ["GET"];
  }
};

// ---------------------------------------------------------------------------
// JSON body decode helpers
// ---------------------------------------------------------------------------

type JsonRequestErrorTag =
  | "AdminOrganizationJsonInvalidError"
  | "AdminOrganizationJsonRequestParseError";

type JsonRequestError = { readonly _tag: JsonRequestErrorTag };

const normalizeJsonRequestError = (
  error: JsonRequestError | ParseResult.ParseError,
) =>
  error._tag === "ParseError"
    ? ({
        _tag: "AdminOrganizationJsonRequestParseError",
      } satisfies JsonRequestError)
    : error;

const readAdminOrganizationRequestJson = <A, R = never>(input: {
  readonly request: Request;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError, R>;
}) =>
  readRequestJson({
    request: input.request,
    invalidJsonTag:
      "AdminOrganizationJsonInvalidError" satisfies JsonRequestErrorTag,
    decode: input.decode,
  }).pipe(Effect.mapError(normalizeJsonRequestError));

// ---------------------------------------------------------------------------
// Trusted request-context resolution
// ---------------------------------------------------------------------------

const AdminOrganizationHttpEnvironmentSchema = Schema.Struct({
  VALKEY_URL: Schema.NonEmptyString,
});

const decodeAdminOrganizationHttpEnvironment = Schema.decodeUnknown(
  AdminOrganizationHttpEnvironmentSchema,
);

type ResolveTrustedRequestContextError =
  | ParseResult.ParseError
  | ValkeyAdapterOperationError
  | IdentitySessionRequestContextNotFoundError
  | { readonly _tag: "SubscriberJourneySessionIdMissingError" };

const resolveTrustedRequestContextFromRequest = (
  environment: unknown,
  request: Request,
): Effect.Effect<RequestContext, ResolveTrustedRequestContextError> =>
  Effect.gen(function* () {
    const sessionId =
      yield* extractRequiredSubscriberJourneySessionIdFromHeader(request);
    const resolvedEnvironment =
      yield* decodeAdminOrganizationHttpEnvironment(environment);
    const valkey = yield* makeValkeyAdapter({
      url: resolvedEnvironment.VALKEY_URL,
    });
    return yield* resolveIdentitySessionRequestContext(valkey, {
      sessionId,
    }).pipe(Effect.ensuring(Effect.ignore(valkey.close)));
  });

// ---------------------------------------------------------------------------
// Per-route input schemas (request body shapes)
// ---------------------------------------------------------------------------

const ListMembersQuerySchema = Schema.Struct({
  role: Schema.optional(AdminMemberRoleSchema),
  includeArchived: Schema.optional(Schema.Literal("true", "false")),
});

const InviteMemberBodySchema = Schema.Struct({
  email: Schema.NonEmptyString,
  invitedRole: AdminMemberRoleSchema,
  invitedBy: Schema.NonEmptyString,
  invitedByDisplayName: Schema.optional(Schema.NonEmptyString),
});

const RedeemInvitationBodySchema = Schema.Struct({
  invitationToken: Schema.NonEmptyString,
  keycloakSubjectId: Schema.NonEmptyString,
  displayName: Schema.NonEmptyString,
});

const ChangeMemberRoleBodySchema = Schema.Struct({
  newRole: AdminMemberRoleSchema,
});

const ResolveCapabilitiesQuerySchema = Schema.Struct({
  hasPrivilegedAccess: Schema.Literal("true", "false"),
  canImpersonate: Schema.Literal("true", "false"),
  canRevealSecrets: Schema.Literal("true", "false"),
  canReadAudit: Schema.Literal("true", "false"),
});

const decodeListMembersQuery = Schema.decodeUnknown(ListMembersQuerySchema);
const decodeInviteMemberBody = Schema.decodeUnknown(InviteMemberBodySchema);
const decodeRedeemInvitationBody = Schema.decodeUnknown(
  RedeemInvitationBodySchema,
);
const decodeChangeMemberRoleBody = Schema.decodeUnknown(
  ChangeMemberRoleBodySchema,
);
const decodeResolveCapabilitiesQuery = Schema.decodeUnknown(
  ResolveCapabilitiesQuerySchema,
);

const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

// ---------------------------------------------------------------------------
// Error → status mapping
// ---------------------------------------------------------------------------

const buildErrorResponse = (error: unknown): Response => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "AdminOrganizationJsonInvalidError":
      case "AdminOrganizationJsonRequestParseError":
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
      case "AdminRoleChangeNotPermitted":
        return createJsonResponse(
          { error: "Admin role change is not permitted." },
          403,
        );
      case "IdentitySessionRequestContextNotFoundError":
      case "AdminMemberNotFound":
      case "AdminInvitationNotFound":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "AdminMemberAlreadyExists":
      case "AdminInvitationAlreadyRedeemed":
      case "AdminOwnerCountInvariant":
        return createJsonResponse(
          { error: "Admin organization invariant violation." },
          409,
        );
      case "AdminInvitationExpired":
        return createJsonResponse(
          { error: "Admin invitation has expired." },
          410,
        );
      case "AdminInvitationNotificationDispatchError":
      case "AdminOrgPersistenceError":
      case "AdminOrgQueryError":
      case "AdminOrgUniqueViolationError":
      case "AdminOrgNotFoundError":
      case "AuditLogPostgresRepositoryPersistenceError":
      case "AuditLogParseError":
      case "NovuAdapterRequestError":
      case "NovuAdapterTransportError":
      case "PostgresAdapterConnectionError":
      case "ValkeyAdapterOperationError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
    }
  }
  return createJsonResponse(
    { error: "Admin organization request failed." },
    500,
  );
};

// ---------------------------------------------------------------------------
// Service runner type
// ---------------------------------------------------------------------------

type AdminOrganizationServiceRunner = <A, E>(
  use: (service: AdminOrganizationServiceImpl) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | AdminOrganizationRuntimeError>;

type AdminOrganizationRequestContextResolver = (
  request: Request,
) => Effect.Effect<RequestContext, ResolveTrustedRequestContextError>;

// ---------------------------------------------------------------------------
// Handler factory (testable seam — accepts an injected request-context
// resolver so unit tests can exercise routing, decoding, and error mapping
// without provisioning a live Valkey adapter)
// ---------------------------------------------------------------------------

export const createAdminOrganizationHttpHandlerWithDependencies = (input: {
  readonly resolveRequestContext: AdminOrganizationRequestContextResolver;
  readonly runWithService: AdminOrganizationServiceRunner;
}) => {
  const { resolveRequestContext, runWithService } = input;
  const buildRequestContext = (request: Request) =>
    resolveRequestContext(request).pipe(Effect.flatMap(decodeRequestContext));

  return (request: Request) => {
    const url = new URL(request.url);
    const match = matchAdminOrganizationRoute(url.pathname);

    if (match === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Admin organization route not found."),
      );
    }

    const allowedMethods = methodForRoute(match);
    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (match.kind) {
      case "listMembers":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            query: decodeListMembersQuery(
              Object.fromEntries(url.searchParams.entries()),
            ),
          }).pipe(
            Effect.flatMap(({ requestContext, query }) =>
              runWithService((service) =>
                service.listMembers({
                  requestContext,
                  ...(query.role === undefined &&
                  query.includeArchived === undefined
                    ? {}
                    : {
                        filter: {
                          ...(query.role === undefined
                            ? {}
                            : { role: query.role }),
                          ...(query.includeArchived === undefined
                            ? {}
                            : {
                                includeArchived:
                                  query.includeArchived === "true",
                              }),
                        },
                      }),
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (members) => createJsonResponse({ members }, 200),
        });
      case "inviteMember":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            body: readAdminOrganizationRequestJson({
              request,
              decode: decodeInviteMemberBody,
            }),
          }).pipe(
            Effect.flatMap(({ requestContext, body }) =>
              runWithService((service) =>
                service.inviteMember({
                  requestContext,
                  email: body.email,
                  invitedRole: body.invitedRole,
                  invitedBy: body.invitedBy,
                  ...(body.invitedByDisplayName === undefined
                    ? {}
                    : { invitedByDisplayName: body.invitedByDisplayName }),
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 201),
        });
      case "redeemInvitation":
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            body: readAdminOrganizationRequestJson({
              request,
              decode: decodeRedeemInvitationBody,
            }),
          }).pipe(
            Effect.flatMap(({ requestContext, body }) =>
              runWithService((service) =>
                service.redeemInvitation({
                  requestContext,
                  invitationToken: body.invitationToken,
                  keycloakSubjectId: body.keycloakSubjectId,
                  displayName: body.displayName,
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (member) => createJsonResponse({ member }, 200),
        });
      case "changeMemberRole": {
        const memberId = match.memberId;
        return matchHttpEffect({
          effect: Effect.all({
            requestContext: buildRequestContext(request),
            body: readAdminOrganizationRequestJson({
              request,
              decode: decodeChangeMemberRoleBody,
            }),
          }).pipe(
            Effect.flatMap(({ requestContext, body }) =>
              runWithService((service) =>
                service.changeMemberRole({
                  requestContext,
                  memberId,
                  newRole: body.newRole,
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (member) => createJsonResponse({ member }, 200),
        });
      }
      case "removeMember": {
        const memberId = match.memberId;
        return matchHttpEffect({
          effect: buildRequestContext(request).pipe(
            Effect.flatMap((requestContext) =>
              runWithService((service) =>
                service.removeMember({ requestContext, memberId }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: () => createJsonResponse({ memberId }, 200),
        });
      }
      case "resolveCapabilities": {
        const subjectId = match.subjectId;
        return matchHttpEffect({
          effect: decodeResolveCapabilitiesQuery(
            Object.fromEntries(url.searchParams.entries()),
          ).pipe(
            Effect.flatMap((query) =>
              runWithService((service) =>
                service.resolveCapabilitiesFor({
                  subjectId,
                  snapshot: {
                    hasPrivilegedAccess: query.hasPrivilegedAccess === "true",
                    canImpersonate: query.canImpersonate === "true",
                    canRevealSecrets: query.canRevealSecrets === "true",
                    canReadAudit: query.canReadAudit === "true",
                  },
                }),
              ),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (capabilities) =>
            createJsonResponse({ capabilities }, 200),
        });
      }
    }
  };
};

export const createAdminOrganizationHttpHandler = (
  environment: unknown,
  runWithService: AdminOrganizationServiceRunner,
) =>
  createAdminOrganizationHttpHandlerWithDependencies({
    resolveRequestContext: (request) =>
      resolveTrustedRequestContextFromRequest(environment, request),
    runWithService,
  });

export const handleAdminOrganizationHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createAdminOrganizationHttpHandler(environment, (use) =>
    runAdminOrganizationFromEnvironment(environment, use),
  )(request);
