import { spawnSync } from "child_process";

const runBackendApiTenantBrandingProbe = () => {
  const proc = spawnSync(
    "bun",
    [
      "-e",
      `import { subscriberJourneySessionHeaderName } from '@comvestec/platform';
import { createBackendApiApp } from '@comvestec/platform/http';
import { createBackendApiOpenApiDocument } from './packages/platform/src/http/openapi-document.ts';
import { adminTenantBrandingApiBasePath, adminTenantBrandingApiPath } from './packages/platform/src/services/domains/tenant-branding-http.ts';

const document = createBackendApiOpenApiDocument('http://localhost');
const staticHandler = () => Response.json({ acknowledged: true });
const tenantBrandingHandler = () => Response.json({ route: 'tenant-branding' });
const app = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminTenantBrandingHandler: tenantBrandingHandler,
  adminGovernanceHandler: staticHandler,
  adminRetentionLegalHoldHandler: staticHandler,
  adminSupportOperationsHandler: staticHandler,
  adminWebhooksApiAccessHandler: staticHandler,
  fileStorageHandler: staticHandler,
  searchHandler: staticHandler,
  webhooksHandler: staticHandler,
  subscriberJourneyHandler: staticHandler,
});
const missingTenantBrandingApp = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminGovernanceHandler: staticHandler,
  adminRetentionLegalHoldHandler: staticHandler,
  adminSupportOperationsHandler: staticHandler,
  adminWebhooksApiAccessHandler: staticHandler,
  fileStorageHandler: staticHandler,
  searchHandler: staticHandler,
  webhooksHandler: staticHandler,
  subscriberJourneyHandler: staticHandler,
});
const routeResponse = await app.request(
  new Request('http://localhost' + adminTenantBrandingApiBasePath + '/custom-domains/requests', {
    method: 'POST',
  }),
);
const supportViewRouteResponse = await app.request(
  new Request('http://localhost' + adminTenantBrandingApiBasePath + '/support-view?scope=organization&scopeId=org_1', {
    method: 'GET',
  }),
);
const transitionRouteResponse = await app.request(
  new Request('http://localhost' + adminTenantBrandingApiBasePath + '/custom-domains/lifecycle', {
    method: 'POST',
  }),
);
const publishAssetRouteResponse = await app.request(
  new Request('http://localhost' + adminTenantBrandingApiBasePath + '/assets/publish', {
    method: 'POST',
  }),
);
const missingRouteResponse = await missingTenantBrandingApp.request(
  new Request('http://localhost' + adminTenantBrandingApiBasePath + '/custom-domains/requests', {
    method: 'POST',
  }),
);
console.log(JSON.stringify({
  requestRef: document.paths[adminTenantBrandingApiPath.requestCustomDomainVerification]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  responseRef: document.paths[adminTenantBrandingApiPath.requestCustomDomainVerification]?.post?.responses?.['201']?.content?.['application/json']?.schema?.$ref,
  parameterNames: (document.paths[adminTenantBrandingApiPath.requestCustomDomainVerification]?.post?.parameters ?? []).map((parameter) => parameter.name),
  transitionRequestRef: document.paths[adminTenantBrandingApiPath.transitionCurrentCustomDomainVerification]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  transitionResponseRef: document.paths[adminTenantBrandingApiPath.transitionCurrentCustomDomainVerification]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  transitionParameterNames: (document.paths[adminTenantBrandingApiPath.transitionCurrentCustomDomainVerification]?.post?.parameters ?? []).map((parameter) => parameter.name),
  transitionDescription: document.paths[adminTenantBrandingApiPath.transitionCurrentCustomDomainVerification]?.post?.responses?.['200']?.description,
  publishAssetRequestRef: document.paths[adminTenantBrandingApiPath.publishAssetReference]?.post?.requestBody?.content?.['application/json']?.schema?.$ref,
  publishAssetResponseRef: document.paths[adminTenantBrandingApiPath.publishAssetReference]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  publishAssetParameterNames: (document.paths[adminTenantBrandingApiPath.publishAssetReference]?.post?.parameters ?? []).map((parameter) => parameter.name),
  publishAssetDescription: document.paths[adminTenantBrandingApiPath.publishAssetReference]?.post?.responses?.['200']?.description,
  supportViewResponseRef: document.paths[adminTenantBrandingApiPath.getSupportSafeView]?.get?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  supportViewParameterNames: (document.paths[adminTenantBrandingApiPath.getSupportSafeView]?.get?.parameters ?? []).map((parameter) => parameter.name),
  supportViewDescription: document.paths[adminTenantBrandingApiPath.getSupportSafeView]?.get?.responses?.['200']?.description,
  forbiddenDescription: document.paths[adminTenantBrandingApiPath.requestCustomDomainVerification]?.post?.responses?.['403']?.description,
  conflictDescription: document.paths[adminTenantBrandingApiPath.requestCustomDomainVerification]?.post?.responses?.['409']?.description,
  scopeEnum: document.components.schemas.RequestCustomDomainVerificationHttpRequest?.properties?.scope?.enum,
  publishAssetScopeEnum: document.components.schemas.PublishTenantBrandingAssetHttpRequest?.properties?.scope?.enum,
  requestProperties: Object.keys(document.components.schemas.RequestCustomDomainVerificationHttpRequest?.properties ?? {}),
  transitionRequestProperties: Object.keys(document.components.schemas.TransitionCustomDomainVerificationHttpRequest?.properties ?? {}),
  publishAssetRequestProperties: Object.keys(document.components.schemas.PublishTenantBrandingAssetHttpRequest?.properties ?? {}),
  routeStatus: routeResponse.status,
  routeBody: await routeResponse.json(),
  transitionRouteStatus: transitionRouteResponse.status,
  transitionRouteBody: await transitionRouteResponse.json(),
  publishAssetRouteStatus: publishAssetRouteResponse.status,
  publishAssetRouteBody: await publishAssetRouteResponse.json(),
  supportViewRouteStatus: supportViewRouteResponse.status,
  supportViewRouteBody: await supportViewRouteResponse.json(),
  missingRouteStatus: missingRouteResponse.status,
  missingRouteBody: await missingRouteResponse.json(),
  subscriberJourneySessionHeaderName,
}));`,
    ],
    {
      cwd: process.cwd(),
    },
  );

  if (proc.status !== 0) {
    throw new Error(
      `Bun runtime probe failed:\n${(proc.stderr ?? "").toString()}`,
    );
  }

  return JSON.parse((proc.stdout ?? "").toString()) as {
    readonly requestRef?: string;
    readonly responseRef?: string;
    readonly parameterNames: readonly string[];
    readonly transitionRequestRef?: string;
    readonly transitionResponseRef?: string;
    readonly transitionParameterNames: readonly string[];
    readonly transitionDescription?: string;
    readonly publishAssetRequestRef?: string;
    readonly publishAssetResponseRef?: string;
    readonly publishAssetParameterNames: readonly string[];
    readonly publishAssetDescription?: string;
    readonly supportViewResponseRef?: string;
    readonly supportViewParameterNames: readonly string[];
    readonly supportViewDescription?: string;
    readonly forbiddenDescription?: string;
    readonly conflictDescription?: string;
    readonly scopeEnum?: readonly string[];
    readonly publishAssetScopeEnum?: readonly string[];
    readonly requestProperties: readonly string[];
    readonly transitionRequestProperties: readonly string[];
    readonly publishAssetRequestProperties: readonly string[];
    readonly routeStatus: number;
    readonly routeBody: {
      readonly route: string;
    };
    readonly transitionRouteStatus: number;
    readonly transitionRouteBody: {
      readonly route: string;
    };
    readonly publishAssetRouteStatus: number;
    readonly publishAssetRouteBody: {
      readonly route: string;
    };
    readonly supportViewRouteStatus: number;
    readonly supportViewRouteBody: {
      readonly route: string;
    };
    readonly missingRouteStatus: number;
    readonly missingRouteBody: {
      readonly error: string;
    };
    readonly subscriberJourneySessionHeaderName: string;
  };
};

describe("platform backend api tenant-branding transport", () => {
  it("documents and mounts the tenant-branding backend route", () => {
    const probe = runBackendApiTenantBrandingProbe();

    expect(probe.requestRef).toBe(
      "#/components/schemas/RequestCustomDomainVerificationHttpRequest",
    );
    expect(probe.responseRef).toBe(
      "#/components/schemas/CustomDomainVerificationAdminView",
    );
    expect(probe.transitionRequestRef).toBe(
      "#/components/schemas/TransitionCustomDomainVerificationHttpRequest",
    );
    expect(probe.transitionResponseRef).toBe(
      "#/components/schemas/CustomDomainVerificationAdminView",
    );
    expect(probe.publishAssetRequestRef).toBe(
      "#/components/schemas/PublishTenantBrandingAssetHttpRequest",
    );
    expect(probe.publishAssetResponseRef).toBe(
      "#/components/schemas/TenantBrandingPublishedAssetReferenceView",
    );
    expect(probe.supportViewResponseRef).toBe(
      "#/components/schemas/TenantBrandingSupportSafeView",
    );
    expect(probe.parameterNames).toEqual([
      probe.subscriberJourneySessionHeaderName,
    ]);
    expect(probe.transitionParameterNames).toEqual([
      probe.subscriberJourneySessionHeaderName,
    ]);
    expect(probe.publishAssetParameterNames).toEqual([
      probe.subscriberJourneySessionHeaderName,
    ]);
    expect(probe.supportViewParameterNames).toEqual([
      probe.subscriberJourneySessionHeaderName,
      "scope",
      "scopeId",
    ]);
    expect(probe.transitionDescription).toBe(
      "Tenant custom-domain lifecycle updated.",
    );
    expect(probe.publishAssetDescription).toBe(
      "Tenant-branding asset reference published.",
    );
    expect(probe.supportViewDescription).toBe(
      "Tenant-branding support-safe view resolved.",
    );
    expect(probe.forbiddenDescription).toBe(
      "Tenant branding management is not allowed for this session.",
    );
    expect(probe.conflictDescription).toBe(
      "Custom domain verification already exists for this host.",
    );
    expect(probe.scopeEnum).toEqual(["enterprise", "organization"]);
    expect(probe.publishAssetScopeEnum).toEqual([
      "platform",
      "enterprise",
      "organization",
    ]);
    expect(probe.requestProperties).toEqual([
      "scope",
      "scopeId",
      "requestedHost",
    ]);
    expect(probe.transitionRequestProperties).toEqual([
      "scope",
      "scopeId",
      "lifecycleState",
      "approvalNotes",
    ]);
    expect(probe.publishAssetRequestProperties).toEqual([
      "scope",
      "scopeId",
      "assetKind",
      "fileId",
    ]);
    expect(probe.requestProperties).not.toContain("sessionId");
    expect(probe.transitionRequestProperties).not.toContain("sessionId");
    expect(probe.publishAssetRequestProperties).not.toContain("sessionId");
    expect(probe.routeStatus).toBe(200);
    expect(probe.routeBody).toEqual({ route: "tenant-branding" });
    expect(probe.transitionRouteStatus).toBe(200);
    expect(probe.transitionRouteBody).toEqual({ route: "tenant-branding" });
    expect(probe.publishAssetRouteStatus).toBe(200);
    expect(probe.publishAssetRouteBody).toEqual({ route: "tenant-branding" });
    expect(probe.supportViewRouteStatus).toBe(200);
    expect(probe.supportViewRouteBody).toEqual({ route: "tenant-branding" });
    expect(probe.missingRouteStatus).toBe(404);
    expect(probe.missingRouteBody).toEqual({
      error: "Admin tenant branding route not found.",
    });
  }, 30_000);
});
