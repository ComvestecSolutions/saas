import { spawnSync } from "child_process";

// Stable path constant – must match backendApiOpenApiPath in openapi-document.ts.
const backendApiOpenApiPath = "/api/openapi.json";

const runOpenApiRuntimeProbe = () => {
  const proc = spawnSync(
    "bun",
    [
      "-e",
      `import { backendApiDocsAssetPath, backendApiDocsPath, backendApiOpenApiPath, handleBackendApiDocumentationRequest } from './packages/platform/src/http/openapi.ts';
import { createBackendApiOpenApiDocument } from './packages/platform/src/http/openapi-document.ts';

const document = createBackendApiOpenApiDocument('http://localhost');

const openApiResponse = handleBackendApiDocumentationRequest(new Request('http://localhost' + backendApiOpenApiPath));
const openApiDocument = await openApiResponse.json();
const docsResponse = handleBackendApiDocumentationRequest(new Request('http://localhost' + backendApiDocsPath));
const docsHtml = await docsResponse.text();
const cssResponse = handleBackendApiDocumentationRequest(new Request('http://localhost' + backendApiDocsAssetPath.swaggerUiCss));
const cssText = await cssResponse.text();
const methodResponse = handleBackendApiDocumentationRequest(new Request('http://localhost' + backendApiDocsPath, { method: 'POST' }));
console.log(JSON.stringify({
  backendApiDocsPath,
  backendApiDocsAssetPath,
  documentOpenApi: document.openapi,
  documentTitle: document.info.title,
  documentServers: document.servers,
  documentHasPlansPath: Boolean(document.paths['/api/subscriber-journey/billing/plans']),
  documentHasAdminBillingPath: Boolean(document.paths['/api/admin/billing/plans']),
  documentHasAdminBillingRepairGapsPath: Boolean(document.paths['/api/admin/billing/repair-gaps']),
  documentHasAdminBillingRepairGaps405Response: Boolean(document.paths['/api/admin/billing/repair-gaps']?.get?.responses?.['405']),
  documentAdminBillingRepairGapsDescription: document.paths['/api/admin/billing/repair-gaps']?.get?.description,
  documentHasAdminBillingRepairReplayPath: Boolean(document.paths['/api/admin/billing/repair-gaps/replays']),
  documentAdminBillingRepairReplay401Description: document.paths['/api/admin/billing/repair-gaps/replays']?.post?.responses?.['401']?.description,
  documentAdminBillingRepairReplay403Description: document.paths['/api/admin/billing/repair-gaps/replays']?.post?.responses?.['403']?.description,
  documentHasAdminBillingRepairReplay409Response: Boolean(document.paths['/api/admin/billing/repair-gaps/replays']?.post?.responses?.['409']),
  documentHasWebhookPath: Boolean(document.paths['/api/subscriber-journey/billing/webhooks/polar']),
  documentHasProductBootstrapResultSchema: Boolean(document.components.schemas.ProductBootstrapResult),
  documentHasPlatformModuleIdSchema: Boolean(document.components.schemas.PlatformModuleId),
  documentProductBootstrapResultRequired: document.components.schemas.ProductBootstrapResult?.required ?? [],
  documentProductBootstrapResultProperties: Object.keys(document.components.schemas.ProductBootstrapResult?.properties ?? {}),
  documentProductBootstrapEnabledModuleItemRef: document.components.schemas.ProductBootstrapResult?.properties?.enabledModules?.items?.$ref,
  documentHasRequestContextSchema: Boolean(document.components.schemas.RequestContext),
  documentHasStartAuthSchema: Boolean(document.components.schemas.StartAuthenticationRequest),
  documentHasErrorResponseSchema: Boolean(document.components.schemas.ErrorResponse),
  openApiStatus: openApiResponse.status,
  openApiContentType: openApiResponse.headers.get('Content-Type'),
  hasGovernancePath: Boolean(openApiDocument.paths['/api/admin/governance/runtime-config/overrides/list']),
  governanceRead401Description: openApiDocument.paths['/api/admin/governance/runtime-config/overrides/list']?.post?.responses?.['401']?.description,
  governanceRead403Description: openApiDocument.paths['/api/admin/governance/runtime-config/overrides/list']?.post?.responses?.['403']?.description,
  governanceProposalRead401Description: openApiDocument.paths['/api/admin/governance/runtime-config/proposals/list']?.post?.responses?.['401']?.description,
  governanceProposalRead403Description: openApiDocument.paths['/api/admin/governance/runtime-config/proposals/list']?.post?.responses?.['403']?.description,
  governanceAuditRead401Description: openApiDocument.paths['/api/admin/governance/audit-log/query-by-module']?.post?.responses?.['401']?.description,
  governanceAuditRead403Description: openApiDocument.paths['/api/admin/governance/audit-log/query-by-module']?.post?.responses?.['403']?.description,
  docsStatus: docsResponse.status,
  docsContentType: docsResponse.headers.get('Content-Type'),
  docsHtml,
  cssStatus: cssResponse.status,
  cssContentType: cssResponse.headers.get('Content-Type'),
  cssHasSwaggerUi: cssText.includes('.swagger-ui'),
  methodStatus: methodResponse.status,
  methodAllow: methodResponse.headers.get('Allow'),
  methodBody: await methodResponse.json(),
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
    readonly backendApiDocsPath: string;
    readonly backendApiDocsAssetPath: {
      readonly swaggerUiCss: string;
      readonly swaggerUiBundle: string;
    };
    readonly documentOpenApi: string;
    readonly documentTitle: string;
    readonly documentServers: readonly {
      readonly url: string;
      readonly description?: string;
    }[];
    readonly documentHasPlansPath: boolean;
    readonly documentHasAdminBillingPath: boolean;
    readonly documentHasAdminBillingRepairGapsPath: boolean;
    readonly documentHasAdminBillingRepairGaps405Response: boolean;
    readonly documentAdminBillingRepairGapsDescription?: string;
    readonly documentHasAdminBillingRepairReplayPath: boolean;
    readonly documentAdminBillingRepairReplay401Description?: string;
    readonly documentAdminBillingRepairReplay403Description?: string;
    readonly documentHasAdminBillingRepairReplay409Response: boolean;
    readonly documentHasWebhookPath: boolean;
    readonly documentHasProductBootstrapResultSchema: boolean;
    readonly documentHasPlatformModuleIdSchema: boolean;
    readonly documentProductBootstrapResultRequired: readonly string[];
    readonly documentProductBootstrapResultProperties: readonly string[];
    readonly documentProductBootstrapEnabledModuleItemRef?: string;
    readonly documentHasRequestContextSchema: boolean;
    readonly documentHasStartAuthSchema: boolean;
    readonly documentHasErrorResponseSchema: boolean;
    readonly openApiStatus: number;
    readonly openApiContentType: string;
    readonly hasGovernancePath: boolean;
    readonly governanceRead401Description?: string;
    readonly governanceRead403Description?: string;
    readonly governanceProposalRead401Description?: string;
    readonly governanceProposalRead403Description?: string;
    readonly governanceAuditRead401Description?: string;
    readonly governanceAuditRead403Description?: string;
    readonly docsStatus: number;
    readonly docsContentType: string;
    readonly docsHtml: string;
    readonly cssStatus: number;
    readonly cssContentType: string;
    readonly cssHasSwaggerUi: boolean;
    readonly methodStatus: number;
    readonly methodAllow: string;
    readonly methodBody: {
      readonly error: string;
    };
  };
};

describe("platform backend api", () => {
  it("builds a generated OpenAPI document and serves Swagger UI via the runtime docs handler", () => {
    const probe = runOpenApiRuntimeProbe();

    // Generated document structure
    expect(probe.documentOpenApi).toBe("3.1.0");
    expect(probe.documentTitle).toBe("Comvestec Backend API");
    expect(probe.documentServers).toEqual([
      {
        url: "http://localhost",
        description: "Active backend API origin",
      },
    ]);
    expect(probe.documentHasPlansPath).toBe(true);
    expect(probe.documentHasAdminBillingPath).toBe(true);
    expect(probe.documentHasAdminBillingRepairGapsPath).toBe(true);
    expect(probe.documentHasAdminBillingRepairGaps405Response).toBe(true);
    expect(probe.documentAdminBillingRepairGapsDescription).toBe(
      "Lists unresolved scheduled, blocked, and stale running billing repair gaps for platform operators.",
    );
    expect(probe.documentHasAdminBillingRepairReplayPath).toBe(true);
    expect(probe.documentAdminBillingRepairReplay401Description).toBe(
      "Authenticated operator session and a Keycloak bearer token accepted for Convex execution are required for repair replay execution.",
    );
    expect(probe.documentAdminBillingRepairReplay403Description).toBe(
      "Billing repair replay requires authorized platform-operator access and a decodable Convex token whose subject matches the operator session.",
    );
    expect(probe.documentHasAdminBillingRepairReplay409Response).toBe(true);
    expect(probe.documentHasWebhookPath).toBe(true);
    expect(probe.documentHasProductBootstrapResultSchema).toBe(true);
    expect(probe.documentHasPlatformModuleIdSchema).toBe(true);
    expect(probe.documentProductBootstrapResultRequired).toEqual([
      "requestContext",
      "authorization",
    ]);
    expect(probe.documentProductBootstrapResultProperties).toEqual(
      expect.arrayContaining([
        "requestContext",
        "authorization",
        "snapshot",
        "billingStatus",
        "enabledModules",
      ]),
    );
    expect(probe.documentProductBootstrapResultProperties).not.toContain(
      "entitlements",
    );
    expect(probe.documentProductBootstrapEnabledModuleItemRef).toBe(
      "#/components/schemas/PlatformModuleId",
    );
    expect(probe.documentHasRequestContextSchema).toBe(true);
    expect(probe.documentHasStartAuthSchema).toBe(true);
    expect(probe.documentHasErrorResponseSchema).toBe(true);

    // OpenAPI spec route
    expect(probe.openApiStatus).toBe(200);
    expect(probe.openApiContentType).toContain("application/json");
    expect(probe.hasGovernancePath).toBe(true);
    expect(probe.governanceRead401Description).toBe(
      "Admin governance reads require a valid authenticated session with an authenticated operator.",
    );
    expect(probe.governanceRead403Description).toBe(
      "Admin governance reads are restricted to platform and support operators.",
    );
    expect(probe.governanceProposalRead401Description).toBe(
      "Admin governance reads require a valid authenticated session with an authenticated operator.",
    );
    expect(probe.governanceProposalRead403Description).toBe(
      "Admin governance reads are restricted to platform and support operators.",
    );
    expect(probe.governanceAuditRead401Description).toBe(
      "Admin governance reads require a valid authenticated session with an authenticated operator.",
    );
    expect(probe.governanceAuditRead403Description).toBe(
      "Admin governance reads are restricted to platform and support operators.",
    );

    // Swagger UI HTML route
    expect(probe.docsStatus).toBe(200);
    expect(probe.docsContentType).toContain("text/html");
    expect(probe.docsHtml).toContain(backendApiOpenApiPath);
    expect(probe.docsHtml).toContain(
      probe.backendApiDocsAssetPath.swaggerUiBundle,
    );
    expect(probe.docsHtml).toContain("SwaggerUIBundle");

    // Swagger UI CSS asset
    expect(probe.cssStatus).toBe(200);
    expect(probe.cssContentType).toContain("text/css");
    expect(probe.cssHasSwaggerUi).toBe(true);

    // Non-GET method rejection
    expect(probe.methodStatus).toBe(405);
    expect(probe.methodAllow).toBe("GET");
    expect(probe.methodBody).toEqual({
      error: "Method not allowed.",
    });
  });
});
