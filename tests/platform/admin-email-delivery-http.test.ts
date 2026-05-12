import { Effect, Schema } from "effect";
import {
  createAdminEmailDeliveryHttpHandler,
  adminEmailDeliveryApiPath,
  subscriberJourneySessionHeaderName,
  type AdminEmailDeliveryService,
} from "@comvestec/platform";
import {
  emailDeliveryStatus,
  emailSuppressionReason,
} from "@comvestec/contracts";

const unexpectedAdminEmailDeliveryServiceEffect = <A>() =>
  Effect.die(new Error("Unexpected admin email delivery service call."));

const defaultInspectTrackedDelivery: AdminEmailDeliveryService["inspectTrackedDelivery"] =
  () => unexpectedAdminEmailDeliveryServiceEffect();

const defaultInspectRecipientSuppression: AdminEmailDeliveryService["inspectRecipientSuppression"] =
  () => unexpectedAdminEmailDeliveryServiceEffect();

const defaultResolveRequestContext: AdminEmailDeliveryService["resolveRequestContext"] =
  () => unexpectedAdminEmailDeliveryServiceEffect();

const createAdminEmailDeliveryServiceDouble = (
  overrides: Partial<AdminEmailDeliveryService>,
): AdminEmailDeliveryService => ({
  resolveRequestContext:
    overrides.resolveRequestContext ?? defaultResolveRequestContext,
  inspectTrackedDelivery:
    overrides.inspectTrackedDelivery ?? defaultInspectTrackedDelivery,
  inspectRecipientSuppression:
    overrides.inspectRecipientSuppression ?? defaultInspectRecipientSuppression,
});

const createTestHandler = (service: Partial<AdminEmailDeliveryService>) =>
  createAdminEmailDeliveryHttpHandler((use) =>
    use(createAdminEmailDeliveryServiceDouble(service)),
  );

const createParseError = () =>
  Effect.runSync(Schema.decodeUnknown(Schema.String)(123).pipe(Effect.flip));

describe("platform admin email delivery http", () => {
  it("does not trust body session ids when the trusted header is missing", async () => {
    const inspectTrackedDelivery = vi.fn(() =>
      unexpectedAdminEmailDeliveryServiceEffect(),
    );
    const handler = createTestHandler({
      inspectTrackedDelivery,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminEmailDeliveryApiPath.inspectTracking}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sessionId: "sess_body_only_email_delivery_admin",
              messageId: "email-delivery:organization:org_1:track_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authenticated operator session is required.",
    });
    expect(inspectTrackedDelivery).not.toHaveBeenCalled();
  });

  it("overrides body session ids with the trusted header value", async () => {
    const inspectTrackedDelivery = vi.fn((input) =>
      Effect.succeed({
        messageId: input.messageId,
        recipient: "customer@example.com",
        template: "welcome-email:v1",
        status: emailDeliveryStatus.complained,
        sentAt: "2026-05-05T06:45:00.000Z",
        lastEventAt: "2026-05-05T06:47:00.000Z",
      }),
    );
    const handler = createTestHandler({
      inspectTrackedDelivery,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminEmailDeliveryApiPath.inspectTracking}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_header_email_delivery_admin",
            },
            body: JSON.stringify({
              sessionId: "sess_body_only_email_delivery_admin",
              messageId: "email-delivery:organization:org_1:track_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(inspectTrackedDelivery).toHaveBeenCalledWith({
      sessionId: "sess_header_email_delivery_admin",
      messageId: "email-delivery:organization:org_1:track_1",
    });
  });

  it("inspects tracked deliveries through the admin communication surface", async () => {
    const handler = createTestHandler({
      inspectTrackedDelivery: () =>
        Effect.succeed({
          messageId: "email-delivery:organization:org_1:track_1",
          recipient: "customer@example.com",
          template: "welcome-email:v1",
          status: emailDeliveryStatus.complained,
          sentAt: "2026-05-05T06:45:00.000Z",
          lastEventAt: "2026-05-05T06:47:00.000Z",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminEmailDeliveryApiPath.inspectTracking}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              messageId: "email-delivery:organization:org_1:track_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        messageId: "email-delivery:organization:org_1:track_1",
        recipient: "customer@example.com",
      }),
    );
  });

  it("inspects recipient suppressions through the admin communication surface", async () => {
    const handler = createTestHandler({
      inspectRecipientSuppression: () =>
        Effect.succeed({
          suppressionId: "email-suppression:customer@example.com",
          recipient: "customer@example.com",
          suppressionReason: emailSuppressionReason.complained,
          sourceMessageId: "email-delivery:organization:org_1:track_1",
          suppressedAt: "2026-05-05T06:47:00.000Z",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminEmailDeliveryApiPath.inspectRecipientSuppression}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              recipient: "customer@example.com",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        suppressionId: "email-suppression:customer@example.com",
        recipient: "customer@example.com",
      }),
    );
  });

  it("returns 403 when operator access is denied", async () => {
    const handler = createTestHandler({
      inspectTrackedDelivery: () =>
        Effect.fail({
          _tag: "AdminEmailDeliveryAccessDeniedError",
          actorType: "organization-member",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminEmailDeliveryApiPath.inspectTracking}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_member_1",
            },
            body: JSON.stringify({
              messageId: "email-delivery:organization:org_1:track_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Email delivery inspection is not allowed for this session.",
    });
  });

  it("returns 404 when a tracked delivery is missing", async () => {
    const handler = createTestHandler({
      inspectTrackedDelivery: () =>
        Effect.fail({
          _tag: "AdminEmailDeliveryTrackingNotFoundError",
          messageId: "email-delivery:organization:org_1:missing",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminEmailDeliveryApiPath.inspectTracking}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              messageId: "email-delivery:organization:org_1:missing",
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

  it("returns 404 when a recipient suppression is missing", async () => {
    const handler = createTestHandler({
      inspectRecipientSuppression: () =>
        Effect.fail({
          _tag: "AdminEmailRecipientSuppressionNotFoundError",
          recipient: "customer@example.com",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminEmailDeliveryApiPath.inspectRecipientSuppression}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              recipient: "customer@example.com",
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

  it("returns 500 when an internal projection contract fails", async () => {
    const handler = createTestHandler({
      inspectRecipientSuppression: () =>
        Effect.fail({
          _tag: "AdminEmailDeliveryInternalContractError",
          operation: "suppressionAdminView",
          cause: createParseError(),
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminEmailDeliveryApiPath.inspectRecipientSuppression}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              recipient: "customer@example.com",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Email delivery inspection request failed.",
    });
  });
});
