import {
  emailDeliveryTemplateId,
  notificationCenterChannel,
} from "@comvestec/contracts";
import { describe, expect, it } from "vitest";
import {
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eEnvironment = tryResolveLocalBackendE2eEnvironment();
const describeLocalBackendE2e =
  localBackendE2eEnvironment === undefined ? describe.skip : describe;

describeLocalBackendE2e(
  "backend e2e admin notification-center transport",
  () => {
    const environment = localBackendE2eEnvironment!;

    const runAdminNotificationCenterProbe = () =>
      runBackendE2eBunProbe<{
        readonly unauthenticatedInspectStatus: number;
        readonly unauthenticatedInspectBody: {
          readonly error: string;
        };
        readonly sameTenantUpsertStatus: number;
        readonly sameTenantUpsertBody: {
          readonly channel: string;
          readonly recipient: string;
          readonly template: string;
          readonly enabled: boolean;
          readonly updatedBy: string;
          readonly updatedAt: string;
        };
        readonly sameTenantInspectStatus: number;
        readonly sameTenantInspectBody: {
          readonly channel: string;
          readonly recipient: string;
          readonly template: string;
          readonly enabled: boolean;
          readonly updatedBy: string;
          readonly updatedAt: string;
        };
        readonly expiredBreakGlassInspectStatus: number;
        readonly expiredBreakGlassInspectBody: {
          readonly error: string;
        };
        readonly validBreakGlassInspectStatus: number;
        readonly validBreakGlassInspectBody: {
          readonly channel: string;
          readonly recipient: string;
          readonly template: string;
          readonly enabled: boolean;
          readonly updatedBy: string;
          readonly updatedAt: string;
        };
      }>(
        `import { Effect } from 'effect';
 import { waitForOryKetoTuple } from './tests/platform/backend-e2e/_shared/wait-for-ory-keto-tuple.ts';
 import {
   actorType,
   authorizationNamespace,
  authorizationRelation,
  emailDeliveryTemplateId,
  notificationCenterChannel,
  platformModuleId,
  platformScope,
} from '@comvestec/contracts';
import {
  buildNotificationCenterPostgresQueryable,
  makeNotificationCenterPostgresRepository,
} from '@comvestec/modules';
import {
  adminNotificationCenterApiPath,
  makeOryKetoAdapter,
  makePostgresAdapter,
  makeValkeyAdapter,
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

const runId = Date.now().toString();
const actorId = 'usr_backend_e2e_notification_center_operator';
const reason = 'Validate admin notification-center backend route family';
const homeTenantScopeId = 'org_backend_e2e_notification_center_home';
const targetTenantScopeId = 'org_backend_e2e_notification_center_target';
const sameTenantSessionId = 'sess_backend_e2e_notification_center_same_' + runId;
const expiredSessionId =
  'sess_backend_e2e_notification_center_expired_' + runId;
const validSessionId = 'sess_backend_e2e_notification_center_valid_' + runId;
const mixedCaseRecipient = 'Backend-E2E-Notification-' + runId + '@Example.COM';
const expectedRecipient = mixedCaseRecipient.toLowerCase();
const targetRecipient = 'Target-Notification-' + runId + '@Example.COM';
const expectedTargetRecipient = targetRecipient.toLowerCase();
const template = emailDeliveryTemplateId.billingInvoiceReady;

const valkey = await Effect.runPromise(
  makeValkeyAdapter({ url: process.env.VALKEY_URL }),
);
await Effect.runPromise(
  valkey.writeSession({
    sessionId: sameTenantSessionId,
    requestContext: {
      actorType: actorType.supportOperator,
      actorId,
      sessionId: sameTenantSessionId,
      correlationId: 'corr_backend_e2e_notification_center_same',
      reason,
      tenant: {
        scope: platformScope.organization,
        scopeId: homeTenantScopeId,
        organizationId: homeTenantScopeId,
      },
    },
  }),
);
await Effect.runPromise(
  valkey.writeSession({
    sessionId: expiredSessionId,
    requestContext: {
      actorType: actorType.supportOperator,
      actorId,
      sessionId: expiredSessionId,
      correlationId: 'corr_backend_e2e_notification_center_expired',
      reason,
      tenant: {
        scope: platformScope.organization,
        scopeId: homeTenantScopeId,
        organizationId: homeTenantScopeId,
      },
      breakGlass: {
        approvedBy: 'usr_backend_e2e_notification_center_approver',
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
      correlationId: 'corr_backend_e2e_notification_center_valid',
      reason,
      tenant: {
        scope: platformScope.organization,
        scopeId: homeTenantScopeId,
        organizationId: homeTenantScopeId,
      },
      breakGlass: {
        approvedBy: 'usr_backend_e2e_notification_center_approver',
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
     object: platformModuleId.notificationCenter,
     relation: authorizationRelation.admin,
     subject: actorId,
   }),
 );
 await waitForOryKetoTuple({
   oryKeto,
   tuple: {
     namespace: authorizationNamespace.module,
     object: platformModuleId.notificationCenter,
     relation: authorizationRelation.admin,
     subject: actorId,
   },
 });
 
 const postgres = await Effect.runPromise(
   makePostgresAdapter({
    connectionString: process.env.POSTGRES_URL,
  }),
);
const notificationCenterRepository = await Effect.runPromise(
  makeNotificationCenterPostgresRepository(
    buildNotificationCenterPostgresQueryable(postgres.database),
  ),
);
await Effect.runPromise(
  notificationCenterRepository.upsertEmailPreference({
    tenantScope: platformScope.organization,
    tenantScopeId: targetTenantScopeId,
    channel: notificationCenterChannel.email,
    recipient: targetRecipient,
    template,
    enabled: false,
    updatedBy: 'usr_backend_e2e_notification_center_seed',
    createdAt: '2026-05-08T12:00:00.000Z',
    updatedAt: '2026-05-08T12:00:00.000Z',
  }),
);

const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

try {
  const baseUrl = 'http://127.0.0.1:' + server.port;
  const unauthenticatedInspectResponse = await runStep(
    'notification-center inspect preference without trusted session header',
    fetch(new URL(adminNotificationCenterApiPath.inspectEmailPreference, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: sameTenantSessionId,
        tenantScope: platformScope.organization,
        tenantScopeId: homeTenantScopeId,
        recipient: mixedCaseRecipient,
        template,
      }),
    }),
  );
  const sameTenantUpsertResponse = await runStep(
    'notification-center upsert same-tenant preference',
    fetch(new URL(adminNotificationCenterApiPath.upsertEmailPreference, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sameTenantSessionId,
      },
      body: JSON.stringify({
        tenantScope: platformScope.organization,
        tenantScopeId: homeTenantScopeId,
        recipient: mixedCaseRecipient,
        template,
        enabled: true,
      }),
    }),
  );
  const sameTenantInspectResponse = await runStep(
    'notification-center inspect same-tenant preference',
    fetch(new URL(adminNotificationCenterApiPath.inspectEmailPreference, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sameTenantSessionId,
      },
      body: JSON.stringify({
        tenantScope: platformScope.organization,
        tenantScopeId: homeTenantScopeId,
        recipient: mixedCaseRecipient,
        template,
      }),
    }),
  );
  const expiredBreakGlassInspectResponse = await runStep(
    'notification-center inspect cross-tenant preference with expired break glass',
    fetch(new URL(adminNotificationCenterApiPath.inspectEmailPreference, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: expiredSessionId,
      },
      body: JSON.stringify({
        tenantScope: platformScope.organization,
        tenantScopeId: targetTenantScopeId,
        recipient: targetRecipient,
        template,
      }),
    }),
  );
  const validBreakGlassInspectResponse = await runStep(
    'notification-center inspect cross-tenant preference with valid break glass',
    fetch(new URL(adminNotificationCenterApiPath.inspectEmailPreference, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: validSessionId,
      },
      body: JSON.stringify({
        tenantScope: platformScope.organization,
        tenantScopeId: targetTenantScopeId,
        recipient: targetRecipient,
        template,
      }),
    }),
  );

  console.log(JSON.stringify({
    unauthenticatedInspectStatus: unauthenticatedInspectResponse.status,
    unauthenticatedInspectBody: await unauthenticatedInspectResponse.json(),
    sameTenantUpsertStatus: sameTenantUpsertResponse.status,
    sameTenantUpsertBody: await sameTenantUpsertResponse.json(),
    sameTenantInspectStatus: sameTenantInspectResponse.status,
    sameTenantInspectBody: await sameTenantInspectResponse.json(),
    expiredBreakGlassInspectStatus: expiredBreakGlassInspectResponse.status,
    expiredBreakGlassInspectBody: await expiredBreakGlassInspectResponse.json(),
    validBreakGlassInspectStatus: validBreakGlassInspectResponse.status,
    validBreakGlassInspectBody: await validBreakGlassInspectResponse.json(),
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

    it("enforces trusted sessions and break-glass rules while round-tripping admin notification-center email preferences over real HTTP", () => {
      const probe = runAdminNotificationCenterProbe();

      expect(probe.unauthenticatedInspectStatus).toBe(401);
      expect(probe.unauthenticatedInspectBody).toEqual({
        error: "Authenticated operator session is required.",
      });

      expect(probe.sameTenantUpsertStatus).toBe(200);
      expect(probe.sameTenantUpsertBody).toEqual(
        expect.objectContaining({
          channel: notificationCenterChannel.email,
          recipient: expect.stringContaining("backend-e2e-notification-"),
          template: emailDeliveryTemplateId.billingInvoiceReady,
          enabled: true,
          updatedBy: "usr_backend_e2e_notification_center_operator",
          updatedAt: expect.any(String),
        }),
      );
      expect(probe.sameTenantUpsertBody.recipient).toBe(
        probe.sameTenantUpsertBody.recipient.toLowerCase(),
      );

      expect(probe.sameTenantInspectStatus).toBe(200);
      expect(probe.sameTenantInspectBody).toEqual(
        expect.objectContaining({
          channel: notificationCenterChannel.email,
          recipient: probe.sameTenantUpsertBody.recipient,
          template: emailDeliveryTemplateId.billingInvoiceReady,
          enabled: true,
          updatedBy: "usr_backend_e2e_notification_center_operator",
          updatedAt: expect.any(String),
        }),
      );

      expect(probe.expiredBreakGlassInspectStatus).toBe(403);
      expect(probe.expiredBreakGlassInspectBody).toEqual({
        error:
          "Notification-center inspection is not allowed for this session.",
      });

      expect(probe.validBreakGlassInspectStatus).toBe(200);
      expect(probe.validBreakGlassInspectBody).toEqual(
        expect.objectContaining({
          channel: notificationCenterChannel.email,
          recipient: expect.stringContaining("target-notification-"),
          template: emailDeliveryTemplateId.billingInvoiceReady,
          enabled: false,
          updatedBy: "usr_backend_e2e_notification_center_seed",
          updatedAt: "2026-05-08T12:00:00.000Z",
        }),
      );
      expect(probe.validBreakGlassInspectBody.recipient).toBe(
        probe.validBreakGlassInspectBody.recipient.toLowerCase(),
      );
      expect(probe.validBreakGlassInspectBody.recipient).not.toBe(
        probe.sameTenantUpsertBody.recipient,
      );
    });
  },
);
