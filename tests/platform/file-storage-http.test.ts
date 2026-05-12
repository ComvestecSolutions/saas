import { Effect, Schema } from "effect";
import {
  actorType,
  dataClassification,
  managedFileUsage,
  ManagedFileUploadUrlSchema,
  permissionScope,
  platformModuleId,
  platformScope,
  type ManagedFileDownloadDescriptor,
  type ManagedFileSummaryView,
  type ManagedFileUploadUrl,
} from "@comvestec/contracts";
import {
  subscriberJourneySessionCookieName,
  subscriberJourneySessionHeaderName,
} from "@comvestec/platform";
import {
  createFileStorageHttpHandler,
  fileStorageApiPath,
  type FileStorageTransportService,
} from "../../packages/platform/src/services/domains/file-storage-http";

const organizationRequestContext = {
  actorType: actorType.organizationMember,
  actorId: "usr_member_1",
  sessionId: "sess_member_1",
  correlationId: "corr_file_storage_http_1",
  tenant: {
    scope: platformScope.organization,
    scopeId: "org_1",
  },
};

const managedFileId = `${platformModuleId.fileStorage}:${platformScope.organization}:org_1:file_1`;
const expectedSha256 =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const unexpectedFileStorageTransportEffect = <A>() =>
  Effect.die(new Error("Unexpected file-storage transport service call."));

const defaultResolveRequestContext: FileStorageTransportService["resolveRequestContext"] =
  () => Effect.succeed(organizationRequestContext);

const defaultRequestManagedFileUploadUrl: FileStorageTransportService["requestManagedFileUploadUrl"] =
  () => unexpectedFileStorageTransportEffect();

const defaultRegisterManagedFile: FileStorageTransportService["registerManagedFile"] =
  () => unexpectedFileStorageTransportEffect();

const defaultListManagedFiles: FileStorageTransportService["listManagedFiles"] =
  () => unexpectedFileStorageTransportEffect();

const defaultResolveManagedFileDownload: FileStorageTransportService["resolveManagedFileDownload"] =
  () => unexpectedFileStorageTransportEffect();

const defaultDeleteManagedFile: FileStorageTransportService["deleteManagedFile"] =
  () => unexpectedFileStorageTransportEffect();

const createFileStorageTransportServiceDouble = (
  overrides: Partial<FileStorageTransportService>,
): FileStorageTransportService => ({
  resolveRequestContext:
    overrides.resolveRequestContext ?? defaultResolveRequestContext,
  requestManagedFileUploadUrl:
    overrides.requestManagedFileUploadUrl ?? defaultRequestManagedFileUploadUrl,
  registerManagedFile:
    overrides.registerManagedFile ?? defaultRegisterManagedFile,
  listManagedFiles: overrides.listManagedFiles ?? defaultListManagedFiles,
  resolveManagedFileDownload:
    overrides.resolveManagedFileDownload ?? defaultResolveManagedFileDownload,
  deleteManagedFile: overrides.deleteManagedFile ?? defaultDeleteManagedFile,
});

const createTestHandler = (service: Partial<FileStorageTransportService>) =>
  createFileStorageHttpHandler((use) =>
    use(createFileStorageTransportServiceDouble(service)),
  );

describe("platform file storage http", () => {
  it("returns 400 when the request payload uses an invalid byte count", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${fileStorageApiPath.requestUploadUrl}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_member_1",
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: "org_1",
            sizeBytes: -1,
            sha256: expectedSha256,
          }),
        }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request payload did not match the expected schema.",
    });
  });

  it("creates managed-file upload reservations through the backend HTTP surface", async () => {
    const handler = createTestHandler({
      requestManagedFileUploadUrl: () =>
        Effect.succeed({
          uploadUrl: "https://convex.example.com/upload",
          uploadToken: "upload_token_1",
        } satisfies ManagedFileUploadUrl),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${fileStorageApiPath.requestUploadUrl}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_member_1",
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: "org_1",
            sizeBytes: 2048,
            sha256: expectedSha256,
          }),
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      uploadUrl: "https://convex.example.com/upload",
      uploadToken: "upload_token_1",
    });
  });

  it("registers managed files through the backend HTTP surface", async () => {
    const handler = createTestHandler({
      registerManagedFile: () =>
        Effect.succeed({
          fileId: managedFileId,
          fileName: "logo.svg",
          contentType: "image/svg+xml",
          sizeBytes: 2048,
        } satisfies ManagedFileSummaryView),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${fileStorageApiPath.registerManagedFile}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_member_1",
            },
            body: JSON.stringify({
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
          },
        ),
      ),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        fileId: managedFileId,
        fileName: "logo.svg",
      }),
    );
  });

  it("returns 409 when the upload reservation is no longer valid", async () => {
    const handler = createTestHandler({
      registerManagedFile: () =>
        Effect.fail({
          _tag: "ConvexFileStorageAdapterRequestError",
          operation: "createManagedFileRecord",
          cause: new Error(
            "Managed file upload token is invalid or already used.",
          ),
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${fileStorageApiPath.registerManagedFile}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_member_1",
            },
            body: JSON.stringify({
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
          },
        ),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Managed file upload reservation is no longer valid.",
    });
  });

  it("returns 404 when the uploaded blob is missing during registration", async () => {
    const handler = createTestHandler({
      registerManagedFile: () =>
        Effect.fail({
          _tag: "ConvexFileStorageAdapterRequestError",
          operation: "createManagedFileRecord",
          cause: new Error("Managed file upload blob was not found."),
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${fileStorageApiPath.registerManagedFile}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_member_1",
            },
            body: JSON.stringify({
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
          },
        ),
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Requested resource was not found.",
    });
  });

  it("returns 413 when the uploaded blob exceeds the reserved size", async () => {
    const handler = createTestHandler({
      registerManagedFile: () =>
        Effect.fail({
          _tag: "ConvexFileStorageAdapterRequestError",
          operation: "createManagedFileRecord",
          cause: new Error(
            "Managed file upload exceeds the reserved size limit.",
          ),
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${fileStorageApiPath.registerManagedFile}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_member_1",
            },
            body: JSON.stringify({
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
          },
        ),
      ),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Managed file upload exceeds the reserved size limit.",
    });
  });

  it("returns 409 when the uploaded blob size is no longer valid", async () => {
    const handler = createTestHandler({
      registerManagedFile: () =>
        Effect.fail({
          _tag: "ConvexFileStorageAdapterRequestError",
          operation: "createManagedFileRecord",
          cause: new Error(
            "Managed file upload blob size must be a positive integer.",
          ),
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${fileStorageApiPath.registerManagedFile}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_member_1",
            },
            body: JSON.stringify({
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
          },
        ),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "Managed file upload reservation or blob state is no longer valid.",
    });
  });

  it("returns 409 when the uploaded blob digest no longer matches the reservation", async () => {
    const handler = createTestHandler({
      registerManagedFile: () =>
        Effect.fail({
          _tag: "ConvexFileStorageAdapterRequestError",
          operation: "createManagedFileRecord",
          cause: new Error(
            "Managed file upload blob digest does not match the reservation.",
          ),
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${fileStorageApiPath.registerManagedFile}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_member_1",
            },
            body: JSON.stringify({
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
          },
        ),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Managed file upload blob does not match the issued reservation.",
    });
  });

  it("returns 409 when the uploaded blob predates the issued reservation", async () => {
    const handler = createTestHandler({
      registerManagedFile: () =>
        Effect.fail({
          _tag: "ConvexFileStorageAdapterRequestError",
          operation: "createManagedFileRecord",
          cause: new Error(
            "Managed file upload blob predates the issued upload reservation.",
          ),
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${fileStorageApiPath.registerManagedFile}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_member_1",
            },
            body: JSON.stringify({
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
          },
        ),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Managed file upload reservation is no longer valid.",
    });
  });

  it("returns 409 when the uploaded blob is already bound to another managed file", async () => {
    const handler = createTestHandler({
      registerManagedFile: () =>
        Effect.fail({
          _tag: "ConvexFileStorageAdapterRequestError",
          operation: "createManagedFileRecord",
          cause: new Error("Managed file upload blob is already bound."),
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${fileStorageApiPath.registerManagedFile}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_member_1",
            },
            body: JSON.stringify({
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
          },
        ),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Managed file upload blob is already bound to a managed file.",
    });
  });

  it("lists deleted rows with tombstone markers when explicitly requested", async () => {
    const handler = createTestHandler({
      listManagedFiles: () =>
        Effect.succeed([
          {
            fileId: managedFileId,
            fileName: "logo.svg",
            contentType: "image/svg+xml",
            sizeBytes: 2048,
            deletedAt: "2026-04-27T12:00:00.000Z",
          },
        ] satisfies ManagedFileSummaryView[]),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${fileStorageApiPath.listManagedFiles}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_member_1",
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: "org_1",
            includeDeleted: true,
          }),
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        fileId: managedFileId,
        deletedAt: "2026-04-27T12:00:00.000Z",
      }),
    ]);
  });

  it("returns 403 when file access is denied", async () => {
    const handler = createTestHandler({
      listManagedFiles: () =>
        Effect.fail({
          _tag: "FileStorageAccessDeniedError",
          permission: permissionScope.fileRead,
          scope: platformScope.organization,
          scopeId: "org_1",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${fileStorageApiPath.listManagedFiles}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_member_1",
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: "org_1",
          }),
        }),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "File access is not allowed for this session.",
    });
  });

  it("returns 403 when file storage is disabled for the target scope", async () => {
    const handler = createTestHandler({
      requestManagedFileUploadUrl: () =>
        Effect.fail({
          _tag: "FileStorageModuleDisabledError",
          scope: platformScope.organization,
          scopeId: "org_1",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${fileStorageApiPath.requestUploadUrl}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_member_1",
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: "org_1",
            sizeBytes: 2048,
            sha256: expectedSha256,
          }),
        }),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "File storage is not enabled for this scope.",
    });
  });

  it("returns 409 when retention blocks managed-file deletion", async () => {
    const handler = createTestHandler({
      deleteManagedFile: () =>
        Effect.fail({
          _tag: "FileStorageDeletionBlockedError",
          fileId: managedFileId,
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${fileStorageApiPath.deleteManagedFile}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_member_1",
          },
          body: JSON.stringify({
            fileId: managedFileId,
          }),
        }),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Managed file deletion is blocked by retention policy.",
    });
  });

  it("returns 401 when the backend request only provides a session cookie", async () => {
    const handler = createTestHandler({
      resolveManagedFileDownload: () =>
        Effect.succeed({
          file: {
            fileId: managedFileId,
            fileName: "logo.svg",
            contentType: "image/svg+xml",
            sizeBytes: 2048,
          },
          downloadUrl: "https://files.example.com/storage_logo_1",
        } satisfies ManagedFileDownloadDescriptor),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${fileStorageApiPath.resolveManagedFileDownload}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              cookie: `${subscriberJourneySessionCookieName}=sess_cookie_1`,
            },
            body: JSON.stringify({
              fileId: managedFileId,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authenticated session is required.",
    });
  });

  it("returns 404 when the backend session cannot be resolved", async () => {
    const handler = createTestHandler({
      resolveRequestContext: () =>
        Effect.fail({
          _tag: "IdentitySessionRequestContextNotFoundError",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${fileStorageApiPath.requestUploadUrl}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_missing_1",
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: "org_1",
            sizeBytes: 2048,
            sha256: expectedSha256,
          }),
        }),
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Requested resource was not found.",
    });
  });

  it("returns 500 for internal parse failures instead of treating them as caller errors", async () => {
    const handler = createTestHandler({
      requestManagedFileUploadUrl: () =>
        Schema.decodeUnknown(ManagedFileUploadUrlSchema)({
          uploadUrl: 123,
          uploadToken: "upload_token_1",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${fileStorageApiPath.requestUploadUrl}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_member_1",
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: "org_1",
            sizeBytes: 2048,
            sha256: expectedSha256,
          }),
        }),
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "File storage request failed.",
    });
  });

  it("returns 401 when the authenticated session is missing", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${fileStorageApiPath.requestUploadUrl}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            scope: platformScope.organization,
            scopeId: "org_1",
            sizeBytes: 2048,
            sha256: expectedSha256,
          }),
        }),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authenticated session is required.",
    });
  });
});
