import { platformScope } from "@comvestec/contracts";
import { describe, expect, it } from "vitest";
import {
  isLocalBackendE2eFeatureFlagsReady,
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eEnvironment = tryResolveLocalBackendE2eEnvironment();
const describeLocalBackendE2e =
  localBackendE2eEnvironment === undefined ||
  !isLocalBackendE2eFeatureFlagsReady()
    ? describe.skip
    : describe;

describeLocalBackendE2e("backend e2e file storage transport", () => {
  const environment = localBackendE2eEnvironment!;

  const runFileStorageProbe = () =>
    runBackendE2eBunProbe<{
      readonly requestUploadUrlStatus: number;
      readonly requestUploadUrlBody: {
        readonly uploadUrl: string;
        readonly uploadToken: string;
      };
      readonly registerManagedFileStatus: number;
      readonly registerManagedFileBody: {
        readonly fileId: string;
        readonly fileName: string;
        readonly contentType: string;
        readonly sizeBytes: number;
      };
      readonly listManagedFilesStatus: number;
      readonly listManagedFilesBody: ReadonlyArray<{
        readonly fileId: string;
        readonly fileName: string;
        readonly contentType: string;
        readonly sizeBytes: number;
      }>;
      readonly resolveDownloadStatus: number;
      readonly resolveDownloadBody: {
        readonly file: {
          readonly fileId: string;
          readonly fileName: string;
          readonly contentType: string;
          readonly sizeBytes: number;
        };
        readonly downloadUrl: string;
      };
      readonly cookieOnlyDownloadStatus: number;
      readonly cookieOnlyDownloadBody: {
        readonly file: {
          readonly fileId: string;
          readonly fileName: string;
          readonly contentType: string;
          readonly sizeBytes: number;
        };
        readonly downloadUrl: string;
      };
      readonly crossTenantListStatus: number;
      readonly crossTenantListBody: {
        readonly error: string;
      };
      readonly deleteManagedFileStatus: number;
      readonly deleteManagedFileBody: {
        readonly fileId: string;
        readonly fileName: string;
        readonly scope: string;
        readonly scopeId: string;
        readonly uploadedBy: string;
        readonly deletedAt: string;
      };
      readonly includeDeletedListStatus: number;
      readonly includeDeletedListBody: ReadonlyArray<{
        readonly fileId: string;
        readonly fileName: string;
        readonly deletedAt?: string;
      }>;
      readonly postDeleteDownloadStatus: number;
      readonly postDeleteDownloadBody: {
        readonly error: string;
      };
    }>(
      `import { Effect } from 'effect';
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  dataClassification,
  managedFileUsage,
  platformScope,
} from '@comvestec/contracts';
import {
  fileStorageApiPath,
  makeOryKetoAdapter,
  makeValkeyAdapter,
  subscriberJourneySessionCookieName,
  subscriberJourneySessionHeaderName,
} from '@comvestec/platform';
import { createBackendApiRequestHandler } from '@comvestec/platform/http';

const runStep = async (label, operation, timeoutMs = 15000) => {
  let timeoutHandle;

  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(label + ' timed out after ' + timeoutMs + 'ms.'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
};

const encodeSha256Hex = async (value) => {
  const digest = await crypto.subtle.digest('SHA-256', value);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
};

const runId = Date.now().toString();
const actorId = 'usr_backend_e2e_file_storage_member_' + runId;
const homeTenantScopeId = 'org_backend_e2e_file_storage_home_' + runId;
const foreignTenantScopeId = 'org_backend_e2e_file_storage_foreign_' + runId;
const authorizedSessionId = 'sess_backend_e2e_file_storage_authorized_' + runId;
const foreignSessionId = 'sess_backend_e2e_file_storage_foreign_' + runId;
const fileBytes = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="4" fill="#22C55E" /></svg>',
);
const fileSha256 = await encodeSha256Hex(fileBytes);
const fileAuthorizationObject = [
  authorizationNamespace.file,
  platformScope.organization,
  homeTenantScopeId,
].join(':');

const valkey = await Effect.runPromise(
  makeValkeyAdapter({ url: process.env.VALKEY_URL }),
);
await Effect.runPromise(
  valkey.writeSession({
    sessionId: authorizedSessionId,
    requestContext: {
      actorType: actorType.organizationMember,
      actorId,
      sessionId: authorizedSessionId,
      correlationId: 'corr_backend_e2e_file_storage_authorized_' + runId,
      reason: 'Validate file-storage backend route family',
      tenant: {
        scope: platformScope.organization,
        scopeId: homeTenantScopeId,
        organizationId: homeTenantScopeId,
      },
    },
  }),
);
await Effect.runPromise(
  valkey.writeSession({
    sessionId: foreignSessionId,
    requestContext: {
      actorType: actorType.organizationMember,
      actorId: 'usr_backend_e2e_file_storage_foreign_' + runId,
      sessionId: foreignSessionId,
      correlationId: 'corr_backend_e2e_file_storage_foreign_' + runId,
      reason: 'Validate cross-tenant file-storage denial',
      tenant: {
        scope: platformScope.organization,
        scopeId: foreignTenantScopeId,
        organizationId: foreignTenantScopeId,
      },
    },
  }),
);
await Effect.runPromise(Effect.ignore(valkey.close));

const oryKeto = await Effect.runPromise(
  makeOryKetoAdapter({
    readUrl: process.env.KETO_READ_URL,
    writeUrl: process.env.KETO_WRITE_URL,
  }),
);
await Effect.runPromise(
  oryKeto.writeTuple({
    namespace: authorizationNamespace.file,
    object: fileAuthorizationObject,
    relation: authorizationRelation.editor,
    subject: actorId,
  }),
);
await Effect.runPromise(
  oryKeto.writeTuple({
    namespace: authorizationNamespace.file,
    object: fileAuthorizationObject,
    relation: authorizationRelation.viewer,
    subject: actorId,
  }),
);

const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

try {
  const baseUrl = 'http://127.0.0.1:' + server.port;
  const requestUploadUrlResponse = await runStep(
    'file storage request upload url',
    fetch(new URL(fileStorageApiPath.requestUploadUrl, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: authorizedSessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: homeTenantScopeId,
        sizeBytes: fileBytes.byteLength,
        sha256: fileSha256,
      }),
    }),
  );
  const requestUploadUrlBody = await requestUploadUrlResponse.json();
  const uploadBlobResponse = await runStep(
    'file storage upload blob',
    fetch(requestUploadUrlBody.uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'image/svg+xml',
      },
      body: fileBytes,
    }),
  );
  const uploadBlobBody = await uploadBlobResponse.json();
  const registerManagedFileResponse = await runStep(
    'file storage register managed file',
    fetch(new URL(fileStorageApiPath.registerManagedFile, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: authorizedSessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: homeTenantScopeId,
        uploadToken: requestUploadUrlBody.uploadToken,
        storageId: uploadBlobBody.storageId,
        fileName: 'backend-e2e-file-' + runId + '.svg',
        contentType: 'image/svg+xml',
        sizeBytes: fileBytes.byteLength,
        classification: dataClassification.public,
        usage: managedFileUsage.brandingAsset,
      }),
    }),
  );
  const registerManagedFileBody = await registerManagedFileResponse.json();
  const listManagedFilesResponse = await runStep(
    'file storage list managed files',
    fetch(new URL(fileStorageApiPath.listManagedFiles, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: authorizedSessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: homeTenantScopeId,
      }),
    }),
  );
  const resolveDownloadResponse = await runStep(
    'file storage resolve download',
    fetch(new URL(fileStorageApiPath.resolveManagedFileDownload, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: authorizedSessionId,
      },
      body: JSON.stringify({
        fileId: registerManagedFileBody.fileId,
      }),
    }),
  );
  const cookieOnlyDownloadResponse = await runStep(
    'file storage resolve download from cookie-backed backend request',
    fetch(new URL(fileStorageApiPath.resolveManagedFileDownload, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie:
          subscriberJourneySessionCookieName + '=' + authorizedSessionId,
      },
      body: JSON.stringify({
        fileId: registerManagedFileBody.fileId,
      }),
    }),
  );
  const crossTenantListResponse = await runStep(
    'file storage cross-tenant list denial',
    fetch(new URL(fileStorageApiPath.listManagedFiles, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: foreignSessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: homeTenantScopeId,
      }),
    }),
  );
  const deleteManagedFileResponse = await runStep(
    'file storage delete managed file',
    fetch(new URL(fileStorageApiPath.deleteManagedFile, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: authorizedSessionId,
      },
      body: JSON.stringify({
        fileId: registerManagedFileBody.fileId,
      }),
    }),
  );
  const includeDeletedListResponse = await runStep(
    'file storage list deleted tombstone',
    fetch(new URL(fileStorageApiPath.listManagedFiles, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: authorizedSessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: homeTenantScopeId,
        includeDeleted: true,
      }),
    }),
  );
  const postDeleteDownloadResponse = await runStep(
    'file storage reject download after delete',
    fetch(new URL(fileStorageApiPath.resolveManagedFileDownload, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: authorizedSessionId,
      },
      body: JSON.stringify({
        fileId: registerManagedFileBody.fileId,
      }),
    }),
  );

  console.log(JSON.stringify({
    requestUploadUrlStatus: requestUploadUrlResponse.status,
    requestUploadUrlBody,
    registerManagedFileStatus: registerManagedFileResponse.status,
    registerManagedFileBody,
    listManagedFilesStatus: listManagedFilesResponse.status,
    listManagedFilesBody: await listManagedFilesResponse.json(),
    resolveDownloadStatus: resolveDownloadResponse.status,
    resolveDownloadBody: await resolveDownloadResponse.json(),
    cookieOnlyDownloadStatus: cookieOnlyDownloadResponse.status,
    cookieOnlyDownloadBody: await cookieOnlyDownloadResponse.json(),
    crossTenantListStatus: crossTenantListResponse.status,
    crossTenantListBody: await crossTenantListResponse.json(),
    deleteManagedFileStatus: deleteManagedFileResponse.status,
    deleteManagedFileBody: await deleteManagedFileResponse.json(),
    includeDeletedListStatus: includeDeletedListResponse.status,
    includeDeletedListBody: await includeDeletedListResponse.json(),
    postDeleteDownloadStatus: postDeleteDownloadResponse.status,
    postDeleteDownloadBody: await postDeleteDownloadResponse.json(),
  }));
} finally {
  server.stop(true);
}`,
      {
        env: {
          ...process.env,
          ...environment,
        },
        timeoutMs: 60_000,
      },
    );

  it("round-trips the real backend-owned file-storage routes while enforcing backend-session and tenant boundaries", () => {
    const probe = runFileStorageProbe();

    expect(probe.requestUploadUrlStatus).toBe(200);
    expect(probe.requestUploadUrlBody).toEqual({
      uploadUrl: expect.any(String),
      uploadToken: expect.any(String),
    });

    expect(probe.registerManagedFileStatus).toBe(201);
    expect(probe.registerManagedFileBody).toEqual(
      expect.objectContaining({
        fileId: expect.stringContaining(
          `${platformScope.organization}:org_backend_e2e_file_storage_home_`,
        ),
        fileName: expect.stringContaining("backend-e2e-file-"),
        contentType: "image/svg+xml",
        sizeBytes: expect.any(Number),
      }),
    );

    expect(probe.listManagedFilesStatus).toBe(200);
    expect(probe.listManagedFilesBody).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileId: probe.registerManagedFileBody.fileId,
          fileName: probe.registerManagedFileBody.fileName,
          contentType: "image/svg+xml",
          sizeBytes: probe.registerManagedFileBody.sizeBytes,
        }),
      ]),
    );

    expect(probe.resolveDownloadStatus).toBe(200);
    expect(probe.resolveDownloadBody).toEqual(
      expect.objectContaining({
        file: expect.objectContaining({
          fileId: probe.registerManagedFileBody.fileId,
          fileName: probe.registerManagedFileBody.fileName,
          contentType: "image/svg+xml",
          sizeBytes: probe.registerManagedFileBody.sizeBytes,
        }),
        downloadUrl: expect.any(String),
      }),
    );

    expect(probe.cookieOnlyDownloadStatus).toBe(200);
    expect(probe.cookieOnlyDownloadBody).toEqual(
      expect.objectContaining({
        file: expect.objectContaining({
          fileId: probe.registerManagedFileBody.fileId,
          fileName: probe.registerManagedFileBody.fileName,
          contentType: "image/svg+xml",
          sizeBytes: probe.registerManagedFileBody.sizeBytes,
        }),
        downloadUrl: expect.any(String),
      }),
    );

    expect(probe.crossTenantListStatus).toBe(403);
    expect(probe.crossTenantListBody).toEqual({
      error: "File access is not allowed for this session.",
    });

    expect(probe.deleteManagedFileStatus).toBe(200);
    expect(probe.deleteManagedFileBody).toEqual(
      expect.objectContaining({
        fileId: probe.registerManagedFileBody.fileId,
        fileName: probe.registerManagedFileBody.fileName,
        contentType: "image/svg+xml",
        sizeBytes: probe.registerManagedFileBody.sizeBytes,
        deletedAt: expect.any(String),
      }),
    );

    expect(probe.includeDeletedListStatus).toBe(200);
    expect(probe.includeDeletedListBody).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileId: probe.registerManagedFileBody.fileId,
          fileName: probe.registerManagedFileBody.fileName,
          deletedAt: probe.deleteManagedFileBody.deletedAt,
        }),
      ]),
    );

    expect(probe.postDeleteDownloadStatus).toBe(404);
    expect(probe.postDeleteDownloadBody).toEqual({
      error: "Requested resource was not found.",
    });
  }, 75_000);
});
