import { Effect, Schema } from "effect";
import {
  platformModuleId,
  webhookApiKeyStatus,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
} from "@comvestec/contracts";
import {
  createAdminWebhooksApiAccessHttpHandler,
  adminWebhooksApiAccessApiPath,
  subscriberJourneySessionHeaderName,
  type WebhooksApiAccessService,
} from "@comvestec/platform";

const unexpectedWebhooksApiAccessServiceEffect = <A>() =>
  Effect.die(new Error("Unexpected admin webhooks api service call."));

const defaultCreateWebhookSubscription: WebhooksApiAccessService["createWebhookSubscription"] =
  () => unexpectedWebhooksApiAccessServiceEffect();

const defaultListWebhookSubscriptions: WebhooksApiAccessService["listWebhookSubscriptions"] =
  () => unexpectedWebhooksApiAccessServiceEffect();

const defaultCreateWebhookApiKey: WebhooksApiAccessService["createWebhookApiKey"] =
  () => unexpectedWebhooksApiAccessServiceEffect();

const defaultRequestWebhookOutboundDelivery: WebhooksApiAccessService["requestWebhookOutboundDelivery"] =
  () => unexpectedWebhooksApiAccessServiceEffect();

const defaultListWebhookApiKeys: WebhooksApiAccessService["listWebhookApiKeys"] =
  () => unexpectedWebhooksApiAccessServiceEffect();

const defaultRotateWebhookApiKey: WebhooksApiAccessService["rotateWebhookApiKey"] =
  () => unexpectedWebhooksApiAccessServiceEffect();

const defaultRevokeWebhookApiKey: WebhooksApiAccessService["revokeWebhookApiKey"] =
  () => unexpectedWebhooksApiAccessServiceEffect();

const defaultResolveRequestContext: WebhooksApiAccessService["resolveRequestContext"] =
  () => unexpectedWebhooksApiAccessServiceEffect();

const defaultRunWebhookOutboundDeliveryWorkflowJob: WebhooksApiAccessService["runWebhookOutboundDeliveryWorkflowJob"] =
  () => unexpectedWebhooksApiAccessServiceEffect();

const createWebhooksApiAccessServiceDouble = (
  overrides: Partial<WebhooksApiAccessService>,
): WebhooksApiAccessService => ({
  resolveRequestContext:
    overrides.resolveRequestContext ?? defaultResolveRequestContext,
  createWebhookApiKey:
    overrides.createWebhookApiKey ?? defaultCreateWebhookApiKey,
  requestWebhookOutboundDelivery:
    overrides.requestWebhookOutboundDelivery ??
    defaultRequestWebhookOutboundDelivery,
  createWebhookSubscription:
    overrides.createWebhookSubscription ?? defaultCreateWebhookSubscription,
  listWebhookApiKeys: overrides.listWebhookApiKeys ?? defaultListWebhookApiKeys,
  listWebhookSubscriptions:
    overrides.listWebhookSubscriptions ?? defaultListWebhookSubscriptions,
  rotateWebhookApiKey:
    overrides.rotateWebhookApiKey ?? defaultRotateWebhookApiKey,
  revokeWebhookApiKey:
    overrides.revokeWebhookApiKey ?? defaultRevokeWebhookApiKey,
  runWebhookOutboundDeliveryWorkflowJob:
    overrides.runWebhookOutboundDeliveryWorkflowJob ??
    defaultRunWebhookOutboundDeliveryWorkflowJob,
});

const createTestHandler = (service: Partial<WebhooksApiAccessService>) =>
  createAdminWebhooksApiAccessHttpHandler((use) =>
    use(createWebhooksApiAccessServiceDouble(service)),
  );

const createParseError = () =>
  Effect.runSync(Schema.decodeUnknown(Schema.String)(123).pipe(Effect.flip));

describe("platform admin webhooks api http", () => {
  it("does not trust body session ids when the trusted header is missing", async () => {
    const listWebhookSubscriptions = vi.fn(() =>
      unexpectedWebhooksApiAccessServiceEffect(),
    );
    const handler = createTestHandler({
      listWebhookSubscriptions,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminWebhooksApiAccessApiPath.listSubscriptions}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sessionId: "sess_body_only_webhook_admin",
              scope: "organization",
              scopeId: "org_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authenticated operator session is required.",
    });
    expect(listWebhookSubscriptions).not.toHaveBeenCalled();
  });

  it("creates webhook subscriptions through the admin communication surface", async () => {
    const handler = createTestHandler({
      createWebhookSubscription: (input) =>
        Effect.succeed({
          subscriptionId: "webhook-subscription:organization:org_1:1",
          url: input.url,
          events: input.events,
          status: "active" as const,
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminWebhooksApiAccessApiPath.createSubscription}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: "organization",
              scopeId: "org_1",
              url: "https://hooks.example.com/outbound",
              events: ["billing.subscription.activated"],
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        subscriptionId: "webhook-subscription:organization:org_1:1",
        url: "https://hooks.example.com/outbound",
      }),
    );
  });

  it("lists webhook subscriptions through the admin communication surface", async () => {
    const handler = createTestHandler({
      listWebhookSubscriptions: (input) =>
        Effect.succeed([
          {
            subscriptionId: "webhook-subscription:organization:org_1:1",
            url: "https://hooks.example.com/outbound",
            events: ["billing.subscription.activated"],
            status: "active" as const,
          },
        ]),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminWebhooksApiAccessApiPath.listSubscriptions}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: "organization",
              scopeId: "org_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        subscriptionId: "webhook-subscription:organization:org_1:1",
      }),
    ]);
  });

  it("requests webhook delivery workflows through the admin communication surface", async () => {
    const requestWebhookOutboundDelivery = vi.fn((input) =>
      Effect.succeed({
        jobId: `workflow-job-webhook-delivery:${input.scope}:${input.scopeId}`,
        sourceModuleId: platformModuleId.webhooksApiAccess,
        kind: workflowJobKind.webhookOutboundDelivery,
        trigger: workflowJobTrigger.operatorRequested,
        status: workflowJobStatus.scheduled,
        tenantScope: input.scope,
        tenantScopeId: input.scopeId,
        attempts: 0,
        scheduledAt: input.scheduledAt ?? "2026-05-07T10:30:00.000Z",
      }),
    );
    const handler = createTestHandler({ requestWebhookOutboundDelivery });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminWebhooksApiAccessApiPath.requestDelivery}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: "organization",
              scopeId: "org_1",
              subscriptionId: "webhook-subscription:organization:org_1:1",
              eventType: "billing.subscription.activated",
              payload: '{"subscriptionId":"sub_123"}',
              scheduledAt: "2026-05-07T10:30:00.000Z",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        sourceModuleId: platformModuleId.webhooksApiAccess,
        kind: workflowJobKind.webhookOutboundDelivery,
        status: workflowJobStatus.scheduled,
      }),
    );
    expect(requestWebhookOutboundDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess_support_1",
        scope: "organization",
        scopeId: "org_1",
        subscriptionId: "webhook-subscription:organization:org_1:1",
        scheduledAt: "2026-05-07T10:30:00.000Z",
      }),
    );
  });

  it("returns 409 when webhook delivery requests target paused subscriptions", async () => {
    const handler = createTestHandler({
      requestWebhookOutboundDelivery: () =>
        Effect.fail({
          _tag: "WebhooksApiAccessSubscriptionPausedError",
          subscriptionId: "webhook-subscription:organization:org_1:1",
          status: "paused",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminWebhooksApiAccessApiPath.requestDelivery}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: "organization",
              scopeId: "org_1",
              subscriptionId: "webhook-subscription:organization:org_1:1",
              eventType: "billing.subscription.activated",
              payload: '{"subscriptionId":"sub_123"}',
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Webhook subscription is paused and cannot deliver events.",
    });
  });

  it("returns 503 when the webhook delivery workflow runtime is unavailable", async () => {
    const handler = createTestHandler({
      requestWebhookOutboundDelivery: () =>
        Effect.fail({
          _tag: "WebhooksApiAccessWorkflowUnavailableError",
          dependency: "convexWorkflowClient",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminWebhooksApiAccessApiPath.requestDelivery}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: "organization",
              scopeId: "org_1",
              subscriptionId: "webhook-subscription:organization:org_1:1",
              eventType: "billing.subscription.activated",
              payload: '{"subscriptionId":"sub_123"}',
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Webhook delivery workflow is not available.",
    });
  });

  it("creates webhook api keys through the admin communication surface", async () => {
    const handler = createTestHandler({
      createWebhookApiKey: () =>
        Effect.succeed({
          apiKey: {
            apiKeyId: "webhook-api-key:organization:org_1:1",
            label: "Partner export",
            prefix: "wkai_created_pref",
            status: webhookApiKeyStatus.active,
            createdAt: "2026-05-06T10:00:00.000Z",
          },
          secret: "wkai_created_secret",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminWebhooksApiAccessApiPath.createApiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: "organization",
              scopeId: "org_1",
              label: "Partner export",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      apiKey: {
        apiKeyId: "webhook-api-key:organization:org_1:1",
        label: "Partner export",
        prefix: "wkai_created_pref",
        status: webhookApiKeyStatus.active,
        createdAt: "2026-05-06T10:00:00.000Z",
      },
      secret: "wkai_created_secret",
    });
  });

  it("rejects non-tenant scopes for webhook api key requests", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminWebhooksApiAccessApiPath.createApiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: "platform",
              scopeId: "platform",
              label: "Partner export",
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

  it("lists webhook api keys through the admin communication surface", async () => {
    const handler = createTestHandler({
      listWebhookApiKeys: () =>
        Effect.succeed([
          {
            apiKeyId: "webhook-api-key:organization:org_1:1",
            label: "Partner export",
            prefix: "wkai_created_pref",
            status: webhookApiKeyStatus.active,
            createdAt: "2026-05-06T10:00:00.000Z",
          },
        ]),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminWebhooksApiAccessApiPath.listApiKeys}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: "organization",
              scopeId: "org_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        apiKeyId: "webhook-api-key:organization:org_1:1",
        label: "Partner export",
        prefix: "wkai_created_pref",
        status: webhookApiKeyStatus.active,
        createdAt: "2026-05-06T10:00:00.000Z",
      },
    ]);
  });

  it("rotates and revokes webhook api keys through the admin communication surface", async () => {
    const handler = createTestHandler({
      rotateWebhookApiKey: () =>
        Effect.succeed({
          apiKey: {
            apiKeyId: "webhook-api-key:organization:org_1:1",
            label: "Partner export",
            prefix: "wkai_rotated_pref",
            status: webhookApiKeyStatus.active,
            createdAt: "2026-05-06T10:00:00.000Z",
            rotatedAt: "2026-05-06T11:00:00.000Z",
          },
          secret: "wkai_rotated_secret",
        }),
      revokeWebhookApiKey: () =>
        Effect.succeed({
          apiKeyId: "webhook-api-key:organization:org_1:1",
          label: "Partner export",
          prefix: "wkai_rotated_pref",
          status: webhookApiKeyStatus.revoked,
          createdAt: "2026-05-06T10:00:00.000Z",
          rotatedAt: "2026-05-06T11:00:00.000Z",
          revokedAt: "2026-05-06T12:00:00.000Z",
        }),
    });

    const rotateResponse = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminWebhooksApiAccessApiPath.rotateApiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: "organization",
              scopeId: "org_1",
              apiKeyId: "webhook-api-key:organization:org_1:1",
            }),
          },
        ),
      ),
    );
    const revokeResponse = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminWebhooksApiAccessApiPath.revokeApiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: "organization",
              scopeId: "org_1",
              apiKeyId: "webhook-api-key:organization:org_1:1",
            }),
          },
        ),
      ),
    );

    expect(rotateResponse.status).toBe(200);
    await expect(rotateResponse.json()).resolves.toEqual({
      apiKey: {
        apiKeyId: "webhook-api-key:organization:org_1:1",
        label: "Partner export",
        prefix: "wkai_rotated_pref",
        status: webhookApiKeyStatus.active,
        createdAt: "2026-05-06T10:00:00.000Z",
        rotatedAt: "2026-05-06T11:00:00.000Z",
      },
      secret: "wkai_rotated_secret",
    });
    expect(revokeResponse.status).toBe(200);
    await expect(revokeResponse.json()).resolves.toEqual({
      apiKeyId: "webhook-api-key:organization:org_1:1",
      label: "Partner export",
      prefix: "wkai_rotated_pref",
      status: webhookApiKeyStatus.revoked,
      createdAt: "2026-05-06T10:00:00.000Z",
      rotatedAt: "2026-05-06T11:00:00.000Z",
      revokedAt: "2026-05-06T12:00:00.000Z",
    });
  });

  it("returns 403 when operator access is denied", async () => {
    const handler = createTestHandler({
      listWebhookSubscriptions: () =>
        Effect.fail({
          _tag: "WebhooksApiAccessAccessDeniedError",
          actorType: "organization-member",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminWebhooksApiAccessApiPath.listSubscriptions}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_member_1",
            },
            body: JSON.stringify({
              scope: "organization",
              scopeId: "org_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Webhook subscription management is not allowed for this session.",
    });
  });

  it("returns 409 when a webhook api key has already been revoked", async () => {
    const handler = createTestHandler({
      rotateWebhookApiKey: () =>
        Effect.fail({
          _tag: "WebhookApiKeyRevokedError",
          scope: "organization",
          scopeId: "org_1",
          apiKeyId: "webhook-api-key:organization:org_1:1",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminWebhooksApiAccessApiPath.rotateApiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: "organization",
              scopeId: "org_1",
              apiKeyId: "webhook-api-key:organization:org_1:1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Webhook API key has already been revoked.",
    });
  });

  it("returns 409 when a webhook api key changes during the request", async () => {
    const handler = createTestHandler({
      rotateWebhookApiKey: () =>
        Effect.fail({
          _tag: "WebhookApiKeyMutationConflictError",
          scope: "organization",
          scopeId: "org_1",
          apiKeyId: "webhook-api-key:organization:org_1:1",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminWebhooksApiAccessApiPath.rotateApiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: "organization",
              scopeId: "org_1",
              apiKeyId: "webhook-api-key:organization:org_1:1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Webhook API key changed during the request. Retry the operation.",
    });
  });

  it("returns 409 when a webhook subscription already exists", async () => {
    const handler = createTestHandler({
      createWebhookSubscription: () =>
        Effect.fail({
          _tag: "WebhookSubscriptionAlreadyExistsError",
          scope: "organization",
          scopeId: "org_1",
          url: "https://hooks.example.com/outbound",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminWebhooksApiAccessApiPath.createSubscription}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: "organization",
              scopeId: "org_1",
              url: "https://hooks.example.com/outbound",
              events: ["billing.subscription.activated"],
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Webhook subscription already exists for this scope and URL.",
    });
  });

  it("returns 502 when delegated authorization fails", async () => {
    const handler = createTestHandler({
      listWebhookSubscriptions: () =>
        Effect.fail({
          _tag: "AuthorizationDelegatedCheckError",
          reason: "ory-keto request failed",
          cause: new Error("ory-keto unavailable"),
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminWebhooksApiAccessApiPath.listSubscriptions}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: "organization",
              scopeId: "org_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "A backend dependency request failed.",
    });
  });

  it("returns 502 when audit log persistence fails", async () => {
    const handler = createTestHandler({
      createWebhookSubscription: () =>
        Effect.fail({
          _tag: "AuditLogPostgresRepositoryPersistenceError",
          operation: "insertAuditEvent",
          cause: new Error("postgres unavailable"),
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminWebhooksApiAccessApiPath.createSubscription}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: "organization",
              scopeId: "org_1",
              url: "https://hooks.example.com/outbound",
              events: ["billing.subscription.activated"],
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "A backend dependency request failed.",
    });
  });

  it("returns 500 when an internal webhook projection contract fails", async () => {
    const handler = createTestHandler({
      listWebhookSubscriptions: () =>
        Effect.fail({
          _tag: "WebhooksApiAccessInternalContractError",
          operation: "webhookSubscriptionAdminViewList",
          cause: createParseError(),
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminWebhooksApiAccessApiPath.listSubscriptions}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: "organization",
              scopeId: "org_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Webhook subscription request failed.",
    });
  });

  it("returns 500 when a raw parse failure escapes admin webhook execution", async () => {
    const handler = createAdminWebhooksApiAccessHttpHandler(() =>
      Effect.fail(createParseError()),
    );

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminWebhooksApiAccessApiPath.listSubscriptions}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_1",
            },
            body: JSON.stringify({
              scope: "organization",
              scopeId: "org_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Webhook subscription request failed.",
    });
  });
});
