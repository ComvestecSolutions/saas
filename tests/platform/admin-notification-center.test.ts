import { Effect } from "effect";
import {
  emailDeliveryTemplateId,
  fieldSecurityAuditAction,
  notificationCenterChannel,
  notificationCenterInAppStatus,
  notificationCenterNotificationFamily,
  notificationCenterAuditAction,
  notificationCenterReceiptStatus,
  platformModuleId,
  platformScope,
  type NotificationCenterInAppNotificationRecord,
  type RequestContext,
} from "@comvestec/contracts";
import {
  AuditLogModule,
  type AuditLogModuleService,
  type AuthorizationModuleService,
  NotificationCenterInAppModule,
  type NotificationCenterInAppModuleService,
  type NotificationCenterPostgresRepositoryService,
  NotificationCenterPostgresRepository,
  IdentitySessionModule,
  type IdentitySessionModuleService,
} from "@comvestec/modules";
import {
  organizationRequestContext,
  supportRequestContext,
} from "../modules/_fixtures";
import {
  makeAdminNotificationCenterService,
  type AdminNotificationCenterAccessDeniedError,
  type AdminNotificationCenterEmailReceiptNotFoundError,
  resolveAdminNotificationCenterRuntimeOptionsFromEnvironment,
} from "../../packages/platform/src/services/communication/admin-notification-center";

const createIdentitySessionServiceDouble = (
  requestContext: RequestContext,
): IdentitySessionModuleService => ({
  startAuthentication: () =>
    Effect.die(new Error("Unexpected identity session start call.")),
  completeAuthentication: () =>
    Effect.die(new Error("Unexpected identity session completion call.")),
  invalidateSession: () =>
    Effect.die(new Error("Unexpected identity session invalidation call.")),
  resolveRequestContext: () => Effect.succeed(requestContext),
});

const permissionScopeNotificationManageCacheKey = "notification:manage";

const createAuthorizationServiceDouble = (input?: {
  readonly onCheck?: AuthorizationModuleService["check"];
}): Pick<AuthorizationModuleService, "check"> => ({
  check:
    input?.onCheck ??
    (() =>
      Effect.succeed({
        allowed: true,
        cacheKey: permissionScopeNotificationManageCacheKey,
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
        timestamp: "2026-05-06T11:00:00.000Z",
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

const createNotificationCenterRepositoryDouble = (input?: {
  readonly onFindEmailReceipt?: NotificationCenterPostgresRepositoryService["findEmailReceipt"];
  readonly onFindEmailPreference?: NotificationCenterPostgresRepositoryService["findEmailPreference"];
  readonly onUpsertEmailPreference?: NotificationCenterPostgresRepositoryService["upsertEmailPreference"];
}): NotificationCenterPostgresRepositoryService => ({
  createEmailReceipt: () =>
    Effect.die(
      new Error("Unexpected notification-center receipt create call."),
    ),
  findDigestRun: () =>
    Effect.die(new Error("Unexpected notification-center digest lookup call.")),
  findEmailReceipt:
    input?.onFindEmailReceipt ??
    ((reference) =>
      reference.notificationId ===
      "notification-center:organization:org_1:receipt_1"
        ? Effect.succeed({
            notificationId: reference.notificationId,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
            channel: notificationCenterChannel.email,
            recipient: "customer@example.com",
            template: emailDeliveryTemplateId.billingInvoiceReady,
            status: notificationCenterReceiptStatus.queueFailed,
            emailDeliveryMessageId: "email-delivery:organization:org_1:msg_1",
            queueFailureSummary:
              "Notification queue receipt did not match the expected schema.",
            createdAt: "2026-05-06T10:55:00.000Z",
            updatedAt: "2026-05-06T10:55:00.000Z",
          })
        : reference.notificationId ===
            "notification-center:organization:org_2:receipt_2"
          ? Effect.succeed({
              notificationId: reference.notificationId,
              tenantScope: platformScope.organization,
              tenantScopeId: "org_2",
              channel: notificationCenterChannel.email,
              recipient: "cross-tenant@example.com",
              template: emailDeliveryTemplateId.billingInvoiceReady,
              status: notificationCenterReceiptStatus.queued,
              emailDeliveryMessageId: "email-delivery:organization:org_2:msg_2",
              createdAt: "2026-05-06T10:56:00.000Z",
              updatedAt: "2026-05-06T10:56:00.000Z",
            })
          : Effect.succeed(undefined)),
  findEmailPreference:
    input?.onFindEmailPreference ??
    ((reference) =>
      reference.tenantScope === platformScope.organization &&
      reference.tenantScopeId === "org_1" &&
      reference.recipient === "customer@example.com" &&
      reference.template === emailDeliveryTemplateId.billingInvoiceReady
        ? Effect.succeed({
            tenantScope: reference.tenantScope,
            tenantScopeId: reference.tenantScopeId,
            channel: notificationCenterChannel.email,
            recipient: reference.recipient,
            template: reference.template,
            enabled: false,
            updatedBy: "usr_support_1",
            createdAt: "2026-05-07T02:00:00.000Z",
            updatedAt: "2026-05-07T02:00:00.000Z",
          })
        : Effect.succeed(undefined)),
  listDigestCandidatesByDigestRun: () =>
    Effect.die(
      new Error("Unexpected notification-center digest candidate list call."),
    ),
  upsertDigestCandidate: () =>
    Effect.die(
      new Error("Unexpected notification-center digest candidate upsert call."),
    ),
  upsertDigestRun: () =>
    Effect.die(new Error("Unexpected notification-center digest upsert call.")),
  upsertEmailPreference:
    input?.onUpsertEmailPreference ?? ((record) => Effect.succeed(record)),
});

const createNotificationCenterInAppModuleDouble = (input?: {
  readonly onGetInAppNotification?: NotificationCenterInAppModuleService["getInAppNotification"];
}): NotificationCenterInAppModuleService => ({
  createInAppNotification: () =>
    Effect.die(new Error("Unexpected notification-center in-app create call.")),
  getInAppNotification:
    input?.onGetInAppNotification ??
    ((reference) =>
      reference.notificationId ===
      "notification-center:in-app:organization:org_1:usr_member_1:billing.invoice-ready:event_1"
        ? Effect.succeed({
            notificationId: reference.notificationId,
            sourceEventId: "event_1",
            sourceModuleId: platformModuleId.billingAndMetering,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
            actorId: "usr_member_1",
            channel: notificationCenterChannel.inApp,
            family: notificationCenterNotificationFamily.billingInvoiceReady,
            status: notificationCenterInAppStatus.unread,
            title: "Invoice ready",
            bodySummary: "Invoice inv_2026_04 is ready for $120.00.",
            actionLabel: "Review invoice",
            actionUrl:
              "https://product.example.com/billing/invoices/inv_2026_04",
            createdAt: "2026-05-08T11:00:00.000Z",
            updatedAt: "2026-05-08T11:00:00.000Z",
          } satisfies NotificationCenterInAppNotificationRecord)
        : reference.notificationId ===
            "notification-center:in-app:organization:org_2:usr_member_2:billing.invoice-ready:event_2"
          ? Effect.succeed({
              notificationId: reference.notificationId,
              sourceEventId: "event_2",
              sourceModuleId: platformModuleId.billingAndMetering,
              tenantScope: platformScope.organization,
              tenantScopeId: "org_2",
              actorId: "usr_member_2",
              channel: notificationCenterChannel.inApp,
              family: notificationCenterNotificationFamily.billingInvoiceReady,
              status: notificationCenterInAppStatus.read,
              title: "Invoice ready",
              bodySummary: "Invoice inv_2026_05 is ready for $220.00.",
              actionLabel: "Review invoice",
              actionUrl:
                "https://product.example.com/billing/invoices/inv_2026_05",
              readAt: "2026-05-08T11:05:00.000Z",
              createdAt: "2026-05-08T11:00:00.000Z",
              updatedAt: "2026-05-08T11:05:00.000Z",
            } satisfies NotificationCenterInAppNotificationRecord)
          : Effect.succeed(undefined)),
  listInAppNotifications: () =>
    Effect.die(new Error("Unexpected notification-center in-app list call.")),
  markInAppNotificationRead: () =>
    Effect.die(
      new Error("Unexpected notification-center in-app mark-read call."),
    ),
  dismissInAppNotification: () =>
    Effect.die(
      new Error("Unexpected notification-center in-app dismiss call."),
    ),
});

describe("platform admin notification center service", () => {
  it("resolves transport runtime options for the Convex-backed in-app store and admin surfaces", async () => {
    await expect(
      Effect.runPromise(
        resolveAdminNotificationCenterRuntimeOptionsFromEnvironment({
          POSTGRES_URL: "postgres://postgres:postgres@localhost:5432/app",
          VALKEY_URL: "redis://localhost:6379",
          CONVEX_SELF_HOSTED_URL: "http://localhost:3210",
          CONVEX_SELF_HOSTED_SITE_URL: "http://localhost:3211",
          KEYCLOAK_BASE_URL: "http://localhost:8080",
          KEYCLOAK_REALM: "comvestec",
          KEYCLOAK_CLIENT_ID: "admin-notification-center",
          KEYCLOAK_CLIENT_SECRET: "secret",
          KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: "svc_convex",
          KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: "secret-password",
          KETO_READ_URL: "http://localhost:4466",
          KETO_WRITE_URL: "http://localhost:4467",
        }),
      ),
    ).resolves.toEqual({
      postgresUrl: "postgres://postgres:postgres@localhost:5432/app",
      valkeyUrl: "redis://localhost:6379",
      convexUrl: "http://localhost:3210",
      convexSiteUrl: "http://localhost:3211",
      keycloakBaseUrl: "http://localhost:8080",
      keycloakRealm: "comvestec",
      keycloakClientId: "admin-notification-center",
      keycloakClientSecret: "secret",
      keycloakConvexServiceActorUsername: "svc_convex",
      keycloakConvexServiceActorPassword: "secret-password",
      ketoReadUrl: "http://localhost:4466",
      ketoWriteUrl: "http://localhost:4467",
    });
  });

  it("projects notification-center receipt inspection and audits recipient reads", async () => {
    const auditTargets: string[] = [];
    const authorizationScopeIds: string[] = [];
    const service = await Effect.runPromise(
      makeAdminNotificationCenterService({
        authorization: createAuthorizationServiceDouble({
          onCheck: (input) => {
            authorizationScopeIds.push(input.requestContext.tenant.scopeId);

            return Effect.succeed({
              allowed: true,
              cacheKey: permissionScopeNotificationManageCacheKey,
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
          NotificationCenterInAppModule,
          createNotificationCenterInAppModuleDouble(),
        ),
        Effect.provideService(
          NotificationCenterPostgresRepository,
          createNotificationCenterRepositoryDouble(),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
      ),
    );

    const record = await Effect.runPromise(
      service.inspectEmailReceipt({
        sessionId: "sess_support_1",
        notificationId: "notification-center:organization:org_1:receipt_1",
      }),
    );

    expect(authorizationScopeIds).toEqual(["org_1"]);
    expect(auditTargets).toEqual([
      `${platformModuleId.notificationCenter}:notification-center:organization:org_1:receipt_1:receipt:recipient`,
    ]);
    expect(record).toEqual({
      id: "notification-center:organization:org_1:receipt_1",
      channel: notificationCenterChannel.email,
      status: notificationCenterReceiptStatus.queueFailed,
      recipient: "customer@example.com",
      template: emailDeliveryTemplateId.billingInvoiceReady,
      emailDeliveryMessageId: "email-delivery:organization:org_1:msg_1",
      queueFailureSummary:
        "Notification queue receipt did not match the expected schema.",
      createdAt: "2026-05-06T10:55:00.000Z",
    });
  });

  it("authorizes cross-tenant inspection through privileged break-glass access", async () => {
    const authorizationScopeIds: string[] = [];
    const service = await Effect.runPromise(
      makeAdminNotificationCenterService({
        authorization: createAuthorizationServiceDouble({
          onCheck: (input) => {
            authorizationScopeIds.push(input.requestContext.tenant.scopeId);

            return Effect.succeed({
              allowed: true,
              cacheKey: permissionScopeNotificationManageCacheKey,
              reason: "allowed",
              auditRequired: false,
            });
          },
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          NotificationCenterInAppModule,
          createNotificationCenterInAppModuleDouble(),
        ),
        Effect.provideService(
          NotificationCenterPostgresRepository,
          createNotificationCenterRepositoryDouble(),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble({
            ...supportRequestContext,
            breakGlass: {
              approvedBy: "usr_platform_1",
              reason: "Investigate cross-tenant notification receipt",
              expiresAt: "2099-01-01T00:00:00.000Z",
            },
          }),
        ),
      ),
    );

    const record = await Effect.runPromise(
      service.inspectEmailReceipt({
        sessionId: "sess_support_1",
        notificationId: "notification-center:organization:org_2:receipt_2",
      }),
    );

    expect(authorizationScopeIds).toEqual(["org_1", "org_2"]);
    expect(record).toMatchObject({
      id: "notification-center:organization:org_2:receipt_2",
      recipient: "cross-tenant@example.com",
    });
  });

  it("rejects non-operator inspection before any lookup", async () => {
    let authorizationChecks = 0;
    let receiptLookups = 0;
    const service = await Effect.runPromise(
      makeAdminNotificationCenterService({
        authorization: createAuthorizationServiceDouble({
          onCheck: () => {
            authorizationChecks += 1;

            return Effect.succeed({
              allowed: true,
              cacheKey: permissionScopeNotificationManageCacheKey,
              reason: "allowed",
              auditRequired: false,
            });
          },
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          NotificationCenterInAppModule,
          createNotificationCenterInAppModuleDouble(),
        ),
        Effect.provideService(
          NotificationCenterPostgresRepository,
          createNotificationCenterRepositoryDouble({
            onFindEmailReceipt: () => {
              receiptLookups += 1;

              return Effect.succeed(undefined);
            },
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(organizationRequestContext),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.inspectEmailReceipt({
          sessionId: "sess_member_1",
          notificationId: "notification-center:organization:org_1:receipt_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminNotificationCenterAccessDeniedError",
        actorType: organizationRequestContext.actorType,
      } satisfies AdminNotificationCenterAccessDeniedError,
    });
    expect(authorizationChecks).toBe(0);
    expect(receiptLookups).toBe(0);
  });

  it("returns a typed not-found error when the receipt is missing", async () => {
    const service = await Effect.runPromise(
      makeAdminNotificationCenterService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          NotificationCenterInAppModule,
          createNotificationCenterInAppModuleDouble(),
        ),
        Effect.provideService(
          NotificationCenterPostgresRepository,
          createNotificationCenterRepositoryDouble(),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.inspectEmailReceipt({
          sessionId: "sess_support_1",
          notificationId: "notification-center:organization:org_1:missing",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminNotificationCenterEmailReceiptNotFoundError",
        notificationId: "notification-center:organization:org_1:missing",
      } satisfies AdminNotificationCenterEmailReceiptNotFoundError,
    });
  });

  it("projects notification-center in-app inspection and audits actor-targeted content reads", async () => {
    const auditTargets: string[] = [];
    const authorizationScopeIds: string[] = [];
    const service = await Effect.runPromise(
      makeAdminNotificationCenterService({
        authorization: createAuthorizationServiceDouble({
          onCheck: (input) => {
            authorizationScopeIds.push(input.requestContext.tenant.scopeId);

            return Effect.succeed({
              allowed: true,
              cacheKey: permissionScopeNotificationManageCacheKey,
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
          NotificationCenterInAppModule,
          createNotificationCenterInAppModuleDouble(),
        ),
        Effect.provideService(
          NotificationCenterPostgresRepository,
          createNotificationCenterRepositoryDouble(),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
      ),
    );

    const record = await Effect.runPromise(
      service.inspectInAppNotification({
        sessionId: "sess_support_1",
        notificationId:
          "notification-center:in-app:organization:org_1:usr_member_1:billing.invoice-ready:event_1",
      }),
    );

    expect(authorizationScopeIds).toEqual(["org_1"]);
    expect(auditTargets).toEqual([
      `${platformModuleId.notificationCenter}:notification-center:in-app:organization:org_1:usr_member_1:billing.invoice-ready:event_1:in-app:actorId,title,bodySummary,actionLabel,actionUrl`,
    ]);
    expect(record).toEqual({
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
    });
  });

  it("projects notification-center email preference inspection and audits recipient reads", async () => {
    const auditTargets: string[] = [];
    const authorizationScopeIds: string[] = [];
    const service = await Effect.runPromise(
      makeAdminNotificationCenterService({
        authorization: createAuthorizationServiceDouble({
          onCheck: (input) => {
            authorizationScopeIds.push(input.requestContext.tenant.scopeId);

            return Effect.succeed({
              allowed: true,
              cacheKey: permissionScopeNotificationManageCacheKey,
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
          NotificationCenterInAppModule,
          createNotificationCenterInAppModuleDouble(),
        ),
        Effect.provideService(
          NotificationCenterPostgresRepository,
          createNotificationCenterRepositoryDouble(),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
      ),
    );

    const record = await Effect.runPromise(
      service.inspectEmailPreference({
        sessionId: "sess_support_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        recipient: "customer@example.com",
        template: emailDeliveryTemplateId.billingInvoiceReady,
      }),
    );

    expect(authorizationScopeIds).toEqual(["org_1"]);
    expect(auditTargets).toEqual([
      `${platformModuleId.notificationCenter}:${platformScope.organization}:org_1:${emailDeliveryTemplateId.billingInvoiceReady}:preference:recipient`,
    ]);
    expect(record).toEqual({
      channel: notificationCenterChannel.email,
      recipient: "customer@example.com",
      template: emailDeliveryTemplateId.billingInvoiceReady,
      enabled: false,
      updatedBy: "usr_support_1",
      updatedAt: "2026-05-07T02:00:00.000Z",
    });
  });

  it("upserts notification-center email preferences and appends module and field-security audit evidence", async () => {
    const auditEvents: string[] = [];
    const persistedStates: boolean[] = [];
    const service = await Effect.runPromise(
      makeAdminNotificationCenterService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogServiceDouble({
            onAppend: (request) => {
              auditEvents.push(`${request.action}:${request.target}`);

              return Effect.succeed({
                eventId: `${request.moduleId}:${request.action}`,
                timestamp: "2026-05-07T02:05:00.000Z",
                actorId: request.requestContext.actorId ?? "anonymous",
                tenantScope: request.requestContext.tenant.scope,
                tenantScopeId: request.requestContext.tenant.scopeId,
                moduleId: request.moduleId,
                action: request.action,
                target: request.target,
                correlationId: request.requestContext.correlationId,
              });
            },
          }),
        ),
        Effect.provideService(
          NotificationCenterInAppModule,
          createNotificationCenterInAppModuleDouble(),
        ),
        Effect.provideService(
          NotificationCenterPostgresRepository,
          createNotificationCenterRepositoryDouble({
            onUpsertEmailPreference: (record) => {
              persistedStates.push(record.enabled);

              return Effect.succeed(record);
            },
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
      ),
    );

    const record = await Effect.runPromise(
      service.upsertEmailPreference({
        sessionId: "sess_support_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        recipient: "customer@example.com",
        template: emailDeliveryTemplateId.billingInvoiceReady,
        enabled: false,
      }),
    );

    expect(persistedStates).toEqual([false]);
    expect(auditEvents).toEqual([
      `${notificationCenterAuditAction.preferenceUpserted}:${platformModuleId.notificationCenter}:${platformScope.organization}:org_1:${emailDeliveryTemplateId.billingInvoiceReady}:email-preference`,
      `${fieldSecurityAuditAction.sensitiveRead}:${platformModuleId.notificationCenter}:${platformScope.organization}:org_1:${emailDeliveryTemplateId.billingInvoiceReady}:preference:recipient`,
    ]);
    expect(record).toMatchObject({
      channel: notificationCenterChannel.email,
      recipient: "customer@example.com",
      template: emailDeliveryTemplateId.billingInvoiceReady,
      enabled: false,
      updatedBy: supportRequestContext.actorId,
    });
  });
});
