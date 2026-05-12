import { Effect, ParseResult, Schema } from "effect";
import {
  FileSizeBytesSchema,
  FileStorageClassificationSchema,
  ManagedFileDownloadDescriptorSchema,
  ManagedFileSummaryViewListSchema,
  ManagedFileSummaryViewSchema,
  ManagedFileUploadUrlSchema,
  ManagedFileUsageSchema,
  PlatformScopeSchema,
  type RequestContext,
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
  runFileStorageTransportFromEnvironment,
  type FileStorageService,
} from "./file-storage";

export const fileStorageApiBasePath = "/api/file-storage";

export const fileStorageApiPath = {
  requestUploadUrl: `${fileStorageApiBasePath}/upload-urls`,
  registerManagedFile: `${fileStorageApiBasePath}/registrations`,
  listManagedFiles: `${fileStorageApiBasePath}/list`,
  resolveManagedFileDownload: `${fileStorageApiBasePath}/downloads`,
  deleteManagedFile: `${fileStorageApiBasePath}/deletions`,
} as const;

const fileStorageAllowedMethodsByPath: Readonly<
  Record<string, readonly string[]>
> = {
  [fileStorageApiPath.requestUploadUrl]: ["POST"],
  [fileStorageApiPath.registerManagedFile]: ["POST"],
  [fileStorageApiPath.listManagedFiles]: ["POST"],
  [fileStorageApiPath.resolveManagedFileDownload]: ["POST"],
  [fileStorageApiPath.deleteManagedFile]: ["POST"],
};

export const RequestManagedFileUploadUrlHttpRequestSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  sizeBytes: FileSizeBytesSchema,
  sha256: Schema.NonEmptyString,
});

export const RegisterManagedFileHttpRequestSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  uploadToken: Schema.NonEmptyString,
  storageId: Schema.NonEmptyString,
  fileName: Schema.NonEmptyString,
  contentType: Schema.NonEmptyString,
  sizeBytes: FileSizeBytesSchema,
  classification: FileStorageClassificationSchema,
  usage: ManagedFileUsageSchema,
});

export const ListManagedFilesHttpRequestSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  includeDeleted: Schema.optional(Schema.Boolean),
});

export const ManagedFileLookupHttpRequestSchema = Schema.Struct({
  fileId: Schema.NonEmptyString,
});

export type FileStorageTransportService = {
  readonly resolveRequestContext: (input: {
    readonly sessionId: string;
  }) => Effect.Effect<RequestContext, unknown>;
  readonly requestManagedFileUploadUrl: FileStorageService["Type"]["requestManagedFileUploadUrl"];
  readonly registerManagedFile: FileStorageService["Type"]["registerManagedFile"];
  readonly listManagedFiles: FileStorageService["Type"]["listManagedFiles"];
  readonly resolveManagedFileDownload: FileStorageService["Type"]["resolveManagedFileDownload"];
  readonly deleteManagedFile: FileStorageService["Type"]["deleteManagedFile"];
};

type SubscriberJourneyDomainRuntimeError = {
  readonly _tag: "SubscriberJourneyRuntimeError";
  readonly cause: unknown;
};

type FileStorageTransportRuntimeError = {
  readonly _tag: "FileStorageTransportRuntimeError";
  readonly cause: unknown;
};

type FileStorageTransportServiceRunner = <A, E>(
  use: (service: FileStorageTransportService) => Effect.Effect<A, E>,
) => Effect.Effect<
  A,
  E | ParseResult.ParseError | FileStorageTransportRuntimeError
>;

const mapFileStorageTransportRuntimeError = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  | Exclude<E, SubscriberJourneyDomainRuntimeError>
  | FileStorageTransportRuntimeError
> =>
  effect.pipe(
    Effect.mapError((cause) =>
      typeof cause === "object" &&
      cause !== null &&
      "_tag" in cause &&
      cause._tag === "SubscriberJourneyRuntimeError"
        ? ({
            _tag: "FileStorageTransportRuntimeError",
            cause,
          } satisfies FileStorageTransportRuntimeError)
        : (cause as Exclude<E, SubscriberJourneyDomainRuntimeError>),
    ),
  ) as Effect.Effect<
    A,
    | Exclude<E, SubscriberJourneyDomainRuntimeError>
    | FileStorageTransportRuntimeError
  >;

type JsonRequestErrorTag =
  | "FileStorageJsonInvalidError"
  | "FileStorageJsonRequestParseError";

const normalizeJsonRequestError = (
  error: { readonly _tag: JsonRequestErrorTag } | ParseResult.ParseError,
) =>
  error._tag === "ParseError"
    ? ({ _tag: "FileStorageJsonRequestParseError" } as const)
    : error;

const readConvexFileStorageErrorMessage = (error: {
  readonly cause: unknown;
  readonly body?: string;
}) => {
  if (typeof error.body === "string" && error.body.length > 0) {
    return error.body;
  }

  if (error.cause instanceof Error && error.cause.message.length > 0) {
    return error.cause.message;
  }

  if (typeof error.cause === "string" && error.cause.length > 0) {
    return error.cause;
  }

  return undefined;
};

const matchKnownConvexFileStorageRequestError = (error: {
  readonly operation: string;
  readonly cause: unknown;
  readonly body?: string;
}) => {
  if (error.operation !== "createManagedFileRecord") {
    return undefined;
  }

  const message = readConvexFileStorageErrorMessage(error);

  if (message === undefined) {
    return undefined;
  }

  if (message.includes("Managed file upload blob was not found")) {
    return createJsonResponse(
      { error: "Requested resource was not found." },
      404,
    );
  }

  if (message.includes("Managed file upload exceeds the reserved size limit")) {
    return createJsonResponse(
      { error: "Managed file upload exceeds the reserved size limit." },
      413,
    );
  }

  if (
    message.includes("Managed file upload blob size must be a positive integer")
  ) {
    return createJsonResponse(
      {
        error:
          "Managed file upload reservation or blob state is no longer valid.",
      },
      409,
    );
  }

  if (
    message.includes("Managed file upload token is invalid") ||
    message.includes("already used") ||
    message.includes("does not match the target scope or actor") ||
    message.includes("predates the issued upload reservation")
  ) {
    return createJsonResponse(
      { error: "Managed file upload reservation is no longer valid." },
      409,
    );
  }

  if (message.includes("digest does not match")) {
    return createJsonResponse(
      {
        error:
          "Managed file upload blob does not match the issued reservation.",
      },
      409,
    );
  }

  if (message.includes("already bound")) {
    return createJsonResponse(
      { error: "Managed file upload blob is already bound to a managed file." },
      409,
    );
  }

  return undefined;
};

const isConvexFileStorageAdapterRequestError = (
  error: unknown,
): error is {
  readonly _tag: "ConvexFileStorageAdapterRequestError";
  readonly operation: string;
  readonly cause: unknown;
  readonly body?: string;
} =>
  isTaggedError(error) &&
  error._tag === "ConvexFileStorageAdapterRequestError" &&
  "operation" in error &&
  typeof (error as { readonly operation?: unknown }).operation === "string" &&
  "cause" in error;

const buildErrorResponse = (error: unknown) => {
  if (isConvexFileStorageAdapterRequestError(error)) {
    const mappedResponse = matchKnownConvexFileStorageRequestError(error);

    return (
      mappedResponse ??
      createJsonResponse({ error: "A backend dependency request failed." }, 502)
    );
  }

  if (isTaggedError(error)) {
    switch (error._tag) {
      case "FileStorageJsonInvalidError":
      case "FileStorageJsonRequestParseError":
        return createJsonResponse(
          { error: "Request payload did not match the expected schema." },
          400,
        );
      case "SubscriberJourneySessionIdMissingError":
        return createJsonResponse(
          { error: "Authenticated session is required." },
          401,
        );
      case "FileStorageAccessDeniedError":
        return createJsonResponse(
          { error: "File access is not allowed for this session." },
          403,
        );
      case "FileStorageModuleDisabledError":
        return createJsonResponse(
          { error: "File storage is not enabled for this scope." },
          403,
        );
      case "IdentitySessionRequestContextNotFoundError":
      case "FileStorageFileNotFoundError":
        return createJsonResponse(
          { error: "Requested resource was not found." },
          404,
        );
      case "FileStorageUploadTooLargeError":
        return createJsonResponse(
          {
            error: "Requested upload exceeds the configured file-size limit.",
          },
          413,
        );
      case "FileStorageDeletionBlockedError":
        return createJsonResponse(
          { error: "Managed file deletion is blocked by retention policy." },
          409,
        );
      case "FileStorageDeclarationMissingError":
      case "ParseError":
        return createJsonResponse(
          { error: "File storage request failed." },
          500,
        );
      case "FileStorageTransportRuntimeError":
        return createJsonResponse(
          { error: "File storage request failed." },
          500,
        );
      case "AuditLogPostgresRepositoryPersistenceError":
      case "AuthorizationDelegatedCheckError":
      case "KeycloakAdapterRequestError":
      case "PostgresAdapterConnectionError":
      case "RetentionLegalHoldPostgresRepositoryQueryError":
      case "RuntimeConfigModulePersistenceError":
      case "ValkeyAdapterOperationError":
        return createJsonResponse(
          { error: "A backend dependency request failed." },
          502,
        );
    }
  }

  return createJsonResponse({ error: "File storage request failed." }, 500);
};

const runWithRequestContext = <A, E>(input: {
  readonly request: Request;
  readonly runWithService: FileStorageTransportServiceRunner;
  readonly use: (
    service: FileStorageTransportService,
    requestContext: RequestContext,
  ) => Effect.Effect<A, E>;
}) =>
  extractRequiredSubscriberJourneySessionIdFromHeader(input.request).pipe(
    Effect.flatMap((sessionId) =>
      input.runWithService((service) =>
        service
          .resolveRequestContext({ sessionId })
          .pipe(
            Effect.flatMap((requestContext) =>
              input.use(service, requestContext),
            ),
          ),
      ),
    ),
  );

export const createFileStorageHttpHandler = (
  runWithService: FileStorageTransportServiceRunner,
) => {
  return (request: Request) => {
    const url = new URL(request.url);
    const allowedMethods = fileStorageAllowedMethodsByPath[url.pathname];

    if (allowedMethods === undefined) {
      return Effect.succeed(
        createNotFoundResponse("File storage route not found."),
      );
    }

    if (!allowedMethods.includes(request.method)) {
      return Effect.succeed(createMethodNotAllowedResponse(allowedMethods));
    }

    switch (url.pathname) {
      case fileStorageApiPath.requestUploadUrl:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag:
              "FileStorageJsonInvalidError" as JsonRequestErrorTag,
            decode: Schema.decodeUnknown(
              RequestManagedFileUploadUrlHttpRequestSchema,
            ),
          }).pipe(
            Effect.mapError(normalizeJsonRequestError),
            Effect.flatMap((input) =>
              runWithRequestContext({
                request,
                runWithService,
                use: (service, requestContext) =>
                  service.requestManagedFileUploadUrl({
                    requestContext,
                    ...input,
                  }),
              }),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case fileStorageApiPath.registerManagedFile:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag:
              "FileStorageJsonInvalidError" as JsonRequestErrorTag,
            decode: Schema.decodeUnknown(RegisterManagedFileHttpRequestSchema),
          }).pipe(
            Effect.mapError(normalizeJsonRequestError),
            Effect.flatMap((input) =>
              runWithRequestContext({
                request,
                runWithService,
                use: (service, requestContext) =>
                  service.registerManagedFile({
                    requestContext,
                    ...input,
                  }),
              }),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 201),
        });
      case fileStorageApiPath.listManagedFiles:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag:
              "FileStorageJsonInvalidError" as JsonRequestErrorTag,
            decode: Schema.decodeUnknown(ListManagedFilesHttpRequestSchema),
          }).pipe(
            Effect.mapError(normalizeJsonRequestError),
            Effect.flatMap((input) =>
              runWithRequestContext({
                request,
                runWithService,
                use: (service, requestContext) =>
                  service.listManagedFiles({
                    requestContext,
                    ...input,
                  }),
              }),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case fileStorageApiPath.resolveManagedFileDownload:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag:
              "FileStorageJsonInvalidError" as JsonRequestErrorTag,
            decode: Schema.decodeUnknown(ManagedFileLookupHttpRequestSchema),
          }).pipe(
            Effect.mapError(normalizeJsonRequestError),
            Effect.flatMap((input) =>
              runWithRequestContext({
                request,
                runWithService,
                use: (service, requestContext) =>
                  service.resolveManagedFileDownload({
                    requestContext,
                    ...input,
                  }),
              }),
            ),
          ),
          onFailure: buildErrorResponse,
          onSuccess: (result) => createJsonResponse(result, 200),
        });
      case fileStorageApiPath.deleteManagedFile:
        return matchHttpEffect({
          effect: readRequestJson({
            request,
            invalidJsonTag:
              "FileStorageJsonInvalidError" as JsonRequestErrorTag,
            decode: Schema.decodeUnknown(ManagedFileLookupHttpRequestSchema),
          }).pipe(
            Effect.mapError(normalizeJsonRequestError),
            Effect.flatMap((input) =>
              runWithRequestContext({
                request,
                runWithService,
                use: (service, requestContext) =>
                  service.deleteManagedFile({
                    requestContext,
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
          createNotFoundResponse("File storage route not found."),
        );
    }
  };
};

export const handleFileStorageHttpRequest = (
  environment: unknown,
  request: Request,
) =>
  createFileStorageHttpHandler((use) =>
    mapFileStorageTransportRuntimeError(
      runFileStorageTransportFromEnvironment(
        environment,
        ({ identitySession, service }) =>
          use({
            resolveRequestContext: (input) =>
              identitySession.resolveRequestContext(input),
            requestManagedFileUploadUrl: service.requestManagedFileUploadUrl,
            registerManagedFile: service.registerManagedFile,
            listManagedFiles: service.listManagedFiles,
            resolveManagedFileDownload: service.resolveManagedFileDownload,
            deleteManagedFile: service.deleteManagedFile,
          }),
      ),
    ),
  )(request);

export const fileStorageOpenApiResponseSchema = {
  uploadUrl: ManagedFileUploadUrlSchema,
  summary: ManagedFileSummaryViewSchema,
  summaryList: ManagedFileSummaryViewListSchema,
  download: ManagedFileDownloadDescriptorSchema,
} as const;
