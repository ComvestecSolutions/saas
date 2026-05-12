import { billingWebhookReceiptProcessingState } from "@comvestec/contracts";
import { describe, expect, it } from "vitest";
import {
  isLocalBackendE2ePolarReady,
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eEnvironment = tryResolveLocalBackendE2eEnvironment();
const describeLocalBackendE2e =
  localBackendE2eEnvironment === undefined || !isLocalBackendE2ePolarReady()
    ? describe.skip
    : describe;

describeLocalBackendE2e("backend e2e billing webhooks transport", () => {
  const environment = localBackendE2eEnvironment!;

  const runBillingWebhooksProbe = () =>
    runBackendE2eBunProbe<{
      readonly unsignedProcessStatus: number;
      readonly unsignedProcessBody: {
        readonly error: string;
      };
      readonly missingReplayStatus: number;
      readonly missingReplayBody: {
        readonly error: string;
      };
      readonly firstReplayStatus: number;
      readonly firstReplayBody: {
        readonly reconciliation: {
          readonly event: {
            readonly deliveryId: string;
            readonly eventId: string;
            readonly subscriptionId: string;
          };
        };
      };
      readonly secondReplayStatus: number;
      readonly secondReplayBody: {
        readonly reconciliation: {
          readonly event: {
            readonly deliveryId: string;
            readonly eventId: string;
            readonly subscriptionId: string;
          };
        };
      };
      readonly receiptCount: number;
      readonly subscriptionCount: number;
      readonly paymentEventCount: number;
      readonly receiptProcessingState: string | null;
    }>(
      `import { Effect } from 'effect';
 import {
   billingWebhookEventType,
   billingWebhookReceiptProcessingState,
  billingWebhookReconciliationAction,
  platformScope,
} from '@comvestec/contracts';
 import { webhookReceiptsTable } from '@comvestec/modules';
import {
  makePostgresAdapter,
  platformAdapterServiceName,
  subscriberJourneyApiPath,
  webhooksApiPath,
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
const deliveryId = 'wh_backend_e2e_replay_' + runId;
const eventId = 'evt_backend_e2e_replay_' + runId;
const subscriptionId = 'sub_backend_e2e_replay_' + runId;
const receiptId = platformAdapterServiceName.polar + ':' + deliveryId;
const tenantScopeId = 'org_smoke';
const occurredAt = new Date().toISOString();

const postgres = await runStep(
  'create postgres adapter',
  Effect.runPromise(
    makePostgresAdapter({
      connectionString: process.env.POSTGRES_URL,
    }),
  ),
);
const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

try {
  const baseUrl = 'http://127.0.0.1:' + server.port;
  const publicPlansResponse = await runStep(
    'subscriber public plans for replay fixture',
    fetch(new URL(subscriberJourneyApiPath.listPublicPlans, baseUrl)),
  );
  const publicPlansBody = await publicPlansResponse.json();

  if (publicPlansResponse.status !== 200) {
    throw new Error(
      'Expected public billing plans before webhook replay probe, received ' +
        publicPlansResponse.status +
        '.',
    );
  }

  const activePlan = publicPlansBody.plans.find((plan) => plan.active);

  if (activePlan === undefined) {
    throw new Error('Expected at least one active public billing plan.');
  }

  const activePrice = activePlan.prices.find((price) => price.active);

  if (activePrice === undefined) {
    throw new Error(
      'Expected the active public billing plan to expose at least one active price.',
    );
  }

  await runStep(
    'seed replay receipt',
    postgres.database
      .insert(webhookReceiptsTable)
      .values({
        receiptId,
        provider: platformAdapterServiceName.polar,
        deliveryId,
        eventType: billingWebhookEventType.checkoutCompleted,
        processingState: billingWebhookReceiptProcessingState.pending,
        verifiedSignature: true,
        scope: platformScope.organization,
        scopeId: tenantScopeId,
        payload: {
          eventId,
          subscriptionId,
          planId: activePlan.planId,
          priceId: activePrice.priceId,
          occurredAt,
          action: billingWebhookReconciliationAction.activate,
          entitlementsActive: true,
        },
        receivedAt: new Date(occurredAt),
      })
      .execute(),
  );

  const unsignedProcessResponse = await runStep(
    'billing webhook process without signature',
    fetch(new URL(webhooksApiPath.processPolarWebhook, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'subscription.created',
      }),
    }),
  );
  const missingReplayResponse = await runStep(
    'billing webhook replay missing delivery',
    fetch(new URL(webhooksApiPath.replayPolarWebhook, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deliveryId: 'wh_backend_e2e_missing_' + runId,
      }),
    }),
  );
  const firstReplayResponse = await runStep(
    'billing webhook replay first pass',
    fetch(new URL(webhooksApiPath.replayPolarWebhook, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deliveryId,
      }),
    }),
  );
  const secondReplayResponse = await runStep(
    'billing webhook replay second pass',
    fetch(new URL(webhooksApiPath.replayPolarWebhook, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deliveryId,
      }),
    }),
  );
   const receiptCountRows = await runStep(
     'count webhook receipts after replay',
    postgres.sqlClient\`
       select count(*)::int as count
       from webhook_receipts
        where provider = \${platformAdapterServiceName.polar}
          and delivery_id = \${deliveryId}
     \`,
   );
   const subscriptionCountRows = await runStep(
     'count billing subscriptions after replay',
    postgres.sqlClient\`
       select count(*)::int as count
       from billing_subscriptions
        where provider = \${platformAdapterServiceName.polar}
          and provider_subscription_id = \${subscriptionId}
     \`,
   );
   const paymentEventCountRows = await runStep(
     'count billing payment events after replay',
    postgres.sqlClient\`
       select count(*)::int as count
       from billing_payment_events
        where provider = \${platformAdapterServiceName.polar}
          and provider_event_id = \${eventId}
     \`,
   );
   const receiptRows = await runStep(
     'read replayed webhook receipt',
    postgres.sqlClient\`
       select processing_state as "processingState"
       from webhook_receipts
        where provider = \${platformAdapterServiceName.polar}
          and delivery_id = \${deliveryId}
       limit 1
     \`,
     15000,
   );
   const [receiptCountRow] = receiptCountRows;
   const [subscriptionCountRow] = subscriptionCountRows;
   const [paymentEventCountRow] = paymentEventCountRows;
   const [receiptRow] = receiptRows;

  console.log(JSON.stringify({
    unsignedProcessStatus: unsignedProcessResponse.status,
    unsignedProcessBody: await unsignedProcessResponse.json(),
    missingReplayStatus: missingReplayResponse.status,
    missingReplayBody: await missingReplayResponse.json(),
    firstReplayStatus: firstReplayResponse.status,
    firstReplayBody: await firstReplayResponse.json(),
    secondReplayStatus: secondReplayResponse.status,
    secondReplayBody: await secondReplayResponse.json(),
    receiptCount: Number(receiptCountRow?.count ?? 0),
    subscriptionCount: Number(subscriptionCountRow?.count ?? 0),
    paymentEventCount: Number(paymentEventCountRow?.count ?? 0),
    receiptProcessingState: receiptRow?.processingState ?? null,
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

  it("rejects unsigned webhook delivery attempts and keeps replayed webhook persistence idempotent over real HTTP", () => {
    const probe = runBillingWebhooksProbe();

    expect(probe.unsignedProcessStatus).toBe(401);
    expect(probe.unsignedProcessBody).toEqual({
      error: "Authentication or signature validation failed.",
    });

    expect(probe.missingReplayStatus).toBe(404);
    expect(probe.missingReplayBody).toEqual({
      error: "Requested resource was not found.",
    });

    expect(probe.firstReplayStatus).toBe(202);
    expect(probe.firstReplayBody.reconciliation.event).toEqual(
      expect.objectContaining({
        deliveryId: expect.stringContaining("wh_backend_e2e_replay_"),
        eventId: expect.stringContaining("evt_backend_e2e_replay_"),
        subscriptionId: expect.stringContaining("sub_backend_e2e_replay_"),
      }),
    );

    expect(probe.secondReplayStatus).toBe(202);
    expect(probe.secondReplayBody.reconciliation.event).toEqual(
      probe.firstReplayBody.reconciliation.event,
    );

    expect(probe.receiptCount).toBe(1);
    expect(probe.subscriptionCount).toBe(1);
    expect(probe.paymentEventCount).toBe(1);
    expect(probe.receiptProcessingState).toBe(
      billingWebhookReceiptProcessingState.processed,
    );
  });
});
