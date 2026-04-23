import { Effect } from "effect";
import { H3, fromWebHandler } from "h3-v2";
import {
  backendApiDocsAssetPath,
  backendApiDocsPath,
  backendApiOpenApiPath,
  handleBackendApiDocumentationRequest,
} from "./openapi";
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

  registerExactPathWebHandler(app, backendApiOpenApiPath, (request) =>
    handleBackendApiDocumentationRequest(request),
  );
  registerExactPathWebHandler(app, backendApiDocsPath, (request) =>
    handleBackendApiDocumentationRequest(request),
  );
  registerExactPathWebHandler(
    app,
    backendApiDocsAssetPath.swaggerUiCss,
    (request) => handleBackendApiDocumentationRequest(request),
  );
  registerExactPathWebHandler(
    app,
    backendApiDocsAssetPath.swaggerUiBundle,
    (request) => handleBackendApiDocumentationRequest(request),
  );
  registerExactPathWebHandler(
    app,
    backendApiDocsAssetPath.swaggerUiStandalonePreset,
    (request) => handleBackendApiDocumentationRequest(request),
  );

  registerFullPathWebHandler(
    app,
    adminBillingApiBasePath,
    options.adminBillingHandler,
  );
  registerFullPathWebHandler(
    app,
    adminGovernanceApiBasePath,
    options.adminGovernanceHandler,
  );
  registerFullPathWebHandler(app, webhooksApiBasePath, options.webhooksHandler);
  app.all(
    "/**",
    fromWebHandler(async (request) =>
      options.subscriberJourneyHandler(request),
    ),
  );

  return app;
};

export const createBackendApiRequestHandler = (environment: unknown) => {
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
  });

  return (request: Request) => app.request(request);
};
