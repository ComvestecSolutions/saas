import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  actorType,
  type CreateManagedFileRecordInput,
  CreateManagedFileRecordInputSchema,
  identityClaimKey,
  type ListManagedFilesRequest,
  ListManagedFilesRequestSchema,
  type ManagedFileLookupInput,
  ManagedFileLookupInputSchema,
  type ManagedFileRecord,
  ManagedFileRecordListSchema,
  ManagedFileRecordSchema,
  type ManagedFileUploadReservationRequest,
  ManagedFileUploadReservationRequestSchema,
  type ManagedFileUploadUrl,
  ManagedFileUploadUrlSchema,
  type MarkManagedFileDeletedInput,
  MarkManagedFileDeletedInputSchema,
  type StoredFileBlobLookupInput,
  StoredFileBlobLookupInputSchema,
} from "@comvestec/contracts";
import {
  type KeycloakAdapterRequestError,
  type KeycloakPasswordGrantIdTokenMissingError,
  makeKeycloakAdapter,
} from "../identity/keycloak";
import {
  createConvexRuntimeHealthcheck,
  type ConvexRuntimeHealthcheckError,
} from "./convex-runtime";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const ConvexFileStorageAdapterOptionsSchema = Schema.Struct({
  deploymentUrl: Schema.NonEmptyString,
  siteUrl: Schema.NonEmptyString,
  adminKey: Schema.optional(Schema.NonEmptyString),
  keycloakBaseUrl: Schema.NonEmptyString,
  keycloakRealm: Schema.NonEmptyString,
  keycloakClientId: Schema.NonEmptyString,
  keycloakClientSecret: Schema.NonEmptyString,
  keycloakConvexServiceActorUsername: Schema.NonEmptyString,
  keycloakConvexServiceActorPassword: Schema.NonEmptyString,
});

type ConvexFileStorageAdapterRuntimeOptions = Schema.Schema.Type<
  typeof ConvexFileStorageAdapterOptionsSchema
>;

export type ConvexFileStorageAdapterOptions =
  ConvexFileStorageAdapterRuntimeOptions & {
    readonly fetch?: typeof fetch;
  };

const ConvexFileStorageHealthcheckSchema =
  createPlatformAdapterHealthcheckSchema(platformAdapterServiceName.convex);

export type ConvexFileStorageHealthcheck = Schema.Schema.Type<
  typeof ConvexFileStorageHealthcheckSchema
>;

export type ConvexFileStorageAdapterRequestError = {
  readonly _tag: "ConvexFileStorageAdapterRequestError";
  readonly operation:
    | "generateManagedFileUploadUrl"
    | "createManagedFileRecord"
    | "getManagedFileRecord"
    | "listManagedFileRecords"
    | "resolveStoredFileUrl"
    | "markManagedFileDeleted"
    | "deleteStoredFileBlob";
  readonly cause: unknown;
  readonly status?: number;
  readonly body?: string;
};

export type ConvexFileStorageAdapterError =
  | ParseResult.ParseError
  | KeycloakAdapterRequestError
  | KeycloakPasswordGrantIdTokenMissingError
  | ConvexFileStorageAdapterRequestError;

export type ConvexFileStorageAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.convex;
  readonly deploymentUrl: string;
  readonly siteUrl: string;
  readonly healthcheck: Effect.Effect<
    ConvexFileStorageHealthcheck,
    ConvexRuntimeHealthcheckError
  >;
  readonly generateManagedFileUploadUrl: (
    input: ManagedFileUploadReservationRequest,
  ) => Effect.Effect<ManagedFileUploadUrl, ConvexFileStorageAdapterError>;
  readonly createManagedFileRecord: (
    input: CreateManagedFileRecordInput,
  ) => Effect.Effect<ManagedFileRecord, ConvexFileStorageAdapterError>;
  readonly getManagedFileRecord: (
    input: ManagedFileLookupInput,
  ) => Effect.Effect<
    ManagedFileRecord | undefined,
    ConvexFileStorageAdapterError
  >;
  readonly listManagedFileRecords: (
    input: ListManagedFilesRequest,
  ) => Effect.Effect<
    readonly ManagedFileRecord[],
    ConvexFileStorageAdapterError
  >;
  readonly resolveStoredFileUrl: (
    input: StoredFileBlobLookupInput,
  ) => Effect.Effect<string | undefined, ConvexFileStorageAdapterError>;
  readonly markManagedFileDeleted: (
    input: MarkManagedFileDeletedInput,
  ) => Effect.Effect<
    ManagedFileRecord | undefined,
    ConvexFileStorageAdapterError
  >;
  readonly deleteStoredFileBlob: (
    input: StoredFileBlobLookupInput,
  ) => Effect.Effect<void, ConvexFileStorageAdapterError>;
};

export class ConvexFileStorageAdapter extends Context.Tag(
  "ConvexFileStorageAdapter",
)<ConvexFileStorageAdapter, ConvexFileStorageAdapterService>() {}

type ConvexAuthenticatedHttpClient = ConvexHttpClient & {
  readonly setAuth: (token: string) => void;
  readonly setAdminAuth: (
    token: string,
    actingUser: Record<string, string>,
  ) => void;
  readonly setDebug: (enabled: boolean) => void;
};

type ConvexFileStorageRequestAuth =
  | {
      readonly mode: "admin";
      readonly token: string;
    }
  | {
      readonly mode: "user";
      readonly token: string;
    };

const generateManagedFileUploadUrlMutation = makeFunctionReference<
  "mutation",
  ManagedFileUploadReservationRequest,
  ManagedFileUploadUrl
>("fileStorage:generateManagedFileUploadUrl");

const createManagedFileRecordMutation = makeFunctionReference<
  "mutation",
  CreateManagedFileRecordInput,
  ManagedFileRecord
>("fileStorage:createManagedFileRecord");

const getManagedFileRecordQuery = makeFunctionReference<
  "query",
  ManagedFileLookupInput,
  ManagedFileRecord | null
>("fileStorage:getManagedFileRecord");

const listManagedFileRecordsQuery = makeFunctionReference<
  "query",
  ListManagedFilesRequest,
  readonly ManagedFileRecord[]
>("fileStorage:listManagedFileRecords");

const resolveStoredFileUrlQuery = makeFunctionReference<
  "query",
  StoredFileBlobLookupInput,
  string | null
>("fileStorage:resolveStoredFileUrl");

const markManagedFileDeletedMutation = makeFunctionReference<
  "mutation",
  MarkManagedFileDeletedInput,
  ManagedFileRecord | null
>("fileStorage:markManagedFileDeleted");

const deleteStoredFileBlobMutation = makeFunctionReference<
  "mutation",
  StoredFileBlobLookupInput,
  null
>("fileStorage:deleteStoredFileBlob");

const decodeManagedFileUploadReservationRequest = Schema.decodeUnknown(
  ManagedFileUploadReservationRequestSchema,
);

const decodeManagedFileUploadUrl = Schema.decodeUnknown(
  ManagedFileUploadUrlSchema,
);

const normalizeManagedFileUploadUrlPayload = (
  payload: unknown,
  siteUrl: string,
): unknown => {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("uploadUrl" in payload) ||
    typeof payload.uploadUrl !== "string"
  ) {
    return payload;
  }

  const trimmedUploadUrl = payload.uploadUrl.trim();
  const normalizedUploadUrl =
    trimmedUploadUrl.length === 0
      ? new URL("/api/storage/upload", siteUrl).toString()
      : (() => {
          try {
            return new URL(trimmedUploadUrl, siteUrl).toString();
          } catch {
            return payload.uploadUrl;
          }
        })();

  return normalizedUploadUrl === payload.uploadUrl
    ? payload
    : {
        ...payload,
        uploadUrl: normalizedUploadUrl,
      };
};

const decodeCreateManagedFileRecordInput = Schema.decodeUnknown(
  CreateManagedFileRecordInputSchema,
);

const decodeManagedFileRecord = Schema.decodeUnknown(ManagedFileRecordSchema);

const decodeManagedFileRecordList = Schema.decodeUnknown(
  ManagedFileRecordListSchema,
);

const decodeManagedFileLookupInput = Schema.decodeUnknown(
  ManagedFileLookupInputSchema,
);

const decodeListManagedFilesRequest = Schema.decodeUnknown(
  ListManagedFilesRequestSchema,
);

const decodeStoredFileBlobLookupInput = Schema.decodeUnknown(
  StoredFileBlobLookupInputSchema,
);

const decodeMarkManagedFileDeletedInput = Schema.decodeUnknown(
  MarkManagedFileDeletedInputSchema,
);

const buildConvexFileStorageAdapterRequestError = (
  operation: ConvexFileStorageAdapterRequestError["operation"],
  cause: unknown,
): ConvexFileStorageAdapterRequestError =>
  ({
    _tag: "ConvexFileStorageAdapterRequestError",
    operation,
    cause,
    ...(typeof cause === "object" &&
    cause !== null &&
    "status" in cause &&
    typeof cause.status === "number"
      ? { status: cause.status }
      : {}),
    ...(typeof cause === "object" &&
    cause !== null &&
    "body" in cause &&
    typeof cause.body === "string"
      ? { body: cause.body }
      : {}),
  }) satisfies ConvexFileStorageAdapterRequestError;

const createConvexHttpClient = (deploymentUrl: string) => {
  const convex = new ConvexHttpClient(deploymentUrl, {
    logger: false,
    skipConvexDeploymentUrlCheck: true,
  }) as ConvexAuthenticatedHttpClient;

  convex.setDebug(false);

  return convex;
};

const buildConvexFileStorageAdminActingIdentity = (
  options: ConvexFileStorageAdapterOptions,
) => ({
  subject: options.keycloakConvexServiceActorUsername,
  issuer: `${options.keycloakBaseUrl}/realms/${options.keycloakRealm}`,
  preferredUsername: options.keycloakConvexServiceActorUsername,
  [identityClaimKey.actorType]: actorType.serviceActor,
});

export const makeConvexFileStorageAdapter = (
  input: ConvexFileStorageAdapterOptions,
) =>
  Schema.decodeUnknown(ConvexFileStorageAdapterOptionsSchema)(input).pipe(
    Effect.flatMap((options) =>
      makeKeycloakAdapter({
        baseUrl: options.keycloakBaseUrl,
        realm: options.keycloakRealm,
        clientId: options.keycloakClientId,
        clientSecret: options.keycloakClientSecret,
      }).pipe(
        Effect.map((keycloak): ConvexFileStorageAdapterService => {
          const resolveRequestAuth = (): Effect.Effect<
            ConvexFileStorageRequestAuth,
            | KeycloakAdapterRequestError
            | KeycloakPasswordGrantIdTokenMissingError
            | ParseResult.ParseError
          > =>
            options.adminKey !== undefined
              ? Effect.succeed({
                  mode: "admin",
                  token: options.adminKey,
                } satisfies ConvexFileStorageRequestAuth)
              : keycloak
                  .issueIdTokenWithPasswordGrant({
                    username: options.keycloakConvexServiceActorUsername,
                    password: options.keycloakConvexServiceActorPassword,
                  })
                  .pipe(
                    Effect.map(
                      (token): ConvexFileStorageRequestAuth => ({
                        mode: "user",
                        token,
                      }),
                    ),
                  );

          const invokeAuthenticatedRequest = <A>(request: {
            readonly operation: ConvexFileStorageAdapterRequestError["operation"];
            readonly invoke: (
              client: ConvexAuthenticatedHttpClient,
            ) => Promise<A>;
          }): Effect.Effect<A, ConvexFileStorageAdapterError> =>
            resolveRequestAuth().pipe(
              Effect.flatMap((requestAuth) =>
                Effect.tryPromise({
                  try: async () => {
                    const convex = createConvexHttpClient(
                      options.deploymentUrl,
                    );

                    if (requestAuth.mode === "admin") {
                      convex.setAdminAuth(
                        requestAuth.token,
                        buildConvexFileStorageAdminActingIdentity(options),
                      );
                    } else {
                      convex.setAuth(requestAuth.token);
                    }

                    return await request.invoke(convex);
                  },
                  catch: (cause) =>
                    buildConvexFileStorageAdapterRequestError(
                      request.operation,
                      cause,
                    ),
                }),
              ),
            );

          return {
            serviceName: platformAdapterServiceName.convex,
            deploymentUrl: options.deploymentUrl,
            siteUrl: options.siteUrl,
            healthcheck: createConvexRuntimeHealthcheck({
              deploymentUrl: options.deploymentUrl,
              fetchImplementation: input.fetch ?? fetch,
            }),
            generateManagedFileUploadUrl: (input) =>
              decodeManagedFileUploadReservationRequest(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "generateManagedFileUploadUrl",
                    invoke: async (convex) =>
                      await convex.mutation(
                        generateManagedFileUploadUrlMutation,
                        request,
                        { skipQueue: true },
                      ),
                  }),
                ),
                Effect.flatMap((payload) =>
                  decodeManagedFileUploadUrl(
                    normalizeManagedFileUploadUrlPayload(
                      payload,
                      options.siteUrl,
                    ),
                  ),
                ),
              ),
            createManagedFileRecord: (input) =>
              decodeCreateManagedFileRecordInput(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "createManagedFileRecord",
                    invoke: async (convex) =>
                      await convex.mutation(
                        createManagedFileRecordMutation,
                        request,
                        { skipQueue: true },
                      ),
                  }),
                ),
                Effect.flatMap((payload) => decodeManagedFileRecord(payload)),
              ),
            getManagedFileRecord: (input) =>
              decodeManagedFileLookupInput(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "getManagedFileRecord",
                    invoke: async (convex) =>
                      await convex.query(getManagedFileRecordQuery, request),
                  }),
                ),
                Effect.flatMap((payload) =>
                  payload === null
                    ? Effect.succeed(undefined)
                    : decodeManagedFileRecord(payload),
                ),
              ),
            listManagedFileRecords: (input) =>
              decodeListManagedFilesRequest(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "listManagedFileRecords",
                    invoke: async (convex) =>
                      await convex.query(listManagedFileRecordsQuery, request),
                  }),
                ),
                Effect.flatMap((payload) =>
                  decodeManagedFileRecordList(payload),
                ),
              ),
            resolveStoredFileUrl: (input) =>
              decodeStoredFileBlobLookupInput(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "resolveStoredFileUrl",
                    invoke: async (convex) =>
                      await convex.query(resolveStoredFileUrlQuery, request),
                  }),
                ),
                Effect.flatMap((payload) =>
                  payload === null
                    ? Effect.succeed(undefined)
                    : Effect.succeed(payload),
                ),
              ),
            markManagedFileDeleted: (input) =>
              decodeMarkManagedFileDeletedInput(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "markManagedFileDeleted",
                    invoke: async (convex) =>
                      await convex.mutation(
                        markManagedFileDeletedMutation,
                        request,
                        { skipQueue: true },
                      ),
                  }),
                ),
                Effect.flatMap((payload) =>
                  payload === null
                    ? Effect.succeed(undefined)
                    : decodeManagedFileRecord(payload),
                ),
              ),
            deleteStoredFileBlob: (input) =>
              decodeStoredFileBlobLookupInput(input).pipe(
                Effect.flatMap((request) =>
                  invokeAuthenticatedRequest({
                    operation: "deleteStoredFileBlob",
                    invoke: async (convex) =>
                      await convex.mutation(
                        deleteStoredFileBlobMutation,
                        request,
                        { skipQueue: true },
                      ),
                  }),
                ),
                Effect.asVoid,
              ),
          } satisfies ConvexFileStorageAdapterService;
        }),
      ),
    ),
  );

export const makeConvexFileStorageAdapterLayer = (
  options: ConvexFileStorageAdapterOptions,
) =>
  Layer.effect(ConvexFileStorageAdapter, makeConvexFileStorageAdapter(options));
