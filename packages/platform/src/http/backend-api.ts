import { Effect } from "effect";
import { H3, fromWebHandler } from "h3-v2";
import {
  backendApiDocsAssetPath,
  backendApiDocsPath,
  backendApiOpenApiPath,
  handleBackendApiDocumentationRequest,
} from "./openapi";
import { backendApiHealthPath, createBackendApiHealthHandler } from "./health";
import {
  createBackendApiObservabilityErrorReporter,
  createBackendApiObservabilityTelemetryEmitter,
  createBackendApiRequestMiddleware,
  type BackendApiRequestMiddleware,
} from "./request-middleware";
import { createNotFoundResponse } from "../services/communication/http-transport";
import {
  adminEmailDeliveryApiBasePath,
  handleAdminEmailDeliveryHttpRequest,
} from "../services/communication/admin-email-delivery-http";
import {
  adminNotificationCenterApiBasePath,
  handleAdminNotificationCenterHttpRequest,
} from "../services/communication/admin-notification-center-http";
import {
  emailDeliveryApiBasePath,
  handleEmailDeliveryHttpRequest,
} from "../services/communication/email-delivery-http";
import {
  adminBillingApiBasePath,
  handleAdminBillingHttpRequest,
} from "../services/domains/admin-billing-http";
import {
  adminTenantManagementApiBasePath,
  handleAdminTenantManagementHttpRequest,
} from "../services/domains/admin-tenant-management-http";
import {
  adminTenantBrandingApiBasePath,
  handleAdminTenantBrandingHttpRequest,
} from "../services/domains/tenant-branding-http";
import {
  fileStorageApiBasePath,
  handleFileStorageHttpRequest,
} from "../services/domains/file-storage-http";
import {
  handleImportExportHttpRequest,
  importExportApiBasePath,
} from "../services/domains/import-export-http";
import {
  handleSearchHttpRequest,
  searchApiBasePath,
  searchTenantApiBasePath,
} from "../services/domains/search-http";
import {
  adminGovernanceApiBasePath,
  handleAdminGovernanceHttpRequest,
} from "../services/governance/admin-governance-http";
import {
  adminRetentionLegalHoldApiBasePath,
  handleAdminRetentionLegalHoldHttpRequest,
} from "../services/governance/admin-retention-legal-hold-http";
import {
  adminSupportOperationsApiBasePath,
  handleAdminSupportOperationsHttpRequest,
} from "../services/governance/support-operations-http";
import { handleSubscriberJourneyHttpRequest } from "../services/domains/subscriber-journey-http";
import {
  adminWebhooksApiAccessApiBasePath,
  createAdminWebhooksApiAccessRequestHandler,
} from "../services/communication/admin-webhooks-api-access-http";
import {
  handleWebhooksApiHttpRequest,
  webhooksApiBasePath,
} from "../services/communication/webhooks-api-access-http";
import {
  handleTenantInvitationRedemptionHttpRequest,
  tenantInvitationRedemptionApiBasePath,
} from "../services/domains/tenant-invitation-redemption-http";
import {
  handleWorkflowJobsHttpRequest,
  workflowJobsApiBasePath,
} from "../services/domains/workflow-jobs-http";

export type BackendApiWebHandler = (
  request: Request,
) => Response | Promise<Response>;

export type BackendApiAppOptions = {
  readonly healthHandler?: BackendApiWebHandler;
  readonly adminBillingHandler: BackendApiWebHandler;
  readonly adminEmailDeliveryHandler?: BackendApiWebHandler;
  readonly adminNotificationCenterHandler?: BackendApiWebHandler;
  readonly emailDeliveryHandler?: BackendApiWebHandler;
  readonly adminTenantBrandingHandler?: BackendApiWebHandler;
  readonly adminTenantManagementHandler?: BackendApiWebHandler;
  readonly adminGovernanceHandler: BackendApiWebHandler;
  readonly adminRetentionLegalHoldHandler: BackendApiWebHandler;
  readonly adminSupportOperationsHandler: BackendApiWebHandler;
  readonly adminWebhooksApiAccessHandler: BackendApiWebHandler;
  readonly fileStorageHandler?: BackendApiWebHandler;
  readonly importExportHandler?: BackendApiWebHandler;
  readonly searchHandler?: BackendApiWebHandler;
  readonly tenantInvitationRedemptionHandler?: BackendApiWebHandler;
  readonly workflowJobsHandler?: BackendApiWebHandler;
  readonly webhooksHandler: BackendApiWebHandler;
  readonly subscriberJourneyHandler: BackendApiWebHandler;
  readonly requestMiddleware?: BackendApiRequestMiddleware;
};

const fromEffectResponseHandler =
  <E>(
    handler: (request: Request) => Effect.Effect<Response, E>,
  ): BackendApiWebHandler =>
  (request) =>
    Effect.runPromise(handler(request));

const registerFullPathWebHandler = (
  app: H3,
  path: string,
  handler: BackendApiWebHandler,
) => {
  const wrapped = fromWebHandler(async (request) => handler(request));

  app.all(path, wrapped);
  app.all(`${path}/**`, wrapped);
};

const registerExactPathWebHandler = (
  app: H3,
  path: string,
  handler: BackendApiWebHandler,
) => {
  const wrapped = fromWebHandler(async (request) => handler(request));

  app.all(path, wrapped);
};

export const createBackendApiApp = (options: BackendApiAppOptions): H3 => {
  const app = new H3();
  const wrapHandler = (handler: BackendApiWebHandler) =>
    options.requestMiddleware?.wrap(handler) ?? handler;
  const healthHandler =
    options.healthHandler ??
    (() => createNotFoundResponse("Health route not found."));
  const adminEmailDeliveryHandler =
    options.adminEmailDeliveryHandler ??
    (() => createNotFoundResponse("Admin email delivery route not found."));
  const adminNotificationCenterHandler =
    options.adminNotificationCenterHandler ??
    (() =>
      createNotFoundResponse("Admin notification center route not found."));
  const emailDeliveryHandler =
    options.emailDeliveryHandler ??
    (() => createNotFoundResponse("Email delivery route not found."));
  const adminTenantBrandingHandler =
    options.adminTenantBrandingHandler ??
    (() => createNotFoundResponse("Admin tenant branding route not found."));
  const adminTenantManagementHandler =
    options.adminTenantManagementHandler ??
    (() => createNotFoundResponse("Admin tenant management route not found."));
  const fileStorageHandler =
    options.fileStorageHandler ??
    (() => createNotFoundResponse("File storage route not found."));
  const importExportHandler =
    options.importExportHandler ??
    (() => createNotFoundResponse("Import export route not found."));
  const searchHandler =
    options.searchHandler ??
    (() => createNotFoundResponse("Search route not found."));
  const tenantInvitationRedemptionHandler =
    options.tenantInvitationRedemptionHandler ??
    (() =>
      createNotFoundResponse("Tenant invitation redemption route not found."));
  const workflowJobsHandler =
    options.workflowJobsHandler ??
    (() => createNotFoundResponse("Workflow jobs route not found."));

  registerExactPathWebHandler(
    app,
    backendApiHealthPath.live,
    wrapHandler(healthHandler),
  );
  registerExactPathWebHandler(
    app,
    backendApiHealthPath.ready,
    wrapHandler(healthHandler),
  );

  registerExactPathWebHandler(app, backendApiOpenApiPath, (request) =>
    wrapHandler((currentRequest) =>
      handleBackendApiDocumentationRequest(currentRequest),
    )(request),
  );
  registerExactPathWebHandler(app, backendApiDocsPath, (request) =>
    wrapHandler((currentRequest) =>
      handleBackendApiDocumentationRequest(currentRequest),
    )(request),
  );
  registerExactPathWebHandler(
    app,
    backendApiDocsAssetPath.swaggerUiCss,
    (request) =>
      wrapHandler((currentRequest) =>
        handleBackendApiDocumentationRequest(currentRequest),
      )(request),
  );
  registerExactPathWebHandler(
    app,
    backendApiDocsAssetPath.swaggerUiBundle,
    (request) =>
      wrapHandler((currentRequest) =>
        handleBackendApiDocumentationRequest(currentRequest),
      )(request),
  );
  registerExactPathWebHandler(
    app,
    backendApiDocsAssetPath.swaggerUiStandalonePreset,
    (request) =>
      wrapHandler((currentRequest) =>
        handleBackendApiDocumentationRequest(currentRequest),
      )(request),
  );

  registerFullPathWebHandler(
    app,
    adminEmailDeliveryApiBasePath,
    wrapHandler(adminEmailDeliveryHandler),
  );
  registerFullPathWebHandler(
    app,
    adminNotificationCenterApiBasePath,
    wrapHandler(adminNotificationCenterHandler),
  );
  registerFullPathWebHandler(
    app,
    emailDeliveryApiBasePath,
    wrapHandler(emailDeliveryHandler),
  );
  registerFullPathWebHandler(
    app,
    adminBillingApiBasePath,
    wrapHandler(options.adminBillingHandler),
  );
  registerFullPathWebHandler(
    app,
    adminTenantBrandingApiBasePath,
    wrapHandler(adminTenantBrandingHandler),
  );
  registerFullPathWebHandler(
    app,
    adminTenantManagementApiBasePath,
    wrapHandler(adminTenantManagementHandler),
  );
  registerFullPathWebHandler(
    app,
    adminGovernanceApiBasePath,
    wrapHandler(options.adminGovernanceHandler),
  );
  registerFullPathWebHandler(
    app,
    adminRetentionLegalHoldApiBasePath,
    wrapHandler(options.adminRetentionLegalHoldHandler),
  );
  registerFullPathWebHandler(
    app,
    adminSupportOperationsApiBasePath,
    wrapHandler(options.adminSupportOperationsHandler),
  );
  registerFullPathWebHandler(
    app,
    adminWebhooksApiAccessApiBasePath,
    wrapHandler(options.adminWebhooksApiAccessHandler),
  );
  registerFullPathWebHandler(
    app,
    fileStorageApiBasePath,
    wrapHandler(fileStorageHandler),
  );
  registerFullPathWebHandler(
    app,
    importExportApiBasePath,
    wrapHandler(importExportHandler),
  );
  registerFullPathWebHandler(
    app,
    searchApiBasePath,
    wrapHandler(searchHandler),
  );
  registerFullPathWebHandler(
    app,
    searchTenantApiBasePath,
    wrapHandler(searchHandler),
  );
  registerFullPathWebHandler(
    app,
    tenantInvitationRedemptionApiBasePath,
    wrapHandler(tenantInvitationRedemptionHandler),
  );
  registerFullPathWebHandler(
    app,
    workflowJobsApiBasePath,
    wrapHandler(workflowJobsHandler),
  );
  registerFullPathWebHandler(
    app,
    webhooksApiBasePath,
    wrapHandler(options.webhooksHandler),
  );
  app.all(
    "/**",
    fromWebHandler(async (request) =>
      wrapHandler(options.subscriberJourneyHandler)(request),
    ),
  );

  return app;
};

export const createBackendApiRequestHandler = (environment: unknown) => {
  const telemetryEmitter =
    createBackendApiObservabilityTelemetryEmitter(environment);
  const errorReporter = createBackendApiObservabilityErrorReporter(environment);
  const requestMiddleware = createBackendApiRequestMiddleware({
    environment,
    ...(telemetryEmitter !== undefined
      ? { emitRequestTelemetry: telemetryEmitter }
      : {}),
    ...(errorReporter !== undefined
      ? { reportUnhandledRequestError: errorReporter }
      : {}),
  });
  const adminWebhooksApiAccessHandler =
    createAdminWebhooksApiAccessRequestHandler(environment);
  const app = createBackendApiApp({
    healthHandler: createBackendApiHealthHandler({
      environment,
    }),
    adminEmailDeliveryHandler: fromEffectResponseHandler((request) =>
      handleAdminEmailDeliveryHttpRequest(environment, request),
    ),
    adminNotificationCenterHandler: fromEffectResponseHandler((request) =>
      handleAdminNotificationCenterHttpRequest(environment, request),
    ),
    emailDeliveryHandler: fromEffectResponseHandler((request) =>
      handleEmailDeliveryHttpRequest(environment, request),
    ),
    adminBillingHandler: fromEffectResponseHandler((request) =>
      handleAdminBillingHttpRequest(environment, request),
    ),
    adminTenantBrandingHandler: fromEffectResponseHandler((request) =>
      handleAdminTenantBrandingHttpRequest(environment, request),
    ),
    adminTenantManagementHandler: fromEffectResponseHandler((request) =>
      handleAdminTenantManagementHttpRequest(environment, request),
    ),
    adminGovernanceHandler: fromEffectResponseHandler((request) =>
      handleAdminGovernanceHttpRequest(environment, request),
    ),
    adminRetentionLegalHoldHandler: fromEffectResponseHandler((request) =>
      handleAdminRetentionLegalHoldHttpRequest(environment, request),
    ),
    adminSupportOperationsHandler: fromEffectResponseHandler((request) =>
      handleAdminSupportOperationsHttpRequest(environment, request),
    ),
    adminWebhooksApiAccessHandler: fromEffectResponseHandler((request) =>
      adminWebhooksApiAccessHandler(request),
    ),
    fileStorageHandler: fromEffectResponseHandler((request) =>
      handleFileStorageHttpRequest(environment, request),
    ),
    importExportHandler: fromEffectResponseHandler((request) =>
      handleImportExportHttpRequest(environment, request),
    ),
    searchHandler: fromEffectResponseHandler((request) =>
      handleSearchHttpRequest(environment, request),
    ),
    tenantInvitationRedemptionHandler: fromEffectResponseHandler((request) =>
      handleTenantInvitationRedemptionHttpRequest(environment, request),
    ),
    workflowJobsHandler: fromEffectResponseHandler((request) =>
      handleWorkflowJobsHttpRequest(environment, request),
    ),
    webhooksHandler: fromEffectResponseHandler((request) =>
      handleWebhooksApiHttpRequest(environment, request),
    ),
    subscriberJourneyHandler: fromEffectResponseHandler((request) =>
      handleSubscriberJourneyHttpRequest(environment, request),
    ),
    requestMiddleware,
  });

  return (request: Request) => app.request(request);
};
