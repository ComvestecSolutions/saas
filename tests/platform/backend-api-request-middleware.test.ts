import { spawnSync } from "child_process";

const runBackendApiRequestMiddlewareProbe = () => {
  const proc = spawnSync(
    "bun",
    [
      "-e",
      `import {
  backendApiCorrelationIdHeaderName,
  createBackendApiApp,
  createBackendApiRequestMiddleware,
} from '@comvestec/platform/http';
import { adminGovernanceApiBasePath } from './packages/platform/src/services/governance/admin-governance-http.ts';

const emittedTelemetry = [];
const successHandler = (request) =>
  Response.json({
    correlationId: request.headers.get(backendApiCorrelationIdHeaderName),
  });
const staticHandler = () => Response.json({ acknowledged: true });

const successApp = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminGovernanceHandler: successHandler,
  webhooksHandler: staticHandler,
  subscriberJourneyHandler: staticHandler,
  requestMiddleware: createBackendApiRequestMiddleware({
    emitRequestTelemetry: async (telemetry) => {
      emittedTelemetry.push(telemetry);
    },
  }),
});

const successResponse = await successApp.request(
  new Request(
    'http://localhost' + adminGovernanceApiBasePath + '/runtime-config/overrides/list',
    {
      method: 'POST',
    },
  ),
);
const successBody = await successResponse.json();

const failureApp = createBackendApiApp({
  adminBillingHandler: staticHandler,
  adminGovernanceHandler: () => {
    throw new Error('Unexpected request failure');
  },
  webhooksHandler: staticHandler,
  subscriberJourneyHandler: staticHandler,
  requestMiddleware: createBackendApiRequestMiddleware({
    emitRequestTelemetry: async (telemetry) => {
      emittedTelemetry.push(telemetry);
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
  webhooksHandler: staticHandler,
  subscriberJourneyHandler: staticHandler,
  requestMiddleware: createBackendApiRequestMiddleware({
    emitRequestTelemetry: async () => {
      throw new Error('telemetry down');
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

console.log(JSON.stringify({
  successStatus: successResponse.status,
  successCorrelationId: successResponse.headers.get(backendApiCorrelationIdHeaderName),
  successBody,
  emittedTelemetry,
  failureStatus: failureResponse.status,
  failureCorrelationId: failureResponse.headers.get(backendApiCorrelationIdHeaderName),
  failureBody,
  telemetryFailureStatus: telemetryFailureResponse.status,
  telemetryFailureCorrelationId: telemetryFailureResponse.headers.get(backendApiCorrelationIdHeaderName),
  telemetryFailureBody,
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
    readonly successStatus: number;
    readonly successCorrelationId?: string;
    readonly successBody: {
      readonly correlationId?: string;
    };
    readonly emittedTelemetry: readonly {
      readonly correlationId?: string;
      readonly method: string;
      readonly path: string;
      readonly status: number;
      readonly durationMs: number;
      readonly outcome: string;
    }[];
    readonly failureStatus: number;
    readonly failureCorrelationId?: string;
    readonly failureBody: {
      readonly error: string;
    };
    readonly telemetryFailureStatus: number;
    readonly telemetryFailureCorrelationId?: string;
    readonly telemetryFailureBody: {
      readonly correlationId?: string;
    };
  };
};

describe("platform backend api request middleware", () => {
  it("generates and preserves correlation ids while emitting request telemetry", () => {
    const probe = runBackendApiRequestMiddlewareProbe();

    expect(probe.successStatus).toBe(200);
    expect(probe.successCorrelationId).toEqual(expect.any(String));
    expect(probe.successBody).toEqual({
      correlationId: probe.successCorrelationId,
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
          correlationId: "corr_existing_request",
          method: "POST",
          path: "/api/admin/governance/runtime-config/overrides/list",
          status: 500,
          outcome: "uncaught-error",
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
    expect(probe.telemetryFailureBody).toEqual({
      correlationId: probe.telemetryFailureCorrelationId,
    });
  });
});
