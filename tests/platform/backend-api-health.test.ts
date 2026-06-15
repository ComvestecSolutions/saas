import { spawnSync } from "child_process";

const runBackendApiHealthValueConfiguredProbe = () => {
  const proc = spawnSync(
    "bun",
    [
      "-e",
      `import { isBackendApiHealthValueConfigured } from '@comvestec/platform/http';

console.log(JSON.stringify({
  placeholderGenerated: isBackendApiHealthValueConfigured('generate-after-running-ops-runtime-bootstrap-or-supplying-managed-glitchtip-dsn'),
  placeholderOperatorSet: isBackendApiHealthValueConfigured('set-when-enabling-openmeter-auth'),
  configuredValue: isBackendApiHealthValueConfigured('https://glitchtip.local/api/1/store/'),
}));`,
    ],
    {
      cwd: process.cwd(),
      timeout: 90_000,
    },
  );

  if (proc.status !== 0) {
    throw new Error(
      `Bun helper probe failed:\n${(proc.stderr ?? "").toString()}`,
    );
  }

  return JSON.parse((proc.stdout ?? "").toString()) as {
    readonly placeholderGenerated: boolean;
    readonly placeholderOperatorSet: boolean;
    readonly configuredValue: boolean;
  };
};

const runBackendApiHealthProbe = () => {
  const proc = spawnSync(
    "bun",
    [
      "-e",
      `import { Effect } from 'effect';
import { platformAdapterServiceName } from '@comvestec/platform';
import {
  backendApiHealthPath,
  createBackendApiApp,
  createBackendApiHealthHandler,
} from '@comvestec/platform/http';
import { createBackendApiOpenApiDocument } from './packages/platform/src/http/openapi-document.ts';

const document = createBackendApiOpenApiDocument('http://localhost');
const staticHandler = () => Response.json({ acknowledged: true });
const healthHandler = createBackendApiHealthHandler({
  getReadinessProbes: () => [
    {
      service: platformAdapterServiceName.postgres,
      healthcheck: Effect.succeed({ healthy: true, service: platformAdapterServiceName.postgres }),
    },
    {
      service: platformAdapterServiceName.meilisearch,
      healthcheck: Effect.fail({ _tag: 'MeilisearchAdapterRequestError' }),
    },
    {
      service: platformAdapterServiceName.novu,
      healthcheck: Effect.succeed({
        healthy: true,
        service: platformAdapterServiceName.novu,
      }),
    },
    {
      service: platformAdapterServiceName.openmeter,
      healthcheck: Effect.succeed({
        healthy: true,
        service: platformAdapterServiceName.openmeter,
      }),
    },
    {
      service: platformAdapterServiceName.postal,
      healthcheck: Effect.succeed({
        healthy: true,
        service: platformAdapterServiceName.postal,
      }),
    },
  ],
});
const initializationFailureHealthHandler = createBackendApiHealthHandler({
  getReadinessProbes: async () => {
    throw { _tag: 'BackendApiReadinessInitializationError' };
  },
});
const app = createBackendApiApp({
  healthHandler,
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
const missingHealthApp = createBackendApiApp({
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
const initializationFailureApp = createBackendApiApp({
  healthHandler: initializationFailureHealthHandler,
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
const liveResponse = await app.request(
  new Request('http://localhost' + backendApiHealthPath.live),
);
const readyResponse = await app.request(
  new Request('http://localhost' + backendApiHealthPath.ready),
);
const methodResponse = await app.request(
  new Request('http://localhost' + backendApiHealthPath.ready, {
    method: 'POST',
  }),
);
const missingRouteResponse = await missingHealthApp.request(
  new Request('http://localhost' + backendApiHealthPath.ready),
);
const initializationFailureResponse = await initializationFailureApp.request(
  new Request('http://localhost' + backendApiHealthPath.ready),
);
console.log(JSON.stringify({
  liveResponseRef: document.paths[backendApiHealthPath.live]?.get?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  readyResponseRef: document.paths[backendApiHealthPath.ready]?.get?.responses?.['200']?.content?.['application/json']?.schema?.$ref,
  ready503ResponseRef: document.paths[backendApiHealthPath.ready]?.get?.responses?.['503']?.content?.['application/json']?.schema?.$ref,
  ready503Description: document.paths[backendApiHealthPath.ready]?.get?.responses?.['503']?.description,
  hasLivenessSchema: Boolean(document.components.schemas.BackendApiLivenessResponse),
  hasReadinessCheckSchema: Boolean(document.components.schemas.BackendApiReadinessCheck),
  hasReadinessSchema: Boolean(document.components.schemas.BackendApiReadinessResponse),
  liveStatus: liveResponse.status,
  liveBody: await liveResponse.json(),
  readyStatus: readyResponse.status,
  readyBody: await readyResponse.json(),
  methodStatus: methodResponse.status,
  methodAllow: methodResponse.headers.get('Allow'),
  methodBody: await methodResponse.json(),
  missingRouteStatus: missingRouteResponse.status,
  missingRouteBody: await missingRouteResponse.json(),
  initializationFailureStatus: initializationFailureResponse.status,
  initializationFailureBody: await initializationFailureResponse.json(),
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
    readonly liveResponseRef?: string;
    readonly readyResponseRef?: string;
    readonly ready503ResponseRef?: string;
    readonly ready503Description?: string;
    readonly hasLivenessSchema: boolean;
    readonly hasReadinessCheckSchema: boolean;
    readonly hasReadinessSchema: boolean;
    readonly liveStatus: number;
    readonly liveBody: {
      readonly service: string;
      readonly healthy: true;
    };
    readonly readyStatus: number;
    readonly readyBody: {
      readonly service: string;
      readonly healthy: boolean;
      readonly checks: readonly {
        readonly service: string;
        readonly healthy: boolean;
        readonly errorTag?: string;
      }[];
      readonly errorTag?: string;
    };
    readonly methodStatus: number;
    readonly methodAllow?: string;
    readonly methodBody: {
      readonly error: string;
    };
    readonly missingRouteStatus: number;
    readonly missingRouteBody: {
      readonly error: string;
    };
    readonly initializationFailureStatus: number;
    readonly initializationFailureBody: {
      readonly service: string;
      readonly healthy: boolean;
      readonly checks: readonly unknown[];
      readonly errorTag?: string;
    };
  };
};

describe("platform backend api health transport", () => {
  it("treats bootstrap placeholder provider values as unconfigured", () => {
    const probe = runBackendApiHealthValueConfiguredProbe();

    expect(probe.placeholderGenerated).toBe(false);
    expect(probe.placeholderOperatorSet).toBe(false);
    expect(probe.configuredValue).toBe(true);
  }, 90_000);

  it("documents and mounts backend health routes", () => {
    const probe = runBackendApiHealthProbe();

    expect(probe.liveResponseRef).toBe(
      "#/components/schemas/BackendApiLivenessResponse",
    );
    expect(probe.readyResponseRef).toBe(
      "#/components/schemas/BackendApiReadinessResponse",
    );
    expect(probe.ready503ResponseRef).toBe(
      "#/components/schemas/BackendApiReadinessResponse",
    );
    expect(probe.ready503Description).toBe(
      "At least one backend readiness check failed or the readiness probes could not be initialized.",
    );
    expect(probe.hasLivenessSchema).toBe(true);
    expect(probe.hasReadinessCheckSchema).toBe(true);
    expect(probe.hasReadinessSchema).toBe(true);
    expect(probe.liveStatus).toBe(200);
    expect(probe.liveBody).toEqual({
      service: "backend-api",
      healthy: true,
    });
    expect(probe.readyStatus).toBe(503);
    expect(probe.readyBody).toEqual({
      service: "backend-api",
      healthy: false,
      checks: [
        {
          service: "postgres",
          healthy: true,
        },
        {
          service: "meilisearch",
          healthy: false,
          errorTag: "MeilisearchAdapterRequestError",
        },
        {
          service: "novu",
          healthy: true,
        },
        {
          service: "openmeter",
          healthy: true,
        },
        {
          service: "postal",
          healthy: true,
        },
      ],
    });
    expect(probe.methodStatus).toBe(405);
    expect(probe.methodAllow).toBe("GET");
    expect(probe.methodBody).toEqual({ error: "Method not allowed." });
    expect(probe.missingRouteStatus).toBe(404);
    expect(probe.missingRouteBody).toEqual({
      error: "Health route not found.",
    });
    expect(probe.initializationFailureStatus).toBe(503);
    expect(probe.initializationFailureBody).toEqual({
      service: "backend-api",
      healthy: false,
      checks: [],
      errorTag: "BackendApiReadinessInitializationError",
    });
  }, 30_000);
});
