import { Effect, ParseResult, Schema } from "effect";
import {
  SearchQueryLimitSchema,
  IsoTimestampSchema,
  SearchSupportCaseSortSchema,
  SearchTenantIndexSettingsSchema,
  SearchTenantScopeSchema,
  SupportOperationsCasePrioritySchema,
  SupportOperationsCaseStatusSchema,
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
  runSearchFromEnvironment,
  type SearchRuntimeError,
  type SearchServiceApi,
} from "./search";

export const searchApiBasePath = "/api/admin/data/search";

export const searchTenantApiBasePath = "/api/data/search";

export const searchApiPath = {
  ensureTenantIndex: `${searchApiBasePath}/indexes/ensure`,
  requestTenantIndexEnsureWorkflowJob: `${searchApiBasePath}/indexes/ensure/request`,
  requestTenantIndexReindexWorkflowJob: `${searchApiBasePath}/indexes/reindex/request`,
  getTenantIndexRecord: `${searchApiBasePath}/indexes/get`,
  listTenantIndexRecords: `${searchApiBasePath}/indexes/list`,
  deleteTenantIndex: `${searchApiBasePath}/indexes/delete`,
  queryManagedFiles: `${searchApiBasePath}/query/managed-files`,
  querySupportCases: `${searchApiBasePath}/query/support-cases`,
} as const;

export const searchTenantApiPath = {
  queryManagedFiles: `${searchTenantApiBasePath}/query/managed-files`,
} as const;

const searchAllowedMethodsByPath: Readonly<Record<string, readonly string[]>> =
  {
    [searchApiPath.ensureTenantIndex]: ["POST"],
    [searchApiPath.requestTenantIndexEnsureWorkflowJob]: ["POST"],
    [searchApiPath.requestTenantIndexReindexWorkflowJob]: ["POST"],
    [searchApiPath.getTenantIndexRecord]: ["POST"],
    [searchApiPath.listTenantIndexRecords]: ["POST"],
    [searchApiPath.deleteTenantIndex]: ["POST"],
    [searchApiPath.queryManagedFiles]: ["POST"],
    [searchApiPath.querySupportCases]: ["POST"],
    [searchTenantApiPath.queryManagedFiles]: ["POST"],
  };

export const EnsureSearchTenantIndexHttpRequestSchema = Schema.Struct({
  scope: SearchTenantScopeSchema,
  scopeId: Schema.NonEmptyString,
  settings: SearchTenantIndexSettingsSchema,
});

export const RequestSearchTenantIndexEnsureWorkflowJobHttpRequestSchema =
  Schema.Struct({
    scope: SearchTenantScopeSchema,
    scopeId: Schema.NonEmptyString,
    settings: SearchTenantIndexSettingsSchema,
    scheduledAt: Schema.optional(IsoTimestampSchema),
  });

export const RequestSearchTenantIndexReindexWorkflowJobHttpRequestSchema =
  Schema.Struct({
    scope: SearchTenantScopeSchema,
    scopeId: Schema.NonEmptyString,
    scheduledAt: Schema.optional(IsoTimestampSchema),
  });

export const SearchTenantIndexLookupHttpRequestSchema = Schema.Struct({
  scope: SearchTenantScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export const QuerySearchManagedFilesHttpRequestSchema = Schema.Struct({
  scope: SearchTenantScopeSchema,
  scopeId: Schema.NonEmptyString,
  query: Schema.String,
  limit: Schema.optional(SearchQueryLimitSchema),
});

const SearchSupportCaseFilterStatusesHttpRequestSchema = Schema.Array(
  SupportOperationsCaseStatusSchema,
).pipe(Schema.filter((value) => value.length > 0));

const SearchSupportCaseFilterPrioritiesHttpRequestSchema = Schema.Array(
  SupportOperationsCasePrioritySchema,
).pipe(Schema.filter((value) => value.length > 0));

export const QuerySearchSupportCasesHttpRequestSchema = Schema.Struct({
  scope: SearchTenantScopeSchema,
  scopeId: Schema.NonEmptyString,
  query: Schema.String,
  limit: Schema.optional(SearchQueryLimitSchema),
  status: Schema.optional(SearchSupportCaseFilterStatusesHttpRequestSchema),
  priority: Schema.optional(SearchSupportCaseFilterPrioritiesHttpRequestSchema),
  sort: Schema.optional(SearchSupportCaseSortSchema),
});

export const QueryCurrentTenantSearchManagedFilesHttpRequestSchema =
  Schema.Struct({
    query: Schema.String,
    limit: Schema.optional(SearchQueryLimitSchema),
  });

type SearchTransportServiceRunner = <A, E>(
  use: (service: SearchServiceApi) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | ParseResult.ParseError | SearchRuntimeError>;

type JsonRequestErrorTag =
  | "SearchJsonInvalidError"
  | "SearchJsonRequestParseError";

const normalizeJsonRequestError = (
  error: { readonly _tag: JsonRequestErrorTag } | ParseResult.ParseError,
) =>
  error._tag === "ParseError"
    ? ({ _tag: "SearchJsonRequestParseError" } as const)
    : error;

const buildErrorResponse = (
  error: unknown,
  options?: {
    readonly accessDeniedMessage?: string;
    readonly unauthenticatedMessage?: string;
  },
) => {
  const accessDeniedMessage =
    options?.accessDeniedMessage ??
    "Search lifecycle management is not allowed for this session.";
  const unauthenticatedMessage =
    options?.unauthenticatedMessage ??
    "Authenticated operator session is required.";

  if (isTaggedError(error)) {
    switch (error._tag) {
      case "SearchJsonInvalidError":
      case "SearchJsonRequestParseError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "SearchUnauthenticatedActorError":
        return createJsonResponse({ error: unauthenticatedMessage }, 401);
      case "SearchAccessDeniedError":
        return createJsonResponse(
          {
            error: accessDeniedMessage,
          },
          403,
        );
      case "SearchTenantIndexSettingsUnavailableError":
        return createJsonResponse(
          {
            error:
              "Search tenant index settings are not available for reindex.",
          },
          409,
        );
      case "SearchModuleDisabledError":
        return createJsonResponse(
          { error: "Search is not enabled for this scope." },
          403,
        );
      case "SearchTenantIndexNotFoundError":
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "SearchDeclarationMissingError":
      case "ParseError":
        return createJsonResponse(
          { error: "Search lifecycle request failed." },
          500,
        );
      case "ConvexAdapterRequestError":
      case "KeycloakAdapterRequestError":
      case "KeycloakPasswordGrantIdTokenMissingError":
      case "AuditLogPostgresRepositoryPersistenceError":
      case "AuthorizationDelegatedCheckError":
      case "MeilisearchAdapterRequestError":
      case "PostgresAdapterConnectionError":
      case "RuntimeConfigModulePersistenceError":
      case "SearchRuntimeError":
      case "SearchTenantIndexPostgresRepositoryQueryError":
      case "SupportOperationsCasePostgresRepositoryQueryError":
      case "SearchWorkflowUnavailableError":
      case "ValkeyAdapterOperationError":
      case "WorkflowJobsPostgresRepositoryQueryError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
    }
  }

  return createJsonResponse({ error: "Search lifecycle request failed." }, 500);
};

const runWithSession = <A, E>(input: {
  readonly request: Request;
  readonly runWithService: SearchTransportServiceRunner;
  readonly use: (
    service: SearchServiceApi,
    sessionId: string,
  ) => Effect.Effect<A, E>;
}) =>
  extractRequiredSubscriberJourneySessionIdFromHeader(input.request).pipe(
    Effect.flatMap((sessionId) =>
      input.runWithService((service) => input.use(service, sessionId)),
    ),
  );

export const createSearchHttpHandler = (
  runWithService: SearchTransportServiceRunner,
) => {
  return (request: Request) => {
    const url = new URL(request.url);
    const allowedMethods = searchAllowedMethodsByPath[url.pathname];

    if (allowedMethods === undefined) {
      return Effect.succeed(createNotFoundResponse("Search route not found."));
    }

    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (url.pathname) {
      case searchApiPath.ensureTenantIndex:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "SearchJsonInvalidError" as JsonRequestErrorTag,
            decode: Schema.decodeUnknown(
              EnsureSearchTenantIndexHttpRequestSchema,
            ),
          }).pipe(
            Effect.mapError(normalizeJsonRequestError),
            Effect.flatMap((input) =>
              runWithSession({
                request,
                runWithService,
                use: (service, sessionId) =>
                  service.ensureTenantIndex({
                    sessionId,
                    ...input,
                  }),
              }),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case searchApiPath.requestTenantIndexEnsureWorkflowJob:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "SearchJsonInvalidError" as JsonRequestErrorTag,
            decode: Schema.decodeUnknown(
              RequestSearchTenantIndexEnsureWorkflowJobHttpRequestSchema,
            ),
          }).pipe(
            Effect.mapError(normalizeJsonRequestError),
            Effect.flatMap((input) =>
              runWithSession({
                request,
                runWithService,
                use: (service, sessionId) =>
                  service.requestTenantIndexEnsureWorkflowJob({
                    sessionId,
                    ...input,
                  }),
              }),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case searchApiPath.requestTenantIndexReindexWorkflowJob:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "SearchJsonInvalidError" as JsonRequestErrorTag,
            decode: Schema.decodeUnknown(
              RequestSearchTenantIndexReindexWorkflowJobHttpRequestSchema,
            ),
          }).pipe(
            Effect.mapError(normalizeJsonRequestError),
            Effect.flatMap((input) =>
              runWithSession({
                request,
                runWithService,
                use: (service, sessionId) =>
                  service.requestTenantIndexReindexWorkflowJob({
                    sessionId,
                    ...input,
                  }),
              }),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case searchApiPath.getTenantIndexRecord:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "SearchJsonInvalidError" as JsonRequestErrorTag,
            decode: Schema.decodeUnknown(
              SearchTenantIndexLookupHttpRequestSchema,
            ),
          }).pipe(
            Effect.mapError(normalizeJsonRequestError),
            Effect.flatMap((input) =>
              runWithSession({
                request,
                runWithService,
                use: (service, sessionId) =>
                  service.getTenantIndexRecord({
                    sessionId,
                    ...input,
                  }),
              }),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) =>
            result === undefined
              ? createJsonResponse(
                  { error: "Requested resource was not found." },
                  404,
                )
              : createJsonResponse(result, 200),
        });
      case searchApiPath.listTenantIndexRecords:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "SearchJsonInvalidError" as JsonRequestErrorTag,
            decode: Schema.decodeUnknown(
              SearchTenantIndexLookupHttpRequestSchema,
            ),
          }).pipe(
            Effect.mapError(normalizeJsonRequestError),
            Effect.flatMap((input) =>
              runWithSession({
                request,
                runWithService,
                use: (service, sessionId) =>
                  service.listTenantIndexRecords({
                    sessionId,
                    ...input,
                  }),
              }),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case searchApiPath.deleteTenantIndex:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "SearchJsonInvalidError" as JsonRequestErrorTag,
            decode: Schema.decodeUnknown(
              SearchTenantIndexLookupHttpRequestSchema,
            ),
          }).pipe(
            Effect.mapError(normalizeJsonRequestError),
            Effect.flatMap((input) =>
              runWithSession({
                request,
                runWithService,
                use: (service, sessionId) =>
                  service.deleteTenantIndex({
                    sessionId,
                    ...input,
                  }),
              }),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case searchApiPath.queryManagedFiles:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "SearchJsonInvalidError" as JsonRequestErrorTag,
            decode: Schema.decodeUnknown(
              QuerySearchManagedFilesHttpRequestSchema,
            ),
          }).pipe(
            Effect.mapError(normalizeJsonRequestError),
            Effect.flatMap((input) =>
              runWithSession({
                request,
                runWithService,
                use: (service, sessionId) =>
                  service.queryManagedFiles({
                    sessionId,
                    ...input,
                  }),
              }),
            ),
          ),
          onFailure: (error) =>
            buildErrorResponse(error, {
              accessDeniedMessage:
                "Search preview queries are not allowed for this session.",
            }),
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case searchApiPath.querySupportCases:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "SearchJsonInvalidError" as JsonRequestErrorTag,
            decode: Schema.decodeUnknown(
              QuerySearchSupportCasesHttpRequestSchema,
            ),
          }).pipe(
            Effect.mapError(normalizeJsonRequestError),
            Effect.flatMap((input) =>
              runWithSession({
                request,
                runWithService,
                use: (service, sessionId) =>
                  service.querySupportCases({
                    sessionId,
                    ...input,
                  }),
              }),
            ),
          ),
          onFailure: (error) =>
            buildErrorResponse(error, {
              accessDeniedMessage:
                "Search preview queries are not allowed for this session.",
            }),
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case searchTenantApiPath.queryManagedFiles:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag: "SearchJsonInvalidError" as JsonRequestErrorTag,
            decode: Schema.decodeUnknown(
              QueryCurrentTenantSearchManagedFilesHttpRequestSchema,
            ),
          }).pipe(
            Effect.mapError(normalizeJsonRequestError),
            Effect.flatMap((input) =>
              runWithSession({
                request,
                runWithService,
                use: (service, sessionId) =>
                  service.queryCurrentTenantManagedFiles({
                    sessionId,
                    ...input,
                  }),
              }),
            ),
          ),
          onFailure: (error) =>
            buildErrorResponse(error, {
              accessDeniedMessage:
                "Tenant search queries are not allowed for this session.",
              unauthenticatedMessage: "Authenticated session is required.",
            }),
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      default:
        return Effect.succeed(
          createNotFoundResponse("Search route not found."),
        );
    }
  };
};

export const handleSearchHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createSearchHttpHandler((use) => runSearchFromEnvironment(environment, use))(
    request,
  );
