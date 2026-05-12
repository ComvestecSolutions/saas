import {
  findModuleManifest,
  fileStorageConfigKey,
  fileStorageFeatureFlag,
} from "@comvestec/config";
import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  authorizationNamespace,
  authorizationRelation,
  type DeleteManagedFileInput,
  FileSizeBytesSchema,
  type FileStorageClassification,
  fileStorageAuditAction,
  FileStorageClassificationSchema,
  type ManagedFileDownloadDescriptor,
  type ManagedFileSummaryView,
  type ManagedFileUploadUrl,
  type ManagedFileUsage,
  ManagedFileUsageSchema,
  permissionScope,
  PlatformScopeSchema,
  platformModuleId,
  platformScope,
  RequestContextSchema,
  type RequestContext,
} from "@comvestec/contracts";
import {
  AuditLogModule,
  type AuditLogModuleError,
  AuthorizationModule,
  FileStorageModule,
  type FileStorageFileNotFoundError,
  type FileStorageModuleError,
  IdentitySessionModule,
  makeFileStorageModule,
  makeAuthorizationModule,
  RetentionLegalHoldModule,
  RuntimeConfigModule,
  type RuntimeConfigModulePersistenceError,
  type UnknownConfigKeyError,
  type AuthorizationDelegatedCheckError,
} from "@comvestec/modules";
import {
  ConvexFileStorageAdapter,
  makeConvexFileStorageAdapter,
  OryKetoAdapter,
} from "../../adapters";
import {
  createOryKetoAuthorizationDelegatedCheck,
  createOryKetoAuthorizationDelegatedTupleLookup,
} from "../access/authorization-delegation";
import {
  makeSubscriberJourneyRuntime,
  resolveSubscriberJourneyRuntimeOptionsFromEnvironment,
  type SubscriberJourneyRuntimeOptions,
} from "./subscriber-journey";

const FileStorageTargetSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

type FileStorageTarget = Schema.Schema.Type<typeof FileStorageTargetSchema>;

export const RequestManagedFileUploadUrlRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  sizeBytes: FileSizeBytesSchema,
  sha256: Schema.NonEmptyString,
});

export type RequestManagedFileUploadUrlRequest = Schema.Schema.Type<
  typeof RequestManagedFileUploadUrlRequestSchema
>;

const RegisterManagedFileByRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
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

export type RegisterManagedFileByRequest = {
  readonly requestContext: RequestContext;
  readonly scope: FileStorageTarget["scope"];
  readonly scopeId: string;
  readonly uploadToken: string;
  readonly storageId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly classification: FileStorageClassification;
  readonly usage: ManagedFileUsage;
};

const ListManagedFilesByRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  includeDeleted: Schema.optional(Schema.Boolean),
});

export type ListManagedFilesByRequest = Schema.Schema.Type<
  typeof ListManagedFilesByRequestSchema
>;

const ManagedFileByRequestLookupSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  fileId: Schema.NonEmptyString,
});

export type ManagedFileByRequestLookup = Schema.Schema.Type<
  typeof ManagedFileByRequestLookupSchema
>;

export type FileStorageDeclarationMissingError = {
  readonly _tag: "FileStorageDeclarationMissingError";
  readonly moduleId: typeof platformModuleId.fileStorage;
  readonly key: string;
};

export type FileStorageModuleDisabledError = {
  readonly _tag: "FileStorageModuleDisabledError";
  readonly scope: FileStorageTarget["scope"];
  readonly scopeId: string;
};

export type FileStorageAccessDeniedError = {
  readonly _tag: "FileStorageAccessDeniedError";
  readonly permission:
    | typeof permissionScope.fileRead
    | typeof permissionScope.fileWrite;
  readonly scope: FileStorageTarget["scope"];
  readonly scopeId: string;
};

export type FileStorageUploadTooLargeError = {
  readonly _tag: "FileStorageUploadTooLargeError";
  readonly sizeBytes: number;
  readonly maxUploadSizeMb: number;
};

export type FileStorageServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | FileStorageModuleError
  | RuntimeConfigModulePersistenceError
  | UnknownConfigKeyError
  | AuthorizationDelegatedCheckError
  | FileStorageDeclarationMissingError
  | FileStorageModuleDisabledError
  | FileStorageAccessDeniedError
  | FileStorageUploadTooLargeError;

export type FileStorageServiceApi = {
  readonly requestManagedFileUploadUrl: (
    input: RequestManagedFileUploadUrlRequest,
  ) => Effect.Effect<ManagedFileUploadUrl, FileStorageServiceError>;
  readonly registerManagedFile: (
    input: RegisterManagedFileByRequest,
  ) => Effect.Effect<ManagedFileSummaryView, FileStorageServiceError>;
  readonly listManagedFiles: (
    input: ListManagedFilesByRequest,
  ) => Effect.Effect<
    readonly ManagedFileSummaryView[],
    FileStorageServiceError
  >;
  readonly resolveManagedFileDownload: (
    input: ManagedFileByRequestLookup,
  ) => Effect.Effect<ManagedFileDownloadDescriptor, FileStorageServiceError>;
  readonly deleteManagedFile: (
    input: ManagedFileByRequestLookup,
  ) => Effect.Effect<ManagedFileSummaryView, FileStorageServiceError>;
};

export class FileStorageService extends Context.Tag("FileStorageService")<
  FileStorageService,
  FileStorageServiceApi
>() {}

const decodeBoolean = Schema.decodeUnknown(Schema.Boolean);
const decodeNumber = Schema.decodeUnknown(Schema.Number);

const buildTargetTenantContext = (
  target: FileStorageTarget,
): RequestContext["tenant"] => ({
  scope: target.scope,
  scopeId: target.scopeId,
  ...(target.scope === platformScope.enterprise
    ? { enterpriseId: target.scopeId }
    : {}),
  ...(target.scope === platformScope.organization
    ? { organizationId: target.scopeId }
    : {}),
  ...(target.scope === platformScope.individual
    ? { individualId: target.scopeId }
    : {}),
});

const buildTargetScopedRequestContext = (
  requestContext: RequestContext,
  target: FileStorageTarget,
) =>
  requestContext.tenant.scope === target.scope &&
  requestContext.tenant.scopeId === target.scopeId
    ? requestContext
    : {
        ...requestContext,
        tenant: buildTargetTenantContext(target),
      };

const buildFileAuthorizationObject = (target: FileStorageTarget) =>
  [authorizationNamespace.file, target.scope, target.scopeId].join(":");

const resolveMutationActorReference = (requestContext: RequestContext) =>
  requestContext.actorId ??
  requestContext.sessionId ??
  requestContext.correlationId;

const requireFileStorageFeatureFlag = () =>
  Effect.fromNullable(
    findModuleManifest(platformModuleId.fileStorage)?.featureFlags.find(
      (candidate) => candidate.key === fileStorageFeatureFlag.enabled,
    ),
  ).pipe(
    Effect.orElseFail(
      () =>
        ({
          _tag: "FileStorageDeclarationMissingError",
          moduleId: platformModuleId.fileStorage,
          key: fileStorageFeatureFlag.enabled,
        }) satisfies FileStorageDeclarationMissingError,
    ),
  );

const resolveFileStorageRuntimeSettings = (input: {
  readonly runtimeConfig: RuntimeConfigModule["Type"];
  readonly requestContext: RequestContext;
  readonly target: FileStorageTarget;
}) =>
  Effect.gen(function* () {
    const scopedRequestContext = buildTargetScopedRequestContext(
      input.requestContext,
      input.target,
    );
    const flag = yield* requireFileStorageFeatureFlag();
    const overrides = yield* input.runtimeConfig.listOverridesByModule(
      platformModuleId.fileStorage,
    );
    const enabledResolution = yield* input.runtimeConfig.resolveFeatureFlag({
      requestContext: scopedRequestContext,
      moduleId: platformModuleId.fileStorage,
      flag,
      overrides,
      entitlements: [],
    });
    const maxUploadResolution = yield* input.runtimeConfig.resolveConfigValue({
      requestContext: scopedRequestContext,
      moduleId: platformModuleId.fileStorage,
      key: fileStorageConfigKey.maxUploadSizeMb,
      overrides,
      entitlements: [],
    });

    const enabled = yield* decodeBoolean(enabledResolution.effectiveValue);
    const maxUploadSizeMb = yield* decodeNumber(
      maxUploadResolution.effectiveValue,
    );

    return {
      enabled,
      maxUploadSizeMb,
      source: enabledResolution.source,
    } as const;
  });

const ensureFileStorageEnabled = (input: {
  readonly runtimeConfig: RuntimeConfigModule["Type"];
  readonly requestContext: RequestContext;
  readonly target: FileStorageTarget;
}) =>
  resolveFileStorageRuntimeSettings({
    runtimeConfig: input.runtimeConfig,
    requestContext: input.requestContext,
    target: input.target,
  }).pipe(
    Effect.flatMap((settings) =>
      settings.enabled
        ? Effect.succeed(settings)
        : Effect.fail({
            _tag: "FileStorageModuleDisabledError",
            scope: input.target.scope,
            scopeId: input.target.scopeId,
          } satisfies FileStorageModuleDisabledError),
    ),
  );

const ensureUploadSizeWithinLimit = (input: {
  readonly sizeBytes: number;
  readonly maxUploadSizeMb: number;
}) =>
  input.sizeBytes <= input.maxUploadSizeMb * 1024 * 1024
    ? Effect.void
    : Effect.fail({
        _tag: "FileStorageUploadTooLargeError",
        sizeBytes: input.sizeBytes,
        maxUploadSizeMb: input.maxUploadSizeMb,
      } satisfies FileStorageUploadTooLargeError);

const authorizeFileStorageAccess = (input: {
  readonly authorization: AuthorizationModule["Type"];
  readonly requestContext: RequestContext;
  readonly target: FileStorageTarget;
  readonly permission:
    | typeof permissionScope.fileRead
    | typeof permissionScope.fileWrite;
}) =>
  input.authorization
    .check({
      requestContext: input.requestContext,
      namespace: authorizationNamespace.file,
      object: buildFileAuthorizationObject(input.target),
      relation:
        input.permission === permissionScope.fileRead
          ? authorizationRelation.viewer
          : authorizationRelation.editor,
      permissionScope: input.permission,
    })
    .pipe(
      Effect.flatMap((decision) =>
        decision.allowed
          ? Effect.succeed(input.requestContext)
          : Effect.fail({
              _tag: "FileStorageAccessDeniedError",
              permission: input.permission,
              scope: input.target.scope,
              scopeId: input.target.scopeId,
            } satisfies FileStorageAccessDeniedError),
      ),
    );

const requireManagedFileTarget = (fileId: string) => {
  const segments = fileId.split(":");
  const prefix = segments[0];
  const scope = segments[1];
  const scopeIdSegments = segments.slice(2, -1);
  const scopeId = scopeIdSegments.join(":");

  if (
    prefix !== platformModuleId.fileStorage ||
    scope === undefined ||
    scopeIdSegments.length === 0 ||
    scopeId.length === 0
  ) {
    return Effect.fail({
      _tag: "FileStorageFileNotFoundError",
      fileId,
    } satisfies FileStorageFileNotFoundError);
  }

  return Schema.decodeUnknown(FileStorageTargetSchema)({
    scope,
    scopeId,
  }).pipe(
    Effect.mapError(
      () =>
        ({
          _tag: "FileStorageFileNotFoundError",
          fileId,
        }) satisfies FileStorageFileNotFoundError,
    ),
  );
};

const buildManagedFileSummaryView = (record: {
  readonly fileId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly deletedAt?: string | undefined;
}): ManagedFileSummaryView => ({
  fileId: record.fileId,
  fileName: record.fileName,
  contentType: record.contentType,
  sizeBytes: record.sizeBytes,
  ...(record.deletedAt !== undefined ? { deletedAt: record.deletedAt } : {}),
});

const appendManagedFileAudit = (input: {
  readonly auditLog: Pick<AuditLogModule["Type"], "append">;
  readonly requestContext: RequestContext;
  readonly action:
    | typeof fileStorageAuditAction.registered
    | typeof fileStorageAuditAction.downloadResolved
    | typeof fileStorageAuditAction.deleted;
  readonly fileId: string;
  readonly reason: string;
}) =>
  input.auditLog
    .append({
      requestContext: input.requestContext,
      moduleId: platformModuleId.fileStorage,
      action: input.action,
      target: input.fileId,
      reason: input.reason,
    })
    .pipe(Effect.asVoid);

const appendManagedFileAuditAfterCommit = (input: {
  readonly auditLog: Pick<AuditLogModule["Type"], "append">;
  readonly requestContext: RequestContext;
  readonly action:
    | typeof fileStorageAuditAction.registered
    | typeof fileStorageAuditAction.downloadResolved
    | typeof fileStorageAuditAction.deleted;
  readonly fileId: string;
  readonly reason: string;
}) => appendManagedFileAudit(input).pipe(Effect.catchAll(() => Effect.void));

export const makeFileStorageService = () =>
  Effect.gen(function* () {
    const auditLog = yield* AuditLogModule;
    const fileStorage = yield* FileStorageModule;
    const runtimeConfig = yield* RuntimeConfigModule;
    const oryKeto = yield* OryKetoAdapter;
    const authorization = yield* makeAuthorizationModule({
      tuples: [],
      cacheTtlSeconds: 60,
      delegatedCheck: createOryKetoAuthorizationDelegatedCheck(oryKeto),
      delegatedTupleLookup:
        createOryKetoAuthorizationDelegatedTupleLookup(oryKeto),
    });

    return {
      requestManagedFileUploadUrl: (
        input: RequestManagedFileUploadUrlRequest,
      ) =>
        Schema.decodeUnknown(RequestManagedFileUploadUrlRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const target = {
                scope: request.scope,
                scopeId: request.scopeId,
              } as const;

              const settings = yield* ensureFileStorageEnabled({
                runtimeConfig,
                requestContext: request.requestContext,
                target,
              });

              yield* authorizeFileStorageAccess({
                authorization,
                requestContext: request.requestContext,
                target,
                permission: permissionScope.fileWrite,
              });
              yield* ensureUploadSizeWithinLimit({
                sizeBytes: request.sizeBytes,
                maxUploadSizeMb: settings.maxUploadSizeMb,
              });

              return yield* fileStorage.requestManagedFileUploadUrl({
                scope: request.scope,
                scopeId: request.scopeId,
                uploadedBy: resolveMutationActorReference(
                  request.requestContext,
                ),
                maxSizeBytes: request.sizeBytes,
                expectedSha256: request.sha256,
              });
            }),
          ),
        ),
      registerManagedFile: (input: RegisterManagedFileByRequest) =>
        Schema.decodeUnknown(RegisterManagedFileByRequestSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const target = {
                scope: request.scope,
                scopeId: request.scopeId,
              } as const;

              const settings = yield* ensureFileStorageEnabled({
                runtimeConfig,
                requestContext: request.requestContext,
                target,
              });

              yield* authorizeFileStorageAccess({
                authorization,
                requestContext: request.requestContext,
                target,
                permission: permissionScope.fileWrite,
              });
              yield* ensureUploadSizeWithinLimit({
                sizeBytes: request.sizeBytes,
                maxUploadSizeMb: settings.maxUploadSizeMb,
              });

              const managedFile = yield* fileStorage.registerManagedFile({
                scope: request.scope,
                scopeId: request.scopeId,
                uploadToken: request.uploadToken,
                storageId: request.storageId,
                fileName: request.fileName,
                contentType: request.contentType,
                sizeBytes: request.sizeBytes,
                classification:
                  request.classification as FileStorageClassification,
                usage: request.usage as ManagedFileUsage,
                uploadedBy: resolveMutationActorReference(
                  request.requestContext,
                ),
              });

              yield* appendManagedFileAuditAfterCommit({
                auditLog,
                requestContext: buildTargetScopedRequestContext(
                  request.requestContext,
                  target,
                ),
                action: fileStorageAuditAction.registered,
                fileId: managedFile.fileId,
                reason: `Register managed file ${managedFile.fileId}.`,
              });

              return buildManagedFileSummaryView(managedFile);
            }),
          ),
        ),
      listManagedFiles: (input: ListManagedFilesByRequest) =>
        Schema.decodeUnknown(ListManagedFilesByRequestSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const target = {
                scope: request.scope,
                scopeId: request.scopeId,
              } as const;

              yield* ensureFileStorageEnabled({
                runtimeConfig,
                requestContext: request.requestContext,
                target,
              });
              yield* authorizeFileStorageAccess({
                authorization,
                requestContext: request.requestContext,
                target,
                permission: permissionScope.fileRead,
              });

              return yield* fileStorage.listManagedFiles({
                scope: request.scope,
                scopeId: request.scopeId,
                ...(request.includeDeleted !== undefined
                  ? { includeDeleted: request.includeDeleted }
                  : {}),
              });
            }),
          ),
        ),
      resolveManagedFileDownload: (input: ManagedFileByRequestLookup) =>
        Schema.decodeUnknown(ManagedFileByRequestLookupSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const target = yield* requireManagedFileTarget(request.fileId);

              yield* ensureFileStorageEnabled({
                runtimeConfig,
                requestContext: request.requestContext,
                target,
              });
              yield* authorizeFileStorageAccess({
                authorization,
                requestContext: request.requestContext,
                target,
                permission: permissionScope.fileRead,
              });

              const download = yield* fileStorage.resolveManagedFileDownload({
                fileId: request.fileId,
              });

              yield* appendManagedFileAudit({
                auditLog,
                requestContext: buildTargetScopedRequestContext(
                  request.requestContext,
                  target,
                ),
                action: fileStorageAuditAction.downloadResolved,
                fileId: request.fileId,
                reason: `Resolve managed-file download URL for ${request.fileId}.`,
              });

              return download;
            }),
          ),
        ),
      deleteManagedFile: (input: ManagedFileByRequestLookup) =>
        Schema.decodeUnknown(ManagedFileByRequestLookupSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const target = yield* requireManagedFileTarget(request.fileId);

              yield* ensureFileStorageEnabled({
                runtimeConfig,
                requestContext: request.requestContext,
                target,
              });
              yield* authorizeFileStorageAccess({
                authorization,
                requestContext: request.requestContext,
                target,
                permission: permissionScope.fileWrite,
              });

              const deletedFile = yield* fileStorage.deleteManagedFile({
                fileId: request.fileId,
                deletedBy: resolveMutationActorReference(
                  request.requestContext,
                ),
              } satisfies DeleteManagedFileInput);

              yield* appendManagedFileAuditAfterCommit({
                auditLog,
                requestContext: buildTargetScopedRequestContext(
                  request.requestContext,
                  target,
                ),
                action: fileStorageAuditAction.deleted,
                fileId: deletedFile.fileId,
                reason: `Delete managed file ${deletedFile.fileId}.`,
              });

              return buildManagedFileSummaryView(deletedFile);
            }),
          ),
        ),
    } satisfies FileStorageServiceApi;
  });

export const FileStorageServiceLive = Layer.effect(
  FileStorageService,
  makeFileStorageService(),
);

export type FileStorageTransportRuntime = {
  readonly service: FileStorageService["Type"];
  readonly identitySession: IdentitySessionModule["Type"];
};

const makeFileStorageTransportRuntime = (
  options: SubscriberJourneyRuntimeOptions,
) =>
  Effect.gen(function* () {
    const runtime = yield* makeSubscriberJourneyRuntime(options);
    const convexFileStorage = yield* makeConvexFileStorageAdapter({
      deploymentUrl: options.convexUrl,
      siteUrl: options.convexSiteUrl,
      adminKey: options.convexAdminKey,
      keycloakBaseUrl: options.keycloakBaseUrl,
      keycloakRealm: options.keycloakRealm,
      keycloakClientId: options.keycloakClientId,
      keycloakClientSecret: options.keycloakClientSecret,
      keycloakConvexServiceActorUsername:
        options.keycloakConvexServiceActorUsername,
      keycloakConvexServiceActorPassword:
        options.keycloakConvexServiceActorPassword,
    });
    const fileStorageModule = yield* makeFileStorageModule().pipe(
      Effect.provideService(ConvexFileStorageAdapter, convexFileStorage),
      Effect.provideService(
        RetentionLegalHoldModule,
        runtime.retentionLegalHold,
      ),
    );
    const service = yield* makeFileStorageService().pipe(
      Effect.provideService(AuditLogModule, runtime.auditLog),
      Effect.provideService(FileStorageModule, fileStorageModule),
      Effect.provideService(RuntimeConfigModule, runtime.runtimeConfig),
      Effect.provideService(OryKetoAdapter, runtime.oryKeto),
    );

    return {
      service,
      identitySession: runtime.identitySession,
      close: runtime.close,
    } as const;
  });

const runFileStorageTransportWithResolvedOptions = <A, E>(
  options: SubscriberJourneyRuntimeOptions,
  use: (runtime: FileStorageTransportRuntime) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const runtime = yield* makeFileStorageTransportRuntime(options);

    return yield* use({
      service: runtime.service,
      identitySession: runtime.identitySession,
    }).pipe(Effect.ensuring(Effect.ignore(runtime.close)));
  });

export const runFileStorageTransportFromEnvironment = <A, E>(
  environment: unknown,
  use: (runtime: FileStorageTransportRuntime) => Effect.Effect<A, E>,
) =>
  resolveSubscriberJourneyRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((resolvedOptions) =>
      runFileStorageTransportWithResolvedOptions(resolvedOptions, use),
    ),
  );

export const runFileStorageFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: FileStorageService["Type"]) => Effect.Effect<A, E>,
) =>
  runFileStorageTransportFromEnvironment(environment, ({ service }) =>
    use(service),
  );
