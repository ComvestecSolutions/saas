import { Effect, Schema } from "effect";
import {
  platformModuleId,
  platformScope,
  runtimeResolutionSource,
  type RequestContext,
  webhookOutboundDeliveryStatus,
  webhookSubscriptionStatus,
  webhooksApiAccessAuditAction,
  webhookApiKeyStatus,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
} from "@comvestec/contracts";
import {
  AuditLogModule,
  type AuditLogModuleService,
  type AuthorizationModuleService,
  buildWebhookOutboundDeliveryWorkflowJobId,
  IdentitySessionModule,
  type IdentitySessionModuleService,
  WebhooksApiAccessModule,
  workflowJobRuntime,
} from "@comvestec/modules";
import {
  supportRequestContext,
  organizationRequestContext,
} from "../modules/_fixtures";
import { OryKetoAdapter } from "@comvestec/platform";
import {
  makeWebhooksApiAccessService,
  type WebhooksApiAccessAccessDeniedError,
  type WebhooksApiAccessInternalContractError,
  type WebhooksApiAccessServiceOptions,
  runWebhooksApiAccessFromEnvironment,
} from "../../packages/platform/src/services/communication/webhooks-api-access";

const createParseError = () =>
  Effect.runSync(Schema.decodeUnknown(Schema.String)(123).pipe(Effect.flip));

const createIdentitySessionServiceDouble = (
  requestContext: RequestContext,
): IdentitySessionModuleService => ({
  startAuthentication: () =>
    Effect.die(new Error("Unexpected identity session start call.")),
  completeAuthentication: () =>
    Effect.die(new Error("Unexpected identity session completion call.")),
  completePlatformOperatorAuthentication: () =>
    Effect.die(
      new Error(
        "Unexpected platform-operator identity session completion call.",
      ),
    ),
  invalidateSession: () =>
    Effect.die(new Error("Unexpected identity session invalidation call.")),
  resolveRequestContext: () => Effect.succeed(requestContext),
});

const createAuthorizationServiceDouble = (input?: {
  readonly onCheck?: AuthorizationModuleService["check"];
}): Pick<AuthorizationModuleService, "check"> => ({
  check:
    input?.onCheck ??
    (() =>
      Effect.succeed({
        allowed: true,
        cacheKey: "webhook:manage",
        reason: "allowed",
        auditRequired: false,
      })),
});

const createAuditLogServiceDouble = (input?: {
  readonly appendTargets?: string[];
  readonly onAppend?: AuditLogModuleService["append"];
}): AuditLogModuleService => ({
  append:
    input?.onAppend ??
    ((request) => {
      input?.appendTargets?.push(request.target);

      return Effect.succeed({
        eventId: `${request.moduleId}:${request.action}:${request.requestContext.correlationId}`,
        timestamp: "2026-04-27T19:00:00.000Z",
        actorId:
          request.requestContext.actorId ??
          `${request.requestContext.actorType}:anonymous`,
        tenantScope: request.requestContext.tenant.scope,
        tenantScopeId: request.requestContext.tenant.scopeId,
        moduleId: request.moduleId,
        action: request.action,
        target: request.target,
        ...(request.reason !== undefined ? { reason: request.reason } : {}),
        correlationId: request.requestContext.correlationId,
      });
    }),
  queryByModule: () => Effect.succeed([]),
  queryByTarget: () => Effect.succeed([]),
  queryByActor: () => Effect.succeed([]),
  queryByTenant: () => Effect.succeed([]),
  requirements: Effect.succeed([]),
});

const createWebhooksApiAccessModuleDouble = (
  overrides: Partial<WebhooksApiAccessModule["Type"]>,
): WebhooksApiAccessModule["Type"] => ({
  processVerifiedProviderWebhook:
    overrides.processVerifiedProviderWebhook ??
    (() => Effect.die(new Error("Unexpected webhook processing call."))),
  replayProviderWebhook:
    overrides.replayProviderWebhook ??
    (() => Effect.die(new Error("Unexpected webhook replay call."))),
  createWebhookSubscription:
    overrides.createWebhookSubscription ??
    (() => Effect.die(new Error("Unexpected webhook subscription call."))),
  listWebhookSubscriptions:
    overrides.listWebhookSubscriptions ??
    (() => Effect.die(new Error("Unexpected webhook subscription call."))),
  getWebhookSubscription:
    overrides.getWebhookSubscription ??
    (() => Effect.die(new Error("Unexpected webhook subscription call."))),
  createWebhookOutboundDelivery:
    overrides.createWebhookOutboundDelivery ??
    (() => Effect.die(new Error("Unexpected webhook outbound delivery call."))),
  getWebhookOutboundDelivery:
    overrides.getWebhookOutboundDelivery ??
    (() => Effect.die(new Error("Unexpected webhook outbound delivery call."))),
  updateWebhookOutboundDelivery:
    overrides.updateWebhookOutboundDelivery ??
    (() => Effect.die(new Error("Unexpected webhook outbound delivery call."))),
  createWebhookApiKey:
    overrides.createWebhookApiKey ??
    (() => Effect.die(new Error("Unexpected webhook api key call."))),
  listWebhookApiKeys:
    overrides.listWebhookApiKeys ??
    (() => Effect.die(new Error("Unexpected webhook api key call."))),
  rotateWebhookApiKey:
    overrides.rotateWebhookApiKey ??
    (() => Effect.die(new Error("Unexpected webhook api key call."))),
  revokeWebhookApiKey:
    overrides.revokeWebhookApiKey ??
    (() => Effect.die(new Error("Unexpected webhook api key call."))),
  restoreWebhookApiKey:
    overrides.restoreWebhookApiKey ??
    (() => Effect.die(new Error("Unexpected webhook api key call."))),
});

const provideWebhooksApiAccessModule = (
  overrides: Partial<WebhooksApiAccessModule["Type"]>,
) =>
  Effect.provideService(
    WebhooksApiAccessModule,
    createWebhooksApiAccessModuleDouble(overrides),
  );

const unexpectedWebhooksAdminEffect = <A>() =>
  Effect.die(new Error("Unexpected webhooks admin dependency call."));

const createRuntimeConfigDouble = (
  overrides: Partial<
    NonNullable<WebhooksApiAccessServiceOptions["runtimeConfig"]>
  > = {},
): NonNullable<WebhooksApiAccessServiceOptions["runtimeConfig"]> => ({
  listOverridesByModule:
    overrides.listOverridesByModule ?? (() => Effect.succeed([])),
  resolveConfigValue:
    overrides.resolveConfigValue ??
    ((input) =>
      Effect.succeed({
        moduleId: input.moduleId,
        key: input.key,
        effectiveValue: 3,
        source: runtimeResolutionSource.codeDefault,
        entitled: true,
      })),
});

const createWorkflowJobsRepositoryDouble = (
  overrides: Partial<
    NonNullable<WebhooksApiAccessServiceOptions["workflowJobs"]>
  > = {},
): NonNullable<WebhooksApiAccessServiceOptions["workflowJobs"]> => ({
  persistWorkflowJob:
    overrides.persistWorkflowJob ?? (() => unexpectedWebhooksAdminEffect()),
  getWorkflowJob:
    overrides.getWorkflowJob ?? (() => unexpectedWebhooksAdminEffect()),
  claimScheduledWorkflowJob:
    overrides.claimScheduledWorkflowJob ??
    (() => unexpectedWebhooksAdminEffect()),
});

const createConvexWorkflowClientDouble = (
  overrides: Partial<
    NonNullable<WebhooksApiAccessServiceOptions["convexWorkflowClient"]>
  > = {},
): NonNullable<WebhooksApiAccessServiceOptions["convexWorkflowClient"]> => ({
  scheduleWebhookOutboundDeliveryWorkflowJob:
    overrides.scheduleWebhookOutboundDeliveryWorkflowJob ??
    (() => unexpectedWebhooksAdminEffect()),
  cancelScheduledWorkflowJob:
    overrides.cancelScheduledWorkflowJob ??
    (() => unexpectedWebhooksAdminEffect()),
});

describe("platform webhooks api access service", () => {
  it("creates and lists webhook subscriptions for operator sessions", async () => {
    const seen: {
      readonly auditTargets: string[];
      readonly authorizationScopeIds: string[];
      readonly creates: Array<{ readonly scopeId: string }>;
      readonly lists: Array<{ readonly scopeId: string }>;
    } = {
      auditTargets: [],
      authorizationScopeIds: [],
      creates: [],
      lists: [],
    };
    const service = await Effect.runPromise(
      makeWebhooksApiAccessService({
        authorization: createAuthorizationServiceDouble({
          onCheck: (input) => {
            seen.authorizationScopeIds.push(
              input.requestContext.tenant.scopeId,
            );

            return Effect.succeed({
              allowed: true,
              cacheKey: "webhook:manage",
              reason: "allowed",
              auditRequired: false,
            });
          },
        }),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogServiceDouble({ appendTargets: seen.auditTargets }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        provideWebhooksApiAccessModule({
          processVerifiedProviderWebhook: () =>
            Effect.die(new Error("Unexpected webhook processing call.")),
          replayProviderWebhook: () =>
            Effect.die(new Error("Unexpected webhook replay call.")),
          createWebhookSubscription: (input) => {
            seen.creates.push({ scopeId: input.scopeId });

            return Effect.succeed({
              subscriptionId: "webhook-subscription:organization:org_1:1",
              scope: input.scope,
              scopeId: input.scopeId,
              url: input.url,
              events: input.events,
              status: "active" as const,
              createdAt: "2026-04-27T19:00:00.000Z",
              updatedAt: "2026-04-27T19:00:00.000Z",
            });
          },
          listWebhookSubscriptions: (input) => {
            seen.lists.push({ scopeId: input.scopeId });

            return Effect.succeed([
              {
                subscriptionId: "webhook-subscription:organization:org_1:1",
                scope: input.scope,
                scopeId: input.scopeId,
                url: "https://hooks.example.com/outbound",
                events: ["billing.subscription.activated"],
                status: "active" as const,
                createdAt: "2026-04-27T19:00:00.000Z",
                updatedAt: "2026-04-27T19:00:00.000Z",
              },
            ]);
          },
        }),
      ),
    );

    const created = await Effect.runPromise(
      service.createWebhookSubscription({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
        url: "https://hooks.example.com/outbound",
        events: ["billing.subscription.activated"],
      }),
    );
    const listed = await Effect.runPromise(
      service.listWebhookSubscriptions({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
      }),
    );

    expect(seen.auditTargets).toEqual([
      `${platformModuleId.webhooksApiAccess}:webhook-subscription:organization:org_1:1:subscription:url`,
      `${platformModuleId.webhooksApiAccess}:organization:org_1:subscriptions:url`,
    ]);
    expect(seen.authorizationScopeIds).toEqual(["org_1", "org_1"]);
    expect(seen.creates).toEqual([{ scopeId: "org_1" }]);
    expect(seen.lists).toEqual([{ scopeId: "org_1" }]);
    expect(created.subscriptionId).toBe(
      "webhook-subscription:organization:org_1:1",
    );
    expect(created).not.toHaveProperty("scopeId");
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("scopeId");
    expect(listed[0]).toMatchObject({
      subscriptionId: "webhook-subscription:organization:org_1:1",
      url: "https://hooks.example.com/outbound",
    });
  });

  it("requests webhook outbound delivery workflows for authorized operators", async () => {
    const seen: {
      readonly auditTargets: string[];
      readonly authorizationScopeIds: string[];
      readonly deliveryInputs: Array<{
        readonly subscriptionId: string;
        readonly maxAttempts: number;
        readonly scheduledAt?: string;
      }>;
      readonly persistedJobIds: string[];
    } = {
      auditTargets: [],
      authorizationScopeIds: [],
      deliveryInputs: [],
      persistedJobIds: [],
    };
    const scheduleWebhookOutboundDeliveryWorkflowJob = vi.fn((input) =>
      Effect.succeed({
        scheduledFunctionId: "webhook-delivery-dispatch-1",
        scheduledFunctionIds: [
          "webhook-delivery-dispatch-1",
          "webhook-delivery-dispatch-2",
        ],
        primaryScheduled: true,
        scheduledRecoveryAttemptCount: 1,
        expectedRecoveryAttemptCount: 1,
      }),
    );
    const service = await Effect.runPromise(
      makeWebhooksApiAccessService({
        authorization: createAuthorizationServiceDouble({
          onCheck: (input) => {
            seen.authorizationScopeIds.push(
              input.requestContext.tenant.scopeId,
            );

            return Effect.succeed({
              allowed: true,
              cacheKey: "webhook:manage",
              reason: "allowed",
              auditRequired: false,
            });
          },
        }),
        runtimeConfig: createRuntimeConfigDouble(),
        workflowJobs: createWorkflowJobsRepositoryDouble({
          persistWorkflowJob: (record) => {
            seen.persistedJobIds.push(record.jobId);

            return Effect.succeed(record);
          },
        }),
        convexWorkflowClient: createConvexWorkflowClientDouble({
          scheduleWebhookOutboundDeliveryWorkflowJob,
        }),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogServiceDouble({ appendTargets: seen.auditTargets }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        Effect.provideService(
          OryKetoAdapter,
          {} as unknown as OryKetoAdapter["Type"],
        ),
        provideWebhooksApiAccessModule({
          getWebhookSubscription: () =>
            Effect.succeed({
              subscriptionId: "webhook-subscription:organization:org_1:1",
              scope: platformScope.organization,
              scopeId: "org_1",
              url: "https://hooks.example.com/outbound",
              events: ["billing.subscription.activated"],
              status: webhookSubscriptionStatus.active,
              createdAt: "2026-05-07T10:00:00.000Z",
              updatedAt: "2026-05-07T10:00:00.000Z",
            }),
          createWebhookOutboundDelivery: (input) => {
            seen.deliveryInputs.push({
              subscriptionId: input.subscriptionId,
              maxAttempts: input.maxAttempts,
              ...(input.scheduledAt === undefined
                ? {}
                : { scheduledAt: input.scheduledAt }),
            });

            return Effect.succeed({
              deliveryId: "webhook-outbound-delivery:organization:org_1:1",
              subscriptionId: input.subscriptionId,
              scope: input.scope,
              scopeId: input.scopeId,
              eventType: input.eventType,
              payload: input.payload,
              status: webhookOutboundDeliveryStatus.pending,
              attemptCount: 0,
              maxAttempts: input.maxAttempts,
              nextAttemptAt: input.scheduledAt ?? "2026-05-07T10:30:00.000Z",
              createdAt: "2026-05-07T10:00:00.000Z",
              updatedAt: "2026-05-07T10:00:00.000Z",
            });
          },
        }),
      ),
    );

    await expect(
      Effect.runPromise(
        service.requestWebhookOutboundDelivery({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          subscriptionId: "webhook-subscription:organization:org_1:1",
          eventType: "billing.subscription.activated",
          payload: '{"subscriptionId":"sub_123"}',
          scheduledAt: "2026-05-07T10:30:00.000Z",
        }),
      ),
    ).resolves.toMatchObject({
      sourceModuleId: platformModuleId.webhooksApiAccess,
      kind: workflowJobKind.webhookOutboundDelivery,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
    });

    expect(scheduleWebhookOutboundDeliveryWorkflowJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: buildWebhookOutboundDeliveryWorkflowJobId({
          trigger: workflowJobTrigger.operatorRequested,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          key: "webhook-outbound-delivery:organization:org_1:1",
        }),
        scheduledAt: "2026-05-07T10:30:00.000Z",
      }),
    );
    expect(seen.authorizationScopeIds).toEqual(["org_1"]);
    expect(seen.deliveryInputs).toEqual([
      {
        subscriptionId: "webhook-subscription:organization:org_1:1",
        maxAttempts: 4,
        scheduledAt: "2026-05-07T10:30:00.000Z",
      },
    ]);
    expect(seen.persistedJobIds).toHaveLength(2);
    expect(seen.auditTargets).toEqual([
      `${platformModuleId.webhooksApiAccess}:webhook-outbound-delivery:organization:org_1:1`,
    ]);
  });

  it("blocks requested webhook deliveries when workflow scheduling fails", async () => {
    const auditTargets: string[] = [];
    const persistWorkflowJob = vi.fn((record) => Effect.succeed(record));
    const updateWebhookOutboundDelivery = vi.fn((input) =>
      Effect.succeed(input.record),
    );
    const scheduleWebhookOutboundDeliveryWorkflowJob = vi.fn(() =>
      Effect.fail({
        _tag: "ConvexAdapterRequestError",
        operation: "scheduleWebhookOutboundDeliveryWorkflowJob",
        cause: new Error("Convex unavailable."),
      } as const),
    );
    const service = await Effect.runPromise(
      makeWebhooksApiAccessService({
        authorization: createAuthorizationServiceDouble(),
        runtimeConfig: createRuntimeConfigDouble(),
        workflowJobs: createWorkflowJobsRepositoryDouble({
          persistWorkflowJob,
        }),
        convexWorkflowClient: createConvexWorkflowClientDouble({
          scheduleWebhookOutboundDeliveryWorkflowJob,
        }),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogServiceDouble({ appendTargets: auditTargets }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        Effect.provideService(
          OryKetoAdapter,
          {} as unknown as OryKetoAdapter["Type"],
        ),
        provideWebhooksApiAccessModule({
          getWebhookSubscription: () =>
            Effect.succeed({
              subscriptionId: "webhook-subscription:organization:org_1:1",
              scope: platformScope.organization,
              scopeId: "org_1",
              url: "https://hooks.example.com/outbound",
              events: ["billing.subscription.activated"],
              status: webhookSubscriptionStatus.active,
              createdAt: "2026-05-07T10:00:00.000Z",
              updatedAt: "2026-05-07T10:00:00.000Z",
            }),
          createWebhookOutboundDelivery: (input) =>
            Effect.succeed({
              deliveryId: "webhook-outbound-delivery:organization:org_1:1",
              subscriptionId: input.subscriptionId,
              scope: input.scope,
              scopeId: input.scopeId,
              eventType: input.eventType,
              payload: input.payload,
              status: webhookOutboundDeliveryStatus.pending,
              attemptCount: 0,
              maxAttempts: input.maxAttempts,
              nextAttemptAt: input.scheduledAt ?? "2026-05-07T10:30:00.000Z",
              createdAt: "2026-05-07T10:00:00.000Z",
              updatedAt: "2026-05-07T10:00:00.000Z",
            }),
          updateWebhookOutboundDelivery,
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.requestWebhookOutboundDelivery({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          subscriptionId: "webhook-subscription:organization:org_1:1",
          eventType: "billing.subscription.activated",
          payload: '{"subscriptionId":"sub_123"}',
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "ConvexAdapterRequestError",
        operation: "scheduleWebhookOutboundDeliveryWorkflowJob",
      },
    });
    expect(scheduleWebhookOutboundDeliveryWorkflowJob).toHaveBeenCalledTimes(1);
    expect(
      persistWorkflowJob.mock.calls.map(([record]) => record.status),
    ).toEqual([workflowJobStatus.scheduled, workflowJobStatus.blocked]);
    expect(updateWebhookOutboundDelivery).toHaveBeenCalledTimes(1);
    expect(
      updateWebhookOutboundDelivery.mock.calls[0]?.[0]?.record,
    ).toMatchObject({
      deliveryId: "webhook-outbound-delivery:organization:org_1:1",
      status: webhookOutboundDeliveryStatus.blocked,
      attemptCount: 0,
    });
    expect(
      updateWebhookOutboundDelivery.mock.calls[0]?.[0]?.record,
    ).not.toHaveProperty("nextAttemptAt");
    expect(
      updateWebhookOutboundDelivery.mock.calls[0]?.[0]?.record?.lastError,
    ).toContain("ConvexAdapterRequestError");
    expect(auditTargets).toEqual([
      `${platformModuleId.webhooksApiAccess}:webhook-outbound-delivery:organization:org_1:1`,
    ]);
  });

  it("blocks pending webhook deliveries when retry rescheduling fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T11:00:00.000Z"));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error("Network unavailable.");
    }) as unknown as typeof fetch;

    try {
      const jobId = buildWebhookOutboundDeliveryWorkflowJobId({
        trigger: workflowJobTrigger.operatorRequested,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        key: "webhook-outbound-delivery:organization:org_1:1",
      });
      const scheduledJob = {
        jobId,
        runtime: workflowJobRuntime.convex,
        sourceModuleId: platformModuleId.webhooksApiAccess,
        kind: workflowJobKind.webhookOutboundDelivery,
        trigger: workflowJobTrigger.operatorRequested,
        status: workflowJobStatus.scheduled,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        attempts: 1,
        scheduledAt: "2026-05-07T10:58:00.000Z",
        payload: {
          sourceModuleId: platformModuleId.webhooksApiAccess,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          requestContext: supportRequestContext,
          actorId: supportRequestContext.actorId,
          correlationId: supportRequestContext.correlationId,
          subscriptionId: "webhook-subscription:organization:org_1:1",
          deliveryId: "webhook-outbound-delivery:organization:org_1:1",
          eventType: "billing.subscription.activated",
          payload: '{"subscriptionId":"sub_123"}',
          maxAttempts: 4,
        },
        createdAt: "2026-05-07T10:58:00.000Z",
        updatedAt: "2026-05-07T10:58:00.000Z",
      } as const;
      const runningJob = {
        ...scheduledJob,
        status: workflowJobStatus.running,
        attempts: 2,
        updatedAt: "2026-05-07T11:00:00.000Z",
      } as const;
      const persistWorkflowJob = vi.fn((record) => Effect.succeed(record));
      const updateWebhookOutboundDelivery = vi.fn((input) =>
        Effect.succeed(input.record),
      );
      const scheduleWebhookOutboundDeliveryWorkflowJob = vi.fn(() =>
        Effect.fail({
          _tag: "ConvexAdapterRequestError",
          operation: "scheduleWebhookOutboundDeliveryWorkflowJob",
          cause: new Error("Convex unavailable."),
        } as const),
      );
      const service = await Effect.runPromise(
        makeWebhooksApiAccessService({
          authorization: createAuthorizationServiceDouble(),
          workflowJobs: createWorkflowJobsRepositoryDouble({
            getWorkflowJob: () => Effect.succeed(scheduledJob),
            claimScheduledWorkflowJob: () => Effect.succeed(runningJob),
            persistWorkflowJob,
          }),
          convexWorkflowClient: createConvexWorkflowClientDouble({
            scheduleWebhookOutboundDeliveryWorkflowJob,
          }),
        }).pipe(
          Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
          Effect.provideService(
            IdentitySessionModule,
            createIdentitySessionServiceDouble(supportRequestContext),
          ),
          Effect.provideService(
            OryKetoAdapter,
            {} as unknown as OryKetoAdapter["Type"],
          ),
          provideWebhooksApiAccessModule({
            getWebhookSubscription: () =>
              Effect.succeed({
                subscriptionId: "webhook-subscription:organization:org_1:1",
                scope: platformScope.organization,
                scopeId: "org_1",
                url: "https://hooks.example.com/outbound",
                events: ["billing.subscription.activated"],
                status: webhookSubscriptionStatus.active,
                createdAt: "2026-05-07T10:00:00.000Z",
                updatedAt: "2026-05-07T10:00:00.000Z",
              }),
            getWebhookOutboundDelivery: () =>
              Effect.succeed({
                deliveryId: "webhook-outbound-delivery:organization:org_1:1",
                subscriptionId: "webhook-subscription:organization:org_1:1",
                scope: platformScope.organization,
                scopeId: "org_1",
                eventType: "billing.subscription.activated",
                payload: '{"subscriptionId":"sub_123"}',
                status: webhookOutboundDeliveryStatus.pending,
                attemptCount: 1,
                maxAttempts: 4,
                nextAttemptAt: "2026-05-07T10:58:00.000Z",
                createdAt: "2026-05-07T10:00:00.000Z",
                updatedAt: "2026-05-07T10:58:00.000Z",
              }),
            updateWebhookOutboundDelivery,
          }),
        ),
      );

      const result = await Effect.runPromise(
        Effect.either(
          service.runWebhookOutboundDeliveryWorkflowJob({
            jobId,
          }),
        ),
      );

      expect(result).toMatchObject({
        _tag: "Right",
        right: {
          jobId,
          kind: workflowJobKind.webhookOutboundDelivery,
          status: workflowJobStatus.blocked,
        },
      });
      expect(updateWebhookOutboundDelivery).toHaveBeenCalledTimes(2);
      expect(
        updateWebhookOutboundDelivery.mock.calls[0]?.[0]?.record,
      ).toMatchObject({
        status: webhookOutboundDeliveryStatus.pending,
        attemptCount: 2,
        nextAttemptAt: "2026-05-07T11:02:00.000Z",
        lastError:
          "Webhook delivery request to https://hooks.example.com/outbound failed.",
      });
      expect(
        updateWebhookOutboundDelivery.mock.calls[1]?.[0]?.record,
      ).toMatchObject({
        status: webhookOutboundDeliveryStatus.blocked,
        attemptCount: 2,
      });
      expect(
        updateWebhookOutboundDelivery.mock.calls[1]?.[0]?.record,
      ).not.toHaveProperty("nextAttemptAt");
      expect(
        updateWebhookOutboundDelivery.mock.calls[1]?.[0]?.record?.lastError,
      ).toContain("Retry scheduling failed");
      expect(
        persistWorkflowJob.mock.calls.map(([record]) => record.status),
      ).toEqual([workflowJobStatus.scheduled, workflowJobStatus.blocked]);
    } finally {
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
    }
  });

  it("completes webhook deliveries and updates subscription lastDeliveryAt on success", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T11:00:00.000Z"));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 202,
      text: async () => "",
    })) as unknown as typeof fetch;

    try {
      const jobId = buildWebhookOutboundDeliveryWorkflowJobId({
        trigger: workflowJobTrigger.operatorRequested,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        key: "webhook-outbound-delivery:organization:org_1:1",
      });
      const scheduledJob = {
        jobId,
        runtime: workflowJobRuntime.convex,
        sourceModuleId: platformModuleId.webhooksApiAccess,
        kind: workflowJobKind.webhookOutboundDelivery,
        trigger: workflowJobTrigger.operatorRequested,
        status: workflowJobStatus.scheduled,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        attempts: 1,
        scheduledAt: "2026-05-07T10:58:00.000Z",
        payload: {
          sourceModuleId: platformModuleId.webhooksApiAccess,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          requestContext: supportRequestContext,
          actorId: supportRequestContext.actorId,
          correlationId: supportRequestContext.correlationId,
          subscriptionId: "webhook-subscription:organization:org_1:1",
          deliveryId: "webhook-outbound-delivery:organization:org_1:1",
          eventType: "billing.subscription.activated",
          payload: '{"subscriptionId":"sub_123"}',
          maxAttempts: 4,
        },
        createdAt: "2026-05-07T10:58:00.000Z",
        updatedAt: "2026-05-07T10:58:00.000Z",
      } as const;
      const runningJob = {
        ...scheduledJob,
        status: workflowJobStatus.running,
        attempts: 2,
        updatedAt: "2026-05-07T11:00:00.000Z",
      } as const;
      const persistWorkflowJob = vi.fn((record) => Effect.succeed(record));
      const updateWebhookOutboundDelivery = vi.fn((input) =>
        Effect.succeed(input.record),
      );
      const service = await Effect.runPromise(
        makeWebhooksApiAccessService({
          authorization: createAuthorizationServiceDouble(),
          workflowJobs: createWorkflowJobsRepositoryDouble({
            getWorkflowJob: () => Effect.succeed(scheduledJob),
            claimScheduledWorkflowJob: () => Effect.succeed(runningJob),
            persistWorkflowJob,
          }),
          convexWorkflowClient: createConvexWorkflowClientDouble(),
        }).pipe(
          Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
          Effect.provideService(
            IdentitySessionModule,
            createIdentitySessionServiceDouble(supportRequestContext),
          ),
          Effect.provideService(
            OryKetoAdapter,
            {} as unknown as OryKetoAdapter["Type"],
          ),
          provideWebhooksApiAccessModule({
            getWebhookSubscription: () =>
              Effect.succeed({
                subscriptionId: "webhook-subscription:organization:org_1:1",
                scope: platformScope.organization,
                scopeId: "org_1",
                url: "https://hooks.example.com/outbound",
                events: ["billing.subscription.activated"],
                status: webhookSubscriptionStatus.active,
                createdAt: "2026-05-07T10:00:00.000Z",
                updatedAt: "2026-05-07T10:00:00.000Z",
              }),
            getWebhookOutboundDelivery: () =>
              Effect.succeed({
                deliveryId: "webhook-outbound-delivery:organization:org_1:1",
                subscriptionId: "webhook-subscription:organization:org_1:1",
                scope: platformScope.organization,
                scopeId: "org_1",
                eventType: "billing.subscription.activated",
                payload: '{"subscriptionId":"sub_123"}',
                status: webhookOutboundDeliveryStatus.pending,
                attemptCount: 1,
                maxAttempts: 4,
                nextAttemptAt: "2026-05-07T10:58:00.000Z",
                lastError: "Previous delivery failure.",
                createdAt: "2026-05-07T10:00:00.000Z",
                updatedAt: "2026-05-07T10:58:00.000Z",
              }),
            updateWebhookOutboundDelivery,
          }),
        ),
      );

      const result = await Effect.runPromise(
        Effect.either(
          service.runWebhookOutboundDeliveryWorkflowJob({
            jobId,
          }),
        ),
      );

      expect(result).toMatchObject({
        _tag: "Right",
        right: {
          jobId,
          kind: workflowJobKind.webhookOutboundDelivery,
          status: workflowJobStatus.completed,
        },
      });
      expect(updateWebhookOutboundDelivery).toHaveBeenCalledTimes(1);
      expect(updateWebhookOutboundDelivery.mock.calls[0]?.[0]).toMatchObject({
        touchSubscriptionLastDeliveryAt: "2026-05-07T11:00:00.000Z",
      });
      expect(
        updateWebhookOutboundDelivery.mock.calls[0]?.[0]?.record,
      ).toMatchObject({
        status: webhookOutboundDeliveryStatus.delivered,
        attemptCount: 2,
        deliveredAt: "2026-05-07T11:00:00.000Z",
      });
      expect(
        updateWebhookOutboundDelivery.mock.calls[0]?.[0]?.record,
      ).not.toHaveProperty("nextAttemptAt");
      expect(
        updateWebhookOutboundDelivery.mock.calls[0]?.[0]?.record,
      ).not.toHaveProperty("lastError");
    } finally {
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
    }
  });

  it("blocks webhook deliveries when the retry budget is exhausted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T11:00:00.000Z"));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error("Network unavailable.");
    }) as unknown as typeof fetch;

    try {
      const jobId = buildWebhookOutboundDeliveryWorkflowJobId({
        trigger: workflowJobTrigger.operatorRequested,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        key: "webhook-outbound-delivery:organization:org_1:1",
      });
      const scheduledJob = {
        jobId,
        runtime: workflowJobRuntime.convex,
        sourceModuleId: platformModuleId.webhooksApiAccess,
        kind: workflowJobKind.webhookOutboundDelivery,
        trigger: workflowJobTrigger.operatorRequested,
        status: workflowJobStatus.scheduled,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        attempts: 1,
        scheduledAt: "2026-05-07T10:58:00.000Z",
        payload: {
          sourceModuleId: platformModuleId.webhooksApiAccess,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          requestContext: supportRequestContext,
          actorId: supportRequestContext.actorId,
          correlationId: supportRequestContext.correlationId,
          subscriptionId: "webhook-subscription:organization:org_1:1",
          deliveryId: "webhook-outbound-delivery:organization:org_1:1",
          eventType: "billing.subscription.activated",
          payload: '{"subscriptionId":"sub_123"}',
          maxAttempts: 2,
        },
        createdAt: "2026-05-07T10:58:00.000Z",
        updatedAt: "2026-05-07T10:58:00.000Z",
      } as const;
      const runningJob = {
        ...scheduledJob,
        status: workflowJobStatus.running,
        attempts: 2,
        updatedAt: "2026-05-07T11:00:00.000Z",
      } as const;
      const persistWorkflowJob = vi.fn((record) => Effect.succeed(record));
      const updateWebhookOutboundDelivery = vi.fn((input) =>
        Effect.succeed(input.record),
      );
      const service = await Effect.runPromise(
        makeWebhooksApiAccessService({
          authorization: createAuthorizationServiceDouble(),
          workflowJobs: createWorkflowJobsRepositoryDouble({
            getWorkflowJob: () => Effect.succeed(scheduledJob),
            claimScheduledWorkflowJob: () => Effect.succeed(runningJob),
            persistWorkflowJob,
          }),
          convexWorkflowClient: createConvexWorkflowClientDouble(),
        }).pipe(
          Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
          Effect.provideService(
            IdentitySessionModule,
            createIdentitySessionServiceDouble(supportRequestContext),
          ),
          Effect.provideService(
            OryKetoAdapter,
            {} as unknown as OryKetoAdapter["Type"],
          ),
          provideWebhooksApiAccessModule({
            getWebhookSubscription: () =>
              Effect.succeed({
                subscriptionId: "webhook-subscription:organization:org_1:1",
                scope: platformScope.organization,
                scopeId: "org_1",
                url: "https://hooks.example.com/outbound",
                events: ["billing.subscription.activated"],
                status: webhookSubscriptionStatus.active,
                createdAt: "2026-05-07T10:00:00.000Z",
                updatedAt: "2026-05-07T10:00:00.000Z",
              }),
            getWebhookOutboundDelivery: () =>
              Effect.succeed({
                deliveryId: "webhook-outbound-delivery:organization:org_1:1",
                subscriptionId: "webhook-subscription:organization:org_1:1",
                scope: platformScope.organization,
                scopeId: "org_1",
                eventType: "billing.subscription.activated",
                payload: '{"subscriptionId":"sub_123"}',
                status: webhookOutboundDeliveryStatus.pending,
                attemptCount: 1,
                maxAttempts: 2,
                nextAttemptAt: "2026-05-07T10:58:00.000Z",
                createdAt: "2026-05-07T10:00:00.000Z",
                updatedAt: "2026-05-07T10:58:00.000Z",
              }),
            updateWebhookOutboundDelivery,
          }),
        ),
      );

      const result = await Effect.runPromise(
        Effect.either(
          service.runWebhookOutboundDeliveryWorkflowJob({
            jobId,
          }),
        ),
      );

      expect(result).toMatchObject({
        _tag: "Right",
        right: {
          jobId,
          kind: workflowJobKind.webhookOutboundDelivery,
          status: workflowJobStatus.blocked,
        },
      });
      expect(updateWebhookOutboundDelivery).toHaveBeenCalledTimes(1);
      expect(
        updateWebhookOutboundDelivery.mock.calls[0]?.[0]?.record,
      ).toMatchObject({
        status: webhookOutboundDeliveryStatus.blocked,
        attemptCount: 2,
        exhaustedAt: "2026-05-07T11:00:00.000Z",
      });
      expect(
        updateWebhookOutboundDelivery.mock.calls[0]?.[0]?.record,
      ).not.toHaveProperty("nextAttemptAt");
      expect(
        updateWebhookOutboundDelivery.mock.calls[0]?.[0]?.record?.lastError,
      ).toContain("https://hooks.example.com/outbound");
      expect(
        persistWorkflowJob.mock.calls.map(([record]) => record.status),
      ).toEqual([workflowJobStatus.blocked]);
    } finally {
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
    }
  });

  it("blocks delivery records when execution-time subscription validation fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T11:15:00.000Z"));

    try {
      const jobId = buildWebhookOutboundDeliveryWorkflowJobId({
        trigger: workflowJobTrigger.operatorRequested,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        key: "webhook-outbound-delivery:organization:org_1:paused",
      });
      const scheduledJob = {
        jobId,
        runtime: workflowJobRuntime.convex,
        sourceModuleId: platformModuleId.webhooksApiAccess,
        kind: workflowJobKind.webhookOutboundDelivery,
        trigger: workflowJobTrigger.operatorRequested,
        status: workflowJobStatus.scheduled,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        attempts: 0,
        scheduledAt: "2026-05-07T11:14:00.000Z",
        payload: {
          sourceModuleId: platformModuleId.webhooksApiAccess,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          requestContext: supportRequestContext,
          actorId: supportRequestContext.actorId,
          correlationId: supportRequestContext.correlationId,
          subscriptionId: "webhook-subscription:organization:org_1:1",
          deliveryId: "webhook-outbound-delivery:organization:org_1:paused",
          eventType: "billing.subscription.activated",
          payload: '{"subscriptionId":"sub_123"}',
          maxAttempts: 4,
        },
        createdAt: "2026-05-07T11:14:00.000Z",
        updatedAt: "2026-05-07T11:14:00.000Z",
      } as const;
      const runningJob = {
        ...scheduledJob,
        status: workflowJobStatus.running,
        attempts: 1,
        updatedAt: "2026-05-07T11:15:00.000Z",
      } as const;
      const persistWorkflowJob = vi.fn((record) => Effect.succeed(record));
      const updateWebhookOutboundDelivery = vi.fn((input) =>
        Effect.succeed(input.record),
      );
      const service = await Effect.runPromise(
        makeWebhooksApiAccessService({
          authorization: createAuthorizationServiceDouble(),
          workflowJobs: createWorkflowJobsRepositoryDouble({
            getWorkflowJob: () => Effect.succeed(scheduledJob),
            claimScheduledWorkflowJob: () => Effect.succeed(runningJob),
            persistWorkflowJob,
          }),
          convexWorkflowClient: createConvexWorkflowClientDouble(),
        }).pipe(
          Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
          Effect.provideService(
            IdentitySessionModule,
            createIdentitySessionServiceDouble(supportRequestContext),
          ),
          Effect.provideService(
            OryKetoAdapter,
            {} as unknown as OryKetoAdapter["Type"],
          ),
          provideWebhooksApiAccessModule({
            getWebhookSubscription: () =>
              Effect.succeed({
                subscriptionId: "webhook-subscription:organization:org_1:1",
                scope: platformScope.organization,
                scopeId: "org_1",
                url: "https://hooks.example.com/outbound",
                events: ["billing.subscription.activated"],
                status: webhookSubscriptionStatus.paused,
                createdAt: "2026-05-07T10:00:00.000Z",
                updatedAt: "2026-05-07T10:00:00.000Z",
              }),
            getWebhookOutboundDelivery: () =>
              Effect.succeed({
                deliveryId:
                  "webhook-outbound-delivery:organization:org_1:paused",
                subscriptionId: "webhook-subscription:organization:org_1:1",
                scope: platformScope.organization,
                scopeId: "org_1",
                eventType: "billing.subscription.activated",
                payload: '{"subscriptionId":"sub_123"}',
                status: webhookOutboundDeliveryStatus.pending,
                attemptCount: 0,
                maxAttempts: 4,
                nextAttemptAt: "2026-05-07T11:14:00.000Z",
                createdAt: "2026-05-07T10:00:00.000Z",
                updatedAt: "2026-05-07T11:14:00.000Z",
              }),
            updateWebhookOutboundDelivery,
          }),
        ),
      );

      const result = await Effect.runPromise(
        Effect.either(
          service.runWebhookOutboundDeliveryWorkflowJob({
            jobId,
          }),
        ),
      );

      expect(result).toMatchObject({
        _tag: "Right",
        right: {
          jobId,
          kind: workflowJobKind.webhookOutboundDelivery,
          status: workflowJobStatus.blocked,
        },
      });
      expect(updateWebhookOutboundDelivery).toHaveBeenCalledTimes(1);
      expect(
        updateWebhookOutboundDelivery.mock.calls[0]?.[0]?.record,
      ).toMatchObject({
        status: webhookOutboundDeliveryStatus.blocked,
        attemptCount: 1,
        lastError:
          "Webhook subscription webhook-subscription:organization:org_1:1 is paused.",
      });
      expect(
        updateWebhookOutboundDelivery.mock.calls[0]?.[0]?.record,
      ).not.toHaveProperty("nextAttemptAt");
      expect(
        persistWorkflowJob.mock.calls.map(([record]) => record.status),
      ).toEqual([workflowJobStatus.blocked]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("completes replayed blocked deliveries without retaining exhausted retry metadata", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T12:00:00.000Z"));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 202,
      text: async () => "",
    })) as unknown as typeof fetch;

    try {
      const jobId = buildWebhookOutboundDeliveryWorkflowJobId({
        trigger: workflowJobTrigger.operatorRequested,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        key: "webhook-outbound-delivery:organization:org_1:blocked",
      });
      const scheduledJob = {
        jobId,
        runtime: workflowJobRuntime.convex,
        sourceModuleId: platformModuleId.webhooksApiAccess,
        kind: workflowJobKind.webhookOutboundDelivery,
        trigger: workflowJobTrigger.operatorRequested,
        status: workflowJobStatus.scheduled,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        attempts: 4,
        scheduledAt: "2026-05-07T11:59:00.000Z",
        payload: {
          sourceModuleId: platformModuleId.webhooksApiAccess,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          requestContext: supportRequestContext,
          actorId: supportRequestContext.actorId,
          correlationId: supportRequestContext.correlationId,
          subscriptionId: "webhook-subscription:organization:org_1:1",
          deliveryId: "webhook-outbound-delivery:organization:org_1:blocked",
          eventType: "billing.subscription.activated",
          payload: '{"subscriptionId":"sub_123"}',
          maxAttempts: 4,
        },
        createdAt: "2026-05-07T11:59:00.000Z",
        updatedAt: "2026-05-07T11:59:00.000Z",
      } as const;
      const runningJob = {
        ...scheduledJob,
        status: workflowJobStatus.running,
        attempts: 5,
        updatedAt: "2026-05-07T12:00:00.000Z",
      } as const;
      const updateWebhookOutboundDelivery = vi.fn((input) =>
        Effect.succeed(input.record),
      );
      const service = await Effect.runPromise(
        makeWebhooksApiAccessService({
          authorization: createAuthorizationServiceDouble(),
          workflowJobs: createWorkflowJobsRepositoryDouble({
            getWorkflowJob: () => Effect.succeed(scheduledJob),
            claimScheduledWorkflowJob: () => Effect.succeed(runningJob),
            persistWorkflowJob: () => Effect.succeed(runningJob),
          }),
          convexWorkflowClient: createConvexWorkflowClientDouble(),
        }).pipe(
          Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
          Effect.provideService(
            IdentitySessionModule,
            createIdentitySessionServiceDouble(supportRequestContext),
          ),
          Effect.provideService(
            OryKetoAdapter,
            {} as unknown as OryKetoAdapter["Type"],
          ),
          provideWebhooksApiAccessModule({
            getWebhookSubscription: () =>
              Effect.succeed({
                subscriptionId: "webhook-subscription:organization:org_1:1",
                scope: platformScope.organization,
                scopeId: "org_1",
                url: "https://hooks.example.com/outbound",
                events: ["billing.subscription.activated"],
                status: webhookSubscriptionStatus.active,
                createdAt: "2026-05-07T10:00:00.000Z",
                updatedAt: "2026-05-07T10:00:00.000Z",
              }),
            getWebhookOutboundDelivery: () =>
              Effect.succeed({
                deliveryId:
                  "webhook-outbound-delivery:organization:org_1:blocked",
                subscriptionId: "webhook-subscription:organization:org_1:1",
                scope: platformScope.organization,
                scopeId: "org_1",
                eventType: "billing.subscription.activated",
                payload: '{"subscriptionId":"sub_123"}',
                status: webhookOutboundDeliveryStatus.blocked,
                attemptCount: 4,
                maxAttempts: 4,
                exhaustedAt: "2026-05-07T11:55:00.000Z",
                lastError: "Retry budget exhausted.",
                createdAt: "2026-05-07T10:00:00.000Z",
                updatedAt: "2026-05-07T11:55:00.000Z",
              }),
            updateWebhookOutboundDelivery,
          }),
        ),
      );

      const result = await Effect.runPromise(
        Effect.either(
          service.runWebhookOutboundDeliveryWorkflowJob({
            jobId,
          }),
        ),
      );

      expect(result).toMatchObject({
        _tag: "Right",
        right: {
          jobId,
          kind: workflowJobKind.webhookOutboundDelivery,
          status: workflowJobStatus.completed,
        },
      });
      expect(updateWebhookOutboundDelivery).toHaveBeenCalledTimes(1);
      expect(
        updateWebhookOutboundDelivery.mock.calls[0]?.[0]?.record,
      ).toMatchObject({
        status: webhookOutboundDeliveryStatus.delivered,
        attemptCount: 5,
        deliveredAt: "2026-05-07T12:00:00.000Z",
      });
      expect(
        updateWebhookOutboundDelivery.mock.calls[0]?.[0]?.record,
      ).not.toHaveProperty("exhaustedAt");
      expect(
        updateWebhookOutboundDelivery.mock.calls[0]?.[0]?.record,
      ).not.toHaveProperty("lastError");
    } finally {
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
    }
  });

  it("rejects webhook delivery requests for paused subscriptions", async () => {
    const createWebhookOutboundDelivery = vi.fn(() =>
      unexpectedWebhooksAdminEffect(),
    );
    const service = await Effect.runPromise(
      makeWebhooksApiAccessService({
        authorization: createAuthorizationServiceDouble(),
        runtimeConfig: createRuntimeConfigDouble(),
        workflowJobs: createWorkflowJobsRepositoryDouble(),
        convexWorkflowClient: createConvexWorkflowClientDouble(),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        Effect.provideService(
          OryKetoAdapter,
          {} as unknown as OryKetoAdapter["Type"],
        ),
        provideWebhooksApiAccessModule({
          getWebhookSubscription: () =>
            Effect.succeed({
              subscriptionId: "webhook-subscription:organization:org_1:1",
              scope: platformScope.organization,
              scopeId: "org_1",
              url: "https://hooks.example.com/outbound",
              events: ["billing.subscription.activated"],
              status: webhookSubscriptionStatus.paused,
              createdAt: "2026-05-07T10:00:00.000Z",
              updatedAt: "2026-05-07T10:00:00.000Z",
            }),
          createWebhookOutboundDelivery,
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.requestWebhookOutboundDelivery({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          subscriptionId: "webhook-subscription:organization:org_1:1",
          eventType: "billing.subscription.activated",
          payload: '{"subscriptionId":"sub_123"}',
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "WebhooksApiAccessSubscriptionPausedError",
        subscriptionId: "webhook-subscription:organization:org_1:1",
        status: webhookSubscriptionStatus.paused,
      },
    });
    expect(createWebhookOutboundDelivery).not.toHaveBeenCalled();
  });

  it("rejects webhook delivery requests for events outside the subscription contract", async () => {
    const createWebhookOutboundDelivery = vi.fn(() =>
      unexpectedWebhooksAdminEffect(),
    );
    const service = await Effect.runPromise(
      makeWebhooksApiAccessService({
        authorization: createAuthorizationServiceDouble(),
        runtimeConfig: createRuntimeConfigDouble(),
        workflowJobs: createWorkflowJobsRepositoryDouble(),
        convexWorkflowClient: createConvexWorkflowClientDouble(),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        Effect.provideService(
          OryKetoAdapter,
          {} as unknown as OryKetoAdapter["Type"],
        ),
        provideWebhooksApiAccessModule({
          getWebhookSubscription: () =>
            Effect.succeed({
              subscriptionId: "webhook-subscription:organization:org_1:1",
              scope: platformScope.organization,
              scopeId: "org_1",
              url: "https://hooks.example.com/outbound",
              events: ["billing.subscription.updated"],
              status: webhookSubscriptionStatus.active,
              createdAt: "2026-05-07T10:00:00.000Z",
              updatedAt: "2026-05-07T10:00:00.000Z",
            }),
          createWebhookOutboundDelivery,
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.requestWebhookOutboundDelivery({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          subscriptionId: "webhook-subscription:organization:org_1:1",
          eventType: "billing.subscription.activated",
          payload: '{"subscriptionId":"sub_123"}',
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "WebhooksApiAccessSubscriptionEventNotAllowedError",
        subscriptionId: "webhook-subscription:organization:org_1:1",
        eventType: "billing.subscription.activated",
      },
    });
    expect(createWebhookOutboundDelivery).not.toHaveBeenCalled();
  });

  it("creates, lists, rotates, and revokes webhook api keys for operator sessions", async () => {
    const seen: {
      readonly auditTargets: string[];
      readonly authorizationScopeIds: string[];
      readonly creates: Array<{ readonly scopeId: string }>;
      readonly lists: Array<{ readonly scopeId: string }>;
      readonly rotates: Array<{ readonly apiKeyId: string }>;
      readonly revokes: Array<{ readonly apiKeyId: string }>;
    } = {
      auditTargets: [],
      authorizationScopeIds: [],
      creates: [],
      lists: [],
      rotates: [],
      revokes: [],
    };
    const service = await Effect.runPromise(
      makeWebhooksApiAccessService({
        authorization: createAuthorizationServiceDouble({
          onCheck: (input) => {
            seen.authorizationScopeIds.push(
              input.requestContext.tenant.scopeId,
            );

            return Effect.succeed({
              allowed: true,
              cacheKey: "webhook:manage",
              reason: "allowed",
              auditRequired: false,
            });
          },
        }),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogServiceDouble({ appendTargets: seen.auditTargets }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        provideWebhooksApiAccessModule({
          processVerifiedProviderWebhook: () =>
            Effect.die(new Error("Unexpected webhook processing call.")),
          replayProviderWebhook: () =>
            Effect.die(new Error("Unexpected webhook replay call.")),
          createWebhookSubscription: () =>
            Effect.die(new Error("Unexpected webhook subscription call.")),
          listWebhookSubscriptions: () =>
            Effect.die(new Error("Unexpected webhook subscription call.")),
          createWebhookApiKey: (input) => {
            seen.creates.push({ scopeId: input.scopeId });

            return Effect.succeed({
              record: {
                apiKeyId: "webhook-api-key:organization:org_1:1",
                scope: input.scope,
                scopeId: input.scopeId,
                label: input.label,
                secretHash: "hash_created",
                prefix: "wkai_created_pref",
                status: webhookApiKeyStatus.active,
                createdAt: "2026-05-06T10:00:00.000Z",
                updatedAt: "2026-05-06T10:00:00.000Z",
              },
              secret: "wkai_created_secret",
            });
          },
          listWebhookApiKeys: (input) => {
            seen.lists.push({ scopeId: input.scopeId });

            return Effect.succeed([
              {
                apiKeyId: "webhook-api-key:organization:org_1:1",
                scope: input.scope,
                scopeId: input.scopeId,
                label: "Partner export",
                secretHash: "hash_created",
                prefix: "wkai_created_pref",
                status: webhookApiKeyStatus.active,
                createdAt: "2026-05-06T10:00:00.000Z",
                updatedAt: "2026-05-06T10:00:00.000Z",
              },
            ]);
          },
          rotateWebhookApiKey: (input) => {
            seen.rotates.push({ apiKeyId: input.apiKeyId });

            return Effect.succeed({
              previousRecord: {
                apiKeyId: input.apiKeyId,
                scope: input.scope,
                scopeId: input.scopeId,
                label: "Partner export",
                secretHash: "hash_created",
                prefix: "wkai_created_pref",
                status: webhookApiKeyStatus.active,
                createdAt: "2026-05-06T10:00:00.000Z",
                updatedAt: "2026-05-06T10:00:00.000Z",
              },
              record: {
                apiKeyId: input.apiKeyId,
                scope: input.scope,
                scopeId: input.scopeId,
                label: "Partner export",
                secretHash: "hash_rotated",
                prefix: "wkai_rotated_pref",
                status: webhookApiKeyStatus.active,
                createdAt: "2026-05-06T10:00:00.000Z",
                updatedAt: "2026-05-06T11:00:00.000Z",
                rotatedAt: "2026-05-06T11:00:00.000Z",
              },
              secret: "wkai_rotated_secret",
            });
          },
          revokeWebhookApiKey: (input) => {
            seen.revokes.push({ apiKeyId: input.apiKeyId });

            return Effect.succeed({
              apiKeyId: input.apiKeyId,
              scope: input.scope,
              scopeId: input.scopeId,
              label: "Partner export",
              secretHash: "hash_rotated",
              prefix: "wkai_rotated_pref",
              status: webhookApiKeyStatus.revoked,
              createdAt: "2026-05-06T10:00:00.000Z",
              updatedAt: "2026-05-06T12:00:00.000Z",
              rotatedAt: "2026-05-06T11:00:00.000Z",
              revokedAt: "2026-05-06T12:00:00.000Z",
            });
          },
        }),
      ),
    );

    const created = await Effect.runPromise(
      service.createWebhookApiKey({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
        label: "Partner export",
      }),
    );
    const listed = await Effect.runPromise(
      service.listWebhookApiKeys({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
      }),
    );
    const rotated = await Effect.runPromise(
      service.rotateWebhookApiKey({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
        apiKeyId: "webhook-api-key:organization:org_1:1",
      }),
    );
    const revoked = await Effect.runPromise(
      service.revokeWebhookApiKey({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
        apiKeyId: "webhook-api-key:organization:org_1:1",
      }),
    );

    expect(seen.auditTargets).toEqual([
      `${platformModuleId.webhooksApiAccess}:webhook-api-key:organization:org_1:1:api-key:label`,
      `${platformModuleId.webhooksApiAccess}:webhook-api-key:organization:org_1:1`,
      `${platformModuleId.webhooksApiAccess}:organization:org_1:api-keys:label`,
      `${platformModuleId.webhooksApiAccess}:webhook-api-key:organization:org_1:1:api-key:label`,
      `${platformModuleId.webhooksApiAccess}:webhook-api-key:organization:org_1:1`,
      `${platformModuleId.webhooksApiAccess}:webhook-api-key:organization:org_1:1:api-key:label`,
      `${platformModuleId.webhooksApiAccess}:webhook-api-key:organization:org_1:1`,
    ]);
    expect(seen.authorizationScopeIds).toEqual([
      "org_1",
      "org_1",
      "org_1",
      "org_1",
    ]);
    expect(seen.creates).toEqual([{ scopeId: "org_1" }]);
    expect(seen.lists).toEqual([{ scopeId: "org_1" }]);
    expect(seen.rotates).toEqual([
      { apiKeyId: "webhook-api-key:organization:org_1:1" },
    ]);
    expect(seen.revokes).toEqual([
      { apiKeyId: "webhook-api-key:organization:org_1:1" },
    ]);
    expect(created).toEqual({
      apiKey: {
        apiKeyId: "webhook-api-key:organization:org_1:1",
        label: "Partner export",
        prefix: "wkai_created_pref",
        status: webhookApiKeyStatus.active,
        createdAt: "2026-05-06T10:00:00.000Z",
      },
      secret: "wkai_created_secret",
    });
    expect(listed).toEqual([
      {
        apiKeyId: "webhook-api-key:organization:org_1:1",
        label: "Partner export",
        prefix: "wkai_created_pref",
        status: webhookApiKeyStatus.active,
        createdAt: "2026-05-06T10:00:00.000Z",
      },
    ]);
    expect(rotated).toEqual({
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
    expect(revoked).toEqual({
      apiKeyId: "webhook-api-key:organization:org_1:1",
      label: "Partner export",
      prefix: "wkai_rotated_pref",
      status: webhookApiKeyStatus.revoked,
      createdAt: "2026-05-06T10:00:00.000Z",
      rotatedAt: "2026-05-06T11:00:00.000Z",
      revokedAt: "2026-05-06T12:00:00.000Z",
    });
  });

  it("revokes a created webhook api key when audit persistence fails before the secret is returned", async () => {
    const seen: {
      readonly revokedApiKeyIds: string[];
      readonly revokeExpectedCurrentRecords: Array<
        Parameters<
          WebhooksApiAccessModule["Type"]["revokeWebhookApiKey"]
        >[0]["expectedCurrentRecord"]
      >;
    } = {
      revokedApiKeyIds: [],
      revokeExpectedCurrentRecords: [],
    };
    const service = await Effect.runPromise(
      makeWebhooksApiAccessService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogServiceDouble({
            onAppend: () =>
              Effect.fail({
                _tag: "AuditLogPostgresRepositoryPersistenceError",
                operation: "insertAuditEvent",
                cause: new Error("postgres unavailable"),
              }),
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        provideWebhooksApiAccessModule({
          createWebhookApiKey: (input) =>
            Effect.succeed({
              record: {
                apiKeyId: "webhook-api-key:organization:org_1:1",
                scope: input.scope,
                scopeId: input.scopeId,
                label: input.label,
                secretHash: "hash_created",
                prefix: "wkai_created_pref",
                status: webhookApiKeyStatus.active,
                createdAt: "2026-05-06T10:00:00.000Z",
                updatedAt: "2026-05-06T10:00:00.000Z",
              },
              secret: "wkai_created_secret",
            }),
          revokeWebhookApiKey: (input) => {
            seen.revokedApiKeyIds.push(input.apiKeyId);
            seen.revokeExpectedCurrentRecords.push(input.expectedCurrentRecord);

            return Effect.succeed({
              apiKeyId: input.apiKeyId,
              scope: input.scope,
              scopeId: input.scopeId,
              label: "Partner export",
              secretHash: "hash_created",
              prefix: "wkai_created_pref",
              status: webhookApiKeyStatus.revoked,
              createdAt: "2026-05-06T10:00:00.000Z",
              updatedAt: "2026-05-06T10:01:00.000Z",
              revokedAt: "2026-05-06T10:01:00.000Z",
            });
          },
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.createWebhookApiKey({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          label: "Partner export",
        }),
      ),
    );

    expect(seen.revokedApiKeyIds).toEqual([
      "webhook-api-key:organization:org_1:1",
    ]);
    expect(seen.revokeExpectedCurrentRecords).toEqual([
      {
        apiKeyId: "webhook-api-key:organization:org_1:1",
        scope: platformScope.organization,
        scopeId: "org_1",
        label: "Partner export",
        secretHash: "hash_created",
        prefix: "wkai_created_pref",
        status: webhookApiKeyStatus.active,
        createdAt: "2026-05-06T10:00:00.000Z",
        updatedAt: "2026-05-06T10:00:00.000Z",
      },
    ]);
    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AuditLogPostgresRepositoryPersistenceError",
        operation: "insertAuditEvent",
      },
    });
  });

  it("preserves the original create failure when compensation sees a later webhook api key mutation", async () => {
    const seen: { readonly revokedApiKeyIds: string[] } = {
      revokedApiKeyIds: [],
    };
    const service = await Effect.runPromise(
      makeWebhooksApiAccessService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogServiceDouble({
            onAppend: () =>
              Effect.fail({
                _tag: "AuditLogPostgresRepositoryPersistenceError",
                operation: "insertAuditEvent",
                cause: new Error("postgres unavailable"),
              }),
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        provideWebhooksApiAccessModule({
          createWebhookApiKey: (input) =>
            Effect.succeed({
              record: {
                apiKeyId: "webhook-api-key:organization:org_1:1",
                scope: input.scope,
                scopeId: input.scopeId,
                label: input.label,
                secretHash: "hash_created",
                prefix: "wkai_created_pref",
                status: webhookApiKeyStatus.active,
                createdAt: "2026-05-06T10:00:00.000Z",
                updatedAt: "2026-05-06T10:00:00.000Z",
              },
              secret: "wkai_created_secret",
            }),
          revokeWebhookApiKey: (input) => {
            seen.revokedApiKeyIds.push(input.apiKeyId);

            return Effect.fail({
              _tag: "WebhookApiKeyMutationConflictError",
              scope: input.scope,
              scopeId: input.scopeId,
              apiKeyId: input.apiKeyId,
            });
          },
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.createWebhookApiKey({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          label: "Partner export",
        }),
      ),
    );

    expect(seen.revokedApiKeyIds).toEqual([
      "webhook-api-key:organization:org_1:1",
    ]);
    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AuditLogPostgresRepositoryPersistenceError",
        operation: "insertAuditEvent",
      },
    });
  });

  it("restores the previous webhook api key state when audit persistence fails after rotation", async () => {
    const seen: { readonly restoredApiKeys: string[] } = {
      restoredApiKeys: [],
    };
    const previousRecord = {
      apiKeyId: "webhook-api-key:organization:org_1:1",
      scope: platformScope.organization,
      scopeId: "org_1",
      label: "Partner export",
      secretHash: "hash_created",
      prefix: "wkai_created_pref",
      status: webhookApiKeyStatus.active,
      createdAt: "2026-05-06T10:00:00.000Z",
      updatedAt: "2026-05-06T10:00:00.000Z",
    } as const;
    const service = await Effect.runPromise(
      makeWebhooksApiAccessService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogServiceDouble({
            onAppend: () =>
              Effect.fail({
                _tag: "AuditLogPostgresRepositoryPersistenceError",
                operation: "insertAuditEvent",
                cause: new Error("postgres unavailable"),
              }),
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        provideWebhooksApiAccessModule({
          rotateWebhookApiKey: (input) =>
            Effect.succeed({
              previousRecord,
              record: {
                apiKeyId: input.apiKeyId,
                scope: input.scope,
                scopeId: input.scopeId,
                label: "Partner export",
                secretHash: "hash_rotated",
                prefix: "wkai_rotated_pref",
                status: webhookApiKeyStatus.active,
                createdAt: "2026-05-06T10:00:00.000Z",
                updatedAt: "2026-05-06T11:00:00.000Z",
                rotatedAt: "2026-05-06T11:00:00.000Z",
              },
              secret: "wkai_rotated_secret",
            }),
          restoreWebhookApiKey: (input) => {
            seen.restoredApiKeys.push(input.record.apiKeyId);

            return Effect.succeed(input.record);
          },
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.rotateWebhookApiKey({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          apiKeyId: "webhook-api-key:organization:org_1:1",
        }),
      ),
    );

    expect(seen.restoredApiKeys).toEqual([
      "webhook-api-key:organization:org_1:1",
    ]);
    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AuditLogPostgresRepositoryPersistenceError",
        operation: "insertAuditEvent",
      },
    });
  });

  it("audits the compensated webhook api key revocation when result shaping fails before secret handoff", async () => {
    const seen: {
      readonly auditActions: string[];
      readonly auditTargets: string[];
      readonly revokedApiKeyIds: string[];
    } = {
      auditActions: [],
      auditTargets: [],
      revokedApiKeyIds: [],
    };
    const service = await Effect.runPromise(
      makeWebhooksApiAccessService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogServiceDouble({
            onAppend: (request) => {
              seen.auditActions.push(request.action);
              seen.auditTargets.push(request.target);

              return Effect.succeed({
                eventId: `${request.moduleId}:${request.action}:${request.requestContext.correlationId}`,
                timestamp: "2026-04-27T19:00:00.000Z",
                actorId:
                  request.requestContext.actorId ??
                  `${request.requestContext.actorType}:anonymous`,
                tenantScope: request.requestContext.tenant.scope,
                tenantScopeId: request.requestContext.tenant.scopeId,
                moduleId: request.moduleId,
                action: request.action,
                target: request.target,
                ...(request.reason !== undefined
                  ? { reason: request.reason }
                  : {}),
                correlationId: request.requestContext.correlationId,
              });
            },
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        provideWebhooksApiAccessModule({
          createWebhookApiKey: (input) =>
            Effect.succeed({
              record: {
                apiKeyId:
                  "webhook-api-key:organization:org_1:projection-failure",
                scope: input.scope,
                scopeId: input.scopeId,
                label: input.label,
                secretHash: "hash_created",
                prefix: "wkai_created_pref",
                status: webhookApiKeyStatus.active,
                createdAt: "not-an-iso-time",
                updatedAt: "2026-05-06T10:00:00.000Z",
              },
              secret: "wkai_created_secret",
            }),
          revokeWebhookApiKey: (input) => {
            seen.revokedApiKeyIds.push(input.apiKeyId);

            return Effect.succeed({
              apiKeyId: input.apiKeyId,
              scope: input.scope,
              scopeId: input.scopeId,
              label: "Partner export",
              secretHash: "hash_created",
              prefix: "wkai_created_pref",
              status: webhookApiKeyStatus.revoked,
              createdAt: "2026-05-06T10:00:00.000Z",
              updatedAt: "2026-05-06T10:01:00.000Z",
              revokedAt: "2026-05-06T10:01:00.000Z",
            });
          },
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.createWebhookApiKey({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          label: "Partner export",
        }),
      ),
    );

    expect(seen.revokedApiKeyIds).toEqual([
      "webhook-api-key:organization:org_1:projection-failure",
    ]);
    expect(seen.auditActions).toEqual([
      webhooksApiAccessAuditAction.apiKeyRevoked,
    ]);
    expect(seen.auditTargets).toEqual([
      `${platformModuleId.webhooksApiAccess}:webhook-api-key:organization:org_1:projection-failure`,
    ]);
    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "WebhooksApiAccessInternalContractError",
        operation: "webhookApiKeyAdminView",
      },
    });
  });

  it("audits the compensated webhook api key rotation rollback when result shaping fails before secret handoff", async () => {
    const seen: {
      readonly auditActions: string[];
      readonly auditTargets: string[];
      readonly restoredApiKeyIds: string[];
    } = {
      auditActions: [],
      auditTargets: [],
      restoredApiKeyIds: [],
    };
    const previousRecord = {
      apiKeyId:
        "webhook-api-key:organization:org_1:rotation-projection-failure",
      scope: platformScope.organization,
      scopeId: "org_1",
      label: "Partner export",
      secretHash: "hash_created",
      prefix: "wkai_created_pref",
      status: webhookApiKeyStatus.active,
      createdAt: "2026-05-06T10:00:00.000Z",
      updatedAt: "2026-05-06T10:00:00.000Z",
    } as const;
    const service = await Effect.runPromise(
      makeWebhooksApiAccessService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogServiceDouble({
            onAppend: (request) => {
              seen.auditActions.push(request.action);
              seen.auditTargets.push(request.target);

              return Effect.succeed({
                eventId: `${request.moduleId}:${request.action}:${request.requestContext.correlationId}`,
                timestamp: "2026-04-27T19:00:00.000Z",
                actorId:
                  request.requestContext.actorId ??
                  `${request.requestContext.actorType}:anonymous`,
                tenantScope: request.requestContext.tenant.scope,
                tenantScopeId: request.requestContext.tenant.scopeId,
                moduleId: request.moduleId,
                action: request.action,
                target: request.target,
                ...(request.reason !== undefined
                  ? { reason: request.reason }
                  : {}),
                correlationId: request.requestContext.correlationId,
              });
            },
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        provideWebhooksApiAccessModule({
          rotateWebhookApiKey: (input) =>
            Effect.succeed({
              previousRecord,
              record: {
                apiKeyId: input.apiKeyId,
                scope: input.scope,
                scopeId: input.scopeId,
                label: "Partner export",
                secretHash: "hash_rotated",
                prefix: "wkai_rotated_pref",
                status: webhookApiKeyStatus.active,
                createdAt: "2026-05-06T10:00:00.000Z",
                updatedAt: "2026-05-06T11:00:00.000Z",
                rotatedAt: "not-an-iso-time",
              },
              secret: "wkai_rotated_secret",
            }),
          restoreWebhookApiKey: (input) => {
            seen.restoredApiKeyIds.push(input.record.apiKeyId);

            return Effect.succeed(input.record);
          },
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.rotateWebhookApiKey({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          apiKeyId: previousRecord.apiKeyId,
        }),
      ),
    );

    expect(seen.restoredApiKeyIds).toEqual([previousRecord.apiKeyId]);
    expect(seen.auditActions).toEqual([
      webhooksApiAccessAuditAction.apiKeyRotationCompensated,
    ]);
    expect(seen.auditTargets).toEqual([
      `${platformModuleId.webhooksApiAccess}:${previousRecord.apiKeyId}`,
    ]);
    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "WebhooksApiAccessInternalContractError",
        operation: "webhookApiKeyAdminView",
      },
    });
  });

  it("denies cross-tenant webhook management without break-glass", async () => {
    let authorizationChecks = 0;
    const service = await Effect.runPromise(
      makeWebhooksApiAccessService({
        authorization: createAuthorizationServiceDouble({
          onCheck: () => {
            authorizationChecks += 1;

            return Effect.succeed({
              allowed: true,
              cacheKey: "webhook:manage",
              reason: "allowed",
              auditRequired: false,
            });
          },
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        provideWebhooksApiAccessModule({
          processVerifiedProviderWebhook: () =>
            Effect.die(new Error("Unexpected webhook processing call.")),
          replayProviderWebhook: () =>
            Effect.die(new Error("Unexpected webhook replay call.")),
          createWebhookSubscription: () =>
            Effect.die(new Error("Unexpected webhook subscription call.")),
          listWebhookSubscriptions: () =>
            Effect.die(new Error("Unexpected webhook subscription call.")),
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.listWebhookApiKeys({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_2",
        }),
      ),
    );

    expect(authorizationChecks).toBe(0);
    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "WebhooksApiAccessAccessDeniedError",
        actorType: supportRequestContext.actorType,
      } satisfies WebhooksApiAccessAccessDeniedError,
    });
  });

  it("allows cross-tenant webhook management with break-glass and target-scoped authorization", async () => {
    const auditTargets: string[] = [];
    const authorizationScopeIds: string[] = [];
    const service = await Effect.runPromise(
      makeWebhooksApiAccessService({
        authorization: createAuthorizationServiceDouble({
          onCheck: (input) => {
            authorizationScopeIds.push(input.requestContext.tenant.scopeId);

            return Effect.succeed({
              allowed: true,
              cacheKey: "webhook:manage",
              reason: "allowed",
              auditRequired: false,
            });
          },
        }),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogServiceDouble({ appendTargets: auditTargets }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble({
            ...supportRequestContext,
            breakGlass: {
              approvedBy: "usr_platform_1",
              reason: "Investigate tenant escalation",
              expiresAt: "2099-01-01T00:00:00.000Z",
            },
          }),
        ),
        provideWebhooksApiAccessModule({
          processVerifiedProviderWebhook: () =>
            Effect.die(new Error("Unexpected webhook processing call.")),
          replayProviderWebhook: () =>
            Effect.die(new Error("Unexpected webhook replay call.")),
          createWebhookSubscription: () =>
            Effect.die(new Error("Unexpected webhook subscription call.")),
          listWebhookApiKeys: (input) =>
            Effect.succeed([
              {
                apiKeyId: "webhook-api-key:organization:org_2:1",
                scope: input.scope,
                scopeId: input.scopeId,
                label: "Partner export",
                secretHash: "hash_cross_tenant",
                prefix: "wkai_cross_pref",
                status: webhookApiKeyStatus.active,
                createdAt: "2026-04-27T19:00:00.000Z",
                updatedAt: "2026-04-27T19:00:00.000Z",
              },
            ]),
        }),
      ),
    );

    const listed = await Effect.runPromise(
      service.listWebhookApiKeys({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_2",
      }),
    );

    expect(auditTargets).toEqual([
      `${platformModuleId.webhooksApiAccess}:organization:org_2:api-keys:label`,
    ]);
    expect(authorizationScopeIds).toEqual(["org_2"]);
    expect(listed).toEqual([
      {
        apiKeyId: "webhook-api-key:organization:org_2:1",
        label: "Partner export",
        prefix: "wkai_cross_pref",
        status: webhookApiKeyStatus.active,
        createdAt: "2026-04-27T19:00:00.000Z",
      },
    ]);
  });

  it("denies cross-tenant webhook management with expired break-glass", async () => {
    let authorizationChecks = 0;
    const service = await Effect.runPromise(
      makeWebhooksApiAccessService({
        authorization: createAuthorizationServiceDouble({
          onCheck: () => {
            authorizationChecks += 1;

            return Effect.succeed({
              allowed: true,
              cacheKey: "webhook:manage",
              reason: "allowed",
              auditRequired: false,
            });
          },
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble({
            ...supportRequestContext,
            breakGlass: {
              approvedBy: "usr_platform_1",
              reason: "Expired tenant escalation",
              expiresAt: "2000-01-01T00:00:00.000Z",
            },
          }),
        ),
        provideWebhooksApiAccessModule({
          processVerifiedProviderWebhook: () =>
            Effect.die(new Error("Unexpected webhook processing call.")),
          replayProviderWebhook: () =>
            Effect.die(new Error("Unexpected webhook replay call.")),
          createWebhookSubscription: () =>
            Effect.die(new Error("Unexpected webhook subscription call.")),
          listWebhookApiKeys: () =>
            Effect.die(new Error("Unexpected webhook api key call.")),
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.listWebhookApiKeys({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_3",
        }),
      ),
    );

    expect(authorizationChecks).toBe(0);
    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "WebhooksApiAccessAccessDeniedError",
        actorType: supportRequestContext.actorType,
      } satisfies WebhooksApiAccessAccessDeniedError,
    });
  });

  it("denies non-operator sessions from managing webhook subscriptions", async () => {
    const service = await Effect.runPromise(
      makeWebhooksApiAccessService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(organizationRequestContext),
        ),
        provideWebhooksApiAccessModule({
          processVerifiedProviderWebhook: () =>
            Effect.die(new Error("Unexpected webhook processing call.")),
          replayProviderWebhook: () =>
            Effect.die(new Error("Unexpected webhook replay call.")),
          createWebhookSubscription: () =>
            Effect.die(new Error("Unexpected webhook subscription call.")),
          listWebhookSubscriptions: () =>
            Effect.die(new Error("Unexpected webhook subscription call.")),
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.listWebhookSubscriptions({
          sessionId: "sess_member_1",
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "WebhooksApiAccessAccessDeniedError",
        actorType: organizationRequestContext.actorType,
      } satisfies WebhooksApiAccessAccessDeniedError,
    });
  });

  it("normalizes delegated authorization parse failures to internal contract errors", async () => {
    const service = await Effect.runPromise(
      makeWebhooksApiAccessService({
        authorization: createAuthorizationServiceDouble({
          onCheck: () => Effect.fail(createParseError()),
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        provideWebhooksApiAccessModule({
          processVerifiedProviderWebhook: () =>
            Effect.die(new Error("Unexpected webhook processing call.")),
          replayProviderWebhook: () =>
            Effect.die(new Error("Unexpected webhook replay call.")),
          createWebhookSubscription: () =>
            Effect.die(new Error("Unexpected webhook subscription call.")),
          listWebhookSubscriptions: () =>
            Effect.die(new Error("Unexpected webhook subscription call.")),
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.listWebhookSubscriptions({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "WebhooksApiAccessInternalContractError",
        operation: "authorizationCheck",
      } satisfies Pick<
        WebhooksApiAccessInternalContractError,
        "_tag" | "operation"
      >,
    });
  });

  it("normalizes audit log parse failures to internal contract errors", async () => {
    const service = await Effect.runPromise(
      makeWebhooksApiAccessService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogServiceDouble({
            onAppend: () => Effect.fail(createParseError()),
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        provideWebhooksApiAccessModule({
          processVerifiedProviderWebhook: () =>
            Effect.die(new Error("Unexpected webhook processing call.")),
          replayProviderWebhook: () =>
            Effect.die(new Error("Unexpected webhook replay call.")),
          createWebhookSubscription: () =>
            Effect.die(new Error("Unexpected webhook subscription call.")),
          listWebhookSubscriptions: () =>
            Effect.succeed([
              {
                subscriptionId: "webhook-subscription:organization:org_1:1",
                scope: platformScope.organization,
                scopeId: "org_1",
                url: "https://hooks.example.com/outbound",
                events: ["billing.subscription.activated"],
                status: "active" as const,
                createdAt: "2026-04-27T19:00:00.000Z",
                updatedAt: "2026-04-27T19:00:00.000Z",
              },
            ]),
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.listWebhookSubscriptions({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "WebhooksApiAccessInternalContractError",
        operation: "auditLogAppend",
      } satisfies Pick<
        WebhooksApiAccessInternalContractError,
        "_tag" | "operation"
      >,
    });
  });

  it("normalizes module create parse failures to internal contract errors", async () => {
    const service = await Effect.runPromise(
      makeWebhooksApiAccessService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        provideWebhooksApiAccessModule({
          processVerifiedProviderWebhook: () =>
            Effect.die(new Error("Unexpected webhook processing call.")),
          replayProviderWebhook: () =>
            Effect.die(new Error("Unexpected webhook replay call.")),
          createWebhookSubscription: () => Effect.fail(createParseError()),
          listWebhookSubscriptions: () =>
            Effect.die(new Error("Unexpected webhook subscription call.")),
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.createWebhookSubscription({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          url: "https://hooks.example.com/outbound",
          events: ["billing.subscription.activated"],
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "WebhooksApiAccessInternalContractError",
        operation: "webhookSubscriptionModuleCreate",
      } satisfies Pick<
        WebhooksApiAccessInternalContractError,
        "_tag" | "operation"
      >,
    });
  });

  it("normalizes module list parse failures to internal contract errors", async () => {
    const service = await Effect.runPromise(
      makeWebhooksApiAccessService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        provideWebhooksApiAccessModule({
          processVerifiedProviderWebhook: () =>
            Effect.die(new Error("Unexpected webhook processing call.")),
          replayProviderWebhook: () =>
            Effect.die(new Error("Unexpected webhook replay call.")),
          createWebhookSubscription: () =>
            Effect.die(new Error("Unexpected webhook subscription call.")),
          listWebhookSubscriptions: () => Effect.fail(createParseError()),
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.listWebhookSubscriptions({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "WebhooksApiAccessInternalContractError",
        operation: "webhookSubscriptionModuleList",
      } satisfies Pick<
        WebhooksApiAccessInternalContractError,
        "_tag" | "operation"
      >,
    });
  });

  it("wraps runtime option parse failures as runtime errors", async () => {
    const result = await Effect.runPromise(
      Effect.either(
        runWebhooksApiAccessFromEnvironment({}, () => Effect.succeed("ok")),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "WebhooksApiAccessRuntimeError",
      },
    });
  });
});
