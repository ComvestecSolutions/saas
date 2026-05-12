import { emailDeliveryStatus } from "@comvestec/contracts";
import { describe, expect, it } from "vitest";
import {
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eEnvironment = tryResolveLocalBackendE2eEnvironment();
const describeLocalBackendE2e =
  localBackendE2eEnvironment === undefined ? describe.skip : describe;

describeLocalBackendE2e(
  "backend e2e email delivery provider-events transport",
  () => {
    const environment = localBackendE2eEnvironment!;

    const runEmailDeliveryProviderEventsProbe = () =>
      runBackendE2eBunProbe<{
        readonly validDeliveredStatus: number;
        readonly validDeliveredBody: {
          readonly acknowledged: boolean;
          readonly ignored: boolean;
        };
        readonly ignoredStatus: number;
        readonly ignoredBody: {
          readonly acknowledged: boolean;
          readonly ignored: boolean;
        };
        readonly missingTrackedStatus: number;
        readonly missingTrackedBody: {
          readonly error: string;
        };
        readonly invalidSignatureStatus: number;
        readonly invalidSignatureBody: {
          readonly error: string;
        };
        readonly invalidPayloadStatus: number;
        readonly invalidPayloadBody: {
          readonly error: string;
        };
        readonly deliveredRecordRow: {
          readonly status: string;
          readonly lastEventAt: string;
        } | null;
      }>(
        `import { createPrivateKey, createSign } from 'node:crypto';
import { Effect } from 'effect';
import { emailDeliveryStatus, platformScope } from '@comvestec/contracts';
import {
  buildEmailDeliveryPostgresQueryable,
  makeEmailDeliveryPostgresRepository,
} from '@comvestec/modules';
import {
  emailDeliveryApiPath,
  makePostgresAdapter,
  platformAdapterServiceName,
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

const requestJson = async (url, init) => {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);

  return {
    status: response.status,
    body,
  };
};

const buildSignedPostalHeaders = (body, keyId, privateKey) => {
  const signer = createSign('RSA-SHA256');
  signer.update(body);
  signer.end();

  return {
    'Content-Type': 'application/json',
    'X-Postal-Signature-256': signer.sign(privateKey).toString('base64'),
    'X-Postal-Signature-KID': keyId,
  };
};

const runId = Date.now().toString();
const tenantScopeId = 'org_backend_e2e_postal_' + runId;
const messageId = 'email-delivery:organization:' + tenantScopeId + ':message_' + runId;
const missingMessageId =
  'email-delivery:organization:' + tenantScopeId + ':missing_' + runId;
const postalKeyId = 'backend-e2e-postal-signing-key';
const recipient = 'backend-e2e-postal-' + runId + '@example.com';
const sentAt = '2026-05-13T10:00:00.000Z';
const deliveredOccurredAt = '2026-05-13T10:05:00.000Z';
const deliveredEventTimestamp = Math.floor(Date.parse(deliveredOccurredAt) / 1000);
const privateKey = createPrivateKey(
  Buffer.from(process.env.POSTAL_SIGNING_KEY_BASE64, 'base64').toString('utf8'),
);

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
    tenantScopeId,
    recipient,
    status: emailDeliveryStatus.queued,
    template: 'backend-e2e-postal:v1',
    senderDisplayName: 'Comvestec Platform',
    fromEmail: 'support@example.com',
    replyToEmail: 'reply@example.com',
    sentAt,
    lastEventAt: sentAt,
    createdAt: sentAt,
    updatedAt: sentAt,
  }),
);

const deliveredBody = JSON.stringify({
  event: 'MessageSent',
  timestamp: deliveredEventTimestamp,
  payload: {
    message: {
      message_id: messageId,
    },
    timestamp: deliveredEventTimestamp,
  },
  uuid: 'postal-wh-backend-e2e-delivered-' + runId,
});
const ignoredBody = JSON.stringify({
  event: 'MessageHeld',
  timestamp: deliveredEventTimestamp + 10,
  payload: {
    message: {
      message_id: 'email-delivery:organization:' + tenantScopeId + ':ignored_' + runId,
    },
  },
  uuid: 'postal-wh-backend-e2e-ignored-' + runId,
});
const missingTrackedBody = JSON.stringify({
  event: 'MessageSent',
  timestamp: deliveredEventTimestamp + 20,
  payload: {
    message: {
      message_id: missingMessageId,
    },
    timestamp: deliveredEventTimestamp + 20,
  },
  uuid: 'postal-wh-backend-e2e-missing-' + runId,
});
const invalidPayloadBody = JSON.stringify({
  event: 'MessageSent',
  timestamp: deliveredEventTimestamp + 30,
  payload: {},
  uuid: 'postal-wh-backend-e2e-invalid-payload-' + runId,
});

const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

try {
  const baseUrl = 'http://127.0.0.1:' + server.port;
  const validDeliveredResponse = await runStep(
    'process signed Postal delivered webhook',
    requestJson(new URL(emailDeliveryApiPath.processPostalProviderEvent, baseUrl), {
      method: 'POST',
      headers: buildSignedPostalHeaders(deliveredBody, postalKeyId, privateKey),
      body: deliveredBody,
    }),
  );
  const ignoredResponse = await runStep(
    'process signed Postal ignored webhook',
    requestJson(new URL(emailDeliveryApiPath.processPostalProviderEvent, baseUrl), {
      method: 'POST',
      headers: buildSignedPostalHeaders(ignoredBody, postalKeyId, privateKey),
      body: ignoredBody,
    }),
  );
  const missingTrackedResponse = await runStep(
    'process signed Postal webhook for unknown tracked delivery',
    requestJson(new URL(emailDeliveryApiPath.processPostalProviderEvent, baseUrl), {
      method: 'POST',
      headers: buildSignedPostalHeaders(missingTrackedBody, postalKeyId, privateKey),
      body: missingTrackedBody,
    }),
  );
  const invalidSignatureResponse = await runStep(
    'process Postal webhook with invalid signature',
    requestJson(new URL(emailDeliveryApiPath.processPostalProviderEvent, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Postal-Signature-256': 'invalid-signature',
        'X-Postal-Signature-KID': postalKeyId,
      },
      body: deliveredBody,
    }),
  );
  const invalidPayloadResponse = await runStep(
    'process signed Postal webhook with invalid payload mapping',
    requestJson(new URL(emailDeliveryApiPath.processPostalProviderEvent, baseUrl), {
      method: 'POST',
      headers: buildSignedPostalHeaders(
        invalidPayloadBody,
        postalKeyId,
        privateKey,
      ),
      body: invalidPayloadBody,
    }),
  );
  const deliveredRecordRows = await runStep(
    'read delivered email delivery tracking row',
    postgres.sqlClient\`
      select
        status,
        to_char(last_event_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "lastEventAt"
      from email_delivery_tracking
      where message_id = \${messageId}
      limit 1
    \`,
  );
  const [deliveredRecordRow] = deliveredRecordRows;

  console.log(JSON.stringify({
    validDeliveredStatus: validDeliveredResponse.status,
    validDeliveredBody: validDeliveredResponse.body,
    ignoredStatus: ignoredResponse.status,
    ignoredBody: ignoredResponse.body,
    missingTrackedStatus: missingTrackedResponse.status,
    missingTrackedBody: missingTrackedResponse.body,
    invalidSignatureStatus: invalidSignatureResponse.status,
    invalidSignatureBody: invalidSignatureResponse.body,
    invalidPayloadStatus: invalidPayloadResponse.status,
    invalidPayloadBody: invalidPayloadResponse.body,
    deliveredRecordRow: deliveredRecordRow ?? null,
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
          timeoutMs: 120_000,
        },
      );

    it("handles verified, ignored, invalid, and unknown Postal provider events over the real backend route", () => {
      const probe = runEmailDeliveryProviderEventsProbe();

      expect(probe.validDeliveredStatus).toBe(202);
      expect(probe.validDeliveredBody).toEqual({
        acknowledged: true,
        ignored: false,
      });

      expect(probe.ignoredStatus).toBe(202);
      expect(probe.ignoredBody).toEqual({
        acknowledged: true,
        ignored: true,
      });

      expect(probe.missingTrackedStatus).toBe(404);
      expect(probe.missingTrackedBody).toEqual({
        error: "Requested resource was not found.",
      });

      expect(probe.invalidSignatureStatus).toBe(401);
      expect(probe.invalidSignatureBody).toEqual({
        error: "Authentication or signature validation failed.",
      });

      expect(probe.invalidPayloadStatus).toBe(422);
      expect(probe.invalidPayloadBody).toEqual({
        error: "Provider payload could not be mapped to the platform contract.",
      });

      expect(probe.deliveredRecordRow).toEqual({
        status: emailDeliveryStatus.delivered,
        lastEventAt: "2026-05-13T10:05:00.000Z",
      });
    });
  },
);
