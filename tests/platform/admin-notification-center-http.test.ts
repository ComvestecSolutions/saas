import { Effect, Schema } from "effect";
import {
  createAdminNotificationCenterHttpHandler,
  adminNotificationCenterApiPath,
  subscriberJourneySessionHeaderName,
  type AdminNotificationCenterService,
} from "@comvestec/platform";
import {
  emailDeliveryTemplateId,
  notificationCenterChannel,
  notificationCenterInAppStatus,
  notificationCenterNotificationFamily,
  notificationCenterReceiptStatus,
  platformModuleId,
} from "@comvestec/contracts";

const unexpectedAdminNotificationCenterServiceEffect = <A>() =>
  Effect.die(new Error("Unexpected admin notification-center service call."));

const defaultInspectEmailReceipt: AdminNotificationCenterService["inspectEmailReceipt"] =
  () => unexpectedAdminNotificationCenterServiceEffect();

const defaultInspectInAppNotification: AdminNotificationCenterService["inspectInAppNotification"] =
  () => unexpectedAdminNotificationCenterServiceEffect();

const defaultInspectEmailPreference: AdminNotificationCenterService["inspectEmailPreference"] =
  () => unexpectedAdminNotificationCenterServiceEffect();

const defaultUpsertEmailPreference: AdminNotificationCenterService["upsertEmailPreference"] =
  () => unexpectedAdminNotificationCenterServiceEffect();

const defaultResolveRequestContext: AdminNotificationCenterService["resolveRequestContext"] =
  () => unexpectedAdminNotificationCenterServiceEffect();

const createAdminNotificationCenterServiceDouble = (
  overrides: Partial<AdminNotificationCenterService>,
): AdminNotificationCenterService => ({
  resolveRequestContext:
    overrides.resolveRequestContext ?? defaultResolveRequestContext,
  inspectEmailReceipt:
    overrides.inspectEmailReceipt ?? defaultInspectEmailReceipt,
  inspectInAppNotification:
    overrides.inspectInAppNotification ?? defaultInspectInAppNotification,
  inspectEmailPreference:
    overrides.inspectEmailPreference ?? defaultInspectEmailPreference,
  upsertEmailPreference:
    overrides.upsertEmailPreference ?? defaultUpsertEmailPreference,
});

const createTestHandler = (service: Partial<AdminNotificationCenterService>) =>
  createAdminNotificationCenterHttpHandler((use) =>
    use(createAdminNotificationCenterServiceDouble(service)),
  );

const createParseError = () =>
  Effect.runSync(Schema.decodeUnknown(Schema.String)(123).pipe(Effect.flip));

describe("platform admin notification center http", () => {
  it("does not trust body session ids when the trusted header is missing", async () => {
    const inspectEmailReceipt = vi.fn(() =>
      unexpectedAdminNotificationCenterServiceEffect(),
    );
    const handler = createTestHandler({
      inspectEmailReceipt,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminNotificationCenterApiPath.inspectEmailReceipt}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sessionId: "sess_body_only_notification_center_admin",
              notificationId:
                "notification-center:organization:org_1:receipt_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authenticated operator session is required.",
    });
    expect(inspectEmailReceipt).not.toHaveBeenCalled();
  });

  it("overrides body session ids with the trusted header value", async () => {
    const inspectEmailReceipt = vi.fn((input) =>
      Effect.succeed({
        id: input.notificationId,
        channel: notificationCenterChannel.email,
        status: notificationCenterReceiptStatus.queued,
        recipient: "customer@example.com",
        template: emailDeliveryTemplateId.billingInvoiceReady,
        emailDeliveryMessageId: "email-delivery:organization:org_1:msg_1",
        createdAt: "2026-05-06T10:55:00.000Z",
      }),
    );
    const handler = createTestHandler({
      inspectEmailReceipt,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminNotificationCenterApiPath.inspectEmailReceipt}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_header_notification_center_admin",
            },
            body: JSON.stringify({
              sessionId: "sess_body_only_notification_center_admin",
              notificationId:
                "notification-center:organization:org_1:receipt_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(inspectEmailReceipt).toHaveBeenCalledWith({
      sessionId: "sess_header_notification_center_admin",
      notificationId: "notification-center:organization:org_1:receipt_1",
    });
  });

  it("inspects notification-center receipts through the admin communication surface", async () => {
    const handler = createTestHandler({
      inspectEmailReceipt: () =>
        Effect.succeed({
          id: "notification-center:organization:org_1:receipt_1",
          channel: notificationCenterChannel.email,
          status: notificationCenterReceiptStatus.queueFailed,
          recipient: "customer@example.com",
          template: emailDeliveryTemplateId.billingInvoiceReady,
          emailDeliveryMessageId: "email-delivery:organization:org_1:msg_1",
          queueFailureSummary:
            "Notification queue receipt did not match the expected schema.",
          createdAt: "2026-05-06T10:55:00.000Z",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminNotificationCenterApiPath.inspectEmailReceipt}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              notificationId:
                "notification-center:organization:org_1:receipt_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        id: "notification-center:organization:org_1:receipt_1",
        recipient: "customer@example.com",
      }),
    );
  });

  it("inspects notification-center in-app notifications through the admin communication surface", async () => {
    const handler = createTestHandler({
      inspectInAppNotification: () =>
        Effect.succeed({
          id: "notification-center:in-app:organization:org_1:usr_member_1:billing.invoice-ready:event_1",
          channel: notificationCenterChannel.inApp,
          family: notificationCenterNotificationFamily.billingInvoiceReady,
          actorId: "usr_member_1",
          sourceModuleId: platformModuleId.billingAndMetering,
          sourceEventId: "event_1",
          status: notificationCenterInAppStatus.unread,
          title: "Invoice ready",
          bodySummary: "Invoice inv_2026_04 is ready for $120.00.",
          actionLabel: "Review invoice",
          actionUrl: "https://product.example.com/billing/invoices/inv_2026_04",
          createdAt: "2026-05-08T11:00:00.000Z",
          updatedAt: "2026-05-08T11:00:00.000Z",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminNotificationCenterApiPath.inspectInAppNotification}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              notificationId:
                "notification-center:in-app:organization:org_1:usr_member_1:billing.invoice-ready:event_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        id: "notification-center:in-app:organization:org_1:usr_member_1:billing.invoice-ready:event_1",
        actorId: "usr_member_1",
        family: notificationCenterNotificationFamily.billingInvoiceReady,
      }),
    );
  });

  it("returns 403 when operator access is denied", async () => {
    const handler = createTestHandler({
      inspectEmailReceipt: () =>
        Effect.fail({
          _tag: "AdminNotificationCenterAccessDeniedError",
          actorType: "organization-member",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminNotificationCenterApiPath.inspectEmailReceipt}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_member_1",
            },
            body: JSON.stringify({
              notificationId:
                "notification-center:organization:org_1:receipt_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Notification-center inspection is not allowed for this session.",
    });
  });

  it("returns 404 when an email receipt is missing", async () => {
    const handler = createTestHandler({
      inspectEmailReceipt: () =>
        Effect.fail({
          _tag: "AdminNotificationCenterEmailReceiptNotFoundError",
          notificationId: "notification-center:organization:org_1:missing",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminNotificationCenterApiPath.inspectEmailReceipt}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              notificationId: "notification-center:organization:org_1:missing",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Requested resource was not found.",
    });
  });

  it("returns 400 when the request body does not match the expected schema", async () => {
    const handler = createTestHandler({
      inspectEmailReceipt: () => Effect.fail(createParseError()),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminNotificationCenterApiPath.inspectEmailReceipt}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              notificationId: 123,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request payload did not match the expected schema.",
    });
  });

  it("inspects notification-center email preferences through the admin communication surface", async () => {
    const handler = createTestHandler({
      inspectEmailPreference: () =>
        Effect.succeed({
          channel: notificationCenterChannel.email,
          recipient: "customer@example.com",
          template: emailDeliveryTemplateId.billingInvoiceReady,
          enabled: false,
          updatedBy: "usr_support_1",
          updatedAt: "2026-05-07T02:00:00.000Z",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminNotificationCenterApiPath.inspectEmailPreference}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              tenantScope: "organization",
              tenantScopeId: "org_1",
              recipient: "customer@example.com",
              template: emailDeliveryTemplateId.billingInvoiceReady,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        recipient: "customer@example.com",
        enabled: false,
      }),
    );
  });

  it("upserts notification-center email preferences with the trusted header session id", async () => {
    const upsertEmailPreference = vi.fn((input) =>
      Effect.succeed({
        channel: notificationCenterChannel.email,
        recipient: input.recipient,
        template: input.template,
        enabled: input.enabled,
        updatedBy: "usr_support_1",
        updatedAt: "2026-05-07T02:05:00.000Z",
      }),
    );
    const handler = createTestHandler({
      upsertEmailPreference,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminNotificationCenterApiPath.upsertEmailPreference}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_header_notification_center_admin",
            },
            body: JSON.stringify({
              sessionId: "sess_body_only_notification_center_admin",
              tenantScope: "organization",
              tenantScopeId: "org_1",
              recipient: "customer@example.com",
              template: emailDeliveryTemplateId.billingInvoiceReady,
              enabled: false,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(upsertEmailPreference).toHaveBeenCalledWith({
      sessionId: "sess_header_notification_center_admin",
      tenantScope: "organization",
      tenantScopeId: "org_1",
      recipient: "customer@example.com",
      template: emailDeliveryTemplateId.billingInvoiceReady,
      enabled: false,
    });
  });
});
