import { Effect } from "effect";
import { platformScope } from "@comvestec/contracts";
import { describe, expect, it } from "vitest";
import {
  decodeAuthCallbackStateFromRedirectLocation,
  isLocalBackendE2eFeatureFlagsReady,
  isLocalBackendE2ePolarReady,
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eEnvironment = tryResolveLocalBackendE2eEnvironment();
const describeLocalBackendE2e =
  localBackendE2eEnvironment === undefined ||
  !isLocalBackendE2eFeatureFlagsReady()
    ? describe.skip
    : describe;

describeLocalBackendE2e("backend e2e subscriber journey transport", () => {
  const environment = localBackendE2eEnvironment!;
  const itLocalPolar = isLocalBackendE2ePolarReady() ? it : it.skip;

  const runSubscriberJourneyAuthStartProbe = () =>
    runBackendE2eBunProbe<{
      readonly status: number;
      readonly body: {
        readonly correlationId: string;
        readonly redirect: {
          readonly url: string;
          readonly realm: string;
          readonly tenantHint?: string;
          readonly redirectUri: string;
        };
      };
    }>(
      `import { actorType, platformScope } from '@comvestec/contracts';
import { subscriberJourneyApiPath } from '@comvestec/platform';
import { createBackendApiRequestHandler } from '@comvestec/platform/http';

const runStep = async (label, operation, timeoutMs = 15000) => {
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

const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

try {
  const response = await runStep(
    'subscriber auth-start',
    fetch(
      new URL(subscriberJourneyApiPath.startAuthentication, 'http://127.0.0.1:' + server.port),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestContext: {
            actorType: actorType.anonymous,
            correlationId: 'corr_backend_e2e_http_auth_start',
            tenant: {
              scope: platformScope.platform,
              scopeId: platformScope.platform,
            },
          },
          tenantHint: 'org_smoke',
          redirectUri: new URL('/auth/callback', process.env.PRODUCT_APP_BASE_URL).toString(),
        }),
      },
    ),
  );

  console.log(JSON.stringify({
    status: response.status,
    body: await response.json(),
  }));
} finally {
  server.stop(true);
}`,
      {
        env: {
          ...process.env,
          ...environment,
        },
      },
    );

  const runSubscriberJourneyListPublicPlansProbe = () =>
    runBackendE2eBunProbe<{
      readonly status: number;
      readonly body: {
        readonly plans: ReadonlyArray<{
          readonly planId: string;
          readonly planKey: string;
          readonly active: boolean;
          readonly prices: ReadonlyArray<{
            readonly priceId: string;
            readonly active: boolean;
          }>;
        }>;
      };
    }>(
      `import { subscriberJourneyApiPath } from '@comvestec/platform';
import { createBackendApiRequestHandler } from '@comvestec/platform/http';

const runStep = async (label, operation, timeoutMs = 15000) => {
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

const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

try {
  const response = await runStep(
    'subscriber public plan list',
    fetch(
      new URL(subscriberJourneyApiPath.listPublicPlans, 'http://127.0.0.1:' + server.port),
    ),
  );

  console.log(JSON.stringify({
    status: response.status,
    body: await response.json(),
  }));
} finally {
  server.stop(true);
}`,
      {
        env: {
          ...process.env,
          ...environment,
        },
      },
    );

  const runSubscriberJourneyBootstrapProbe = () =>
    runBackendE2eBunProbe<{
      readonly authStartStatus: number;
      readonly authStartBody: {
        readonly correlationId: string;
        readonly redirect: {
          readonly url: string;
          readonly realm: string;
          readonly tenantHint?: string;
          readonly redirectUri: string;
        };
      };
      readonly authCompletionStatus: number;
      readonly authCompletionBody: {
        readonly session: {
          readonly authenticated: boolean;
          readonly sessionId: string;
          readonly actorId: string;
          readonly realm: string;
        };
      };
      readonly bootstrapStatus: number;
      readonly bootstrapBody: {
        readonly requestContext: {
          readonly sessionId: string;
          readonly tenant: {
            readonly scope: string;
            readonly scopeId: string;
            readonly organizationId?: string;
            readonly enterpriseId?: string;
          };
        };
        readonly authorization: {
          readonly allowed: boolean;
          readonly reason: string;
        };
        readonly enabledModules?: readonly string[];
      };
    }>(
      `import { Effect } from 'effect';
import { resolveDefaultTenantOnboardingEnabledModules } from '@comvestec/config';
import { actorType, platformScope } from '@comvestec/contracts';
import {
  createProductAppAuthCallbackStateFromEnvironment,
  subscriberJourneyApiPath,
  subscriberJourneySessionHeaderName,
} from '@comvestec/platform';
import { createBackendApiRequestHandler } from '@comvestec/platform/http';
import {
  issueKeycloakPasswordGrant,
  subscriberJourneySmokeDefaults,
} from './tooling/scripts/subscriber-journey/common.ts';

const runStep = async (label, operation, timeoutMs = 15000) => {
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

const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

try {
  const baseUrl = 'http://127.0.0.1:' + server.port;
  const correlationId = 'corr_backend_e2e_http_bootstrap';
  const tenantId = subscriberJourneySmokeDefaults.tenantId;
  const enterpriseId = subscriberJourneySmokeDefaults.enterpriseId;
  const redirectUri = new URL('/auth/callback', process.env.PRODUCT_APP_BASE_URL).toString();
  const requestHost = new URL(redirectUri).host;
  const authCompletionState = await Effect.runPromise(
    createProductAppAuthCallbackStateFromEnvironment(
      {
        PRODUCT_APP_BASE_URL: new URL(redirectUri).origin,
        KEYCLOAK_CLIENT_SECRET: process.env.KEYCLOAK_CLIENT_SECRET,
      },
      {
        correlationId,
        redirectUri,
        tenant: {
          scope: platformScope.organization,
          scopeId: tenantId,
          enterpriseId,
          organizationId: tenantId,
        },
        enabledModules: resolveDefaultTenantOnboardingEnabledModules(),
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      },
    ),
  );
  const authStartResponse = await runStep(
    'subscriber auth-start kickoff',
    fetch(
      new URL(subscriberJourneyApiPath.startAuthentication, baseUrl),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestContext: {
            actorType: actorType.anonymous,
            correlationId,
            host: requestHost,
            tenant: {
              scope: platformScope.platform,
              scopeId: platformScope.platform,
            },
          },
          tenantHint: tenantId,
          redirectUri,
          state: authCompletionState,
        }),
      },
    ),
  );
  const authStartBody = await authStartResponse.json();
  const returnedState = new URL(authStartBody.redirect.url).searchParams.get('state');

  if (returnedState === null) {
    throw new Error('Expected auth-start redirect to include a state query parameter.');
  }

  const keycloakAccessToken = await runStep(
    'keycloak password grant',
    Effect.runPromise(
        issueKeycloakPasswordGrant({
          baseUrl: process.env.KEYCLOAK_BASE_URL,
          realm: process.env.KEYCLOAK_REALM,
          clientId: process.env.KEYCLOAK_CLIENT_ID,
          clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
          username: subscriberJourneySmokeDefaults.username,
          password:
            process.env.SUBSCRIBER_JOURNEY_SMOKE_USER_PASSWORD ??
            subscriberJourneySmokeDefaults.password,
        }),
      ),
    );
  const authCompletionResponse = await runStep(
    'subscriber auth completion',
    fetch(
      new URL(subscriberJourneyApiPath.completeAuthentication, baseUrl),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session: {
            accessToken: keycloakAccessToken,
          },
          host: requestHost,
          state: returnedState,
        }),
      },
    ),
  );
  const authCompletionBody = await authCompletionResponse.json();
  const bootstrapResponse = await runStep(
    'subscriber product bootstrap',
    fetch(
      new URL(subscriberJourneyApiPath.buildProductBootstrap, baseUrl),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [subscriberJourneySessionHeaderName]:
            authCompletionBody.session.sessionId,
        },
        body: '{}',
      },
    ),
  );
  const bootstrapBody = await bootstrapResponse.json();

  console.log(JSON.stringify({
    authStartStatus: authStartResponse.status,
    authStartBody,
    authCompletionStatus: authCompletionResponse.status,
    authCompletionBody,
    bootstrapStatus: bootstrapResponse.status,
    bootstrapBody,
  }));
} finally {
  server.stop(true);
}`,
      {
        env: {
          ...process.env,
          ...environment,
        },
        timeoutMs: 30_000,
      },
    );

  it("starts authentication through the real backend-owned HTTP route", async () => {
    const probe = runSubscriberJourneyAuthStartProbe();
    const redirectUrl = new URL(probe.body.redirect.url);
    const expectedRedirectUri = new URL(
      "/auth/callback",
      environment.PRODUCT_APP_BASE_URL,
    ).toString();

    expect(probe.status).toBe(202);
    expect(probe.body.correlationId).toBe("corr_backend_e2e_http_auth_start");
    expect(probe.body.redirect.tenantHint).toBe("org_smoke");
    expect(probe.body.redirect.redirectUri).toBe(expectedRedirectUri);
    expect(redirectUrl.origin).toBe(
      new URL(environment.KEYCLOAK_BASE_URL).origin,
    );
    expect(redirectUrl.pathname).toBe(
      `/realms/${environment.KEYCLOAK_REALM}/protocol/openid-connect/auth`,
    );
    expect(redirectUrl.searchParams.get("state")).toBeNull();
  });

  it("completes subscriber authentication and builds product bootstrap through the real backend-owned HTTP routes", async () => {
    const probe = runSubscriberJourneyBootstrapProbe();
    const decodedState = await Effect.runPromise(
      decodeAuthCallbackStateFromRedirectLocation(
        environment,
        probe.authStartBody.redirect.url,
      ),
    );

    expect(probe.authStartStatus).toBe(202);
    expect(probe.authStartBody.correlationId).toBe(
      "corr_backend_e2e_http_bootstrap",
    );
    expect(probe.authCompletionStatus).toBe(202);
    expect(probe.authCompletionBody.session.authenticated).toBe(true);
    expect(probe.authCompletionBody.session.sessionId).toEqual(
      expect.any(String),
    );
    expect(probe.bootstrapStatus).toBe(200);
    expect(probe.bootstrapBody.requestContext.sessionId).toBe(
      probe.authCompletionBody.session.sessionId,
    );
    expect(probe.bootstrapBody.requestContext.tenant.scope).toBe(
      platformScope.organization,
    );
    expect(probe.bootstrapBody.requestContext.tenant.scopeId).toBe("org_smoke");
    expect(probe.bootstrapBody.authorization.allowed).toBe(true);
    expect(probe.bootstrapBody.authorization.reason).toEqual(
      expect.any(String),
    );
    expect(decodedState.correlationId).toBe("corr_backend_e2e_http_bootstrap");
    expect(decodedState.tenant.scope).toBe(platformScope.organization);
    expect(decodedState.tenant.scopeId).toBe("org_smoke");
  });

  itLocalPolar(
    "lists public plans through the real backend-owned HTTP route",
    () => {
      const probe = runSubscriberJourneyListPublicPlansProbe();

      expect(probe.status).toBe(200);
      expect(probe.body.plans.length).toBeGreaterThan(0);
      expect(probe.body.plans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            planId: expect.any(String),
            planKey: expect.any(String),
            active: true,
            prices: expect.arrayContaining([
              expect.objectContaining({
                priceId: expect.any(String),
                active: true,
              }),
            ]),
          }),
        ]),
      );
    },
  );
});
