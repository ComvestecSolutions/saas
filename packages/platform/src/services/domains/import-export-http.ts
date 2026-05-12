import { Effect, ParseResult, Schema } from "effect";
import {
  ImportExportJobFormatSchema,
  ImportExportTenantScopeSchema,
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
  type ImportExportRuntimeError,
  runImportExportFromEnvironment,
  type ImportExportServiceApi,
} from "./import-export";

export const importExportApiBasePath = "/api/admin/data/import-export";

export const importExportApiPath = {
  requestManagedFileSummaryExport: `${importExportApiBasePath}/managed-file-summaries/request`,
  requestSupportCaseSummaryExport: `${importExportApiBasePath}/support-case-summaries/request`,
  getImportExportJob: `${importExportApiBasePath}/jobs/get`,
} as const;

const importExportAllowedMethodsByPath: Readonly<
  Record<string, readonly string[]>
> = {
  [importExportApiPath.requestManagedFileSummaryExport]: ["POST"],
  [importExportApiPath.requestSupportCaseSummaryExport]: ["POST"],
  [importExportApiPath.getImportExportJob]: ["POST"],
};

export const RequestManagedFileSummaryExportHttpRequestSchema = Schema.Struct({
  scope: ImportExportTenantScopeSchema,
  scopeId: Schema.NonEmptyString,
  format: Schema.optional(ImportExportJobFormatSchema),
});

export const RequestSupportCaseSummaryExportHttpRequestSchema = Schema.Struct({
  scope: ImportExportTenantScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export const GetImportExportJobHttpRequestSchema = Schema.Struct({
  jobId: Schema.NonEmptyString,
});

type ImportExportTransportServiceRunner = <A, E>(
  use: (service: ImportExportServiceApi) => Effect.Effect<A, E>,
) => Effect.Effect<A, E | ParseResult.ParseError | ImportExportRuntimeError>;

type JsonRequestErrorTag =
  | "ImportExportJsonInvalidError"
  | "ImportExportJsonRequestParseError";

const normalizeJsonRequestError = (
  error: { readonly _tag: JsonRequestErrorTag } | ParseResult.ParseError,
) =>
  error._tag === "ParseError"
    ? ({ _tag: "ImportExportJsonRequestParseError" } as const)
    : error;

const buildErrorResponse = (
  error: unknown,
  options?: {
    readonly accessDeniedMessage?: string;
  },
) => {
  const accessDeniedMessage =
    options?.accessDeniedMessage ??
    "Import-export inspection is not allowed for this session.";

  if (isTaggedError(error)) {
    switch (error._tag) {
      case "ImportExportJsonInvalidError":
      case "ImportExportJsonRequestParseError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "ImportExportUnauthenticatedActorError":
        return createJsonResponse(
          { error: "Authenticated operator session is required." },
          401,
        );
      case "ImportExportAccessDeniedError":
        return createJsonResponse(
          {
            error: accessDeniedMessage,
          },
          403,
        );
      case "ImportExportManagedFileSummaryExportBlockedError":
        return createJsonResponse(
          {
            error:
              "Managed-file summary export is blocked by an active retention legal hold.",
          },
          409,
        );
      case "ImportExportModuleDisabledError":
        return createJsonResponse(
          { error: "Import export is not enabled for this scope." },
          403,
        );
      case "IdentitySessionRequestContextNotFoundError":
      case "ImportExportJobNotFoundError":
      case "ImportExportJobRecordNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "ImportExportDeclarationMissingError":
      case "ParseError":
        return createJsonResponse(
          { error: "Import-export request failed." },
          500,
        );
      case "AuditLogPostgresRepositoryPersistenceError":
      case "AuthorizationDelegatedCheckError":
      case "ConvexAdapterRequestError":
      case "FileStorageDeletionBlockedError":
      case "FileStorageFileNotFoundError":
      case "ImportExportArtifactUploadError":
      case "ImportExportRuntimeError":
      case "ImportExportWorkflowUnavailableError":
      case "ImportExportJobPostgresRepositoryQueryError":
      case "KeycloakAdapterRequestError":
      case "KeycloakPasswordGrantIdTokenMissingError":
      case "PostgresAdapterConnectionError":
      case "RetentionLegalHoldPostgresRepositoryQueryError":
      case "RuntimeConfigModulePersistenceError":
      case "ValkeyAdapterOperationError":
      case "WorkflowJobsPostgresRepositoryQueryError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
    }
  }

  return createJsonResponse({ error: "Import-export request failed." }, 500);
};

const runWithSession = <A, E>(input: {
  readonly request: Request;
  readonly runWithService: ImportExportTransportServiceRunner;
  readonly use: (
    service: ImportExportServiceApi,
    sessionId: string,
  ) => Effect.Effect<A, E>;
}) =>
  extractRequiredSubscriberJourneySessionIdFromHeader(input.request).pipe(
    Effect.flatMap((sessionId) =>
      input.runWithService((service) => input.use(service, sessionId)),
    ),
  );

export const createImportExportHttpHandler = (
  runWithService: ImportExportTransportServiceRunner,
) => {
  return (request: Request) => {
    const url = new URL(request.url);
    const allowedMethods = importExportAllowedMethodsByPath[url.pathname];

    if (allowedMethods === undefined) {
      return Effect.succeed(
        createNotFoundResponse("Import-export route not found."),
      );
    }

    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (url.pathname) {
      case importExportApiPath.requestManagedFileSummaryExport:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag:
              "ImportExportJsonInvalidError" as JsonRequestErrorTag,
            decode: Schema.decodeUnknown(
              RequestManagedFileSummaryExportHttpRequestSchema,
            ),
          }).pipe(
            Effect.mapError(normalizeJsonRequestError),
            Effect.flatMap((input) =>
              runWithSession({
                request,
                runWithService,
                use: (service, sessionId) =>
                  service.requestManagedFileSummaryExport({
                    sessionId,
                    ...input,
                  }),
              }),
            ),
          ),
          onFailure: (error) =>
            buildErrorResponse(error, {
              accessDeniedMessage:
                "Managed-file summary export is not allowed for this session.",
            }),
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case importExportApiPath.requestSupportCaseSummaryExport:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag:
              "ImportExportJsonInvalidError" as JsonRequestErrorTag,
            decode: Schema.decodeUnknown(
              RequestSupportCaseSummaryExportHttpRequestSchema,
            ),
          }).pipe(
            Effect.mapError(normalizeJsonRequestError),
            Effect.flatMap((input) =>
              runWithSession({
                request,
                runWithService,
                use: (service, sessionId) =>
                  service.requestSupportCaseSummaryExport({
                    sessionId,
                    ...input,
                  }),
              }),
            ),
          ),
          onFailure: (error) =>
            buildErrorResponse(error, {
              accessDeniedMessage:
                "Support-case summary export is not allowed for this session.",
            }),
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case importExportApiPath.getImportExportJob:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag:
              "ImportExportJsonInvalidError" as JsonRequestErrorTag,
            decode: Schema.decodeUnknown(GetImportExportJobHttpRequestSchema),
          }).pipe(
            Effect.mapError(normalizeJsonRequestError),
            Effect.flatMap((input) =>
              runWithSession({
                request,
                runWithService,
                use: (service, sessionId) =>
                  service.getImportExportJob({
                    sessionId,
                    ...input,
                  }),
              }),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      default:
        return Effect.succeed(
          createNotFoundResponse("Import-export route not found."),
        );
    }
  };
};

export const handleImportExportHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createImportExportHttpHandler((use) =>
    runImportExportFromEnvironment(environment, use),
  )(request);
