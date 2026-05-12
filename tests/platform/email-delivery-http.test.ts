import { Effect, ParseResult, Schema } from "effect";
import {
  EmailDeliveryTrackingRecordSchema,
  emailDeliveryProviderEventType,
  emailDeliveryStatus,
  platformScope,
} from "@comvestec/contracts";
import {
  createEmailDeliveryHttpHandler,
  platformAdapterServiceName,
  type EmailDeliveryService,
  emailDeliveryApiPath,
} from "@comvestec/platform";

type EmailDeliveryProviderEventsService = Pick<
  EmailDeliveryService,
  "recordProviderDeliveryEvent"
>;

const unexpectedEmailDeliveryServiceEffect = <A>() =>
  Effect.die(new Error("Unexpected email delivery provider-event call."));

const createEmailDeliveryProviderEventsServiceDouble = (
  overrides: Partial<EmailDeliveryProviderEventsService>,
): EmailDeliveryProviderEventsService => ({
  recordProviderDeliveryEvent:
    overrides.recordProviderDeliveryEvent ??
    (() => unexpectedEmailDeliveryServiceEffect()),
});

const createTestHandler = (
  service: Partial<EmailDeliveryProviderEventsService>,
  options?: Parameters<typeof createEmailDeliveryHttpHandler>[1],
) =>
  createEmailDeliveryHttpHandler(
    (use) => use(createEmailDeliveryProviderEventsServiceDouble(service)),
    options,
  );

const parseFailureEffect = <A>() =>
  Schema.decodeUnknown(Schema.Struct({ required: Schema.NonEmptyString }))({
    required: "",
  }) as Effect.Effect<A, ParseResult.ParseError>;

describe("platform email delivery http", () => {
  it("processes verified Postal provider events through the dedicated HTTP surface", async () => {
    const handler = createTestHandler(
      {
        recordProviderDeliveryEvent: (input) =>
          Schema.decodeUnknown(EmailDeliveryTrackingRecordSchema)({
            messageId: input.messageId,
            provider: platformAdapterServiceName.postal,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_http_1",
            recipient: "member@example.com",
            status: emailDeliveryStatus.delivered,
            senderDisplayName: "Comvestec Platform",
            fromEmail: "support@platform.example",
            replyToEmail: "reply@platform.example",
            sentAt: input.occurredAt,
            lastEventAt: input.occurredAt,
            createdAt: input.occurredAt,
            updatedAt: input.occurredAt,
          }),
      },
      {
        parsePostalWebhookRequest: () =>
          Effect.succeed({
            messageId: "email-delivery:organization:org_http_1:msg_1",
            eventType: emailDeliveryProviderEventType.delivered,
            occurredAt: "2026-05-05T14:00:00.000Z",
          }),
      },
    );

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${emailDeliveryApiPath.processPostalProviderEvent}`,
          {
            method: "POST",
            body: JSON.stringify({ event: "MessageSent" }),
          },
        ),
      ),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      acknowledged: true,
      ignored: false,
    });
  });

  it("returns 202 when a verified Postal provider event is intentionally ignored", async () => {
    const handler = createTestHandler(
      {},
      {
        parsePostalWebhookRequest: () => Effect.succeed(null),
      },
    );

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${emailDeliveryApiPath.processPostalProviderEvent}`,
          {
            method: "POST",
            body: JSON.stringify({ event: "ServerUp" }),
          },
        ),
      ),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      acknowledged: true,
      ignored: true,
    });
  });

  it("returns 401 when Postal webhook verification fails", async () => {
    const handler = createTestHandler(
      {},
      {
        parsePostalWebhookRequest: () =>
          Effect.fail({
            _tag: "PostalWebhookSignatureError",
            reason: "signatureVerificationFailed",
            keyId: "postal-wh-1",
          }),
      },
    );

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${emailDeliveryApiPath.processPostalProviderEvent}`,
          {
            method: "POST",
            body: JSON.stringify({ event: "MessageSent" }),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication or signature validation failed.",
    });
  });

  it("returns 404 when the provider event references an unknown tracked delivery", async () => {
    const handler = createTestHandler(
      {
        recordProviderDeliveryEvent: () =>
          Effect.fail({
            _tag: "EmailDeliveryTrackingRecordMissingError",
            messageId: "email-delivery:organization:org_http_1:missing",
          }),
      },
      {
        parsePostalWebhookRequest: () =>
          Effect.succeed({
            messageId: "email-delivery:organization:org_http_1:missing",
            eventType: emailDeliveryProviderEventType.delivered,
            occurredAt: "2026-05-05T14:05:00.000Z",
          }),
      },
    );

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${emailDeliveryApiPath.processPostalProviderEvent}`,
          {
            method: "POST",
            body: JSON.stringify({ event: "MessageSent" }),
          },
        ),
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Requested resource was not found.",
    });
  });

  it("returns 422 when Postal payload verification succeeds but mapping fails", async () => {
    const handler = createTestHandler(
      {},
      {
        parsePostalWebhookRequest: () =>
          Effect.fail({
            _tag: "PostalWebhookPayloadMappingError",
            event: "MessageSent",
            reason: "invalidPayload",
          }),
      },
    );

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${emailDeliveryApiPath.processPostalProviderEvent}`,
          {
            method: "POST",
            body: JSON.stringify({ event: "MessageSent" }),
          },
        ),
      ),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Provider payload could not be mapped to the platform contract.",
    });
  });

  it("maps parse failures from provider-event execution to server errors", async () => {
    const handler = createTestHandler(
      {
        recordProviderDeliveryEvent: () => parseFailureEffect(),
      },
      {
        parsePostalWebhookRequest: () =>
          Effect.succeed({
            messageId: "email-delivery:organization:org_http_1:parse_failure",
            eventType: emailDeliveryProviderEventType.delivered,
            occurredAt: "2026-05-05T14:10:00.000Z",
          }),
      },
    );

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${emailDeliveryApiPath.processPostalProviderEvent}`,
          {
            method: "POST",
            body: JSON.stringify({ event: "MessageSent" }),
          },
        ),
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Email delivery provider-event request failed.",
    });
  });
});
