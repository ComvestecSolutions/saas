import { emailDeliveryStatus } from "@comvestec/contracts";
import { describe, expect, it } from "vitest";
import {
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eEnvironment = tryResolveLocalBackendE2eEnvironment();
const describeLocalBackendE2e =
  localBackendE2eEnvironment === undefined ? describe.skip : describe;

describeLocalBackendE2e("backend e2e admin email delivery transport", () => {
  const environment = localBackendE2eEnvironment!;

  const runAdminEmailDeliveryProbe = () =>
    runBackendE2eBunProbe<{
      readonly expiredBreakGlassStatus: number;
      readonly expiredBreakGlassBody: {
        readonly error: string;
      };
      readonly validBreakGlassStatus: number;
      readonly validBreakGlassBody: {
        readonly messageId: string;
        readonly recipient: string;
        readonly template: string;
        readonly status: string;
        readonly sentAt: string;
        readonly lastEventAt: string;
      };
    }>(
      `import { Effect } from 'effect';
import { waitForOryKetoTuple } from './tests/platform/backend-e2e/_shared/wait-for-ory-keto-tuple.ts';
 import {
   emailDeliveryStatus,
   actorType,
   authorizationNamespace,
  authorizationRelation,
  platformModuleId,
  platformScope,
} from '@comvestec/contracts';
import {
  buildEmailDeliveryPostgresQueryable,
  makeEmailDeliveryPostgresRepository,
} from '@comvestec/modules';
import {
  adminEmailDeliveryApiPath,
  makeOryKetoAdapter,
  makePostgresAdapter,
  makeValkeyAdapter,
  platformAdapterServiceName,
  subscriberJourneySessionHeaderName,
} from '@comvestec/platform';
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

const actorId = 'usr_backend_e2e_email_delivery_operator';
const runId = Date.now().toString();
const homeTenantScopeId = 'org_backend_e2e_email_delivery_home';
const targetTenantScopeId = 'org_backend_e2e_email_delivery_target';
const expiredSessionId = 'sess_backend_e2e_email_delivery_expired_' + runId;
const validSessionId = 'sess_backend_e2e_email_delivery_valid_' + runId;
const messageId =
  'email-delivery:organization:' + targetTenantScopeId + ':track_' + runId;
const recipient = 'backend-e2e-email-' + runId + '@example.com';
const sentAt = '2026-05-05T06:45:00.000Z';
const lastEventAt = '2026-05-05T06:47:00.000Z';
const reason = 'Investigate cross-tenant email delivery incident';

const valkey = await Effect.runPromise(
  makeValkeyAdapter({ url: process.env.VALKEY_URL }),
);
await Effect.runPromise(
  valkey.writeSession({
    sessionId: expiredSessionId,
    requestContext: {
      actorType: actorType.supportOperator,
      actorId,
      sessionId: expiredSessionId,
      correlationId: 'corr_backend_e2e_email_delivery_expired',
      reason,
      tenant: {
        scope: platformScope.organization,
        scopeId: homeTenantScopeId,
        organizationId: homeTenantScopeId,
      },
      breakGlass: {
        approvedBy: 'usr_backend_e2e_email_delivery_approver',
        reason,
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      },
    },
  }),
);
await Effect.runPromise(
  valkey.writeSession({
    sessionId: validSessionId,
    requestContext: {
      actorType: actorType.supportOperator,
      actorId,
      sessionId: validSessionId,
      correlationId: 'corr_backend_e2e_email_delivery_valid',
      reason,
      tenant: {
        scope: platformScope.organization,
        scopeId: homeTenantScopeId,
        organizationId: homeTenantScopeId,
      },
      breakGlass: {
        approvedBy: 'usr_backend_e2e_email_delivery_approver',
        reason,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      },
    },
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
     object: platformModuleId.emailDelivery,
     relation: authorizationRelation.admin,
     subject: actorId,
   }),
 );
 await waitForOryKetoTuple({
   oryKeto,
   tuple: {
     namespace: authorizationNamespace.module,
     object: platformModuleId.emailDelivery,
     relation: authorizationRelation.admin,
     subject: actorId,
   },
 });
 
 const postgres = await Effect.runPromise(
   makePostgresAdapter({
    connectionString: process.env.POSTGRES_URL,
  }),
);
const emailDeliveryRepository = await Effect.runPromise(
  makeEmailDeliveryPostgresRepository(
    buildEmailDeliveryPostgresQueryable(postgres.database),
  ),
);
await Effect.runPromise(
  emailDeliveryRepository.createTrackedDelivery({
    messageId,
    provider: platformAdapterServiceName.postal,
    tenantScope: platformScope.organization,
    tenantScopeId: targetTenantScopeId,
    recipient,
    status: emailDeliveryStatus.complained,
    template: 'welcome-email:v1',
    senderDisplayName: 'Comvestec Support',
    fromEmail: 'support@example.com',
    replyToEmail: 'reply@example.com',
    sentAt,
    lastEventAt,
    createdAt: sentAt,
    updatedAt: lastEventAt,
  }),
);

const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

try {
  const baseUrl = 'http://127.0.0.1:' + server.port;
  const expiredBreakGlassResponse = await runStep(
    'admin email delivery inspect tracking with expired break glass',
    fetch(new URL(adminEmailDeliveryApiPath.inspectTracking, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: expiredSessionId,
      },
      body: JSON.stringify({
        messageId,
      }),
    }),
  );
  const validBreakGlassResponse = await runStep(
    'admin email delivery inspect tracking with valid break glass',
    fetch(new URL(adminEmailDeliveryApiPath.inspectTracking, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: validSessionId,
      },
      body: JSON.stringify({
        messageId,
      }),
    }),
  );

  console.log(JSON.stringify({
    expiredBreakGlassStatus: expiredBreakGlassResponse.status,
    expiredBreakGlassBody: await expiredBreakGlassResponse.json(),
    validBreakGlassStatus: validBreakGlassResponse.status,
    validBreakGlassBody: await validBreakGlassResponse.json(),
  }));
} finally {
  server.stop(true);
  await Effect.runPromise(Effect.ignore(postgres.close));
}`,
      {
        env: {
          ...process.env,
          ...environment,
        },
        timeoutMs: 30_000,
      },
    );

  it("denies expired break-glass cross-tenant email inspection but allows a valid break-glass context over real HTTP", () => {
    const probe = runAdminEmailDeliveryProbe();

    expect(probe.expiredBreakGlassStatus).toBe(404);
    expect(probe.expiredBreakGlassBody).toEqual({
      error: "Requested resource was not found.",
    });

    expect(probe.validBreakGlassStatus).toBe(200);
    expect(probe.validBreakGlassBody).toEqual(
      expect.objectContaining({
        messageId: expect.stringContaining(
          "email-delivery:organization:org_backend_e2e_email_delivery_target:",
        ),
        recipient: expect.stringContaining("backend-e2e-email-"),
        template: "welcome-email:v1",
        status: emailDeliveryStatus.complained,
        sentAt: "2026-05-05T06:45:00.000Z",
        lastEventAt: "2026-05-05T06:47:00.000Z",
      }),
    );
  });
});
