import {
  emailDeliveryStatus,
  notificationCenterReceiptStatus,
} from "@comvestec/contracts";
import { platformAdapterServiceName } from "@comvestec/platform";
import { describe, expect, it } from "vitest";
import {
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eEnvironment,
  tryResolveLocalBackendE2eMessagingEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eEnvironment = tryResolveLocalBackendE2eEnvironment();
const localBackendE2eMessagingEnvironment =
  tryResolveLocalBackendE2eMessagingEnvironment();
const describeLocalBackendE2e =
  localBackendE2eEnvironment === undefined ||
  localBackendE2eMessagingEnvironment === undefined
    ? describe.skip
    : describe;

describeLocalBackendE2e("backend e2e notification dispatch runtime", () => {
  const environment = localBackendE2eEnvironment!;

  const runNotificationDispatchProbe = () =>
    runBackendE2eBunProbe<{
      readonly notificationReceiptId: string;
      readonly notificationProvider: string;
      readonly deliveryMessageId: string;
      readonly deliveryProvider: string;
      readonly emailReceiptStatus: string;
      readonly emailReceiptQueueReceiptId: string;
      readonly trackedDeliveryStatus: string;
      readonly trackedDeliveryRecipient: string;
      readonly trackedDeliveryProvider: string;
    }>(
      `import { notificationCenterConfigKey } from '@comvestec/config';
import {
  actorType,
  platformModuleId,
  platformScope,
  runtimeResolutionSource,
} from '@comvestec/contracts';
import {
  BillingStatePostgresRepository,
  EmailDeliveryPostgresRepository,
  NotificationCenterPostgresRepository,
  buildEmailDeliveryPostgresQueryable,
  buildNotificationCenterPostgresQueryable,
  makeEmailDeliveryModule,
  makeEmailDeliveryPostgresRepository,
  makeNotificationCenterModule,
  makeNotificationCenterPostgresRepository,
  makeRuntimeConfigModule,
  RuntimeConfigModule,
} from '@comvestec/modules';
import { Effect } from 'effect';
import {
  makeEmailDeliveryService,
  makeNotificationCenterService,
  makeNovuAdapter,
  makePostgresAdapter,
  makePostalAdapter,
  NovuAdapter,
  PostalAdapter,
} from '@comvestec/platform';
import { buildWriteDatabase } from './packages/platform/src/services/postgres-write-database.ts';

const createRuntimeConfigService = async (overrides) => {
  const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

  return {
    ...runtimeConfig,
    listOverridesByModule: (moduleId) =>
      Effect.succeed(
        overrides.filter((override) => override.moduleId === moduleId),
      ),
  };
};

const tenantScopeId = 'org_backend_e2e_notification_runtime';
const runId = Date.now().toString();
const recipient = 'backend-e2e-notification-' + runId + '@example.com';
const runtimeConfig = await createRuntimeConfigService([
  {
    moduleId: platformModuleId.notificationCenter,
    key: notificationCenterConfigKey.digestIntervalMinutes,
    scope: platformScope.organization,
    scopeId: tenantScopeId,
    value: 0,
    source: runtimeResolutionSource.runtimeOverride,
    changedBy: 'usr_backend_e2e_notification_runtime_operator',
    changedAt: new Date().toISOString(),
  },
]);
const postgres = await Effect.runPromise(
  makePostgresAdapter({
    connectionString: process.env.POSTGRES_URL,
  }),
);

try {
  const writeDatabase = buildWriteDatabase(postgres.database);
  const emailDeliveryRepository = await Effect.runPromise(
    makeEmailDeliveryPostgresRepository(
      buildEmailDeliveryPostgresQueryable(writeDatabase),
    ),
  );
  const postal = await Effect.runPromise(
    makePostalAdapter({
      apiUrl: process.env.POSTAL_API_URL,
      apiKey: process.env.POSTAL_API_KEY,
    }),
  );
  const emailDeliveryModule = await Effect.runPromise(
    makeEmailDeliveryModule().pipe(
      Effect.provideService(PostalAdapter, postal),
      Effect.provideService(
        EmailDeliveryPostgresRepository,
        emailDeliveryRepository,
      ),
    ),
  );
  const emailDeliveryService = await Effect.runPromise(
    makeEmailDeliveryService({
      platformSender: {
        displayName: process.env.PLATFORM_EMAIL_SENDER_DISPLAY_NAME,
        fromEmail: process.env.PLATFORM_EMAIL_SENDER_FROM_EMAIL,
        replyToEmail: process.env.PLATFORM_EMAIL_SENDER_REPLY_TO_EMAIL,
      },
      emailDelivery: emailDeliveryModule,
    }).pipe(
      Effect.provideService(RuntimeConfigModule, runtimeConfig),
      Effect.provideService(BillingStatePostgresRepository, {
        getTenantAccessState: () =>
          Effect.succeed({
            entitlements: [],
            invoiceHistory: [],
          }),
      }),
    ),
  );
  const novu = await Effect.runPromise(
    makeNovuAdapter({
      apiUrl: process.env.NOVU_API_URL,
      apiKey: process.env.NOVU_API_KEY,
    }),
  );
  const notificationCenterRepository = await Effect.runPromise(
    makeNotificationCenterPostgresRepository(
      buildNotificationCenterPostgresQueryable(writeDatabase),
    ),
  );
  const notificationCenterModule = await Effect.runPromise(
    makeNotificationCenterModule().pipe(
      Effect.provideService(NovuAdapter, novu),
      Effect.provideService(
        NotificationCenterPostgresRepository,
        notificationCenterRepository,
      ),
    ),
  );
  const service = await Effect.runPromise(
    makeNotificationCenterService({
      emailDelivery: emailDeliveryService,
      notificationCenter: notificationCenterModule,
    }).pipe(Effect.provideService(RuntimeConfigModule, runtimeConfig)),
  );

  const result = await Effect.runPromise(
    service.dispatchBillingInvoiceReadyNotification({
      requestContext: {
        actorType: actorType.platformOperator,
        actorId: 'usr_backend_e2e_notification_runtime_operator',
        sessionId: 'sess_backend_e2e_notification_runtime_operator',
        correlationId: 'corr_backend_e2e_notification_runtime_operator',
        reason: 'Validate live Postal and Novu notification dispatch.',
        tenant: {
          scope: platformScope.organization,
          scopeId: tenantScopeId,
          organizationId: tenantScopeId,
        },
      },
      recipient,
      invoiceNumber: 'INV-BACKEND-E2E-' + runId,
      invoiceUrl: 'https://product.example.com/billing/invoices/' + runId,
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      totalDue: '$42.00',
    }),
  );

  if (result.notification.status !== 'queued' || !('delivery' in result)) {
    throw new Error(
      'Expected live notification dispatch to queue both Novu and Postal receipts.',
    );
  }

  const emailReceipt = await Effect.runPromise(
    notificationCenterModule.findEmailReceipt({
      notificationId: result.notification.notificationId,
    }),
  );

  if (emailReceipt === undefined) {
    throw new Error(
      'Expected a persisted notification-center email receipt record.',
    );
  }

  const trackedDelivery = await Effect.runPromise(
    emailDeliveryRepository.findTrackedDelivery({
      messageId: result.delivery.messageId,
    }),
  );

  if (trackedDelivery === undefined) {
    throw new Error('Expected a persisted email-delivery tracking record.');
  }

  console.log(JSON.stringify({
    notificationReceiptId: result.notification.receipt.id,
    notificationProvider: result.notification.receipt.provider,
    deliveryMessageId: result.delivery.messageId,
    deliveryProvider: result.delivery.provider,
    emailReceiptStatus: emailReceipt.status,
    emailReceiptQueueReceiptId: emailReceipt.queueReceiptId,
    trackedDeliveryStatus: trackedDelivery.status,
    trackedDeliveryRecipient: trackedDelivery.recipient,
    trackedDeliveryProvider: trackedDelivery.provider,
  }));
} finally {
  await Effect.runPromise(Effect.ignore(postgres.close));
}`,
      {
        env: {
          ...process.env,
          ...environment,
        },
        timeoutMs: 45_000,
      },
    );

  it("dispatches a real billing notification through Postal and Novu", () => {
    const probe = runNotificationDispatchProbe();

    expect(probe.notificationProvider).toBe(platformAdapterServiceName.novu);
    expect(probe.deliveryProvider).toBe(platformAdapterServiceName.postal);
    expect(probe.emailReceiptStatus).toBe(
      notificationCenterReceiptStatus.queued,
    );
    expect(probe.emailReceiptQueueReceiptId).toBe(probe.notificationReceiptId);
    expect(probe.trackedDeliveryStatus).toBe(emailDeliveryStatus.queued);
    expect(probe.trackedDeliveryRecipient).toContain(
      "backend-e2e-notification-",
    );
    expect(probe.trackedDeliveryProvider).toBe(
      platformAdapterServiceName.postal,
    );
  });
});
