import { spawnSync } from "child_process";
import { subscriberJourneyApiPath } from "@comvestec/platform";

const runBackendApiRequestMiddlewareProbe = () => {
  const proc = spawnSync(
    "bun",
    [
      "-e",
      `import {
  backendApiCorrelationIdHeaderName,
  createBackendApiApp,
  createBackendApiRequestHandler,
  createBackendApiRequestMiddleware,
} from '@comvestec/platform/http';
import {
  createEmailDeliveryHttpHandler,
  emailDeliveryApiPath,
  extractSubscriberJourneySessionIdFromHeader,
  subscriberJourneyApiPath,
  subscriberJourneySessionCookieName,
  subscriberJourneySessionHeaderName,
} from '@comvestec/platform';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { Effect } from 'effect';
import {
  adminGovernanceApiBasePath,
  adminGovernanceApiPath,
} from './packages/platform/src/services/governance/admin-governance-http.ts';
import {
  createWebhooksApiHttpHandler,
  webhooksApiPath,
} from './packages/platform/src/services/communication/webhooks-api-access-http.ts';

const emittedTelemetry = [];
const postalWebhookTestKeyId = 'postal-webhook-test-key';
const postalWebhookTestKeyPair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const postalWebhookTestPublicJwk = {
  ...(postalWebhookTestKeyPair.publicKey.export({
    format: 'jwk',
  })),
  kid: postalWebhookTestKeyId,
  alg: 'RS256',
  use: 'sig',
};
const createSignedPostalWebhookRequest = (body) => {
  const signer = createSign('RSA-SHA256');

  signer.update(body);
  signer.end();

  return new Request('http://localhost' + emailDeliveryApiPath.processPostalProviderEvent, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Postal-Signature-256': signer
        .sign(postalWebhookTestKeyPair.privateKey)
        .toString('base64'),
      'X-Postal-Signature-KID': postalWebhookTestKeyId,
    },
    body,
  });
};

const originalFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.toString();

  if (url === 'http://postal.example/.well-known/jwks.json') {
    return new Response(
      JSON.stringify({
        keys: [postalWebhookTestPublicJwk],
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  }

  return originalFetch(input, init);
};

const successHandler = async (request) =>
  Response.json({
    sessionId: await Effect.runPromise(
      extractSubscriberJourneySessionIdFromHeader(request),
    ),
  });
const jsonEchoHandler = async (request) =>
  Response.json({
    sessionId: await Effect.runPromise(
      extractSubscriberJourneySessionIdFromHeader(request),
    ),
    requestBody: await request.json(),
  });
const staticHandler = () => Response.json({ acknowledged: true });
const unexpectedWebhookService = {
  processBillingWebhook: () => {
    throw new Error('Unexpected webhook processing call');
  },
  replayBillingWebhook: () => {
    throw new Error('Unexpected webhook replay call');
  },
};
const webhooksHandler = (request) =>
  Effect.runPromise(
    createWebhooksApiHttpHandler((use) => use(unexpectedWebhookService))(request),
  );
const unexpectedEmailDeliveryService = {
  recordProviderDeliveryEvent: () => {
    throw new Error('Unexpected email delivery provider-event call');
  },
};
const emailDeliveryHandler = (request) =>
  Effect.runPromise(
    createEmailDeliveryHttpHandler((use) => use(unexpectedEmailDeliveryService))(request),
  );
const reportedErrors = [];

const successApp = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminGovernanceHandler: successHandler,
  adminRetentionLegalHoldHandler: staticHandler,
  adminSupportOperationsHandler: staticHandler,
  adminWebhooksApiAccessHandler: staticHandler,
  emailDeliveryHandler,
  webhooksHandler,
  subscriberJourneyHandler: jsonEchoHandler,
  requestMiddleware: createBackendApiRequestMiddleware({
    environment: {
      POLAR_WEBHOOK_SECRET: 'polar-webhook-secret',
      POSTAL_API_URL: 'http://postal.example',
    },
    emitRequestTelemetry: async (telemetry) => {
      emittedTelemetry.push(telemetry);
    },
    reportUnhandledRequestError: async (error) => {
      reportedErrors.push(error);
    },
  }),
});

const canonicalSessionHeaderApp = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminGovernanceHandler: jsonEchoHandler,
  adminRetentionLegalHoldHandler: staticHandler,
  adminSupportOperationsHandler: staticHandler,
  adminWebhooksApiAccessHandler: staticHandler,
  emailDeliveryHandler,
  webhooksHandler,
  subscriberJourneyHandler: staticHandler,
  requestMiddleware: createBackendApiRequestMiddleware({
    environment: {
      POLAR_WEBHOOK_SECRET: 'polar-webhook-secret',
      POSTAL_API_URL: 'http://postal.example',
    },
    emitRequestTelemetry: async (telemetry) => {
      emittedTelemetry.push(telemetry);
    },
    reportUnhandledRequestError: async (error) => {
      reportedErrors.push(error);
    },
  }),
});

const successResponse = await successApp.request(
  new Request(
    'http://localhost' + adminGovernanceApiBasePath + '/runtime-config/overrides/list',
    {
      method: 'POST',
      headers: {
        cookie: subscriberJourneySessionCookieName + '=sess_cookie_request',
      },
    },
  ),
);
const successBody = await successResponse.json();

const jsonEchoResponse = await successApp.request(
  new Request('http://localhost' + subscriberJourneyApiPath.startAuthentication, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      probe: 'json-post',
    }),
  }),
);
const jsonEchoBody = await jsonEchoResponse.json();

const canonicalSessionHeaderJsonResponse = await canonicalSessionHeaderApp.request(
  new Request('http://localhost' + adminGovernanceApiPath.listFeatureFlags, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [subscriberJourneySessionHeaderName]: 'sess_header_request',
    },
    body: JSON.stringify({
      moduleId: 'runtime-config',
    }),
  }),
);
const canonicalSessionHeaderJsonBody =
  await canonicalSessionHeaderJsonResponse.json();

const cookieBackedJsonResponse = await canonicalSessionHeaderApp.request(
  new Request('http://localhost' + adminGovernanceApiPath.listFeatureFlags, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie:
        subscriberJourneySessionCookieName + '=sess_cookie_json_request',
    },
    body: JSON.stringify({
      moduleId: 'runtime-config',
      source: 'cookie-backed-json',
    }),
  }),
);
const cookieBackedJsonBody = await cookieBackedJsonResponse.json();

const canonicalBackendHandler = createBackendApiRequestHandler({
  POLAR_WEBHOOK_SECRET: 'polar-webhook-secret',
  POSTAL_API_URL: 'http://postal.example',
  POSTAL_API_KEY: 'postal-api-key',
  POSTGRES_URL: 'postgresql://comvestec:comvestec@127.0.0.1:5432/comvestec',
  PLATFORM_EMAIL_SENDER_DISPLAY_NAME: 'Comvestec Platform',
  PLATFORM_EMAIL_SENDER_FROM_EMAIL: 'support@platform.example',
  PLATFORM_EMAIL_SENDER_REPLY_TO_EMAIL: 'reply@platform.example',
});
const canonicalBackendServer = Bun.serve({
  port: 0,
  fetch: (request) => canonicalSessionHeaderApp.fetch(request),
});
const canonicalServerCookieBackedJsonResponse = await fetch(
  new URL(
    adminGovernanceApiPath.listFeatureFlags,
    'http://127.0.0.1:' + canonicalBackendServer.port,
  ),
  {
    method: 'POST',
    signal: AbortSignal.timeout(5_000),
    headers: {
      'Content-Type': 'application/json',
      cookie:
        subscriberJourneySessionCookieName + '=sess_cookie_runtime_request',
    },
    body: JSON.stringify({
      moduleId: 'runtime-config',
      source: 'cookie-backed-runtime',
    }),
  },
);
const canonicalServerCookieBackedJsonBody =
  await canonicalServerCookieBackedJsonResponse.json();
canonicalBackendServer.stop(true);

const failureApp = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminGovernanceHandler: () => {
    throw new Error('Unexpected request failure');
  },
  adminRetentionLegalHoldHandler: staticHandler,
  adminSupportOperationsHandler: staticHandler,
  adminWebhooksApiAccessHandler: staticHandler,
  emailDeliveryHandler,
  webhooksHandler,
  subscriberJourneyHandler: staticHandler,
  requestMiddleware: createBackendApiRequestMiddleware({
    environment: {
      POLAR_WEBHOOK_SECRET: 'polar-webhook-secret',
      POSTAL_API_URL: 'http://postal.example',
    },
    emitRequestTelemetry: async (telemetry) => {
      emittedTelemetry.push(telemetry);
    },
    reportUnhandledRequestError: async (error) => {
      reportedErrors.push(error);
    },
  }),
});

const failureResponse = await failureApp.request(
  new Request(
    'http://localhost' + adminGovernanceApiBasePath + '/runtime-config/overrides/list',
    {
      method: 'POST',
      headers: {
        [backendApiCorrelationIdHeaderName]: 'corr_existing_request',
      },
    },
  ),
);
const failureBody = await failureResponse.json();

const telemetryFailureApp = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminGovernanceHandler: successHandler,
  adminRetentionLegalHoldHandler: staticHandler,
  adminSupportOperationsHandler: staticHandler,
  adminWebhooksApiAccessHandler: staticHandler,
  emailDeliveryHandler,
  webhooksHandler,
  subscriberJourneyHandler: staticHandler,
  requestMiddleware: createBackendApiRequestMiddleware({
    environment: {
      POLAR_WEBHOOK_SECRET: 'polar-webhook-secret',
      POSTAL_API_URL: 'http://postal.example',
    },
    emitRequestTelemetry: async () => {
      throw new Error('telemetry down');
    },
    reportUnhandledRequestError: async (error) => {
      reportedErrors.push(error);
    },
  }),
});

const telemetryFailureResponse = await telemetryFailureApp.request(
  new Request(
    'http://localhost' + adminGovernanceApiBasePath + '/runtime-config/overrides/list',
    {
      method: 'POST',
    },
  ),
);
const telemetryFailureBody = await telemetryFailureResponse.json();

const webhookVerificationResponse = await successApp.request(
  new Request('http://localhost' + webhooksApiPath.processPolarWebhook, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'order.paid' }),
  }),
);
const webhookVerificationBody = await webhookVerificationResponse.json();
const canonicalWebhookVerificationResponse = await canonicalBackendHandler(
  new Request('http://localhost' + webhooksApiPath.processPolarWebhook, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'order.paid' }),
  }),
);
const canonicalWebhookVerificationBody =
  await canonicalWebhookVerificationResponse.json();

const postalIgnoredResponse = await successApp.request(
  createSignedPostalWebhookRequest(
    JSON.stringify({
      event: 'ServerUp',
      timestamp: 1735718400,
      payload: {},
      uuid: 'postal-wh-ignored',
    }),
  ),
);
const postalIgnoredBody = await postalIgnoredResponse.json();

const postalVerificationFailureResponse = await successApp.request(
  new Request('http://localhost' + emailDeliveryApiPath.processPostalProviderEvent, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event: 'MessageSent' }),
  }),
);
const postalVerificationFailureBody = await postalVerificationFailureResponse.json();

const canonicalPostalIgnoredResponse = await canonicalBackendHandler(
  createSignedPostalWebhookRequest(
    JSON.stringify({
      event: 'ServerUp',
      timestamp: 1735718400,
      payload: {},
      uuid: 'postal-wh-canonical-ignored',
    }),
  ),
);
const canonicalPostalIgnoredBody = await canonicalPostalIgnoredResponse.json();

const canonicalPostalVerificationFailureResponse = await canonicalBackendHandler(
  new Request('http://localhost' + emailDeliveryApiPath.processPostalProviderEvent, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event: 'MessageSent' }),
  }),
);
const canonicalPostalVerificationFailureBody =
  await canonicalPostalVerificationFailureResponse.json();

console.log(JSON.stringify({
  successStatus: successResponse.status,
  successCorrelationId: successResponse.headers.get(backendApiCorrelationIdHeaderName),
  successBody,
  jsonEchoStatus: jsonEchoResponse.status,
  jsonEchoBody,
  canonicalSessionHeaderJsonStatus: canonicalSessionHeaderJsonResponse.status,
  canonicalSessionHeaderJsonBody,
  cookieBackedJsonStatus: cookieBackedJsonResponse.status,
  cookieBackedJsonBody,
  canonicalServerCookieBackedJsonStatus:
    canonicalServerCookieBackedJsonResponse.status,
  canonicalServerCookieBackedJsonBody,
  emittedTelemetry,
  reportedErrors,
  failureStatus: failureResponse.status,
  failureCorrelationId: failureResponse.headers.get(backendApiCorrelationIdHeaderName),
  failureBody,
  telemetryFailureStatus: telemetryFailureResponse.status,
  telemetryFailureCorrelationId: telemetryFailureResponse.headers.get(backendApiCorrelationIdHeaderName),
  telemetryFailureBody,
  webhookVerificationStatus: webhookVerificationResponse.status,
  webhookVerificationBody,
  canonicalWebhookVerificationStatus: canonicalWebhookVerificationResponse.status,
  canonicalWebhookVerificationBody,
  postalIgnoredStatus: postalIgnoredResponse.status,
  postalIgnoredBody,
  postalVerificationFailureStatus: postalVerificationFailureResponse.status,
  postalVerificationFailureBody,
  canonicalPostalIgnoredStatus: canonicalPostalIgnoredResponse.status,
  canonicalPostalIgnoredBody,
  canonicalPostalVerificationFailureStatus: canonicalPostalVerificationFailureResponse.status,
  canonicalPostalVerificationFailureBody,
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
    readonly successStatus: number;
    readonly successCorrelationId?: string;
    readonly successBody: {
      readonly sessionId?: string;
    };
    readonly jsonEchoStatus: number;
    readonly jsonEchoBody: {
      readonly sessionId?: string;
      readonly requestBody: {
        readonly probe: string;
      };
    };
    readonly canonicalSessionHeaderJsonStatus: number;
    readonly canonicalSessionHeaderJsonBody: {
      readonly sessionId?: string;
      readonly requestBody: {
        readonly moduleId: string;
      };
    };
    readonly cookieBackedJsonStatus: number;
    readonly cookieBackedJsonBody: {
      readonly sessionId?: string;
      readonly requestBody: {
        readonly moduleId: string;
        readonly source: string;
      };
    };
    readonly canonicalServerCookieBackedJsonStatus: number;
    readonly canonicalServerCookieBackedJsonBody: {
      readonly sessionId?: string;
      readonly requestBody: {
        readonly moduleId: string;
        readonly source: string;
      };
    };
    readonly emittedTelemetry: readonly {
      readonly correlationId?: string;
      readonly method: string;
      readonly path: string;
      readonly status: number;
      readonly durationMs: number;
      readonly outcome: string;
    }[];
    readonly reportedErrors: readonly {
      readonly correlationId?: string;
      readonly method: string;
      readonly path: string;
      readonly status: number;
      readonly durationMs: number;
      readonly errorName: string;
      readonly errorMessage: string;
    }[];
    readonly failureStatus: number;
    readonly failureCorrelationId?: string;
    readonly failureBody: {
      readonly error: string;
    };
    readonly telemetryFailureStatus: number;
    readonly telemetryFailureCorrelationId?: string;
    readonly telemetryFailureBody: Record<string, never>;
    readonly webhookVerificationStatus: number;
    readonly webhookVerificationBody: {
      readonly error: string;
    };
    readonly canonicalWebhookVerificationStatus: number;
    readonly canonicalWebhookVerificationBody: {
      readonly error: string;
    };
    readonly postalIgnoredStatus: number;
    readonly postalIgnoredBody: {
      readonly acknowledged: boolean;
      readonly ignored: boolean;
    };
    readonly postalVerificationFailureStatus: number;
    readonly postalVerificationFailureBody: {
      readonly error: string;
    };
    readonly canonicalPostalIgnoredStatus: number;
    readonly canonicalPostalIgnoredBody: {
      readonly acknowledged: boolean;
      readonly ignored: boolean;
    };
    readonly canonicalPostalVerificationFailureStatus: number;
    readonly canonicalPostalVerificationFailureBody: {
      readonly error: string;
    };
  };
};

describe("platform backend api request middleware", () => {
  it("generates and preserves correlation ids while emitting request telemetry", () => {
    const probe = runBackendApiRequestMiddlewareProbe();

    expect(probe.successStatus).toBe(200);
    expect(probe.successCorrelationId).toEqual(expect.any(String));
    expect(probe.successBody).toEqual({
      sessionId: "sess_cookie_request",
    });
    expect(probe.jsonEchoStatus).toBe(200);
    expect(probe.jsonEchoBody).toEqual({
      requestBody: {
        probe: "json-post",
      },
    });
    expect(probe.canonicalSessionHeaderJsonStatus).toBe(200);
    expect(probe.canonicalSessionHeaderJsonBody).toEqual({
      sessionId: "sess_header_request",
      requestBody: {
        moduleId: "runtime-config",
      },
    });
    expect(probe.cookieBackedJsonStatus).toBe(200);
    expect(probe.cookieBackedJsonBody).toEqual({
      sessionId: "sess_cookie_json_request",
      requestBody: {
        moduleId: "runtime-config",
        source: "cookie-backed-json",
      },
    });
    expect(probe.canonicalServerCookieBackedJsonStatus).toBe(200);
    expect(probe.canonicalServerCookieBackedJsonBody).toEqual({
      sessionId: "sess_cookie_runtime_request",
      requestBody: {
        moduleId: "runtime-config",
        source: "cookie-backed-runtime",
      },
    });
    expect(probe.emittedTelemetry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          correlationId: probe.successCorrelationId,
          method: "POST",
          path: "/api/admin/governance/runtime-config/overrides/list",
          status: 200,
          outcome: "response",
        }),
        expect.objectContaining({
          correlationId: expect.any(String),
          method: "POST",
          path: subscriberJourneyApiPath.startAuthentication,
          status: 200,
          outcome: "response",
        }),
        expect.objectContaining({
          correlationId: "corr_existing_request",
          method: "POST",
          path: "/api/admin/governance/runtime-config/overrides/list",
          status: 500,
          outcome: "uncaught-error",
        }),
      ]),
    );
    expect(probe.reportedErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          correlationId: "corr_existing_request",
          method: "POST",
          path: "/api/admin/governance/runtime-config/overrides/list",
          status: 500,
          errorName: "Error",
          errorMessage: "Unexpected request failure",
        }),
      ]),
    );

    expect(probe.failureStatus).toBe(500);
    expect(probe.failureCorrelationId).toBe("corr_existing_request");
    expect(probe.failureBody).toEqual({
      error: "Backend API request failed.",
    });
    expect(probe.telemetryFailureStatus).toBe(200);
    expect(probe.telemetryFailureCorrelationId).toEqual(expect.any(String));
    expect(probe.telemetryFailureBody).toEqual({});
    expect(probe.webhookVerificationStatus).toBe(401);
    expect(probe.webhookVerificationBody).toEqual({
      error: "Authentication or signature validation failed.",
    });
    expect(probe.canonicalWebhookVerificationStatus).toBe(401);
    expect(probe.canonicalWebhookVerificationBody).toEqual({
      error: "Authentication or signature validation failed.",
    });
    expect(probe.postalIgnoredStatus).toBe(202);
    expect(probe.postalIgnoredBody).toEqual({
      acknowledged: true,
      ignored: true,
    });
    expect(probe.postalVerificationFailureStatus).toBe(401);
    expect(probe.postalVerificationFailureBody).toEqual({
      error: "Authentication or signature validation failed.",
    });
    expect(probe.canonicalPostalIgnoredStatus).toBe(202);
    expect(probe.canonicalPostalIgnoredBody).toEqual({
      acknowledged: true,
      ignored: true,
    });
    expect(probe.canonicalPostalVerificationFailureStatus).toBe(401);
    expect(probe.canonicalPostalVerificationFailureBody).toEqual({
      error: "Authentication or signature validation failed.",
    });
  }, 60_000);
});
