import { spawnSync } from "child_process";

const runBackendApiFileStorageProbe = () => {
  const proc = spawnSync(
    "bun",
    [
      "-e",
      `import { subscriberJourneySessionHeaderName } from '@comvestec/platform';
    import { fileStorageApiBasePath, fileStorageApiPath } from './packages/platform/src/services/domains/file-storage-http.ts';
import { createBackendApiApp } from '@comvestec/platform/http';
import { createBackendApiOpenApiDocument } from './packages/platform/src/http/openapi-document.ts';

const document = createBackendApiOpenApiDocument('http://localhost');
const staticHandler = () => Response.json({ acknowledged: true });
const fileStorageHandler = () => Response.json({ route: 'file-storage' });
const app = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminGovernanceHandler: staticHandler,
  adminRetentionLegalHoldHandler: staticHandler,
  adminSupportOperationsHandler: staticHandler,
  adminWebhooksApiAccessHandler: staticHandler,
  fileStorageHandler,
  webhooksHandler: staticHandler,
  subscriberJourneyHandler: staticHandler,
});
const missingFileStorageApp = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminGovernanceHandler: staticHandler,
  adminRetentionLegalHoldHandler: staticHandler,
  adminSupportOperationsHandler: staticHandler,
  adminWebhooksApiAccessHandler: staticHandler,
  webhooksHandler: staticHandler,
  subscriberJourneyHandler: () => Response.json({ route: 'subscriber-journey' }),
});
const routeResponse = await app.request(
  new Request('http://localhost' + fileStorageApiBasePath + '/list', {
    method: 'POST',
  }),
);
const missingRouteResponse = await missingFileStorageApp.request(
  new Request('http://localhost' + fileStorageApiBasePath + '/list', {
    method: 'POST',
  }),
);
console.log(JSON.stringify({
  requestUploadUrlRequestRef: document.paths[fileStorageApiPath.requestUploadUrl]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  requestUploadUrlParameterNames: (document.paths[fileStorageApiPath.requestUploadUrl]?.post?.parameters ?? []).map((parameter) => parameter.name),
  requestUploadUrl404Description: document.paths[fileStorageApiPath.requestUploadUrl]?.post?.responses?.['404']?.description,
  requestUploadUrl403Description: document.paths[fileStorageApiPath.requestUploadUrl]?.post?.responses?.['403']?.description,
  requestUploadUrlSizeBytesSchema: document.components.schemas.RequestManagedFileUploadUrlHttpRequest?.properties?.sizeBytes,
  registerManagedFileResponseRef: document.paths[fileStorageApiPath.registerManagedFile]?.post?.responses?.['201']?.content?.['application/json']?.schema?.$ref,
  registerManagedFile404Description: document.paths[fileStorageApiPath.registerManagedFile]?.post?.responses?.['404']?.description,
  registerManagedFile409Description: document.paths[fileStorageApiPath.registerManagedFile]?.post?.responses?.['409']?.description,
  registerManagedFile413Description: document.paths[fileStorageApiPath.registerManagedFile]?.post?.responses?.['413']?.description,
  registerManagedFileSizeBytesSchema: document.components.schemas.RegisterManagedFileHttpRequest?.properties?.sizeBytes,
  resolveManagedFileDownloadResponseRef: document.paths[fileStorageApiPath.resolveManagedFileDownload]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  managedFileSummaryViewSizeBytesSchema: document.components.schemas.ManagedFileSummaryView?.properties?.sizeBytes,
  managedFileSummaryViewDeletedAtSchema: document.components.schemas.ManagedFileSummaryView?.properties?.deletedAt,
  managedFileSummaryViewListItemSizeBytesSchema: document.components.schemas.ManagedFileSummaryViewList?.items?.properties?.sizeBytes,
  managedFileSummaryViewListItemDeletedAtSchema: document.components.schemas.ManagedFileSummaryViewList?.items?.properties?.deletedAt,
  managedFileDownloadDescriptorSizeBytesSchema: document.components.schemas.ManagedFileDownloadDescriptor?.properties?.file?.properties?.sizeBytes,
  managedFileDownloadDescriptorDeletedAtSchema: document.components.schemas.ManagedFileDownloadDescriptor?.properties?.file?.properties?.deletedAt,
  deleteManagedFile409Description: document.paths[fileStorageApiPath.deleteManagedFile]?.post?.responses?.['409']?.description,
  hasManagedFileUploadUrlSchema: Boolean(document.components.schemas.ManagedFileUploadUrl),
  hasManagedFileSummaryViewSchema: Boolean(document.components.schemas.ManagedFileSummaryView),
  hasManagedFileDownloadDescriptorSchema: Boolean(document.components.schemas.ManagedFileDownloadDescriptor),
  routeStatus: routeResponse.status,
  routeBody: await routeResponse.json(),
  missingRouteStatus: missingRouteResponse.status,
  missingRouteBody: await missingRouteResponse.json(),
  subscriberJourneySessionHeaderName,
}));`,
    ],
    {
      cwd: process.cwd(),
      timeout: 90_000,
    },
  );

  if (proc.status !== 0) {
    throw new Error(
      `Bun runtime probe failed:\n${(proc.stderr ?? "").toString()}`,
    );
  }

  return JSON.parse((proc.stdout ?? "").toString()) as {
    readonly requestUploadUrlRequestRef?: string;
    readonly requestUploadUrlParameterNames: readonly string[];
    readonly requestUploadUrl404Description?: string;
    readonly requestUploadUrl403Description?: string;
    readonly requestUploadUrlSizeBytesSchema?: {
      readonly type?: string;
      readonly minimum?: number;
    };
    readonly registerManagedFileResponseRef?: string;
    readonly registerManagedFile404Description?: string;
    readonly registerManagedFile409Description?: string;
    readonly registerManagedFile413Description?: string;
    readonly registerManagedFileSizeBytesSchema?: {
      readonly type?: string;
      readonly minimum?: number;
    };
    readonly resolveManagedFileDownloadResponseRef?: string;
    readonly managedFileSummaryViewSizeBytesSchema?: {
      readonly type?: string;
      readonly minimum?: number;
    };
    readonly managedFileSummaryViewDeletedAtSchema?: {
      readonly type?: string;
      readonly format?: string;
    };
    readonly managedFileSummaryViewListItemSizeBytesSchema?: {
      readonly type?: string;
      readonly minimum?: number;
    };
    readonly managedFileSummaryViewListItemDeletedAtSchema?: {
      readonly type?: string;
      readonly format?: string;
    };
    readonly managedFileDownloadDescriptorSizeBytesSchema?: {
      readonly type?: string;
      readonly minimum?: number;
    };
    readonly managedFileDownloadDescriptorDeletedAtSchema?: {
      readonly type?: string;
      readonly format?: string;
    };
    readonly deleteManagedFile409Description?: string;
    readonly hasManagedFileUploadUrlSchema: boolean;
    readonly hasManagedFileSummaryViewSchema: boolean;
    readonly hasManagedFileDownloadDescriptorSchema: boolean;
    readonly routeStatus: number;
    readonly routeBody: {
      readonly route: string;
    };
    readonly missingRouteStatus: number;
    readonly missingRouteBody: {
      readonly error: string;
    };
    readonly subscriberJourneySessionHeaderName: string;
  };
};

describe("platform backend api file-storage transport", () => {
  it("documents and mounts the file-storage backend routes", () => {
    const probe = runBackendApiFileStorageProbe();

    expect(probe.requestUploadUrlRequestRef).toBe(
      "#/components/schemas/RequestManagedFileUploadUrlHttpRequest",
    );
    expect(probe.requestUploadUrlParameterNames).toEqual([
      probe.subscriberJourneySessionHeaderName,
    ]);
    expect(probe.requestUploadUrl404Description).toBe(
      "Requested resource was not found.",
    );
    expect(probe.requestUploadUrl403Description).toBe(
      "File storage is not enabled for this scope or file access is not allowed for this session.",
    );
    expect(probe.registerManagedFileResponseRef).toBe(
      "#/components/schemas/ManagedFileSummaryView",
    );
    expect(probe.registerManagedFile404Description).toBe(
      "Requested resource was not found.",
    );
    expect(probe.registerManagedFile409Description).toBe(
      "Managed file upload reservation or blob state is no longer valid.",
    );
    expect(probe.registerManagedFile413Description).toBe(
      "Managed file upload exceeds the configured or reserved file-size limit.",
    );
    expect(probe.resolveManagedFileDownloadResponseRef).toBe(
      "#/components/schemas/ManagedFileDownloadDescriptor",
    );
    expect(probe.deleteManagedFile409Description).toBe(
      "Managed file deletion is blocked by retention policy.",
    );
    expect(probe.hasManagedFileUploadUrlSchema).toBe(true);
    expect(probe.hasManagedFileSummaryViewSchema).toBe(true);
    expect(probe.hasManagedFileDownloadDescriptorSchema).toBe(true);
    expect(probe.requestUploadUrlSizeBytesSchema).toEqual({
      type: "integer",
      minimum: 1,
    });
    expect(probe.registerManagedFileSizeBytesSchema).toEqual({
      type: "integer",
      minimum: 1,
    });
    expect(probe.managedFileSummaryViewSizeBytesSchema).toEqual({
      type: "integer",
      minimum: 1,
    });
    expect(probe.managedFileSummaryViewDeletedAtSchema).toEqual({
      type: "string",
      format: "date-time",
    });
    expect(probe.managedFileSummaryViewListItemSizeBytesSchema).toEqual({
      type: "integer",
      minimum: 1,
    });
    expect(probe.managedFileSummaryViewListItemDeletedAtSchema).toEqual({
      type: "string",
      format: "date-time",
    });
    expect(probe.managedFileDownloadDescriptorSizeBytesSchema).toEqual({
      type: "integer",
      minimum: 1,
    });
    expect(probe.managedFileDownloadDescriptorDeletedAtSchema).toEqual({
      type: "string",
      format: "date-time",
    });
    expect(probe.routeStatus).toBe(200);
    expect(probe.routeBody).toEqual({ route: "file-storage" });
    expect(probe.missingRouteStatus).toBe(404);
    expect(probe.missingRouteBody).toEqual({
      error: "File storage route not found.",
    });
  }, 90_000);
});
