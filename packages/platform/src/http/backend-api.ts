import { Effect } from "effect";
import { H3, fromWebHandler } from "h3-v2";
import {
  backendApiDocsAssetPath,
  backendApiDocsPath,
  backendApiOpenApiPath,
  handleBackendApiDocumentationRequest,
} from "./openapi";
import {
  createBackendApiObservabilityTelemetryEmitter,
  createBackendApiRequestMiddleware,
  type BackendApiRequestMiddleware,
} from "./request-middleware";
import {
  adminBillingApiBasePath,
  handleAdminBillingHttpRequest,
} from "../services/domains/admin-billing-http";
import {
  adminGovernanceApiBasePath,
  handleAdminGovernanceHttpRequest,
} from "../services/governance/admin-governance-http";
import { handleSubscriberJourneyHttpRequest } from "../services/domains/subscriber-journey-http";
import {
  handleWebhooksApiHttpRequest,
  webhooksApiBasePath,
} from "../services/communication/webhooks-api-access-http";

export type BackendApiWebHandler = (
  request: Request,
) => Response | Promise<Response>;

export type BackendApiAppOptions = {
  readonly adminBillingHandler: BackendApiWebHandler;
  readonly adminGovernanceHandler: BackendApiWebHandler;
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
    adminBillingApiBasePath,
    wrapHandler(options.adminBillingHandler),
  );
  registerFullPathWebHandler(
    app,
    adminGovernanceApiBasePath,
    wrapHandler(options.adminGovernanceHandler),
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
  const requestMiddleware = createBackendApiRequestMiddleware({
    ...(telemetryEmitter !== undefined
      ? { emitRequestTelemetry: telemetryEmitter }
      : {}),
  });
  const app = createBackendApiApp({
    adminBillingHandler: fromEffectResponseHandler((request) =>
      handleAdminBillingHttpRequest(environment, request),
    ),
    adminGovernanceHandler: fromEffectResponseHandler((request) =>
      handleAdminGovernanceHttpRequest(environment, request),
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
