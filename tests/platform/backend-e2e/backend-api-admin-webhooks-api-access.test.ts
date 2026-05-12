import {
  billingWebhookEventType,
  webhookApiKeyStatus,
  webhookSubscriptionStatus,
} from "@comvestec/contracts";
import { describe, expect, it } from "vitest";
import {
  isLocalBackendE2eFeatureFlagsReady,
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eEnvironment = tryResolveLocalBackendE2eEnvironment();
const describeLocalBackendE2e =
  localBackendE2eEnvironment === undefined ||
  !isLocalBackendE2eFeatureFlagsReady()
    ? describe.skip
    : describe;

describeLocalBackendE2e(
  "backend e2e admin webhooks api access transport",
  () => {
    const environment = localBackendE2eEnvironment!;

    const runAdminWebhooksApiAccessProbe = () =>
      runBackendE2eBunProbe<{
        readonly unauthenticatedListStatus: number;
        readonly unauthenticatedListBody: {
          readonly error: string;
        };
        readonly createSubscriptionStatus: number;
        readonly createSubscriptionBody: {
          readonly subscriptionId: string;
          readonly url: string;
          readonly events: ReadonlyArray<string>;
          readonly status: string;
        };
        readonly listSubscriptionsStatus: number;
        readonly listSubscriptionsBody: ReadonlyArray<{
          readonly subscriptionId: string;
          readonly url: string;
          readonly events: ReadonlyArray<string>;
          readonly status: string;
          readonly createdAt: string;
        }>;
        readonly createApiKeyStatus: number;
        readonly createApiKeyBody: {
          readonly apiKey: {
            readonly apiKeyId: string;
            readonly label: string;
            readonly prefix: string;
            readonly status: string;
            readonly createdAt: string;
          };
          readonly secret: string;
        };
        readonly listApiKeysStatus: number;
        readonly listApiKeysBody: ReadonlyArray<{
          readonly apiKeyId: string;
          readonly label: string;
          readonly prefix: string;
          readonly status: string;
          readonly createdAt: string;
        }>;
        readonly rotateApiKeyStatus: number;
        readonly rotateApiKeyBody: {
          readonly apiKey: {
            readonly apiKeyId: string;
            readonly label: string;
            readonly prefix: string;
            readonly status: string;
            readonly createdAt: string;
            readonly rotatedAt?: string;
          };
          readonly secret: string;
        };
        readonly revokeApiKeyStatus: number;
        readonly revokeApiKeyBody: {
          readonly apiKeyId: string;
          readonly label: string;
          readonly prefix: string;
          readonly status: string;
          readonly createdAt: string;
          readonly rotatedAt?: string;
          readonly revokedAt?: string;
        };
        readonly finalListApiKeysStatus: number;
        readonly finalListApiKeysBody: ReadonlyArray<{
          readonly apiKeyId: string;
          readonly label: string;
          readonly prefix: string;
          readonly status: string;
          readonly createdAt: string;
          readonly rotatedAt?: string;
          readonly revokedAt?: string;
        }>;
      }>(
        `import { Effect } from 'effect';
 import { waitForOryKetoTuple } from './tests/platform/backend-e2e/_shared/wait-for-ory-keto-tuple.ts';
 import {
   actorType,
   authorizationNamespace,
  authorizationRelation,
  billingWebhookEventType,
  platformModuleId,
  platformScope,
} from '@comvestec/contracts';
import {
  adminWebhooksApiAccessApiPath,
  makeOryKetoAdapter,
  makeValkeyAdapter,
  subscriberJourneySessionHeaderName,
} from '@comvestec/platform';
import { createBackendApiRequestHandler } from '@comvestec/platform/http';

const runStep = async (label, operation, timeoutMs = 30000) => {
  let timeoutHandle;

  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(label + ' timed out after ' + timeoutMs + 'ms.'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
};

const sessionId = 'sess_backend_e2e_admin_webhooks_api_access';
const actorId = 'usr_backend_e2e_support_webhooks_operator';
const tenantScopeId = 'org_smoke';
const runId = Date.now().toString();
const subscriptionUrl = 'https://hooks.backend-e2e.example/webhooks/' + runId;
const apiKeyLabel = 'Backend e2e webhook api key ' + runId;
const requestContext = {
  actorType: actorType.supportOperator,
  actorId,
  sessionId,
  correlationId: 'corr_backend_e2e_admin_webhooks_api_access',
  reason: 'Validate admin webhooks backend route family',
  tenant: {
    scope: platformScope.organization,
    scopeId: tenantScopeId,
    enterpriseId: 'ent_smoke',
    organizationId: tenantScopeId,
  },
};

const valkey = await Effect.runPromise(
  makeValkeyAdapter({ url: process.env.VALKEY_URL }),
);
await Effect.runPromise(
  valkey.writeSession({
    sessionId,
    requestContext,
  }),
);
await Effect.runPromise(Effect.ignore(valkey.close));

const oryKeto = await Effect.runPromise(
  makeOryKetoAdapter({
    readUrl: process.env.KETO_READ_URL,
    writeUrl: process.env.KETO_WRITE_URL,
  }),
);
 await Effect.runPromise(
   oryKeto.writeTuple({
     namespace: authorizationNamespace.module,
     object: platformModuleId.webhooksApiAccess,
     relation: authorizationRelation.admin,
     subject: actorId,
   }),
 );
 await waitForOryKetoTuple({
   oryKeto,
   tuple: {
     namespace: authorizationNamespace.module,
     object: platformModuleId.webhooksApiAccess,
     relation: authorizationRelation.admin,
     subject: actorId,
   },
 });
 
 const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

try {
  const baseUrl = 'http://127.0.0.1:' + server.port;
  const unauthenticatedListResponse = await runStep(
    'admin webhooks list subscriptions without session',
    fetch(new URL(adminWebhooksApiAccessApiPath.listSubscriptions, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'sess_body_only_admin_webhooks',
        scope: platformScope.organization,
        scopeId: tenantScopeId,
      }),
    }),
  );
  const createSubscriptionResponse = await runStep(
    'admin webhooks create subscription',
    fetch(new URL(adminWebhooksApiAccessApiPath.createSubscription, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        url: subscriptionUrl,
        events: [billingWebhookEventType.subscriptionRenewed],
      }),
    }),
  );
  const listSubscriptionsResponse = await runStep(
    'admin webhooks list subscriptions',
    fetch(new URL(adminWebhooksApiAccessApiPath.listSubscriptions, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: tenantScopeId,
      }),
    }),
  );
  const createApiKeyResponse = await runStep(
    'admin webhooks create api key',
    fetch(new URL(adminWebhooksApiAccessApiPath.createApiKey, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        label: apiKeyLabel,
      }),
    }),
  );
  const listApiKeysResponse = await runStep(
    'admin webhooks list api keys',
    fetch(new URL(adminWebhooksApiAccessApiPath.listApiKeys, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: tenantScopeId,
      }),
    }),
  );
  const createApiKeyBody = await createApiKeyResponse.json();
  const rotateApiKeyResponse = await runStep(
    'admin webhooks rotate api key',
    fetch(new URL(adminWebhooksApiAccessApiPath.rotateApiKey, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        apiKeyId: createApiKeyBody.apiKey.apiKeyId,
      }),
    }),
  );
  const revokeApiKeyResponse = await runStep(
    'admin webhooks revoke api key',
    fetch(new URL(adminWebhooksApiAccessApiPath.revokeApiKey, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        apiKeyId: createApiKeyBody.apiKey.apiKeyId,
      }),
    }),
  );
  const finalListApiKeysResponse = await runStep(
    'admin webhooks final list api keys',
    fetch(new URL(adminWebhooksApiAccessApiPath.listApiKeys, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: tenantScopeId,
      }),
    }),
  );

  console.log(JSON.stringify({
    unauthenticatedListStatus: unauthenticatedListResponse.status,
    unauthenticatedListBody: await unauthenticatedListResponse.json(),
    createSubscriptionStatus: createSubscriptionResponse.status,
    createSubscriptionBody: await createSubscriptionResponse.json(),
    listSubscriptionsStatus: listSubscriptionsResponse.status,
    listSubscriptionsBody: await listSubscriptionsResponse.json(),
    createApiKeyStatus: createApiKeyResponse.status,
    createApiKeyBody,
    listApiKeysStatus: listApiKeysResponse.status,
    listApiKeysBody: await listApiKeysResponse.json(),
    rotateApiKeyStatus: rotateApiKeyResponse.status,
    rotateApiKeyBody: await rotateApiKeyResponse.json(),
    revokeApiKeyStatus: revokeApiKeyResponse.status,
    revokeApiKeyBody: await revokeApiKeyResponse.json(),
    finalListApiKeysStatus: finalListApiKeysResponse.status,
    finalListApiKeysBody: await finalListApiKeysResponse.json(),
  }));
} finally {
  server.stop(true);
}

process.exit(0);`,
        {
          env: {
            ...process.env,
            ...environment,
          },
          timeoutMs: 90_000,
        },
      );

    it("round-trips trusted-session subscription and api-key lifecycle operations over real backend-owned HTTP", () => {
      const probe = runAdminWebhooksApiAccessProbe();
      const createdApiKeyListEntry = probe.listApiKeysBody.find(
        (apiKey) => apiKey.apiKeyId === probe.createApiKeyBody.apiKey.apiKeyId,
      );
      const revokedApiKeyListEntry = probe.finalListApiKeysBody.find(
        (apiKey) => apiKey.apiKeyId === probe.createApiKeyBody.apiKey.apiKeyId,
      );

      expect(probe.unauthenticatedListStatus).toBe(401);
      expect(probe.unauthenticatedListBody).toEqual({
        error: "Authenticated operator session is required.",
      });

      expect(probe.createSubscriptionStatus).toBe(201);
      expect(probe.createSubscriptionBody).toEqual(
        expect.objectContaining({
          subscriptionId: expect.any(String),
          url: expect.stringContaining("https://hooks.backend-e2e.example/"),
          events: [billingWebhookEventType.subscriptionRenewed],
          status: webhookSubscriptionStatus.active,
        }),
      );

      expect(probe.listSubscriptionsStatus).toBe(200);
      expect(probe.listSubscriptionsBody).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            subscriptionId: probe.createSubscriptionBody.subscriptionId,
            url: probe.createSubscriptionBody.url,
            events: [billingWebhookEventType.subscriptionRenewed],
            status: webhookSubscriptionStatus.active,
          }),
        ]),
      );

      expect(probe.createApiKeyStatus).toBe(201);
      expect(probe.createApiKeyBody).toEqual({
        apiKey: {
          apiKeyId: expect.any(String),
          label: expect.stringContaining("Backend e2e webhook api key "),
          prefix: expect.any(String),
          status: webhookApiKeyStatus.active,
          createdAt: expect.any(String),
        },
        secret: expect.any(String),
      });

      expect(probe.listApiKeysStatus).toBe(200);
      expect(createdApiKeyListEntry).toEqual(
        expect.objectContaining({
          apiKeyId: probe.createApiKeyBody.apiKey.apiKeyId,
          label: probe.createApiKeyBody.apiKey.label,
          prefix: probe.createApiKeyBody.apiKey.prefix,
          status: webhookApiKeyStatus.active,
          createdAt: probe.createApiKeyBody.apiKey.createdAt,
        }),
      );
      expect(createdApiKeyListEntry).not.toHaveProperty("secret");

      expect(probe.rotateApiKeyStatus).toBe(200);
      expect(probe.rotateApiKeyBody).toEqual({
        apiKey: {
          apiKeyId: probe.createApiKeyBody.apiKey.apiKeyId,
          label: probe.createApiKeyBody.apiKey.label,
          prefix: expect.any(String),
          status: webhookApiKeyStatus.active,
          createdAt: probe.createApiKeyBody.apiKey.createdAt,
          rotatedAt: expect.any(String),
        },
        secret: expect.any(String),
      });
      expect(probe.rotateApiKeyBody.secret).not.toBe(
        probe.createApiKeyBody.secret,
      );
      expect(probe.rotateApiKeyBody.apiKey.prefix).not.toBe(
        probe.createApiKeyBody.apiKey.prefix,
      );

      expect(probe.revokeApiKeyStatus).toBe(200);
      expect(probe.revokeApiKeyBody).toEqual({
        apiKeyId: probe.createApiKeyBody.apiKey.apiKeyId,
        label: probe.createApiKeyBody.apiKey.label,
        prefix: probe.rotateApiKeyBody.apiKey.prefix,
        status: webhookApiKeyStatus.revoked,
        createdAt: probe.createApiKeyBody.apiKey.createdAt,
        rotatedAt: probe.rotateApiKeyBody.apiKey.rotatedAt,
        revokedAt: expect.any(String),
      });

      expect(probe.finalListApiKeysStatus).toBe(200);
      expect(revokedApiKeyListEntry).toEqual(
        expect.objectContaining({
          apiKeyId: probe.createApiKeyBody.apiKey.apiKeyId,
          label: probe.createApiKeyBody.apiKey.label,
          prefix: probe.rotateApiKeyBody.apiKey.prefix,
          status: webhookApiKeyStatus.revoked,
          createdAt: probe.createApiKeyBody.apiKey.createdAt,
          rotatedAt: probe.rotateApiKeyBody.apiKey.rotatedAt,
          revokedAt: probe.revokeApiKeyBody.revokedAt,
        }),
      );
      expect(revokedApiKeyListEntry).not.toHaveProperty("secret");
    });
  },
);
