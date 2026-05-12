import { actorType, platformScope } from "@comvestec/contracts";
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

describeLocalBackendE2e("backend e2e subscriber session transport", () => {
  const environment = localBackendE2eEnvironment!;
  const runSubscriberSessionProbe = () => {
    return runBackendE2eBunProbe<{
      readonly status: number;
      readonly body: {
        readonly requestContext: {
          readonly actorType: string;
          readonly actorId: string;
          readonly sessionId: string;
          readonly correlationId: string;
          readonly tenant: {
            readonly scope: string;
            readonly scopeId: string;
            readonly organizationId: string;
          };
        };
      };
    }>(
      `import { Effect } from 'effect';
import { actorType, platformScope } from '@comvestec/contracts';
import { makeValkeyAdapter, subscriberJourneyApiPath, subscriberJourneySessionCookieName } from '@comvestec/platform';
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

const sessionId = 'sess_backend_e2e_request_context';
const requestContext = {
  actorType: actorType.organizationAdmin,
  actorId: 'usr_backend_e2e_request_context',
  sessionId,
  correlationId: 'corr_backend_e2e_request_context',
  tenant: {
    scope: platformScope.organization,
    scopeId: 'org_backend_e2e_request_context',
    organizationId: 'org_backend_e2e_request_context',
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

const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

try {
  const response = await runStep(
    'subscriber request-context lookup',
    fetch(
      new URL(
        subscriberJourneyApiPath.resolveRequestContext,
        'http://127.0.0.1:' + server.port,
      ),
      {
        method: 'POST',
        headers: {
          cookie: subscriberJourneySessionCookieName + '=' + sessionId,
        },
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
  };

  it("resolves request context through a cookie-backed subscriber session over real HTTP", () => {
    const probe = runSubscriberSessionProbe();

    expect(probe.status).toBe(200);
    expect(probe.body).toEqual({
      requestContext: {
        actorType: actorType.organizationAdmin,
        actorId: "usr_backend_e2e_request_context",
        sessionId: "sess_backend_e2e_request_context",
        correlationId: "corr_backend_e2e_request_context",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_backend_e2e_request_context",
          organizationId: "org_backend_e2e_request_context",
        },
      },
    });
  });
});
