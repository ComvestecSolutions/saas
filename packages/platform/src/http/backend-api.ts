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
  adminOrganizationApiBasePath,
  handleAdminOrganizationHttpRequest,
} from "../services/communication/admin-organization-http";
import {
  adminSavedViewsApiBasePath,
  handleAdminSavedViewsHttpRequest,
} from "../services/communication/admin-saved-views-http";
import {
  adminWorkspacesApiBasePath,
  handleAdminWorkspacesHttpRequest,
} from "../services/communication/admin-workspaces-http";
import {
  emailDeliveryApiBasePath,
  handleEmailDeliveryHttpRequest,
} from "../services/communication/email-delivery-http";
import {
  handleManualBreakGlassHttpRequest,
  manualBreakGlassApiBasePath,
} from "../services/communication/manual-break-glass-http";
import {
  handleOperationsHomeHttpRequest,
  operationsHomeApiBasePath,
} from "../services/communication/operations-home-http";
import {
  handleOperatorWebhookDeliveryHttpRequest,
  operatorWebhookDeliveryApiBasePath,
} from "../services/communication/operator-webhook-delivery-http";
import {
  handleKeycloakRoleReadHttpRequest,
  keycloakRoleReadApiBasePath,
} from "../services/communication/keycloak-role-read-http";
import {
  handleKeycloakUserReadHttpRequest,
  keycloakUserReadApiBasePath,
} from "../services/communication/keycloak-user-read-http";
import {
  handlePolarCustomerReadHttpRequest,
  polarCustomerReadApiBasePath,
} from "../services/communication/polar-customer-read-http";
import {
  handleOpenMeterMeterReadHttpRequest,
  openMeterMeterReadApiBasePath,
} from "../services/communication/open-meter-meter-read-http";
import {
  handleNovuDeliveriesReadHttpRequest,
  novuDeliveriesReadApiBasePath,
} from "../services/communication/novu-deliveries-read-http";
import {
  handlePostalMailLogReadHttpRequest,
  postalMailLogReadApiBasePath,
} from "../services/communication/postal-mail-log-read-http";
import {
  handleGlitchTipIssuesReadHttpRequest,
  glitchTipIssuesReadApiBasePath,
} from "../services/communication/glitchtip-issues-read-http";
import {
  handleOpenPanelEventsReadHttpRequest,
  openPanelEventsReadApiBasePath,
} from "../services/communication/openpanel-events-read-http";
import {
  handleUniversalSearchHttpRequest,
  universalSearchApiBasePath,
} from "../services/communication/universal-search-http";
import {
  capabilitySnapshotV2ApiBasePath,
  handleCapabilitySnapshotV2HttpRequest,
} from "../services/communication/capability-snapshot-v2-http";
import {
  handleRunAsBannerStateHttpRequest,
  runAsBannerStateApiBasePath,
} from "../services/communication/run-as-banner-state-http";
import {
  handleWorkflowRunsAdminHttpRequest,
  workflowRunsAdminApiBasePath,
} from "../services/communication/workflow-runs-admin-http";
import {
  handleNotificationCenterAdminHttpRequest,
  notificationCenterAdminApiBasePath,
} from "../services/communication/notification-center-admin-http";
import {
  handleOpenMeterUsageQueryHttpRequest,
  openMeterUsageQueryApiBasePath,
} from "../services/communication/open-meter-usage-query-http";
import {
  handlePolarRevenueProjectionHttpRequest,
  polarRevenueProjectionApiBasePath,
} from "../services/communication/polar-revenue-projection-http";
import {
  handleTenantWorkspaceHttpRequest,
  tenantWorkspaceApiBasePath,
} from "../services/communication/tenant-workspace-http";
import {
  handleVendorHealthAggregatorHttpRequest,
  vendorHealthAggregatorApiBasePath,
} from "../services/communication/vendor-health-aggregator-http";
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
  readonly adminOrganizationHandler?: BackendApiWebHandler;
  readonly adminSavedViewsHandler?: BackendApiWebHandler;
  readonly adminWorkspacesHandler?: BackendApiWebHandler;
  readonly emailDeliveryHandler?: BackendApiWebHandler;
  readonly manualBreakGlassHandler?: BackendApiWebHandler;
  readonly operationsHomeHandler?: BackendApiWebHandler;
  readonly operatorWebhookDeliveryHandler?: BackendApiWebHandler;
  readonly keycloakRoleReadHandler?: BackendApiWebHandler;
  readonly keycloakUserReadHandler?: BackendApiWebHandler;
  readonly polarCustomerReadHandler?: BackendApiWebHandler;
  readonly openMeterMeterReadHandler?: BackendApiWebHandler;
  readonly novuDeliveriesReadHandler?: BackendApiWebHandler;
  readonly postalMailLogReadHandler?: BackendApiWebHandler;
  readonly glitchTipIssuesReadHandler?: BackendApiWebHandler;
  readonly openPanelEventsReadHandler?: BackendApiWebHandler;
  readonly universalSearchHandler?: BackendApiWebHandler;
  readonly capabilitySnapshotV2Handler?: BackendApiWebHandler;
  readonly runAsBannerStateHandler?: BackendApiWebHandler;
  readonly workflowRunsAdminHandler?: BackendApiWebHandler;
  readonly notificationCenterAdminHandler?: BackendApiWebHandler;
  readonly openMeterUsageQueryHandler?: BackendApiWebHandler;
  readonly polarRevenueProjectionHandler?: BackendApiWebHandler;
  readonly tenantWorkspaceHandler?: BackendApiWebHandler;
  readonly vendorHealthAggregatorHandler?: BackendApiWebHandler;
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
  const adminOrganizationHandler =
    options.adminOrganizationHandler ??
    (() => createNotFoundResponse("Admin organization route not found."));
  const adminSavedViewsHandler =
    options.adminSavedViewsHandler ??
    (() => createNotFoundResponse("Admin saved views route not found."));
  const adminWorkspacesHandler =
    options.adminWorkspacesHandler ??
    (() => createNotFoundResponse("Admin workspaces route not found."));
  const emailDeliveryHandler =
    options.emailDeliveryHandler ??
    (() => createNotFoundResponse("Email delivery route not found."));
  const manualBreakGlassHandler =
    options.manualBreakGlassHandler ??
    (() => createNotFoundResponse("Manual break-glass route not found."));
  const operationsHomeHandler =
    options.operationsHomeHandler ??
    (() => createNotFoundResponse("Operations Home route not found."));
  const operatorWebhookDeliveryHandler =
    options.operatorWebhookDeliveryHandler ??
    (() =>
      createNotFoundResponse("Operator webhook delivery route not found."));
  const openMeterUsageQueryHandler =
    options.openMeterUsageQueryHandler ??
    (() => createNotFoundResponse("OpenMeter usage query route not found."));
  const keycloakRoleReadHandler =
    options.keycloakRoleReadHandler ??
    (() => createNotFoundResponse("Keycloak role read route not found."));
  const keycloakUserReadHandler =
    options.keycloakUserReadHandler ??
    (() => createNotFoundResponse("Keycloak user read route not found."));
  const polarCustomerReadHandler =
    options.polarCustomerReadHandler ??
    (() => createNotFoundResponse("Polar customer read route not found."));
  const openMeterMeterReadHandler =
    options.openMeterMeterReadHandler ??
    (() => createNotFoundResponse("OpenMeter meter read route not found."));
  const novuDeliveriesReadHandler =
    options.novuDeliveriesReadHandler ??
    (() => createNotFoundResponse("Novu deliveries read route not found."));
  const postalMailLogReadHandler =
    options.postalMailLogReadHandler ??
    (() => createNotFoundResponse("Postal mail log read route not found."));
  const glitchTipIssuesReadHandler =
    options.glitchTipIssuesReadHandler ??
    (() => createNotFoundResponse("GlitchTip issues read route not found."));
  const openPanelEventsReadHandler =
    options.openPanelEventsReadHandler ??
    (() => createNotFoundResponse("OpenPanel events read route not found."));
  const universalSearchHandler =
    options.universalSearchHandler ??
    (() => createNotFoundResponse("Universal-search route not found."));
  const capabilitySnapshotV2Handler =
    options.capabilitySnapshotV2Handler ??
    (() => createNotFoundResponse("Capability snapshot v2 route not found."));
  const runAsBannerStateHandler =
    options.runAsBannerStateHandler ??
    (() => createNotFoundResponse("Run-as banner state route not found."));
  const workflowRunsAdminHandler =
    options.workflowRunsAdminHandler ??
    (() => createNotFoundResponse("Workflow-runs admin route not found."));
  const notificationCenterAdminHandler =
    options.notificationCenterAdminHandler ??
    (() =>
      createNotFoundResponse("Notification-center admin route not found."));
  const polarRevenueProjectionHandler =
    options.polarRevenueProjectionHandler ??
    (() => createNotFoundResponse("Polar revenue projection route not found."));
  const tenantWorkspaceHandler =
    options.tenantWorkspaceHandler ??
    (() => createNotFoundResponse("Tenant workspace route not found."));
  const vendorHealthAggregatorHandler =
    options.vendorHealthAggregatorHandler ??
    (() => createNotFoundResponse("Vendor-health aggregator route not found."));
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
    adminOrganizationApiBasePath,
    wrapHandler(adminOrganizationHandler),
  );
  registerFullPathWebHandler(
    app,
    adminSavedViewsApiBasePath,
    wrapHandler(adminSavedViewsHandler),
  );
  registerFullPathWebHandler(
    app,
    adminWorkspacesApiBasePath,
    wrapHandler(adminWorkspacesHandler),
  );
  registerFullPathWebHandler(
    app,
    emailDeliveryApiBasePath,
    wrapHandler(emailDeliveryHandler),
  );
  registerFullPathWebHandler(
    app,
    manualBreakGlassApiBasePath,
    wrapHandler(manualBreakGlassHandler),
  );
  registerFullPathWebHandler(
    app,
    operationsHomeApiBasePath,
    wrapHandler(operationsHomeHandler),
  );
  registerFullPathWebHandler(
    app,
    operatorWebhookDeliveryApiBasePath,
    wrapHandler(operatorWebhookDeliveryHandler),
  );
  registerFullPathWebHandler(
    app,
    polarRevenueProjectionApiBasePath,
    wrapHandler(polarRevenueProjectionHandler),
  );
  registerFullPathWebHandler(
    app,
    openMeterUsageQueryApiBasePath,
    wrapHandler(openMeterUsageQueryHandler),
  );
  registerFullPathWebHandler(
    app,
    keycloakRoleReadApiBasePath,
    wrapHandler(keycloakRoleReadHandler),
  );
  registerFullPathWebHandler(
    app,
    keycloakUserReadApiBasePath,
    wrapHandler(keycloakUserReadHandler),
  );
  registerFullPathWebHandler(
    app,
    polarCustomerReadApiBasePath,
    wrapHandler(polarCustomerReadHandler),
  );
  registerFullPathWebHandler(
    app,
    openMeterMeterReadApiBasePath,
    wrapHandler(openMeterMeterReadHandler),
  );
  registerFullPathWebHandler(
    app,
    novuDeliveriesReadApiBasePath,
    wrapHandler(novuDeliveriesReadHandler),
  );
  registerFullPathWebHandler(
    app,
    postalMailLogReadApiBasePath,
    wrapHandler(postalMailLogReadHandler),
  );
  registerFullPathWebHandler(
    app,
    glitchTipIssuesReadApiBasePath,
    wrapHandler(glitchTipIssuesReadHandler),
  );
  registerFullPathWebHandler(
    app,
    openPanelEventsReadApiBasePath,
    wrapHandler(openPanelEventsReadHandler),
  );
  registerFullPathWebHandler(
    app,
    universalSearchApiBasePath,
    wrapHandler(universalSearchHandler),
  );
  registerFullPathWebHandler(
    app,
    capabilitySnapshotV2ApiBasePath,
    wrapHandler(capabilitySnapshotV2Handler),
  );
  registerFullPathWebHandler(
    app,
    runAsBannerStateApiBasePath,
    wrapHandler(runAsBannerStateHandler),
  );
  registerFullPathWebHandler(
    app,
    workflowRunsAdminApiBasePath,
    wrapHandler(workflowRunsAdminHandler),
  );
  registerFullPathWebHandler(
    app,
    notificationCenterAdminApiBasePath,
    wrapHandler(notificationCenterAdminHandler),
  );
  registerFullPathWebHandler(
    app,
    tenantWorkspaceApiBasePath,
    wrapHandler(tenantWorkspaceHandler),
  );
  registerFullPathWebHandler(
    app,
    vendorHealthAggregatorApiBasePath,
    wrapHandler(vendorHealthAggregatorHandler),
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
    adminOrganizationHandler: fromEffectResponseHandler((request) =>
      handleAdminOrganizationHttpRequest(environment, request),
    ),
    adminSavedViewsHandler: fromEffectResponseHandler((request) =>
      handleAdminSavedViewsHttpRequest(environment, request),
    ),
    adminWorkspacesHandler: fromEffectResponseHandler((request) =>
      handleAdminWorkspacesHttpRequest(environment, request),
    ),
    emailDeliveryHandler: fromEffectResponseHandler((request) =>
      handleEmailDeliveryHttpRequest(environment, request),
    ),
    manualBreakGlassHandler: fromEffectResponseHandler((request) =>
      handleManualBreakGlassHttpRequest(environment, request),
    ),
    operationsHomeHandler: fromEffectResponseHandler((request) =>
      handleOperationsHomeHttpRequest(environment, request),
    ),
    operatorWebhookDeliveryHandler: fromEffectResponseHandler((request) =>
      handleOperatorWebhookDeliveryHttpRequest(environment, request),
    ),
    polarRevenueProjectionHandler: fromEffectResponseHandler((request) =>
      handlePolarRevenueProjectionHttpRequest(environment, request),
    ),
    openMeterUsageQueryHandler: fromEffectResponseHandler((request) =>
      handleOpenMeterUsageQueryHttpRequest(environment, request),
    ),
    keycloakRoleReadHandler: fromEffectResponseHandler((request) =>
      handleKeycloakRoleReadHttpRequest(environment, request),
    ),
    keycloakUserReadHandler: fromEffectResponseHandler((request) =>
      handleKeycloakUserReadHttpRequest(environment, request),
    ),
    polarCustomerReadHandler: fromEffectResponseHandler((request) =>
      handlePolarCustomerReadHttpRequest(environment, request),
    ),
    openMeterMeterReadHandler: fromEffectResponseHandler((request) =>
      handleOpenMeterMeterReadHttpRequest(environment, request),
    ),
    novuDeliveriesReadHandler: fromEffectResponseHandler((request) =>
      handleNovuDeliveriesReadHttpRequest(environment, request),
    ),
    postalMailLogReadHandler: fromEffectResponseHandler((request) =>
      handlePostalMailLogReadHttpRequest(environment, request),
    ),
    glitchTipIssuesReadHandler: fromEffectResponseHandler((request) =>
      handleGlitchTipIssuesReadHttpRequest(environment, request),
    ),
    openPanelEventsReadHandler: fromEffectResponseHandler((request) =>
      handleOpenPanelEventsReadHttpRequest(environment, request),
    ),
    universalSearchHandler: fromEffectResponseHandler((request) =>
      handleUniversalSearchHttpRequest(environment, request),
    ),
    capabilitySnapshotV2Handler: fromEffectResponseHandler((request) =>
      handleCapabilitySnapshotV2HttpRequest(environment, request),
    ),
    runAsBannerStateHandler: fromEffectResponseHandler((request) =>
      handleRunAsBannerStateHttpRequest(environment, request),
    ),
    workflowRunsAdminHandler: fromEffectResponseHandler((request) =>
      handleWorkflowRunsAdminHttpRequest(environment, request),
    ),
    notificationCenterAdminHandler: fromEffectResponseHandler((request) =>
      handleNotificationCenterAdminHttpRequest(environment, request),
    ),
    tenantWorkspaceHandler: fromEffectResponseHandler((request) =>
      handleTenantWorkspaceHttpRequest(environment, request),
    ),
    vendorHealthAggregatorHandler: fromEffectResponseHandler((request) =>
      handleVendorHealthAggregatorHttpRequest(environment, request),
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
