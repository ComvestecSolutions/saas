import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  notificationChannel,
  notificationDeliveryStatus,
} from "@comvestec/contracts";
import {
  makeDefaultNotificationCenterPort,
  platformAdapterServiceName,
  type NovuAdapterService,
  type NovuMessageRecord,
  type NovuNotificationEventRecord,
} from "@comvestec/platform";

const createNovuAdapterDouble = (input: {
  readonly listMessages?: (
    request: Parameters<NovuAdapterService["listMessages"]>[0],
  ) => ReturnType<NovuAdapterService["listMessages"]>;
  readonly getNotification?: (
    request: Parameters<NovuAdapterService["getNotification"]>[0],
  ) => ReturnType<NovuAdapterService["getNotification"]>;
  readonly triggerEvent?: (
    request: Parameters<NovuAdapterService["triggerEvent"]>[0],
  ) => ReturnType<NovuAdapterService["triggerEvent"]>;
}): NovuAdapterService => ({
  serviceName: platformAdapterServiceName.novu,
  apiUrl: "http://localhost:3101",
  healthcheck: Effect.succeed({
    healthy: true,
    service: platformAdapterServiceName.novu,
  } as const),
  triggerNotification: () =>
    Effect.die(new Error("Unexpected triggerNotification call.")),
  listMessages:
    input.listMessages ??
    (() => Effect.die(new Error("Unexpected listMessages call."))),
  getNotification:
    input.getNotification ??
    (() => Effect.die(new Error("Unexpected getNotification call."))),
  triggerEvent:
    input.triggerEvent ??
    (() => Effect.die(new Error("Unexpected triggerEvent call."))),
});

const buildNovuMessage = (
  overrides: Partial<NovuMessageRecord> = {},
): NovuMessageRecord => ({
  _id: "msg_1",
  _notificationId: "evt_1",
  _subscriberId: "sub_1",
  createdAt: "2026-06-01T10:00:00.000Z",
  transactionId: "tx_1",
  channel: "email",
  email: "customer@example.com",
  subject: "Invoice ready",
  status: "sent",
  ...overrides,
});

const buildNovuEvent = (
  overrides: Partial<NovuNotificationEventRecord> = {},
): NovuNotificationEventRecord => ({
  _id: "evt_1",
  transactionId: "tx_1",
  ...overrides,
});

describe("notification-center admin default Novu port", () => {
  it("maps live Novu messages into admin summaries and paginates within an upstream page", async () => {
    const listMessagesCalls: Array<
      Parameters<NovuAdapterService["listMessages"]>[0]
    > = [];
    const pageZeroMessages: ReadonlyArray<NovuMessageRecord> = [
      buildNovuMessage({
        _id: "msg_email_1",
        _notificationId: "evt_email_1",
        transactionId: "tx_email_1",
        deliveredAt: ["2026-06-01T10:01:00.000Z"],
      }),
      buildNovuMessage({
        _id: "msg_chat_1",
        _notificationId: "evt_chat_1",
        transactionId: "tx_chat_1",
        channel: "chat",
        email: undefined,
        directWebhookUrl: "https://hooks.example.com/notify",
        subject: undefined,
        title: "Webhook delivery",
      }),
    ];
    const port = makeDefaultNotificationCenterPort(
      createNovuAdapterDouble({
        listMessages: (request) => {
          listMessagesCalls.push(request);
          return Effect.succeed({
            hasMore: false,
            pageSize: pageZeroMessages.length,
            page: request.page ?? 0,
            totalCount: pageZeroMessages.length,
            data:
              request.page === undefined || request.page === 0
                ? pageZeroMessages
                : [],
          });
        },
      }),
    );

    const firstPage = await Effect.runPromise(
      port.listNotifications({
        filters: {},
        pageSize: 1,
      }),
    );

    expect(firstPage).toEqual({
      notifications: [
        {
          notificationId: "evt_email_1--msg_email_1",
          channel: notificationChannel.email,
          status: notificationDeliveryStatus.delivered,
          recipientProjection: "customer@example.com",
          subjectProjection: "Invoice ready",
          createdAt: "2026-06-01T10:00:00.000Z",
          deliveredAt: "2026-06-01T10:01:00.000Z",
        },
      ],
      nextPageToken: "0:1",
    });

    const secondPage = await Effect.runPromise(
      port.listNotifications({
        filters: {},
        pageSize: 1,
        ...(firstPage.nextPageToken === undefined
          ? {}
          : {
              pageToken: firstPage.nextPageToken,
            }),
      }),
    );

    expect(secondPage).toEqual({
      notifications: [
        {
          notificationId: "evt_chat_1--msg_chat_1",
          channel: notificationChannel.webhook,
          status: notificationDeliveryStatus.sent,
          recipientProjection: "https://hooks.example.com/notify",
          subjectProjection: "Webhook delivery",
          createdAt: "2026-06-01T10:00:00.000Z",
        },
      ],
    });

    const filtered = await Effect.runPromise(
      port.listNotifications({
        filters: {
          channel: notificationChannel.webhook,
          status: notificationDeliveryStatus.sent,
        },
        pageSize: 10,
      }),
    );

    expect(filtered.notifications).toEqual(secondPage.notifications);
    expect(listMessagesCalls.at(-1)).toMatchObject({
      channel: "chat",
    });
  });

  it("reads live Novu detail records and re-triggers resend requests from upstream metadata", async () => {
    const triggerEventCalls: Array<
      Parameters<NovuAdapterService["triggerEvent"]>[0]
    > = [];
    const message = buildNovuMessage({
      _id: "msg_detail_1",
      _notificationId: "evt_detail_1",
      transactionId: "tx_detail_1",
      content: "<p>Invoice ready</p>",
      payload: {
        invoiceId: "inv_from_message",
      },
      overrides: {
        email: {
          subject: "Invoice ready",
        },
      },
      contextKeys: ["tenantId:org_1", "plan:scale"],
      providerId: "provider_novu_1",
      _templateId: "tmpl_1",
      templateIdentifier: null,
      subscriber: {
        subscriberId: "sub_detail_1",
        email: "customer@example.com",
      },
    });
    const event = buildNovuEvent({
      _id: "evt_detail_1",
      transactionId: "tx_detail_1",
      payload: {
        invoiceId: "inv_from_event",
      },
      contextKeys: ["tenantId:org_1", "plan:scale"],
      subscriber: {
        subscriberId: "sub_detail_1",
        email: "customer@example.com",
      },
      template: {
        triggers: [{ identifier: "billing-invoice-ready" }],
      },
    });
    const port = makeDefaultNotificationCenterPort(
      createNovuAdapterDouble({
        listMessages: () =>
          Effect.succeed({
            hasMore: false,
            pageSize: 1,
            page: 0,
            totalCount: 1,
            data: [message],
          }),
        getNotification: (request) =>
          Effect.succeed(
            request.notificationId === "evt_detail_1"
              ? Option.some(event)
              : Option.none<NovuNotificationEventRecord>(),
          ),
        triggerEvent: (request) => {
          triggerEventCalls.push(request);
          return Effect.succeed({
            id: "novu_tx_resent_1",
            createdAt: "2026-06-01T11:05:00.000Z",
            provider: platformAdapterServiceName.novu,
          });
        },
      }),
    );

    const detail = await Effect.runPromise(
      port.getNotificationDetail({
        notificationId: "evt_detail_1--msg_detail_1",
      }),
    );

    expect(Option.isSome(detail)).toBe(true);
    if (Option.isSome(detail)) {
      expect(detail.value).toMatchObject({
        notificationId: "evt_detail_1--msg_detail_1",
        channel: notificationChannel.email,
        status: notificationDeliveryStatus.sent,
        recipientProjection: "customer@example.com",
        subjectProjection: "Invoice ready",
        createdAt: "2026-06-01T10:00:00.000Z",
        auditCorrelationId: "tx_detail_1",
      });
      expect(JSON.parse(detail.value.payloadProjection)).toEqual({
        payload: {
          invoiceId: "inv_from_event",
        },
        renderedContent: "<p>Invoice ready</p>",
      });
      expect(JSON.parse(detail.value.providerMetadata)).toMatchObject({
        provider: platformAdapterServiceName.novu,
        messageId: "msg_detail_1",
        parentNotificationId: "evt_detail_1",
        transactionId: "tx_detail_1",
        providerId: "provider_novu_1",
        templateId: "tmpl_1",
        overrides: {
          email: {
            subject: "Invoice ready",
          },
        },
        contextKeys: ["tenantId:org_1", "plan:scale"],
      });
    }

    await expect(
      Effect.runPromise(
        port.resendNotification({
          notificationId: "evt_detail_1--msg_detail_1",
        }),
      ),
    ).resolves.toEqual({
      accepted: true,
      resendNotificationId: "novu_tx_resent_1",
    });

    expect(triggerEventCalls).toHaveLength(1);
    expect(triggerEventCalls[0]).toMatchObject({
      name: "billing-invoice-ready",
      to: {
        subscriberId: "sub_detail_1",
        email: "customer@example.com",
      },
      payload: {
        invoiceId: "inv_from_event",
      },
      overrides: {
        email: {
          subject: "Invoice ready",
        },
      },
      context: {
        tenantId: "org_1",
        plan: "scale",
      },
    });
    expect(triggerEventCalls[0]?.transactionId).toMatch(/^tx_detail_1-resend-/);
  });
});
