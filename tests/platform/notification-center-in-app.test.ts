import { Effect } from "effect";
import {
  notificationCenterChannel,
  notificationCenterInAppStatus,
  notificationCenterNotificationFamily,
  platformModuleId,
  type NotificationCenterInAppNotificationRecord,
} from "@comvestec/contracts";
import {
  NotificationCenterInAppModule,
  makeNotificationCenterInAppModule,
} from "@comvestec/modules";
import {
  ConvexNotificationCenterInAppAdapter,
  type ConvexNotificationCenterInAppAdapterService,
  platformAdapterServiceName,
} from "@comvestec/platform";
import { organizationRequestContext } from "../modules/_fixtures";
import {
  makeNotificationCenterInAppService,
  type NotificationCenterInAppCurrentActorRequiredError,
  type NotificationCenterInAppNotificationNotFoundError,
} from "../../packages/platform/src/services/communication/notification-center-in-app";

const buildInAppNotificationId = (input: {
  readonly tenantScope: string;
  readonly tenantScopeId: string;
  readonly actorId: string;
  readonly family: string;
  readonly sourceEventId: string;
}) =>
  [
    "notification-center",
    "in-app",
    input.tenantScope,
    input.tenantScopeId,
    input.actorId,
    input.family,
    input.sourceEventId,
  ].join(":");

const createConvexNotificationCenterInAppAdapterDouble = () => {
  const notifications = new Map<
    string,
    NotificationCenterInAppNotificationRecord
  >();

  const service: ConvexNotificationCenterInAppAdapterService = {
    serviceName: platformAdapterServiceName.convex,
    deploymentUrl: "https://convex.example.test",
    siteUrl: "https://convex-site.example.test",
    healthcheck: Effect.succeed({
      healthy: true,
      service: platformAdapterServiceName.convex,
    }),
    createInAppNotificationRecord: (input) => {
      const notificationId = buildInAppNotificationId({
        tenantScope: input.tenantScope,
        tenantScopeId: input.tenantScopeId,
        actorId: input.actorId,
        family: input.family,
        sourceEventId: input.sourceEventId,
      });
      const existing = notifications.get(notificationId);

      if (existing !== undefined) {
        return Effect.succeed(existing);
      }

      const record: NotificationCenterInAppNotificationRecord = {
        notificationId,
        sourceEventId: input.sourceEventId,
        sourceModuleId: input.sourceModuleId,
        tenantScope: input.tenantScope,
        tenantScopeId: input.tenantScopeId,
        actorId: input.actorId,
        channel: notificationCenterChannel.inApp,
        family: input.family,
        status: notificationCenterInAppStatus.unread,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.bodySummary !== undefined
          ? { bodySummary: input.bodySummary }
          : {}),
        ...(input.actionLabel !== undefined
          ? { actionLabel: input.actionLabel }
          : {}),
        ...(input.actionUrl !== undefined
          ? { actionUrl: input.actionUrl }
          : {}),
        ...(input.correlationId !== undefined
          ? { correlationId: input.correlationId }
          : {}),
        ...(input.correlatedEmailReceiptId !== undefined
          ? { correlatedEmailReceiptId: input.correlatedEmailReceiptId }
          : {}),
        ...(input.correlatedDigestRunId !== undefined
          ? { correlatedDigestRunId: input.correlatedDigestRunId }
          : {}),
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      };

      notifications.set(notificationId, record);

      return Effect.succeed(record);
    },
    getInAppNotificationRecord: ({ notificationId }) =>
      Effect.succeed(notifications.get(notificationId)),
    listInAppNotificationRecords: ({
      tenantScope,
      tenantScopeId,
      actorId,
      pageSize,
    }) =>
      Effect.succeed(
        Array.from(notifications.values())
          .filter(
            (record) =>
              record.tenantScope === tenantScope &&
              record.tenantScopeId === tenantScopeId &&
              record.actorId === actorId,
          )
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, pageSize),
      ),
    markInAppNotificationRead: ({
      notificationId,
      tenantScope,
      tenantScopeId,
      actorId,
      readAt,
    }) => {
      const existing = notifications.get(notificationId);

      if (
        existing === undefined ||
        existing.tenantScope !== tenantScope ||
        existing.tenantScopeId !== tenantScopeId ||
        existing.actorId !== actorId
      ) {
        return Effect.succeed(undefined);
      }

      if (existing.status !== notificationCenterInAppStatus.unread) {
        return Effect.succeed(existing);
      }

      const nextRecord: NotificationCenterInAppNotificationRecord = {
        ...existing,
        status: notificationCenterInAppStatus.read,
        readAt,
        updatedAt: readAt,
      };

      notifications.set(notificationId, nextRecord);

      return Effect.succeed(nextRecord);
    },
    dismissInAppNotification: ({
      notificationId,
      tenantScope,
      tenantScopeId,
      actorId,
      dismissedAt,
    }) => {
      const existing = notifications.get(notificationId);

      if (
        existing === undefined ||
        existing.tenantScope !== tenantScope ||
        existing.tenantScopeId !== tenantScopeId ||
        existing.actorId !== actorId
      ) {
        return Effect.succeed(undefined);
      }

      if (existing.status === notificationCenterInAppStatus.dismissed) {
        return Effect.succeed(existing);
      }

      const nextRecord: NotificationCenterInAppNotificationRecord = {
        ...existing,
        status: notificationCenterInAppStatus.dismissed,
        dismissedAt,
        updatedAt: dismissedAt,
      };

      notifications.set(notificationId, nextRecord);

      return Effect.succeed(nextRecord);
    },
  };

  return {
    notifications,
    service,
  };
};

describe("platform notification center in-app service", () => {
  it("emits, lists, marks read, and dismisses current-actor in-app notifications", async () => {
    vi.useFakeTimers();

    try {
      vi.setSystemTime(new Date("2026-05-08T11:00:00.000Z"));
      const adapterDouble = createConvexNotificationCenterInAppAdapterDouble();
      const notificationCenterInAppModule = await Effect.runPromise(
        makeNotificationCenterInAppModule().pipe(
          Effect.provideService(
            ConvexNotificationCenterInAppAdapter,
            adapterDouble.service,
          ),
        ),
      );
      const service = await Effect.runPromise(
        makeNotificationCenterInAppService().pipe(
          Effect.provideService(
            NotificationCenterInAppModule,
            notificationCenterInAppModule,
          ),
        ),
      );

      const firstNotification = await Effect.runPromise(
        service.emitInAppNotification({
          sourceEventId: "invoice-ready:event_1",
          sourceModuleId: platformModuleId.billingAndMetering,
          tenantScope: organizationRequestContext.tenant.scope,
          tenantScopeId: organizationRequestContext.tenant.scopeId,
          actorId: organizationRequestContext.actorId ?? "usr_member_1",
          family: notificationCenterNotificationFamily.billingInvoiceReady,
          title: "Invoice ready",
          bodySummary: "Invoice inv_2026_04 is ready for $120.00.",
          actionLabel: "Review invoice",
          actionUrl: "https://product.example.com/billing/invoices/inv_2026_04",
          correlationId: organizationRequestContext.correlationId,
        }),
      );

      vi.setSystemTime(new Date("2026-05-08T11:05:00.000Z"));

      const secondNotification = await Effect.runPromise(
        service.emitInAppNotification({
          sourceEventId: "invoice-ready:event_2",
          sourceModuleId: platformModuleId.billingAndMetering,
          tenantScope: organizationRequestContext.tenant.scope,
          tenantScopeId: organizationRequestContext.tenant.scopeId,
          actorId: organizationRequestContext.actorId ?? "usr_member_1",
          family: notificationCenterNotificationFamily.billingInvoiceReady,
          title: "Second invoice ready",
          bodySummary: "Invoice inv_2026_05 is ready for $220.00.",
          actionLabel: "Review invoice",
          actionUrl: "https://product.example.com/billing/invoices/inv_2026_05",
          correlationId: organizationRequestContext.correlationId,
        }),
      );

      const inbox = await Effect.runPromise(
        service.listCurrentActorInAppNotifications({
          requestContext: organizationRequestContext,
        }),
      );

      expect(inbox.map((notification) => notification.id)).toEqual([
        secondNotification.notificationId,
        firstNotification.notificationId,
      ]);
      expect(inbox[0]).toMatchObject({
        channel: notificationCenterChannel.inApp,
        family: notificationCenterNotificationFamily.billingInvoiceReady,
        status: notificationCenterInAppStatus.unread,
      });

      vi.setSystemTime(new Date("2026-05-08T11:10:00.000Z"));

      const readNotification = await Effect.runPromise(
        service.markCurrentActorInAppNotificationRead({
          requestContext: organizationRequestContext,
          notificationId: firstNotification.notificationId,
        }),
      );

      expect(readNotification).toMatchObject({
        id: firstNotification.notificationId,
        status: notificationCenterInAppStatus.read,
        readAt: "2026-05-08T11:10:00.000Z",
      });

      vi.setSystemTime(new Date("2026-05-08T11:12:00.000Z"));

      const dismissedNotification = await Effect.runPromise(
        service.dismissCurrentActorInAppNotification({
          requestContext: organizationRequestContext,
          notificationId: secondNotification.notificationId,
        }),
      );

      expect(dismissedNotification).toMatchObject({
        id: secondNotification.notificationId,
        status: notificationCenterInAppStatus.dismissed,
        dismissedAt: "2026-05-08T11:12:00.000Z",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("requires an authenticated actor for current-actor inbox access", async () => {
    const adapterDouble = createConvexNotificationCenterInAppAdapterDouble();
    const notificationCenterInAppModule = await Effect.runPromise(
      makeNotificationCenterInAppModule().pipe(
        Effect.provideService(
          ConvexNotificationCenterInAppAdapter,
          adapterDouble.service,
        ),
      ),
    );
    const service = await Effect.runPromise(
      makeNotificationCenterInAppService().pipe(
        Effect.provideService(
          NotificationCenterInAppModule,
          notificationCenterInAppModule,
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.listCurrentActorInAppNotifications({
          requestContext: {
            ...organizationRequestContext,
            actorId: undefined,
          },
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "NotificationCenterInAppCurrentActorRequiredError",
      } satisfies NotificationCenterInAppCurrentActorRequiredError,
    });
  });

  it("returns a typed not-found error when the inbox notification is missing", async () => {
    const adapterDouble = createConvexNotificationCenterInAppAdapterDouble();
    const notificationCenterInAppModule = await Effect.runPromise(
      makeNotificationCenterInAppModule().pipe(
        Effect.provideService(
          ConvexNotificationCenterInAppAdapter,
          adapterDouble.service,
        ),
      ),
    );
    const service = await Effect.runPromise(
      makeNotificationCenterInAppService().pipe(
        Effect.provideService(
          NotificationCenterInAppModule,
          notificationCenterInAppModule,
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.markCurrentActorInAppNotificationRead({
          requestContext: organizationRequestContext,
          notificationId:
            "notification-center:in-app:organization:org_1:missing",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "NotificationCenterInAppNotificationNotFoundError",
        notificationId: "notification-center:in-app:organization:org_1:missing",
      } satisfies NotificationCenterInAppNotificationNotFoundError,
    });
  });
});
