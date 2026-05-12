import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  type CreateManagedFileRecordInput,
  type DeleteManagedFileInput,
  DeleteManagedFileInputSchema,
  type ListManagedFilesRequest,
  ListManagedFilesRequestSchema,
  type ManagedFileAdminView,
  ManagedFileAdminViewSchema,
  type ManagedFileDownloadDescriptor,
  ManagedFileDownloadDescriptorSchema,
  type ManagedFileLookupInput,
  ManagedFileLookupInputSchema,
  type ManagedFileRecord,
  ManagedFileRecordSchema,
  type ManagedFileSummaryView,
  ManagedFileSummaryViewListSchema,
  ManagedFileSummaryViewSchema,
  type ManagedFileUploadReservationRequest,
  ManagedFileUploadReservationRequestSchema,
  type ManagedFileUploadUrl,
  ManagedFileUploadUrlSchema,
  type RegisterManagedFileInput,
  RegisterManagedFileInputSchema,
  platformModuleId,
  retentionDataType,
  type RetentionGuardDecision,
} from "@comvestec/contracts";
import {
  ConvexFileStorageAdapter,
  type ConvexFileStorageAdapterError,
} from "@comvestec/platform";
import {
  RetentionLegalHoldModule,
  type RetentionLegalHoldModuleError,
} from "../governance";

export type FileStorageFileNotFoundError = {
  readonly _tag: "FileStorageFileNotFoundError";
  readonly fileId: string;
};

export type FileStorageDeletionBlockedError = {
  readonly _tag: "FileStorageDeletionBlockedError";
  readonly fileId: string;
};

export type FileStorageModuleError =
  | ParseResult.ParseError
  | ConvexFileStorageAdapterError
  | RetentionLegalHoldModuleError
  | FileStorageFileNotFoundError
  | FileStorageDeletionBlockedError;

export type FileStorageModuleService = {
  readonly requestManagedFileUploadUrl: (
    input: ManagedFileUploadReservationRequest,
  ) => Effect.Effect<ManagedFileUploadUrl, FileStorageModuleError>;
  readonly registerManagedFile: (
    input: RegisterManagedFileInput,
  ) => Effect.Effect<ManagedFileAdminView, FileStorageModuleError>;
  readonly getManagedFileRecord: (
    input: ManagedFileLookupInput,
  ) => Effect.Effect<ManagedFileRecord, FileStorageModuleError>;
  readonly listManagedFiles: (
    input: ListManagedFilesRequest,
  ) => Effect.Effect<readonly ManagedFileSummaryView[], FileStorageModuleError>;
  readonly resolveManagedFileDownload: (
    input: ManagedFileLookupInput,
  ) => Effect.Effect<ManagedFileDownloadDescriptor, FileStorageModuleError>;
  readonly deleteManagedFile: (
    input: DeleteManagedFileInput,
  ) => Effect.Effect<ManagedFileAdminView, FileStorageModuleError>;
};

export class FileStorageModule extends Context.Tag("FileStorageModule")<
  FileStorageModule,
  FileStorageModuleService
>() {}

const buildManagedFileId = (record: {
  readonly scope: RegisterManagedFileInput["scope"];
  readonly scopeId: string;
}) =>
  [
    platformModuleId.fileStorage,
    record.scope,
    record.scopeId,
    crypto.randomUUID(),
  ].join(":");

const loadRetentionDecision = (
  retention: typeof RetentionLegalHoldModule.Service,
  record: ManagedFileRecord,
) =>
  retention.checkRetentionGuard({
    scope: record.scope,
    scopeId: record.scopeId,
    dataType: retentionDataType.fileObject,
    targetId: record.fileId,
  });

const buildManagedFileAdminView = (
  record: ManagedFileRecord,
  decision: RetentionGuardDecision,
) =>
  Schema.decodeUnknown(ManagedFileAdminViewSchema)({
    fileId: record.fileId,
    fileName: record.fileName,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    scope: record.scope,
    scopeId: record.scopeId,
    uploadedBy: record.uploadedBy,
    ...(record.deletedAt !== undefined ? { deletedAt: record.deletedAt } : {}),
    legalHoldActive: decision.legalHoldActive,
  });

const buildManagedFileSummaryView = (record: ManagedFileRecord) =>
  Schema.decodeUnknown(ManagedFileSummaryViewSchema)({
    fileId: record.fileId,
    fileName: record.fileName,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    ...(record.deletedAt !== undefined ? { deletedAt: record.deletedAt } : {}),
  });

const loadManagedFileRecord = (
  storage: typeof ConvexFileStorageAdapter.Service,
  fileId: string,
) =>
  storage.getManagedFileRecord({ fileId }).pipe(
    Effect.flatMap((record) =>
      record === undefined || record.deletedAt !== undefined
        ? Effect.fail({
            _tag: "FileStorageFileNotFoundError",
            fileId,
          } satisfies FileStorageFileNotFoundError)
        : Effect.succeed(record),
    ),
  );

export const makeFileStorageModule = () =>
  Effect.gen(function* () {
    const storage = yield* ConvexFileStorageAdapter;
    const retention = yield* RetentionLegalHoldModule;

    return {
      requestManagedFileUploadUrl: (
        input: ManagedFileUploadReservationRequest,
      ) =>
        Schema.decodeUnknown(ManagedFileUploadReservationRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            storage.generateManagedFileUploadUrl(request),
          ),
          Effect.flatMap((payload) =>
            Schema.decodeUnknown(ManagedFileUploadUrlSchema)(payload),
          ),
        ),
      registerManagedFile: (input: RegisterManagedFileInput) =>
        Schema.decodeUnknown(RegisterManagedFileInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            storage.createManagedFileRecord({
              fileId: buildManagedFileId({
                scope: request.scope,
                scopeId: request.scopeId,
              }),
              scope: request.scope,
              scopeId: request.scopeId,
              storageId: request.storageId,
              fileName: request.fileName,
              contentType: request.contentType,
              sizeBytes: request.sizeBytes,
              classification: request.classification,
              usage: request.usage,
              uploadToken: request.uploadToken,
              uploadedBy: request.uploadedBy,
              uploadedAt: new Date().toISOString(),
            } satisfies CreateManagedFileRecordInput),
          ),
          Effect.flatMap((record) =>
            loadRetentionDecision(retention, record).pipe(
              Effect.flatMap((decision) =>
                buildManagedFileAdminView(record, decision),
              ),
            ),
          ),
        ),
      getManagedFileRecord: (input: ManagedFileLookupInput) =>
        Schema.decodeUnknown(ManagedFileLookupInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            loadManagedFileRecord(storage, request.fileId),
          ),
          Effect.flatMap((record) =>
            Schema.decodeUnknown(ManagedFileRecordSchema)(record),
          ),
        ),
      listManagedFiles: (input: ListManagedFilesRequest) =>
        Schema.decodeUnknown(ListManagedFilesRequestSchema)(input).pipe(
          Effect.flatMap((request) => storage.listManagedFileRecords(request)),
          Effect.flatMap((records) =>
            Effect.forEach(records, (record) =>
              buildManagedFileSummaryView(record),
            ),
          ),
          Effect.flatMap((views) =>
            Schema.decodeUnknown(ManagedFileSummaryViewListSchema)(views),
          ),
        ),
      resolveManagedFileDownload: (input: ManagedFileLookupInput) =>
        Schema.decodeUnknown(ManagedFileLookupInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            loadManagedFileRecord(storage, request.fileId),
          ),
          Effect.flatMap((record) =>
            Effect.gen(function* () {
              const downloadUrl = yield* storage.resolveStoredFileUrl({
                storageId: record.storageId,
              });

              if (downloadUrl === undefined) {
                return yield* Effect.fail({
                  _tag: "FileStorageFileNotFoundError",
                  fileId: record.fileId,
                } satisfies FileStorageFileNotFoundError);
              }

              const file = yield* buildManagedFileSummaryView(record);

              return yield* Schema.decodeUnknown(
                ManagedFileDownloadDescriptorSchema,
              )({
                file,
                downloadUrl,
              });
            }),
          ),
        ),
      deleteManagedFile: (input: DeleteManagedFileInput) =>
        Schema.decodeUnknown(DeleteManagedFileInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            loadManagedFileRecord(storage, request.fileId).pipe(
              Effect.flatMap((record) =>
                Effect.gen(function* () {
                  const decision = yield* loadRetentionDecision(
                    retention,
                    record,
                  );

                  if (decision.purgeBlocked) {
                    return yield* Effect.fail({
                      _tag: "FileStorageDeletionBlockedError",
                      fileId: request.fileId,
                    } satisfies FileStorageDeletionBlockedError);
                  }

                  const storedFileUrl = yield* storage.resolveStoredFileUrl({
                    storageId: record.storageId,
                  });

                  if (storedFileUrl !== undefined) {
                    yield* storage.deleteStoredFileBlob({
                      storageId: record.storageId,
                    });
                  }

                  const deletedRecord = yield* storage.markManagedFileDeleted({
                    fileId: request.fileId,
                    deletedBy: request.deletedBy,
                    deletedAt: new Date().toISOString(),
                  });

                  if (deletedRecord === undefined) {
                    return yield* Effect.fail({
                      _tag: "FileStorageFileNotFoundError",
                      fileId: request.fileId,
                    } satisfies FileStorageFileNotFoundError);
                  }

                  return yield* buildManagedFileAdminView(
                    deletedRecord,
                    decision,
                  );
                }),
              ),
            ),
          ),
        ),
    } satisfies FileStorageModuleService;
  });

export const FileStorageModuleLive = Layer.effect(
  FileStorageModule,
  makeFileStorageModule(),
);
