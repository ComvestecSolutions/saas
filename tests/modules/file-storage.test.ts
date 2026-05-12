import { Effect } from "effect";
import {
  dataClassification,
  managedFileUsage,
  platformModuleId,
  platformScope,
  retentionDataType,
  type ManagedFileRecord,
} from "@comvestec/contracts";
import {
  type FileStorageModuleService,
  makeFileStorageModule,
  RetentionLegalHoldModule,
  type RetentionLegalHoldModuleService,
} from "@comvestec/modules";
import {
  ConvexFileStorageAdapter,
  platformAdapterServiceName,
  type ConvexFileStorageAdapterService,
} from "@comvestec/platform";

const createConvexFileStorageAdapterDouble = (options?: {
  readonly failDeleteStoredFileBlob?: boolean;
  readonly failMarkManagedFileDeletedOnce?: boolean;
  readonly actualBlobSizesByStorageId?: Readonly<Record<string, number>>;
  readonly actualContentTypesByStorageId?: Readonly<Record<string, string>>;
  readonly actualBlobSha256ByStorageId?: Readonly<Record<string, string>>;
}) => {
  const records = new Map<string, ManagedFileRecord>();
  const uploadReservations = new Map<
    string,
    {
      readonly scope: string;
      readonly scopeId: string;
      readonly uploadedBy: string;
      readonly maxSizeBytes: number;
      readonly expectedSha256: string;
      consumed: boolean;
    }
  >();
  const deletedStorageIds: string[] = [];
  const operationLog: string[] = [];
  let uploadTokenCounter = 0;
  let shouldFailMarkManagedFileDeleted =
    options?.failMarkManagedFileDeletedOnce === true;

  const service: ConvexFileStorageAdapterService = {
    serviceName: platformAdapterServiceName.convex,
    deploymentUrl: "http://127.0.0.1:3210",
    siteUrl: "http://127.0.0.1:3211",
    healthcheck: Effect.succeed({
      healthy: true,
      service: platformAdapterServiceName.convex,
    } as const),
    generateManagedFileUploadUrl: (input) => {
      const uploadToken = `upload_token_${++uploadTokenCounter}`;

      uploadReservations.set(uploadToken, {
        scope: input.scope,
        scopeId: input.scopeId,
        uploadedBy: input.uploadedBy,
        maxSizeBytes: input.maxSizeBytes,
        expectedSha256: input.expectedSha256,
        consumed: false,
      });

      return Effect.succeed({
        uploadUrl: "https://convex.example.com/upload",
        uploadToken,
      });
    },
    createManagedFileRecord: (input) => {
      const uploadReservation = uploadReservations.get(input.uploadToken);

      if (
        uploadReservation === undefined ||
        uploadReservation.consumed ||
        uploadReservation.scope !== input.scope ||
        uploadReservation.scopeId !== input.scopeId ||
        uploadReservation.uploadedBy !== input.uploadedBy
      ) {
        return Effect.fail({
          _tag: "ConvexFileStorageAdapterRequestError",
          operation: "createManagedFileRecord",
          cause: new Error("Managed file upload token is invalid."),
        } as const);
      }

      const actualSizeBytes =
        options?.actualBlobSizesByStorageId?.[input.storageId] ??
        input.sizeBytes;

      if (actualSizeBytes > uploadReservation.maxSizeBytes) {
        return Effect.fail({
          _tag: "ConvexFileStorageAdapterRequestError",
          operation: "createManagedFileRecord",
          cause: new Error(
            "Managed file upload exceeds the reserved size limit.",
          ),
        } as const);
      }

      if (!Number.isInteger(actualSizeBytes) || actualSizeBytes <= 0) {
        return Effect.fail({
          _tag: "ConvexFileStorageAdapterRequestError",
          operation: "createManagedFileRecord",
          cause: new Error(
            "Managed file upload blob size must be a positive integer.",
          ),
        } as const);
      }

      const actualSha256 =
        options?.actualBlobSha256ByStorageId?.[input.storageId] ??
        uploadReservation.expectedSha256;

      if (actualSha256 !== uploadReservation.expectedSha256) {
        return Effect.fail({
          _tag: "ConvexFileStorageAdapterRequestError",
          operation: "createManagedFileRecord",
          cause: new Error(
            "Managed file upload blob digest does not match the reservation.",
          ),
        } as const);
      }

      if (
        [...records.values()].some(
          (record) => record.storageId === input.storageId,
        )
      ) {
        return Effect.fail({
          _tag: "ConvexFileStorageAdapterRequestError",
          operation: "createManagedFileRecord",
          cause: new Error("Managed file upload blob is already bound."),
        } as const);
      }

      uploadReservation.consumed = true;

      const { uploadToken: _uploadToken, ...record } = {
        ...input,
        sizeBytes: actualSizeBytes,
        contentType:
          options?.actualContentTypesByStorageId?.[input.storageId] ??
          input.contentType,
      };

      records.set(record.fileId, record);

      return Effect.succeed(record);
    },
    getManagedFileRecord: ({ fileId }) => Effect.succeed(records.get(fileId)),
    listManagedFileRecords: (input) =>
      Effect.succeed(
        [...records.values()].filter(
          (record) =>
            record.scope === input.scope &&
            record.scopeId === input.scopeId &&
            (input.includeDeleted === true || record.deletedAt === undefined),
        ),
      ),
    resolveStoredFileUrl: ({ storageId }) =>
      Effect.succeed(
        deletedStorageIds.includes(storageId)
          ? undefined
          : `https://files.example.com/${storageId}`,
      ),
    markManagedFileDeleted: ({ fileId, deletedBy, deletedAt }) => {
      operationLog.push(`mark:${fileId}`);

      if (shouldFailMarkManagedFileDeleted) {
        shouldFailMarkManagedFileDeleted = false;

        return Effect.fail({
          _tag: "ConvexFileStorageAdapterRequestError",
          operation: "markManagedFileDeleted",
          cause: new Error("Managed file metadata delete failed."),
        } as const);
      }

      const existingRecord = records.get(fileId);

      if (existingRecord === undefined) {
        return Effect.succeed(undefined);
      }

      const deletedRecord = {
        ...existingRecord,
        deletedBy,
        deletedAt,
      } satisfies ManagedFileRecord;

      records.set(fileId, deletedRecord);

      return Effect.succeed(deletedRecord);
    },
    deleteStoredFileBlob: ({ storageId }) => {
      operationLog.push(`delete:${storageId}`);

      return options?.failDeleteStoredFileBlob === true
        ? Effect.fail({
            _tag: "ConvexFileStorageAdapterRequestError",
            operation: "deleteStoredFileBlob",
            cause: new Error("Blob delete failed."),
          } as const)
        : Effect.sync(() => {
            deletedStorageIds.push(storageId);
          });
    },
  };

  return {
    deletedStorageIds,
    operationLog,
    records,
    service,
  };
};

const createRetentionLegalHoldModuleDouble = (options?: {
  readonly blockedFileIds?: Set<string>;
}): RetentionLegalHoldModuleService => ({
  upsertRetentionPolicy: () =>
    Effect.die(new Error("Unexpected policy upsert.")),
  listRetentionPolicies: () => Effect.die(new Error("Unexpected policy list.")),
  placeRetentionLegalHold: () =>
    Effect.die(new Error("Unexpected legal hold placement.")),
  getRetentionLegalHoldRecord: () =>
    Effect.die(new Error("Unexpected legal hold record lookup.")),
  releaseRetentionLegalHold: () =>
    Effect.die(new Error("Unexpected legal hold release.")),
  listRetentionLegalHolds: () =>
    Effect.die(new Error("Unexpected legal hold list.")),
  checkRetentionGuard: (input) =>
    Effect.succeed({
      dataType: input.dataType,
      retentionDays: 365,
      policyId: `retention-policy:${platformScope.organization}:org_1:${retentionDataType.fileObject}`,
      legalHoldActive: options?.blockedFileIds?.has(input.targetId) ?? false,
      purgeBlocked: options?.blockedFileIds?.has(input.targetId) ?? false,
    }),
});

const requestManagedFileUpload = (
  module: FileStorageModuleService,
  input: {
    readonly uploadedBy: string;
    readonly scope?: typeof platformScope.organization;
    readonly scopeId?: string;
    readonly maxSizeBytes?: number;
    readonly expectedSha256?: string;
  },
) =>
  Effect.runPromise(
    module.requestManagedFileUploadUrl({
      scope: input.scope ?? platformScope.organization,
      scopeId: input.scopeId ?? "org_1",
      uploadedBy: input.uploadedBy,
      maxSizeBytes: input.maxSizeBytes ?? 5 * 1024 * 1024,
      expectedSha256:
        input.expectedSha256 ??
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    }),
  );

const missingManagedFileId = `${platformModuleId.fileStorage}:${platformScope.organization}:org_1:missing`;

describe("file storage module", () => {
  it("registers managed files, lists them, and resolves download descriptors", async () => {
    const storage = createConvexFileStorageAdapterDouble();
    const module = await Effect.runPromise(
      makeFileStorageModule().pipe(
        Effect.provideService(ConvexFileStorageAdapter, storage.service),
        Effect.provideService(
          RetentionLegalHoldModule,
          createRetentionLegalHoldModuleDouble(),
        ),
      ),
    );

    const upload = await requestManagedFileUpload(module, {
      uploadedBy: "usr_platform_1",
    });

    await expect(Promise.resolve(upload)).resolves.toEqual({
      uploadUrl: "https://convex.example.com/upload",
      uploadToken: upload.uploadToken,
    });

    const createdFile = await Effect.runPromise(
      module.registerManagedFile({
        scope: platformScope.organization,
        scopeId: "org_1",
        uploadToken: upload.uploadToken,
        storageId: "storage_logo_1",
        fileName: "logo.svg",
        contentType: "image/svg+xml",
        sizeBytes: 2048,
        classification: dataClassification.public,
        usage: managedFileUsage.brandingAsset,
        uploadedBy: "usr_platform_1",
      }),
    );

    expect(createdFile).toMatchObject({
      scope: platformScope.organization,
      scopeId: "org_1",
      fileName: "logo.svg",
      contentType: "image/svg+xml",
      sizeBytes: 2048,
      uploadedBy: "usr_platform_1",
      legalHoldActive: false,
    });

    await expect(
      Effect.runPromise(
        module.listManagedFiles({
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        fileId: createdFile.fileId,
        fileName: "logo.svg",
      }),
    ]);

    await expect(
      Effect.runPromise(
        module.resolveManagedFileDownload({
          fileId: createdFile.fileId,
        }),
      ),
    ).resolves.toMatchObject({
      file: expect.objectContaining({
        fileId: createdFile.fileId,
      }),
      downloadUrl: "https://files.example.com/storage_logo_1",
    });
  });

  it("blocks deletion when a legal hold is active", async () => {
    const blockedFileIds = new Set<string>();
    const storage = createConvexFileStorageAdapterDouble();
    const module = await Effect.runPromise(
      makeFileStorageModule().pipe(
        Effect.provideService(ConvexFileStorageAdapter, storage.service),
        Effect.provideService(
          RetentionLegalHoldModule,
          createRetentionLegalHoldModuleDouble({ blockedFileIds }),
        ),
      ),
    );

    const upload = await requestManagedFileUpload(module, {
      uploadedBy: "usr_support_1",
    });

    const createdFile = await Effect.runPromise(
      module.registerManagedFile({
        scope: platformScope.organization,
        scopeId: "org_1",
        uploadToken: upload.uploadToken,
        storageId: "storage_case_file_1",
        fileName: "evidence.pdf",
        contentType: "application/pdf",
        sizeBytes: 8192,
        classification: dataClassification.regulatedSensitive,
        usage: managedFileUsage.standard,
        uploadedBy: "usr_support_1",
      }),
    );

    blockedFileIds.add(createdFile.fileId);

    const result = await Effect.runPromise(
      Effect.either(
        module.deleteManagedFile({
          fileId: createdFile.fileId,
          deletedBy: "usr_support_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "FileStorageDeletionBlockedError",
        fileId: createdFile.fileId,
      },
    });
    expect(storage.deletedStorageIds).toEqual([]);
    expect(storage.records.get(createdFile.fileId)?.deletedAt).toBeUndefined();
  });

  it("deletes managed files when no legal hold is active", async () => {
    const storage = createConvexFileStorageAdapterDouble();
    const module = await Effect.runPromise(
      makeFileStorageModule().pipe(
        Effect.provideService(ConvexFileStorageAdapter, storage.service),
        Effect.provideService(
          RetentionLegalHoldModule,
          createRetentionLegalHoldModuleDouble(),
        ),
      ),
    );

    const upload = await requestManagedFileUpload(module, {
      uploadedBy: "usr_member_1",
    });

    const createdFile = await Effect.runPromise(
      module.registerManagedFile({
        scope: platformScope.organization,
        scopeId: "org_1",
        uploadToken: upload.uploadToken,
        storageId: "storage_doc_1",
        fileName: "invoice.pdf",
        contentType: "application/pdf",
        sizeBytes: 4096,
        classification: dataClassification.tenantConfidential,
        usage: managedFileUsage.standard,
        uploadedBy: "usr_member_1",
      }),
    );

    const deletedFile = await Effect.runPromise(
      module.deleteManagedFile({
        fileId: createdFile.fileId,
        deletedBy: "usr_member_1",
      }),
    );

    expect(deletedFile).toMatchObject({
      fileId: createdFile.fileId,
      legalHoldActive: false,
    });
    expect(storage.deletedStorageIds).toEqual(["storage_doc_1"]);
    expect(storage.records.get(createdFile.fileId)).toMatchObject({
      deletedBy: "usr_member_1",
    });
    await expect(
      Effect.runPromise(
        module.listManagedFiles({
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    ).resolves.toEqual([]);
    await expect(
      Effect.runPromise(
        module.listManagedFiles({
          scope: platformScope.organization,
          scopeId: "org_1",
          includeDeleted: true,
        }),
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        fileId: createdFile.fileId,
        fileName: "invoice.pdf",
        deletedAt: expect.any(String),
      }),
    ]);
  });

  it("returns file not found for missing records", async () => {
    const storage = createConvexFileStorageAdapterDouble();
    const module = await Effect.runPromise(
      makeFileStorageModule().pipe(
        Effect.provideService(ConvexFileStorageAdapter, storage.service),
        Effect.provideService(
          RetentionLegalHoldModule,
          createRetentionLegalHoldModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        module.resolveManagedFileDownload({
          fileId: missingManagedFileId,
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "FileStorageFileNotFoundError",
        fileId: missingManagedFileId,
      },
    });
  });

  it("keeps metadata active when blob deletion fails", async () => {
    const storage = createConvexFileStorageAdapterDouble({
      failDeleteStoredFileBlob: true,
    });

    const module = await Effect.runPromise(
      makeFileStorageModule().pipe(
        Effect.provideService(ConvexFileStorageAdapter, storage.service),
        Effect.provideService(
          RetentionLegalHoldModule,
          createRetentionLegalHoldModuleDouble(),
        ),
      ),
    );

    const upload = await requestManagedFileUpload(module, {
      uploadedBy: "usr_member_1",
    });

    const createdFile = await Effect.runPromise(
      module.registerManagedFile({
        scope: platformScope.organization,
        scopeId: "org_1",
        uploadToken: upload.uploadToken,
        storageId: "storage_blob_failure_1",
        fileName: "archive.zip",
        contentType: "application/zip",
        sizeBytes: 4096,
        classification: dataClassification.internal,
        usage: managedFileUsage.standard,
        uploadedBy: "usr_member_1",
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        module.deleteManagedFile({
          fileId: createdFile.fileId,
          deletedBy: "usr_member_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "ConvexFileStorageAdapterRequestError",
        operation: "deleteStoredFileBlob",
      },
    });
    expect(storage.operationLog).toEqual(["delete:storage_blob_failure_1"]);
    expect(storage.records.get(createdFile.fileId)?.deletedBy).toBeUndefined();
  });

  it("allows deletion retry after metadata failure without repeating blob deletion", async () => {
    const storage = createConvexFileStorageAdapterDouble({
      failMarkManagedFileDeletedOnce: true,
    });

    const module = await Effect.runPromise(
      makeFileStorageModule().pipe(
        Effect.provideService(ConvexFileStorageAdapter, storage.service),
        Effect.provideService(
          RetentionLegalHoldModule,
          createRetentionLegalHoldModuleDouble(),
        ),
      ),
    );

    const upload = await requestManagedFileUpload(module, {
      uploadedBy: "usr_member_1",
    });

    const createdFile = await Effect.runPromise(
      module.registerManagedFile({
        scope: platformScope.organization,
        scopeId: "org_1",
        uploadToken: upload.uploadToken,
        storageId: "storage_retryable_delete_1",
        fileName: "archive.zip",
        contentType: "application/zip",
        sizeBytes: 4096,
        classification: dataClassification.internal,
        usage: managedFileUsage.standard,
        uploadedBy: "usr_member_1",
      }),
    );

    const firstAttempt = await Effect.runPromise(
      Effect.either(
        module.deleteManagedFile({
          fileId: createdFile.fileId,
          deletedBy: "usr_member_1",
        }),
      ),
    );

    expect(firstAttempt).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "ConvexFileStorageAdapterRequestError",
        operation: "markManagedFileDeleted",
      },
    });
    expect(storage.records.get(createdFile.fileId)?.deletedBy).toBeUndefined();

    const secondAttempt = await Effect.runPromise(
      module.deleteManagedFile({
        fileId: createdFile.fileId,
        deletedBy: "usr_member_1",
      }),
    );

    expect(secondAttempt).toMatchObject({
      fileId: createdFile.fileId,
      legalHoldActive: false,
    });
    expect(storage.deletedStorageIds).toEqual(["storage_retryable_delete_1"]);
    expect(storage.operationLog).toEqual([
      "delete:storage_retryable_delete_1",
      `mark:${createdFile.fileId}`,
      `mark:${createdFile.fileId}`,
    ]);
    expect(storage.records.get(createdFile.fileId)).toMatchObject({
      deletedBy: "usr_member_1",
      deletedAt: expect.any(String),
    });
  });

  it("rejects registration when the upload token was not issued for the blob", async () => {
    const storage = createConvexFileStorageAdapterDouble();
    const module = await Effect.runPromise(
      makeFileStorageModule().pipe(
        Effect.provideService(ConvexFileStorageAdapter, storage.service),
        Effect.provideService(
          RetentionLegalHoldModule,
          createRetentionLegalHoldModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        module.registerManagedFile({
          scope: platformScope.organization,
          scopeId: "org_1",
          uploadToken: "upload_token_missing",
          storageId: "storage_logo_rogue_1",
          fileName: "logo.svg",
          contentType: "image/svg+xml",
          sizeBytes: 2048,
          classification: dataClassification.public,
          usage: managedFileUsage.brandingAsset,
          uploadedBy: "usr_platform_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "ConvexFileStorageAdapterRequestError",
        operation: "createManagedFileRecord",
      },
    });
    expect(storage.records.size).toBe(0);
  });

  it("rejects registration when the authoritative blob size exceeds the reserved limit", async () => {
    const storage = createConvexFileStorageAdapterDouble({
      actualBlobSizesByStorageId: {
        storage_oversized_1: 3 * 1024 * 1024,
      },
    });
    const module = await Effect.runPromise(
      makeFileStorageModule().pipe(
        Effect.provideService(ConvexFileStorageAdapter, storage.service),
        Effect.provideService(
          RetentionLegalHoldModule,
          createRetentionLegalHoldModuleDouble(),
        ),
      ),
    );

    const upload = await requestManagedFileUpload(module, {
      uploadedBy: "usr_platform_1",
      maxSizeBytes: 1024 * 1024,
    });

    const result = await Effect.runPromise(
      Effect.either(
        module.registerManagedFile({
          scope: platformScope.organization,
          scopeId: "org_1",
          uploadToken: upload.uploadToken,
          storageId: "storage_oversized_1",
          fileName: "oversized.pdf",
          contentType: "application/pdf",
          sizeBytes: 512 * 1024,
          classification: dataClassification.internal,
          usage: managedFileUsage.standard,
          uploadedBy: "usr_platform_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "ConvexFileStorageAdapterRequestError",
        operation: "createManagedFileRecord",
      },
    });
    expect(storage.records.size).toBe(0);
  });

  it("rejects registration when the authoritative blob size is not positive", async () => {
    const storage = createConvexFileStorageAdapterDouble({
      actualBlobSizesByStorageId: {
        storage_empty_1: 0,
      },
    });
    const module = await Effect.runPromise(
      makeFileStorageModule().pipe(
        Effect.provideService(ConvexFileStorageAdapter, storage.service),
        Effect.provideService(
          RetentionLegalHoldModule,
          createRetentionLegalHoldModuleDouble(),
        ),
      ),
    );

    const upload = await requestManagedFileUpload(module, {
      uploadedBy: "usr_platform_1",
      maxSizeBytes: 1024 * 1024,
    });

    const result = await Effect.runPromise(
      Effect.either(
        module.registerManagedFile({
          scope: platformScope.organization,
          scopeId: "org_1",
          uploadToken: upload.uploadToken,
          storageId: "storage_empty_1",
          fileName: "empty.txt",
          contentType: "text/plain",
          sizeBytes: 1,
          classification: dataClassification.internal,
          usage: managedFileUsage.standard,
          uploadedBy: "usr_platform_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "ConvexFileStorageAdapterRequestError",
        operation: "createManagedFileRecord",
      },
    });
    expect(storage.records.size).toBe(0);
  });

  it("rejects registration when the upload token and blob digest do not match", async () => {
    const storage = createConvexFileStorageAdapterDouble({
      actualBlobSha256ByStorageId: {
        storage_token_b_1:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    });
    const module = await Effect.runPromise(
      makeFileStorageModule().pipe(
        Effect.provideService(ConvexFileStorageAdapter, storage.service),
        Effect.provideService(
          RetentionLegalHoldModule,
          createRetentionLegalHoldModuleDouble(),
        ),
      ),
    );

    const uploadA = await requestManagedFileUpload(module, {
      uploadedBy: "usr_platform_1",
      expectedSha256:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    await requestManagedFileUpload(module, {
      uploadedBy: "usr_platform_1",
      expectedSha256:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });

    const result = await Effect.runPromise(
      Effect.either(
        module.registerManagedFile({
          scope: platformScope.organization,
          scopeId: "org_1",
          uploadToken: uploadA.uploadToken,
          storageId: "storage_token_b_1",
          fileName: "logo.svg",
          contentType: "image/svg+xml",
          sizeBytes: 2048,
          classification: dataClassification.public,
          usage: managedFileUsage.brandingAsset,
          uploadedBy: "usr_platform_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "ConvexFileStorageAdapterRequestError",
        operation: "createManagedFileRecord",
      },
    });
    expect(storage.records.size).toBe(0);
  });
});
