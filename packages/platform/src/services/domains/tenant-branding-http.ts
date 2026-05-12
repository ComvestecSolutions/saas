import { Effect, ParseResult, Schema } from "effect";
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
  PublishTenantBrandingAssetBySessionRequestSchema,
  TransitionCustomDomainVerificationBySessionRequestSchema,
  RequestCustomDomainVerificationBySessionRequestSchema as RequestCustomDomainVerificationServiceSchema,
  runTenantBrandingFromEnvironment,
  type TenantBrandingRuntimeError,
  type TenantBrandingService,
} from "./tenant-branding";

export const adminTenantBrandingApiBasePath =
  "/api/admin/domains/tenant-branding";

export const adminTenantBrandingApiPath = {
  requestCustomDomainVerification: `${adminTenantBrandingApiBasePath}/custom-domains/requests`,
  transitionCurrentCustomDomainVerification: `${adminTenantBrandingApiBasePath}/custom-domains/lifecycle`,
  publishAssetReference: `${adminTenantBrandingApiBasePath}/assets/publish`,
  getSupportSafeView: `${adminTenantBrandingApiBasePath}/support-view`,
} as const;

const adminTenantBrandingAllowedMethodsByPath: Readonly<
  Record<string, readonly string[]>
> = {
  [adminTenantBrandingApiPath.requestCustomDomainVerification]: ["POST"],
  [adminTenantBrandingApiPath.transitionCurrentCustomDomainVerification]: [
    "POST",
  ],
  [adminTenantBrandingApiPath.publishAssetReference]: ["POST"],
  [adminTenantBrandingApiPath.getSupportSafeView]: ["GET"],
};

export const RequestCustomDomainVerificationHttpRequestSchema = Schema.Struct({
  scope: RequestCustomDomainVerificationServiceSchema.fields.scope,
  scopeId: RequestCustomDomainVerificationServiceSchema.fields.scopeId,
  requestedHost:
    RequestCustomDomainVerificationServiceSchema.fields.requestedHost,
});

export const GetTenantBrandingSupportSafeViewHttpRequestSchema = Schema.Struct({
  scope: RequestCustomDomainVerificationServiceSchema.fields.scope,
  scopeId: RequestCustomDomainVerificationServiceSchema.fields.scopeId,
});

export const PublishTenantBrandingAssetHttpRequestSchema = Schema.Struct({
  scope: PublishTenantBrandingAssetBySessionRequestSchema.fields.scope,
  scopeId: PublishTenantBrandingAssetBySessionRequestSchema.fields.scopeId,
  assetKind: PublishTenantBrandingAssetBySessionRequestSchema.fields.assetKind,
  fileId: PublishTenantBrandingAssetBySessionRequestSchema.fields.fileId,
});

export const TransitionCustomDomainVerificationHttpRequestSchema =
  Schema.Struct({
    scope:
      TransitionCustomDomainVerificationBySessionRequestSchema.fields.scope,
    scopeId:
      TransitionCustomDomainVerificationBySessionRequestSchema.fields.scopeId,
    lifecycleState:
      TransitionCustomDomainVerificationBySessionRequestSchema.fields
        .lifecycleState,
    approvalNotes:
      TransitionCustomDomainVerificationBySessionRequestSchema.fields
        .approvalNotes,
  });

type AdminTenantBrandingServiceRunner = <A, E>(
  use: (service: TenantBrandingService) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | ParseResult.ParseError | TenantBrandingRuntimeError>;

type JsonRequestErrorTag =
  | "AdminTenantBrandingJsonInvalidError"
  | "AdminTenantBrandingJsonRequestParseError";

const normalizeJsonRequestError = (
  error: { readonly _tag: JsonRequestErrorTag } | ParseResult.ParseError,
) =>
  error._tag === "ParseError"
    ? ({ _tag: "AdminTenantBrandingJsonRequestParseError" } as const)
    : error;

const buildErrorResponse = (error: unknown) => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "AdminTenantBrandingJsonInvalidError":
      case "AdminTenantBrandingJsonRequestParseError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "TenantBrandingUnauthenticatedActorError":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "TenantBrandingCustomDomainApprovalNotesRequiredError":
        return createJsonResponse(
          {
            error:
              "Approval notes are required when activating a tenant custom domain.",
          },
          400,
        );
      case "TenantBrandingManagedAssetInvalidError":
        return createJsonResponse(
          {
            error:
              "Managed file is not approved for tenant-branding asset publication.",
          },
          400,
        );
      case "TenantBrandingAccessDeniedError":
      case "TenantBrandingFeatureDisabledError":
        return createJsonResponse(
          {
            error:
              "Tenant branding management is not allowed for this session.",
          },
          403,
        );
      case "IdentitySessionRequestContextNotFoundError":
      case "TenantBrandingManagedAssetNotFoundError":
      case "TenantBrandingCustomDomainVerificationNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "TenantBrandingDomainVerificationAlreadyExistsError":
        return createJsonResponse(
          {
            error: "Custom domain verification already exists for this host.",
          },
          409,
        );
      case "ParseError":
      case "TenantBrandingDeclarationMissingError":
      case "TenantBrandingInternalContractError":
        return createJsonResponse(
          { error: "Tenant branding request failed." },
          500,
        );
      case "BillingStatePostgresRepositoryQueryError":
      case "AuditLogPostgresRepositoryPersistenceError":
      case "AuthorizationDelegatedCheckError":
      case "RuntimeConfigModulePersistenceError":
      case "TenantBrandingDomainVerificationPostgresRepositoryQueryError":
      case "TenantBrandingManagedAssetLookupError":
      case "TenantBrandingRuntimeError":
      case "ValkeyAdapterOperationError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
    }
  }

  return createJsonResponse({ error: "Tenant branding request failed." }, 500);
};

const runWithSession = <A, E>(input: {
  readonly request: Request;
  readonly runWithService: AdminTenantBrandingServiceRunner;
  readonly use: (
    service: TenantBrandingService,
    sessionId: string,
  ) => Effect.Effect<A, E>;
}) =>
  extractRequiredSubscriberJourneySessionIdFromHeader(input.request).pipe(
    Effect.flatMap((sessionId) =>
      input.runWithService((service) => input.use(service, sessionId)),
    ),
  );

const readTenantBrandingSupportSafeViewQuery = (request: Request) => {
  const url = new URL(request.url);

  return Schema.decodeUnknown(
    GetTenantBrandingSupportSafeViewHttpRequestSchema,
  )({
    scope: url.searchParams.get("scope"),
    scopeId: url.searchParams.get("scopeId"),
  }).pipe(Effect.mapError(normalizeJsonRequestError));
};

export const createAdminTenantBrandingHttpHandler = (
  runWithService: AdminTenantBrandingServiceRunner,
) => {
  return (request: Request) => {
    const url = new URL(request.url);
    const allowedMethods =
      adminTenantBrandingAllowedMethodsByPath[url.pathname];

    if (allowedMethods === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Admin tenant branding route not found."),
      );
    }

    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (url.pathname) {
      case adminTenantBrandingApiPath.requestCustomDomainVerification:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag:
              "AdminTenantBrandingJsonInvalidError" as JsonRequestErrorTag,
            decode: Schema.decodeUnknown(
              RequestCustomDomainVerificationHttpRequestSchema,
            ),
          }).pipe(
            Effect.mapError(normalizeJsonRequestError),
            Effect.flatMap((input) =>
              runWithSession({
                request,
                runWithService,
                use: (service, sessionId) =>
                  service.requestCustomDomainVerification({
                    sessionId,
                    ...input,
                  }),
              }),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 201),
        });
      case adminTenantBrandingApiPath.transitionCurrentCustomDomainVerification:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag:
              "AdminTenantBrandingJsonInvalidError" as JsonRequestErrorTag,
            decode: Schema.decodeUnknown(
              TransitionCustomDomainVerificationHttpRequestSchema,
            ),
          }).pipe(
            Effect.mapError(normalizeJsonRequestError),
            Effect.flatMap((input) =>
              runWithSession({
                request,
                runWithService,
                use: (service, sessionId) =>
                  service.transitionCurrentCustomDomainVerification({
                    sessionId,
                    ...input,
                  }),
              }),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result),
        });
      case adminTenantBrandingApiPath.publishAssetReference:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag:
              "AdminTenantBrandingJsonInvalidError" as JsonRequestErrorTag,
            decode: Schema.decodeUnknown(
              PublishTenantBrandingAssetHttpRequestSchema,
            ),
          }).pipe(
            Effect.mapError(normalizeJsonRequestError),
            Effect.flatMap((input) =>
              runWithSession({
                request,
                runWithService,
                use: (service, sessionId) =>
                  service.publishAssetReference({
                    sessionId,
                    ...input,
                  }),
              }),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result),
        });
      case adminTenantBrandingApiPath.getSupportSafeView:
        return matchHttpEffect({
          effect: readTenantBrandingSupportSafeViewQuery(request).pipe(
            Effect.flatMap((input) =>
              runWithSession({
                request,
                runWithService,
                use: (service, sessionId) =>
                  service.getSupportSafeView({
                    sessionId,
                    ...input,
                  }),
              }),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result),
        });
      default:
        return Effect.succeed(
          createNotFoundResponse("Admin tenant branding route not found."),
        );
    }
  };
};

export const handleAdminTenantBrandingHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createAdminTenantBrandingHttpHandler((use) =>
    runTenantBrandingFromEnvironment(environment, use),
  )(request);
