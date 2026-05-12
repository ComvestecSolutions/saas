import { Effect } from "effect";
import {
  actorType,
  authorizationNamespace,
  dataClassification,
  fileStorageAuditAction,
  managedFileUsage,
  permissionScope,
  platformModuleId,
  platformScope,
  type ManagedFileRecord,
  runtimeResolutionSource,
  type ManagedFileAdminView,
  type ManagedFileDownloadDescriptor,
  type ManagedFileSummaryView,
  type ManagedFileUploadUrl,
} from "@comvestec/contracts";
import {
  AuditLogModule,
  FileStorageModule,
  RuntimeConfigModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type FileStorageModuleService,
  type RuntimeConfigModuleService,
} from "@comvestec/modules";
import {
  makeFileStorageService,
  OryKetoAdapter,
  platformAdapterServiceName,
  type OryKetoAdapterService,
} from "@comvestec/platform";

const organizationRequestContext = {
  actorType: actorType.organizationMember,
  actorId: "usr_member_1",
  sessionId: "sess_member_1",
  correlationId: "corr_file_storage_1",
  tenant: {
    scope: platformScope.organization,
    scopeId: "org_1",
  },
};

const crossTenantSupportRequestContext = {
  actorType: actorType.supportOperator,
  actorId: "usr_support_1",
  sessionId: "sess_support_1",
  correlationId: "corr_file_storage_support_1",
  tenant: {
    scope: platformScope.organization,
    scopeId: "org_2",
  },
};

const managedFileId = `${platformModuleId.fileStorage}:${platformScope.organization}:org_1:file_1`;
const managedFileAuthorizationObject = [
  authorizationNamespace.file,
  platformScope.organization,
  "org_1",
].join(":");
const colonScopeId = "org:west";
const colonScopeManagedFileId = `${platformModuleId.fileStorage}:${platformScope.organization}:${colonScopeId}:file_3`;
const colonScopeManagedFileAuthorizationObject = [
  authorizationNamespace.file,
  platformScope.organization,
  colonScopeId,
].join(":");
const crossTenantManagedFileId = `${platformModuleId.fileStorage}:${platformScope.organization}:org_2:file_2`;
const crossTenantManagedFileAuthorizationObject = [
  authorizationNamespace.file,
  platformScope.organization,
  "org_2",
].join(":");
const expectedSha256 =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const colonScopeRequestContext = {
  ...organizationRequestContext,
  correlationId: "corr_file_storage_colon_1",
  tenant: {
    scope: platformScope.organization,
    scopeId: colonScopeId,
  },
};

const createFileStorageModuleDouble = (options?: {
  readonly listManagedFilesResult?: readonly ManagedFileSummaryView[];
}) => {
  const calls = {
    uploadUrl: 0,
    register: 0,
    getRecord: 0,
    list: 0,
    download: 0,
    delete: 0,
  };
  const uploadRequests: Array<
    Parameters<FileStorageModuleService["requestManagedFileUploadUrl"]>[0]
  > = [];
  let uploadTokenCounter = 0;

  const service: FileStorageModuleService = {
    requestManagedFileUploadUrl: (input) => {
      calls.uploadUrl += 1;
      uploadRequests.push(input);

      return Effect.succeed({
        uploadUrl: "https://convex.example.com/upload",
        uploadToken: `upload_token_${++uploadTokenCounter}`,
      } satisfies ManagedFileUploadUrl);
    },
    registerManagedFile: (input) => {
      calls.register += 1;

      return Effect.succeed({
        fileId: managedFileId,
        scope: input.scope,
        scopeId: input.scopeId,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        uploadedBy: input.uploadedBy,
        legalHoldActive: false,
      } satisfies ManagedFileAdminView);
    },
    getManagedFileRecord: () => {
      calls.getRecord += 1;

      return Effect.succeed({
        fileId: managedFileId,
        scope: platformScope.organization,
        scopeId: "org_1",
        storageId: "storage_logo_1",
        fileName: "logo.svg",
        contentType: "image/svg+xml",
        sizeBytes: 2048,
        classification: dataClassification.public,
        usage: managedFileUsage.brandingAsset,
        uploadedBy: "usr_member_1",
        uploadedAt: "2026-04-27T12:00:00.000Z",
      } satisfies ManagedFileRecord);
    },
    listManagedFiles: () => {
      calls.list += 1;

      return Effect.succeed(
        options?.listManagedFilesResult ?? [
          {
            fileId: managedFileId,
            fileName: "logo.svg",
            contentType: "image/svg+xml",
            sizeBytes: 2048,
          } satisfies ManagedFileSummaryView,
        ],
      );
    },
    resolveManagedFileDownload: () => {
      calls.download += 1;

      return Effect.succeed({
        file: {
          fileId: managedFileId,
          fileName: "logo.svg",
          contentType: "image/svg+xml",
          sizeBytes: 2048,
        },
        downloadUrl: "https://files.example.com/storage_logo_1",
      } satisfies ManagedFileDownloadDescriptor);
    },
    deleteManagedFile: (input) => {
      calls.delete += 1;

      return Effect.succeed({
        fileId: input.fileId,
        scope: platformScope.organization,
        scopeId: "org_1",
        fileName: "logo.svg",
        contentType: "image/svg+xml",
        sizeBytes: 2048,
        uploadedBy: "usr_member_1",
        deletedAt: "2026-04-27T12:00:00.000Z",
        legalHoldActive: false,
      } satisfies ManagedFileAdminView);
    },
  };

  return { calls, service, uploadRequests };
};

const createRuntimeConfigModuleDouble = (input?: {
  readonly enabled?: boolean;
  readonly maxUploadSizeMb?: number;
  readonly maxUploadSizeMbByScopeId?: Readonly<Record<string, number>>;
}): RuntimeConfigModuleService => ({
  resolveConfigValue: ({ moduleId, key, requestContext }) =>
    Effect.succeed({
      moduleId,
      key,
      effectiveValue:
        input?.maxUploadSizeMbByScopeId?.[requestContext.tenant.scopeId] ??
        input?.maxUploadSizeMb ??
        5,
      source: runtimeResolutionSource.codeDefault,
      entitled: true,
    }),
  resolveStoredConfigValue: () =>
    Effect.die(new Error("Unexpected stored config resolution.")),
  resolveFeatureFlag: ({ moduleId, flag }) =>
    Effect.succeed({
      moduleId,
      key: flag.key,
      effectiveValue: input?.enabled ?? true,
      source: runtimeResolutionSource.codeDefault,
      entitled: true,
    }),
  resolveStoredFeatureFlag: () =>
    Effect.die(new Error("Unexpected stored feature flag resolution.")),
  buildChangeProposals: () =>
    Effect.die(new Error("Unexpected change proposal build.")),
  listOverridesByModule: () => Effect.succeed([]),
  listChangeProposalsByModule: () =>
    Effect.die(new Error("Unexpected change proposal list.")),
  listOverrideProposalsByModule: () =>
    Effect.die(new Error("Unexpected override proposal list.")),
  upsertOverride: () => Effect.die(new Error("Unexpected override upsert.")),
  submitOverrideProposal: () =>
    Effect.die(new Error("Unexpected override proposal submit.")),
  reviewChangeProposal: () =>
    Effect.die(new Error("Unexpected proposal review.")),
  persistChangeProposals: () =>
    Effect.die(new Error("Unexpected change proposal persistence.")),
});

const createAuditLogModuleDouble = (options?: {
  readonly appendError?: AuditLogModuleError;
}) => {
  const calls: Array<Parameters<AuditLogModuleService["append"]>[0]> = [];

  const service: AuditLogModuleService = {
    append: (auditInput) => {
      calls.push(auditInput);

      if (options?.appendError !== undefined) {
        return Effect.fail(options.appendError);
      }

      return Effect.succeed({
        eventId: `${auditInput.moduleId}:${auditInput.action}:${auditInput.target}`,
        timestamp: new Date().toISOString(),
        actorId: auditInput.requestContext.actorId ?? "anonymous",
        tenantScope: auditInput.requestContext.tenant.scope,
        tenantScopeId: auditInput.requestContext.tenant.scopeId,
        moduleId: auditInput.moduleId,
        action: auditInput.action,
        target: auditInput.target,
        correlationId: auditInput.requestContext.correlationId,
        ...(auditInput.reason !== undefined
          ? { reason: auditInput.reason }
          : {}),
      });
    },
    queryByModule: () => Effect.succeed([]),
    queryByTarget: () => Effect.succeed([]),
    queryByActor: () => Effect.succeed([]),
    queryByTenant: () => Effect.succeed([]),
    requirements: Effect.succeed([]),
  };

  return { calls, service };
};

const createOryKetoAdapterDouble = (input?: {
  readonly allowedObjects?: readonly string[];
  readonly allowedSubjects?: readonly string[];
}): OryKetoAdapterService => ({
  serviceName: platformAdapterServiceName.oryKeto,
  readUrl: "http://localhost:4466",
  writeUrl: "http://localhost:4467",
  healthcheck: Effect.succeed({
    healthy: true,
    service: platformAdapterServiceName.oryKeto,
  } as const),
  writeTuple: () => Effect.die(new Error("Unexpected tuple write.")),
  deleteTuple: () => Effect.die(new Error("Unexpected tuple delete.")),
  listTuples: ({ object, relation, namespace, subject }) =>
    Effect.succeed(
      input?.allowedObjects?.includes(object) &&
        (input?.allowedSubjects === undefined ||
          (subject !== undefined && input.allowedSubjects.includes(subject)))
        ? [
            {
              namespace,
              object,
              relation,
              subject: subject ?? "actor:usr_member_1",
            },
          ]
        : [],
    ),
  check: ({ namespace, object, relation, subject }) =>
    Effect.succeed({
      namespace,
      object,
      relation,
      subject,
      allowed:
        (input?.allowedObjects?.includes(object) ?? false) &&
        (input?.allowedSubjects === undefined ||
          input.allowedSubjects.includes(subject)),
    }),
});

describe("file storage service", () => {
  it("denies file listing when file:read access is missing", async () => {
    const auditLog = createAuditLogModuleDouble();
    const fileStorage = createFileStorageModuleDouble();
    const service = await Effect.runPromise(
      makeFileStorageService().pipe(
        Effect.provideService(AuditLogModule, auditLog.service),
        Effect.provideService(FileStorageModule, fileStorage.service),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(OryKetoAdapter, createOryKetoAdapterDouble()),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.listManagedFiles({
          requestContext: organizationRequestContext,
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "FileStorageAccessDeniedError",
        permission: permissionScope.fileRead,
        scope: platformScope.organization,
        scopeId: "org_1",
      },
    });
    expect(fileStorage.calls.list).toBe(0);
    expect(auditLog.calls).toHaveLength(0);
  });

  it("rejects oversized uploads before requesting an upload URL", async () => {
    const auditLog = createAuditLogModuleDouble();
    const fileStorage = createFileStorageModuleDouble();
    const service = await Effect.runPromise(
      makeFileStorageService().pipe(
        Effect.provideService(AuditLogModule, auditLog.service),
        Effect.provideService(FileStorageModule, fileStorage.service),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble({ maxUploadSizeMb: 1 }),
        ),
        Effect.provideService(
          OryKetoAdapter,
          createOryKetoAdapterDouble({
            allowedObjects: [managedFileAuthorizationObject],
          }),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.requestManagedFileUploadUrl({
          requestContext: organizationRequestContext,
          scope: platformScope.organization,
          scopeId: "org_1",
          sizeBytes: 2 * 1024 * 1024,
          sha256: expectedSha256,
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "FileStorageUploadTooLargeError",
        maxUploadSizeMb: 1,
      },
    });
    expect(fileStorage.calls.uploadUrl).toBe(0);
    expect(auditLog.calls).toHaveLength(0);
  });

  it("binds upload reservations to the caller-declared blob size", async () => {
    const auditLog = createAuditLogModuleDouble();
    const fileStorage = createFileStorageModuleDouble();
    const service = await Effect.runPromise(
      makeFileStorageService().pipe(
        Effect.provideService(AuditLogModule, auditLog.service),
        Effect.provideService(FileStorageModule, fileStorage.service),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble({ maxUploadSizeMb: 5 }),
        ),
        Effect.provideService(
          OryKetoAdapter,
          createOryKetoAdapterDouble({
            allowedObjects: [managedFileAuthorizationObject],
          }),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        service.requestManagedFileUploadUrl({
          requestContext: organizationRequestContext,
          scope: platformScope.organization,
          scopeId: "org_1",
          sizeBytes: 2048,
          sha256: expectedSha256,
        }),
      ),
    ).resolves.toEqual({
      uploadUrl: "https://convex.example.com/upload",
      uploadToken: "upload_token_1",
    });

    expect(fileStorage.uploadRequests).toEqual([
      expect.objectContaining({
        maxSizeBytes: 2048,
        scope: platformScope.organization,
        scopeId: "org_1",
      }),
    ]);
    expect(auditLog.calls).toHaveLength(0);
  });

  it("rejects invalid byte counts at the service boundary before reaching the module", async () => {
    const auditLog = createAuditLogModuleDouble();
    const fileStorage = createFileStorageModuleDouble();
    const service = await Effect.runPromise(
      makeFileStorageService().pipe(
        Effect.provideService(AuditLogModule, auditLog.service),
        Effect.provideService(FileStorageModule, fileStorage.service),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(
          OryKetoAdapter,
          createOryKetoAdapterDouble({
            allowedObjects: [managedFileAuthorizationObject],
          }),
        ),
      ),
    );

    const uploadResult = await Effect.runPromise(
      Effect.either(
        service.requestManagedFileUploadUrl({
          requestContext: organizationRequestContext,
          scope: platformScope.organization,
          scopeId: "org_1",
          sizeBytes: -1,
          sha256: expectedSha256,
        }),
      ),
    );

    expect(uploadResult).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "ParseError",
      },
    });

    const registerResult = await Effect.runPromise(
      Effect.either(
        service.registerManagedFile({
          requestContext: organizationRequestContext,
          scope: platformScope.organization,
          scopeId: "org_1",
          uploadToken: "upload_token_1",
          storageId: "storage_logo_1",
          fileName: "logo.svg",
          contentType: "image/svg+xml",
          sizeBytes: 1.5,
          classification: dataClassification.public,
          usage: managedFileUsage.brandingAsset,
        }),
      ),
    );

    expect(registerResult).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "ParseError",
      },
    });
    expect(fileStorage.calls.uploadUrl).toBe(0);
    expect(fileStorage.calls.register).toBe(0);
    expect(auditLog.calls).toHaveLength(0);
  });

  it("enforces the target tenant upload limit for cross-tenant upload reservations and registrations", async () => {
    const auditLog = createAuditLogModuleDouble();
    const fileStorage = createFileStorageModuleDouble();
    const service = await Effect.runPromise(
      makeFileStorageService().pipe(
        Effect.provideService(AuditLogModule, auditLog.service),
        Effect.provideService(FileStorageModule, fileStorage.service),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble({
            maxUploadSizeMbByScopeId: {
              org_1: 1,
              org_2: 10,
            },
          }),
        ),
        Effect.provideService(
          OryKetoAdapter,
          createOryKetoAdapterDouble({
            allowedObjects: [managedFileAuthorizationObject],
          }),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.requestManagedFileUploadUrl({
          requestContext: crossTenantSupportRequestContext,
          scope: platformScope.organization,
          scopeId: "org_1",
          sizeBytes: 2 * 1024 * 1024,
          sha256: expectedSha256,
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "FileStorageUploadTooLargeError",
        maxUploadSizeMb: 1,
      },
    });

    const registerResult = await Effect.runPromise(
      Effect.either(
        service.registerManagedFile({
          requestContext: crossTenantSupportRequestContext,
          scope: platformScope.organization,
          scopeId: "org_1",
          uploadToken: "upload_token_1",
          storageId: "storage_logo_1",
          fileName: "logo.svg",
          contentType: "image/svg+xml",
          sizeBytes: 2 * 1024 * 1024,
          classification: dataClassification.public,
          usage: managedFileUsage.brandingAsset,
        }),
      ),
    );

    expect(registerResult).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "FileStorageUploadTooLargeError",
        maxUploadSizeMb: 1,
      },
    });
    expect(fileStorage.calls.uploadUrl).toBe(0);
    expect(fileStorage.calls.register).toBe(0);
    expect(auditLog.calls).toHaveLength(0);
  });

  it("rejects requests when the file-storage feature flag is disabled", async () => {
    const auditLog = createAuditLogModuleDouble();
    const fileStorage = createFileStorageModuleDouble();
    const service = await Effect.runPromise(
      makeFileStorageService().pipe(
        Effect.provideService(AuditLogModule, auditLog.service),
        Effect.provideService(FileStorageModule, fileStorage.service),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble({ enabled: false }),
        ),
        Effect.provideService(
          OryKetoAdapter,
          createOryKetoAdapterDouble({
            allowedObjects: [managedFileAuthorizationObject],
          }),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.listManagedFiles({
          requestContext: organizationRequestContext,
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "FileStorageModuleDisabledError",
        scope: platformScope.organization,
        scopeId: "org_1",
      },
    });
    expect(fileStorage.calls.list).toBe(0);
    expect(auditLog.calls).toHaveLength(0);
  });

  it("routes authorized read and write requests through the shared module", async () => {
    const auditLog = createAuditLogModuleDouble();
    const fileStorage = createFileStorageModuleDouble();
    const service = await Effect.runPromise(
      makeFileStorageService().pipe(
        Effect.provideService(AuditLogModule, auditLog.service),
        Effect.provideService(FileStorageModule, fileStorage.service),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(
          OryKetoAdapter,
          createOryKetoAdapterDouble({
            allowedObjects: [managedFileAuthorizationObject],
          }),
        ),
      ),
    );

    const upload = await Effect.runPromise(
      service.requestManagedFileUploadUrl({
        requestContext: organizationRequestContext,
        scope: platformScope.organization,
        scopeId: "org_1",
        sizeBytes: 1024,
        sha256: expectedSha256,
      }),
    );

    expect(upload).toEqual({
      uploadUrl: "https://convex.example.com/upload",
      uploadToken: "upload_token_1",
    });

    await expect(
      Effect.runPromise(
        service.listManagedFiles({
          requestContext: organizationRequestContext,
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    ).resolves.toEqual([
      {
        fileId: managedFileId,
        fileName: "logo.svg",
        contentType: "image/svg+xml",
        sizeBytes: 2048,
      },
    ]);

    await expect(
      Effect.runPromise(
        service.registerManagedFile({
          requestContext: organizationRequestContext,
          scope: platformScope.organization,
          scopeId: "org_1",
          uploadToken: upload.uploadToken,
          storageId: "storage_logo_1",
          fileName: "logo.svg",
          contentType: "image/svg+xml",
          sizeBytes: 2048,
          classification: dataClassification.public,
          usage: managedFileUsage.brandingAsset,
        }),
      ),
    ).resolves.toMatchObject({
      fileId: managedFileId,
      fileName: "logo.svg",
    });

    await expect(
      Effect.runPromise(
        service.resolveManagedFileDownload({
          requestContext: organizationRequestContext,
          fileId: managedFileId,
        }),
      ),
    ).resolves.toMatchObject({
      file: {
        fileId: managedFileId,
        fileName: "logo.svg",
        contentType: "image/svg+xml",
        sizeBytes: 2048,
      },
      downloadUrl: "https://files.example.com/storage_logo_1",
    });

    await expect(
      Effect.runPromise(
        service.deleteManagedFile({
          requestContext: organizationRequestContext,
          fileId: managedFileId,
        }),
      ),
    ).resolves.toMatchObject({
      fileId: managedFileId,
      fileName: "logo.svg",
    });

    expect(fileStorage.calls.uploadUrl).toBe(1);
    expect(fileStorage.calls.register).toBe(1);
    expect(fileStorage.calls.list).toBe(1);
    expect(fileStorage.calls.download).toBe(1);
    expect(fileStorage.calls.delete).toBe(1);
    expect(auditLog.calls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.fileStorage,
        action: fileStorageAuditAction.registered,
        target: managedFileId,
      }),
      expect.objectContaining({
        moduleId: platformModuleId.fileStorage,
        action: fileStorageAuditAction.downloadResolved,
        target: managedFileId,
      }),
      expect.objectContaining({
        moduleId: platformModuleId.fileStorage,
        action: fileStorageAuditAction.deleted,
        target: managedFileId,
      }),
    ]);
  });

  it("returns successful mutation responses even when post-commit audit persistence fails", async () => {
    const auditLog = createAuditLogModuleDouble({
      appendError: {
        _tag: "AuditLogPostgresRepositoryPersistenceError",
        operation: "insertAuditEvent",
        cause: new Error("audit unavailable"),
      } as const,
    });
    const fileStorage = createFileStorageModuleDouble();
    const service = await Effect.runPromise(
      makeFileStorageService().pipe(
        Effect.provideService(AuditLogModule, auditLog.service),
        Effect.provideService(FileStorageModule, fileStorage.service),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(
          OryKetoAdapter,
          createOryKetoAdapterDouble({
            allowedObjects: [managedFileAuthorizationObject],
          }),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        service.registerManagedFile({
          requestContext: organizationRequestContext,
          scope: platformScope.organization,
          scopeId: "org_1",
          uploadToken: "upload_token_1",
          storageId: "storage_logo_1",
          fileName: "logo.svg",
          contentType: "image/svg+xml",
          sizeBytes: 2048,
          classification: dataClassification.public,
          usage: managedFileUsage.brandingAsset,
        }),
      ),
    ).resolves.toMatchObject({
      fileId: managedFileId,
      fileName: "logo.svg",
    });

    await expect(
      Effect.runPromise(
        service.deleteManagedFile({
          requestContext: organizationRequestContext,
          fileId: managedFileId,
        }),
      ),
    ).resolves.toMatchObject({
      fileId: managedFileId,
      fileName: "logo.svg",
    });

    expect(fileStorage.calls.register).toBe(1);
    expect(fileStorage.calls.delete).toBe(1);
    expect(auditLog.calls).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.fileStorage,
        action: fileStorageAuditAction.registered,
        target: managedFileId,
      }),
      expect.objectContaining({
        moduleId: platformModuleId.fileStorage,
        action: fileStorageAuditAction.deleted,
        target: managedFileId,
      }),
    ]);
  });

  it("attributes cross-tenant audit events to the target tenant scope", async () => {
    const auditLog = createAuditLogModuleDouble();
    const fileStorage = createFileStorageModuleDouble();
    const service = await Effect.runPromise(
      makeFileStorageService().pipe(
        Effect.provideService(AuditLogModule, auditLog.service),
        Effect.provideService(FileStorageModule, fileStorage.service),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(
          OryKetoAdapter,
          createOryKetoAdapterDouble({
            allowedObjects: [managedFileAuthorizationObject],
          }),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        service.registerManagedFile({
          requestContext: crossTenantSupportRequestContext,
          scope: platformScope.organization,
          scopeId: "org_1",
          uploadToken: "upload_token_1",
          storageId: "storage_logo_1",
          fileName: "logo.svg",
          contentType: "image/svg+xml",
          sizeBytes: 2048,
          classification: dataClassification.public,
          usage: managedFileUsage.brandingAsset,
        }),
      ),
    ).resolves.toMatchObject({
      fileId: managedFileId,
    });

    await expect(
      Effect.runPromise(
        service.resolveManagedFileDownload({
          requestContext: crossTenantSupportRequestContext,
          fileId: managedFileId,
        }),
      ),
    ).resolves.toMatchObject({
      file: {
        fileId: managedFileId,
      },
    });

    await expect(
      Effect.runPromise(
        service.deleteManagedFile({
          requestContext: crossTenantSupportRequestContext,
          fileId: managedFileId,
        }),
      ),
    ).resolves.toMatchObject({
      fileId: managedFileId,
    });

    expect(auditLog.calls).toEqual([
      expect.objectContaining({
        action: fileStorageAuditAction.registered,
        target: managedFileId,
        requestContext: expect.objectContaining({
          tenant: expect.objectContaining({
            scope: platformScope.organization,
            scopeId: "org_1",
          }),
        }),
      }),
      expect.objectContaining({
        action: fileStorageAuditAction.downloadResolved,
        target: managedFileId,
        requestContext: expect.objectContaining({
          tenant: expect.objectContaining({
            scope: platformScope.organization,
            scopeId: "org_1",
          }),
        }),
      }),
      expect.objectContaining({
        action: fileStorageAuditAction.deleted,
        target: managedFileId,
        requestContext: expect.objectContaining({
          tenant: expect.objectContaining({
            scope: platformScope.organization,
            scopeId: "org_1",
          }),
        }),
      }),
    ]);
  });

  it("denies cross-tenant download and delete requests derived from fileId", async () => {
    const auditLog = createAuditLogModuleDouble();
    const fileStorage = createFileStorageModuleDouble();
    const service = await Effect.runPromise(
      makeFileStorageService().pipe(
        Effect.provideService(AuditLogModule, auditLog.service),
        Effect.provideService(FileStorageModule, fileStorage.service),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(
          OryKetoAdapter,
          createOryKetoAdapterDouble({
            allowedObjects: [managedFileAuthorizationObject],
          }),
        ),
      ),
    );

    const downloadResult = await Effect.runPromise(
      Effect.either(
        service.resolveManagedFileDownload({
          requestContext: organizationRequestContext,
          fileId: crossTenantManagedFileId,
        }),
      ),
    );

    expect(downloadResult).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "FileStorageAccessDeniedError",
        permission: permissionScope.fileRead,
        scope: platformScope.organization,
        scopeId: "org_2",
      },
    });

    const deleteResult = await Effect.runPromise(
      Effect.either(
        service.deleteManagedFile({
          requestContext: organizationRequestContext,
          fileId: crossTenantManagedFileId,
        }),
      ),
    );

    expect(deleteResult).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "FileStorageAccessDeniedError",
        permission: permissionScope.fileWrite,
        scope: platformScope.organization,
        scopeId: "org_2",
      },
    });
    expect(fileStorage.calls.download).toBe(0);
    expect(fileStorage.calls.delete).toBe(0);
    expect(auditLog.calls).toHaveLength(0);
  });

  it("does not authorize cross-tenant file access from target-tenant delegated subjects", async () => {
    const auditLog = createAuditLogModuleDouble();
    const fileStorage = createFileStorageModuleDouble();
    const service = await Effect.runPromise(
      makeFileStorageService().pipe(
        Effect.provideService(AuditLogModule, auditLog.service),
        Effect.provideService(FileStorageModule, fileStorage.service),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(
          OryKetoAdapter,
          createOryKetoAdapterDouble({
            allowedObjects: [crossTenantManagedFileAuthorizationObject],
            allowedSubjects: [`tenant:${platformScope.organization}:org_2`],
          }),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        Effect.either(
          service.requestManagedFileUploadUrl({
            requestContext: organizationRequestContext,
            scope: platformScope.organization,
            scopeId: "org_2",
            sizeBytes: 2048,
            sha256: expectedSha256,
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "Left",
      left: {
        _tag: "FileStorageAccessDeniedError",
        permission: permissionScope.fileWrite,
        scope: platformScope.organization,
        scopeId: "org_2",
      },
    });

    await expect(
      Effect.runPromise(
        Effect.either(
          service.listManagedFiles({
            requestContext: organizationRequestContext,
            scope: platformScope.organization,
            scopeId: "org_2",
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "Left",
      left: {
        _tag: "FileStorageAccessDeniedError",
        permission: permissionScope.fileRead,
        scope: platformScope.organization,
        scopeId: "org_2",
      },
    });

    await expect(
      Effect.runPromise(
        Effect.either(
          service.resolveManagedFileDownload({
            requestContext: organizationRequestContext,
            fileId: crossTenantManagedFileId,
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "Left",
      left: {
        _tag: "FileStorageAccessDeniedError",
        permission: permissionScope.fileRead,
        scope: platformScope.organization,
        scopeId: "org_2",
      },
    });

    await expect(
      Effect.runPromise(
        Effect.either(
          service.deleteManagedFile({
            requestContext: organizationRequestContext,
            fileId: crossTenantManagedFileId,
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "Left",
      left: {
        _tag: "FileStorageAccessDeniedError",
        permission: permissionScope.fileWrite,
        scope: platformScope.organization,
        scopeId: "org_2",
      },
    });

    expect(fileStorage.calls.uploadUrl).toBe(0);
    expect(fileStorage.calls.list).toBe(0);
    expect(fileStorage.calls.download).toBe(0);
    expect(fileStorage.calls.delete).toBe(0);
    expect(auditLog.calls).toHaveLength(0);
  });

  it("preserves deleted markers when deleted rows are explicitly listed", async () => {
    const auditLog = createAuditLogModuleDouble();
    const fileStorage = createFileStorageModuleDouble({
      listManagedFilesResult: [
        {
          fileId: managedFileId,
          fileName: "logo.svg",
          contentType: "image/svg+xml",
          sizeBytes: 2048,
          deletedAt: "2026-04-27T12:00:00.000Z",
        },
      ],
    });
    const service = await Effect.runPromise(
      makeFileStorageService().pipe(
        Effect.provideService(AuditLogModule, auditLog.service),
        Effect.provideService(FileStorageModule, fileStorage.service),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(
          OryKetoAdapter,
          createOryKetoAdapterDouble({
            allowedObjects: [managedFileAuthorizationObject],
          }),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        service.listManagedFiles({
          requestContext: organizationRequestContext,
          scope: platformScope.organization,
          scopeId: "org_1",
          includeDeleted: true,
        }),
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        fileId: managedFileId,
        deletedAt: "2026-04-27T12:00:00.000Z",
      }),
    ]);
  });

  it("preserves colon-bearing scope ids when deriving targets from file ids", async () => {
    const auditLog = createAuditLogModuleDouble();
    const fileStorage = createFileStorageModuleDouble();
    const service = await Effect.runPromise(
      makeFileStorageService().pipe(
        Effect.provideService(AuditLogModule, auditLog.service),
        Effect.provideService(FileStorageModule, fileStorage.service),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(
          OryKetoAdapter,
          createOryKetoAdapterDouble({
            allowedObjects: [colonScopeManagedFileAuthorizationObject],
            allowedSubjects: [
              `tenant:${platformScope.organization}:${colonScopeId}`,
            ],
          }),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        service.resolveManagedFileDownload({
          requestContext: colonScopeRequestContext,
          fileId: colonScopeManagedFileId,
        }),
      ),
    ).resolves.toMatchObject({
      downloadUrl: "https://files.example.com/storage_logo_1",
    });

    await expect(
      Effect.runPromise(
        service.deleteManagedFile({
          requestContext: colonScopeRequestContext,
          fileId: colonScopeManagedFileId,
        }),
      ),
    ).resolves.toMatchObject({
      fileId: colonScopeManagedFileId,
    });

    expect(fileStorage.calls.download).toBe(1);
    expect(fileStorage.calls.delete).toBe(1);
    expect(auditLog.calls).toEqual([
      expect.objectContaining({
        action: fileStorageAuditAction.downloadResolved,
        target: colonScopeManagedFileId,
        requestContext: expect.objectContaining({
          tenant: expect.objectContaining({
            scope: platformScope.organization,
            scopeId: colonScopeId,
          }),
        }),
      }),
      expect.objectContaining({
        action: fileStorageAuditAction.deleted,
        target: colonScopeManagedFileId,
        requestContext: expect.objectContaining({
          tenant: expect.objectContaining({
            scope: platformScope.organization,
            scopeId: colonScopeId,
          }),
        }),
      }),
    ]);
  });

  it("returns summary-only file metadata on read and mutation responses", async () => {
    const auditLog = createAuditLogModuleDouble();
    const fileStorage = createFileStorageModuleDouble();
    const service = await Effect.runPromise(
      makeFileStorageService().pipe(
        Effect.provideService(AuditLogModule, auditLog.service),
        Effect.provideService(FileStorageModule, fileStorage.service),
        Effect.provideService(
          RuntimeConfigModule,
          createRuntimeConfigModuleDouble(),
        ),
        Effect.provideService(
          OryKetoAdapter,
          createOryKetoAdapterDouble({
            allowedObjects: [managedFileAuthorizationObject],
          }),
        ),
      ),
    );

    const upload = await Effect.runPromise(
      service.requestManagedFileUploadUrl({
        requestContext: organizationRequestContext,
        scope: platformScope.organization,
        scopeId: "org_1",
        sizeBytes: 2048,
        sha256: expectedSha256,
      }),
    );

    const [files, registeredFile, download, deleted] = await Promise.all([
      Effect.runPromise(
        service.listManagedFiles({
          requestContext: organizationRequestContext,
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
      Effect.runPromise(
        service.registerManagedFile({
          requestContext: organizationRequestContext,
          scope: platformScope.organization,
          scopeId: "org_1",
          uploadToken: upload.uploadToken,
          storageId: "storage_logo_1",
          fileName: "logo.svg",
          contentType: "image/svg+xml",
          sizeBytes: 2048,
          classification: dataClassification.public,
          usage: managedFileUsage.brandingAsset,
        }),
      ),
      Effect.runPromise(
        service.resolveManagedFileDownload({
          requestContext: organizationRequestContext,
          fileId: managedFileId,
        }),
      ),
      Effect.runPromise(
        service.deleteManagedFile({
          requestContext: organizationRequestContext,
          fileId: managedFileId,
        }),
      ),
    ]);

    expect(files[0]).not.toHaveProperty("scope");
    expect(files[0]).not.toHaveProperty("uploadedBy");
    expect(files[0]).not.toHaveProperty("legalHoldActive");
    expect(registeredFile).not.toHaveProperty("uploadedBy");
    expect(registeredFile).not.toHaveProperty("legalHoldActive");
    expect(download.file).not.toHaveProperty("scope");
    expect(download.file).not.toHaveProperty("uploadedBy");
    expect(download.file).not.toHaveProperty("legalHoldActive");
    expect(deleted).toMatchObject({
      deletedAt: "2026-04-27T12:00:00.000Z",
    });
    expect(deleted).not.toHaveProperty("uploadedBy");
    expect(deleted).not.toHaveProperty("legalHoldActive");
  });
});
