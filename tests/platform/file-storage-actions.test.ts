import { Effect } from "effect";
import {
  actorType,
  dataClassification,
  managedFileUsage,
  platformModuleId,
  platformScope,
} from "@comvestec/contracts";
import {
  deleteManagedFileFromRequestContext,
  listManagedFilesFromRequestContext,
  registerManagedFileFromRequestContext,
  requestManagedFileUploadUrlFromRequestContext,
  resolveManagedFileDownloadFromRequestContext,
} from "@comvestec/platform";

const organizationRequestContext = {
  actorType: actorType.organizationMember,
  actorId: "usr_member_1",
  sessionId: "sess_member_1",
  correlationId: "corr_file_storage_actions_1",
  tenant: {
    scope: platformScope.organization,
    scopeId: "org_1",
  },
};

describe("platform file-storage app helpers", () => {
  it("delegates upload-url requests through the request-context helper wrapper", async () => {
    const requestManagedFileUploadUrl = vi.fn((input) =>
      Effect.succeed({
        uploadUrl: `https://convex.example.com/upload/${input.scopeId}`,
        uploadToken: "upload_token_1",
      }),
    );

    const result = await Effect.runPromise(
      requestManagedFileUploadUrlFromRequestContext(
        {},
        {
          requestContext: organizationRequestContext,
          scope: platformScope.organization,
          scopeId: "org_1",
          sizeBytes: 2048,
          sha256:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
        requestManagedFileUploadUrl,
      ),
    );

    expect(requestManagedFileUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: organizationRequestContext,
        scopeId: "org_1",
      }),
    );
    expect(result).toEqual({
      uploadUrl: "https://convex.example.com/upload/org_1",
      uploadToken: "upload_token_1",
    });
  });

  it("delegates delete requests through the request-context helper wrapper", async () => {
    const deleteManagedFile = vi.fn((input) =>
      Effect.succeed({
        fileId: input.fileId,
        fileName: "logo.svg",
        contentType: "image/svg+xml",
        sizeBytes: 2048,
      }),
    );

    const result = await Effect.runPromise(
      deleteManagedFileFromRequestContext(
        {},
        {
          requestContext: organizationRequestContext,
          fileId: `${platformModuleId.fileStorage}:${platformScope.organization}:org_1:file_1`,
        },
        deleteManagedFile,
      ),
    );

    expect(deleteManagedFile).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: organizationRequestContext,
        fileId: `${platformModuleId.fileStorage}:${platformScope.organization}:org_1:file_1`,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        fileName: "logo.svg",
      }),
    );
  });

  it("delegates register requests through the request-context helper wrapper", async () => {
    const registerManagedFile = vi.fn((input) =>
      Effect.succeed({
        fileId: `${platformModuleId.fileStorage}:${input.scope}:${input.scopeId}:file_1`,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
      }),
    );

    const result = await Effect.runPromise(
      registerManagedFileFromRequestContext(
        {},
        {
          requestContext: organizationRequestContext,
          scope: platformScope.organization,
          scopeId: "org_1",
          uploadToken: "upload_token_1",
          storageId: "storage_1",
          fileName: "logo.svg",
          contentType: "image/svg+xml",
          sizeBytes: 2048,
          classification: dataClassification.internal,
          usage: managedFileUsage.standard,
        },
        registerManagedFile,
      ),
    );

    expect(registerManagedFile).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: organizationRequestContext,
        scopeId: "org_1",
        uploadToken: "upload_token_1",
      }),
    );
    expect(result).toEqual({
      fileId: `${platformModuleId.fileStorage}:${platformScope.organization}:org_1:file_1`,
      fileName: "logo.svg",
      contentType: "image/svg+xml",
      sizeBytes: 2048,
    });
  });

  it("delegates list requests through the request-context helper wrapper", async () => {
    const listManagedFiles = vi.fn((input) =>
      Effect.succeed([
        {
          fileId: `${platformModuleId.fileStorage}:${input.scope}:${input.scopeId}:file_1`,
          fileName: "logo.svg",
          contentType: "image/svg+xml",
          sizeBytes: 2048,
        },
      ]),
    );

    const result = await Effect.runPromise(
      listManagedFilesFromRequestContext(
        {},
        {
          requestContext: organizationRequestContext,
          scope: platformScope.organization,
          scopeId: "org_1",
          includeDeleted: true,
        },
        listManagedFiles,
      ),
    );

    expect(listManagedFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: organizationRequestContext,
        scopeId: "org_1",
        includeDeleted: true,
      }),
    );
    expect(result).toEqual([
      {
        fileId: `${platformModuleId.fileStorage}:${platformScope.organization}:org_1:file_1`,
        fileName: "logo.svg",
        contentType: "image/svg+xml",
        sizeBytes: 2048,
      },
    ]);
  });

  it("delegates download requests through the request-context helper wrapper", async () => {
    const resolveManagedFileDownload = vi.fn((input) =>
      Effect.succeed({
        file: {
          fileId: input.fileId,
          fileName: "logo.svg",
          contentType: "image/svg+xml",
          sizeBytes: 2048,
        },
        downloadUrl: `https://files.example.com/download/${encodeURIComponent(input.fileId)}`,
      }),
    );

    const result = await Effect.runPromise(
      resolveManagedFileDownloadFromRequestContext(
        {},
        {
          requestContext: organizationRequestContext,
          fileId: `${platformModuleId.fileStorage}:${platformScope.organization}:org_1:file_1`,
        },
        resolveManagedFileDownload,
      ),
    );

    expect(resolveManagedFileDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: organizationRequestContext,
        fileId: `${platformModuleId.fileStorage}:${platformScope.organization}:org_1:file_1`,
      }),
    );
    expect(result).toEqual({
      file: {
        fileId: `${platformModuleId.fileStorage}:${platformScope.organization}:org_1:file_1`,
        fileName: "logo.svg",
        contentType: "image/svg+xml",
        sizeBytes: 2048,
      },
      downloadUrl:
        "https://files.example.com/download/file-storage%3Aorganization%3Aorg_1%3Afile_1",
    });
  });
});
