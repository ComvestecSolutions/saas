import { Effect } from "effect";
import {
  emailDeliveryStatus,
  emailSuppressionReason,
  platformModuleId,
  platformScope,
  type RequestContext,
} from "@comvestec/contracts";
import {
  AuditLogModule,
  type AuditLogModuleService,
  type AuthorizationModuleService,
  EmailDeliveryPostgresRepository,
  type EmailDeliveryPostgresRepositoryService,
  IdentitySessionModule,
  type IdentitySessionModuleService,
} from "@comvestec/modules";
import { platformAdapterServiceName } from "../../packages/platform/src/adapters";
import {
  organizationRequestContext,
  supportRequestContext,
} from "../modules/_fixtures";
import {
  makeAdminEmailDeliveryService,
  type AdminEmailDeliveryAccessDeniedError,
  type AdminEmailDeliveryDataIntegrityError,
  type AdminEmailRecipientSuppressionNotFoundError,
  resolveAdminEmailDeliveryRuntimeOptionsFromEnvironment,
  type AdminEmailDeliveryTrackingNotFoundError,
} from "../../packages/platform/src/services/communication/admin-email-delivery";

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
        cacheKey: permissionScopeEmailManageCacheKey,
        reason: "allowed",
        auditRequired: false,
      })),
});

const permissionScopeEmailManageCacheKey = "email:manage";

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
        timestamp: "2026-05-05T07:00:00.000Z",
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

const createEmailDeliveryRepositoryDouble = (input?: {
  readonly onFindTrackedDelivery?: EmailDeliveryPostgresRepositoryService["findTrackedDelivery"];
  readonly onFindRecipientSuppression?: EmailDeliveryPostgresRepositoryService["findRecipientSuppression"];
}): EmailDeliveryPostgresRepositoryService => ({
  createTrackedDelivery: () =>
    Effect.die(new Error("Unexpected tracked delivery create call.")),
  updateTrackedDelivery: () =>
    Effect.die(new Error("Unexpected tracked delivery update call.")),
  findTrackedDelivery:
    input?.onFindTrackedDelivery ??
    ((reference) =>
      reference.messageId === "email-delivery:organization:org_1:track_1"
        ? Effect.succeed({
            messageId: reference.messageId,
            provider: platformAdapterServiceName.postal,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
            recipient: "customer@example.com",
            status: emailDeliveryStatus.complained,
            template: "welcome-email:v1",
            senderDisplayName: "Acme",
            fromEmail: "support@platform.example",
            replyToEmail: "reply@acme.example",
            sentAt: "2026-05-05T06:45:00.000Z",
            lastEventAt: "2026-05-05T06:47:00.000Z",
            createdAt: "2026-05-05T06:45:00.000Z",
            updatedAt: "2026-05-05T06:47:00.000Z",
          })
        : reference.messageId ===
            "email-delivery:organization:org_2:source_suppression"
          ? Effect.succeed({
              messageId: reference.messageId,
              provider: platformAdapterServiceName.postal,
              tenantScope: platformScope.organization,
              tenantScopeId: "org_2",
              recipient: "customer@example.com",
              status: emailDeliveryStatus.bounced,
              senderDisplayName: "Acme",
              fromEmail: "support@platform.example",
              replyToEmail: "reply@acme.example",
              sentAt: "2026-05-05T06:45:00.000Z",
              lastEventAt: "2026-05-05T06:47:00.000Z",
              bounceType: "hard",
              createdAt: "2026-05-05T06:45:00.000Z",
              updatedAt: "2026-05-05T06:47:00.000Z",
            })
          : Effect.succeed(undefined)),
  findRecipientSuppression:
    input?.onFindRecipientSuppression ??
    ((lookup) =>
      lookup.recipient === "customer@example.com"
        ? Effect.succeed({
            suppressionId: "email-suppression:customer@example.com",
            recipient: lookup.recipient,
            reason: emailSuppressionReason.complained,
            sourceMessageId:
              "email-delivery:organization:org_2:source_suppression",
            suppressedAt: "2026-05-05T06:47:00.000Z",
            createdAt: "2026-05-05T06:47:00.000Z",
            updatedAt: "2026-05-05T06:47:00.000Z",
          })
        : Effect.succeed(undefined)),
  upsertRecipientSuppression: () =>
    Effect.die(new Error("Unexpected recipient suppression upsert call.")),
});

describe("platform admin email delivery service", () => {
  it("resolves transport runtime options without subscriber-journey-only env keys", async () => {
    await expect(
      Effect.runPromise(
        resolveAdminEmailDeliveryRuntimeOptionsFromEnvironment({
          POSTGRES_URL: "postgres://postgres:postgres@localhost:5432/app",
          VALKEY_URL: "redis://localhost:6379",
          KEYCLOAK_BASE_URL: "http://localhost:8080",
          KEYCLOAK_REALM: "comvestec",
          KEYCLOAK_CLIENT_ID: "admin-email-delivery",
          KEYCLOAK_CLIENT_SECRET: "secret",
          KETO_READ_URL: "http://localhost:4466",
          KETO_WRITE_URL: "http://localhost:4467",
        }),
      ),
    ).resolves.toEqual({
      postgresUrl: "postgres://postgres:postgres@localhost:5432/app",
      valkeyUrl: "redis://localhost:6379",
      keycloakBaseUrl: "http://localhost:8080",
      keycloakRealm: "comvestec",
      keycloakClientId: "admin-email-delivery",
      keycloakClientSecret: "secret",
      ketoReadUrl: "http://localhost:4466",
      ketoWriteUrl: "http://localhost:4467",
    });
  });

  it("projects tracked delivery inspection and audits recipient reads", async () => {
    const auditTargets: string[] = [];
    const authorizationScopeIds: string[] = [];
    const service = await Effect.runPromise(
      makeAdminEmailDeliveryService({
        authorization: createAuthorizationServiceDouble({
          onCheck: (input) => {
            authorizationScopeIds.push(input.requestContext.tenant.scopeId);

            return Effect.succeed({
              allowed: true,
              cacheKey: permissionScopeEmailManageCacheKey,
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
          EmailDeliveryPostgresRepository,
          createEmailDeliveryRepositoryDouble(),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
      ),
    );

    const record = await Effect.runPromise(
      service.inspectTrackedDelivery({
        sessionId: "sess_support_1",
        messageId: "email-delivery:organization:org_1:track_1",
      }),
    );

    expect(authorizationScopeIds).toEqual(["org_1"]);
    expect(auditTargets).toEqual([
      `${platformModuleId.emailDelivery}:email-delivery:organization:org_1:track_1:tracking:recipient`,
    ]);
    expect(record).toEqual({
      messageId: "email-delivery:organization:org_1:track_1",
      recipient: "customer@example.com",
      template: "welcome-email:v1",
      status: emailDeliveryStatus.complained,
      sentAt: "2026-05-05T06:45:00.000Z",
      lastEventAt: "2026-05-05T06:47:00.000Z",
    });
  });

  it("authorizes suppression inspection against the source tracked delivery tenant", async () => {
    const auditTargets: string[] = [];
    const authorizationScopeIds: string[] = [];
    const service = await Effect.runPromise(
      makeAdminEmailDeliveryService({
        authorization: createAuthorizationServiceDouble({
          onCheck: (input) => {
            authorizationScopeIds.push(input.requestContext.tenant.scopeId);

            return Effect.succeed({
              allowed: true,
              cacheKey: permissionScopeEmailManageCacheKey,
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
          EmailDeliveryPostgresRepository,
          createEmailDeliveryRepositoryDouble(),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble({
            ...supportRequestContext,
            breakGlass: {
              approvedBy: "usr_platform_1",
              reason: "Investigate cross-tenant email suppression",
              expiresAt: "2099-01-01T00:00:00.000Z",
            },
          }),
        ),
      ),
    );

    const record = await Effect.runPromise(
      service.inspectRecipientSuppression({
        sessionId: "sess_support_1",
        recipient: "customer@example.com",
      }),
    );

    expect(authorizationScopeIds).toEqual(["org_1", "org_2"]);
    expect(auditTargets).toEqual([
      `${platformModuleId.emailDelivery}:email-suppression:customer@example.com:suppression:recipient`,
    ]);
    expect(record).toEqual({
      suppressionId: "email-suppression:customer@example.com",
      recipient: "customer@example.com",
      suppressionReason: emailSuppressionReason.complained,
      sourceMessageId: "email-delivery:organization:org_2:source_suppression",
      suppressedAt: "2026-05-05T06:47:00.000Z",
    });
  });

  it("rejects non-operator inspection before any lookup", async () => {
    let authorizationChecks = 0;
    let trackedDeliveryLookups = 0;
    const service = await Effect.runPromise(
      makeAdminEmailDeliveryService({
        authorization: createAuthorizationServiceDouble({
          onCheck: () => {
            authorizationChecks += 1;

            return Effect.succeed({
              allowed: true,
              cacheKey: permissionScopeEmailManageCacheKey,
              reason: "allowed",
              auditRequired: false,
            });
          },
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          EmailDeliveryPostgresRepository,
          createEmailDeliveryRepositoryDouble({
            onFindTrackedDelivery: () => {
              trackedDeliveryLookups += 1;

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
        service.inspectTrackedDelivery({
          sessionId: organizationRequestContext.sessionId,
          messageId: "email-delivery:organization:org_1:track_1",
        }),
      ),
    );

    expect(authorizationChecks).toBe(0);
    expect(trackedDeliveryLookups).toBe(0);
    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminEmailDeliveryAccessDeniedError",
        actorType: organizationRequestContext.actorType,
      } satisfies AdminEmailDeliveryAccessDeniedError,
    });
  });

  it("rejects operator inspection when current-tenant permission checks fail before lookup", async () => {
    let authorizationChecks = 0;
    let trackedDeliveryLookups = 0;
    const service = await Effect.runPromise(
      makeAdminEmailDeliveryService({
        authorization: createAuthorizationServiceDouble({
          onCheck: () => {
            authorizationChecks += 1;

            return Effect.succeed({
              allowed: false,
              cacheKey: permissionScopeEmailManageCacheKey,
              reason: "missing_permission",
              auditRequired: false,
            });
          },
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          EmailDeliveryPostgresRepository,
          createEmailDeliveryRepositoryDouble({
            onFindTrackedDelivery: () => {
              trackedDeliveryLookups += 1;

              return Effect.succeed(undefined);
            },
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.inspectTrackedDelivery({
          sessionId: "sess_support_1",
          messageId: "email-delivery:organization:org_1:track_1",
        }),
      ),
    );

    expect(authorizationChecks).toBe(1);
    expect(trackedDeliveryLookups).toBe(0);
    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminEmailDeliveryAccessDeniedError",
        actorType: supportRequestContext.actorType,
      } satisfies AdminEmailDeliveryAccessDeniedError,
    });
  });

  it("masks cross-tenant tracked delivery inspection without break-glass", async () => {
    let authorizationChecks = 0;
    const service = await Effect.runPromise(
      makeAdminEmailDeliveryService({
        authorization: createAuthorizationServiceDouble({
          onCheck: () => {
            authorizationChecks += 1;

            return Effect.succeed({
              allowed: true,
              cacheKey: permissionScopeEmailManageCacheKey,
              reason: "allowed",
              auditRequired: false,
            });
          },
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          EmailDeliveryPostgresRepository,
          createEmailDeliveryRepositoryDouble({
            onFindTrackedDelivery: () =>
              Effect.succeed({
                messageId: "email-delivery:organization:org_2:track_1",
                provider: platformAdapterServiceName.postal,
                tenantScope: platformScope.organization,
                tenantScopeId: "org_2",
                recipient: "customer@example.com",
                status: emailDeliveryStatus.queued,
                senderDisplayName: "Acme",
                fromEmail: "support@platform.example",
                replyToEmail: "reply@acme.example",
                sentAt: "2026-05-05T06:45:00.000Z",
                lastEventAt: "2026-05-05T06:45:00.000Z",
                createdAt: "2026-05-05T06:45:00.000Z",
                updatedAt: "2026-05-05T06:45:00.000Z",
              }),
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.inspectTrackedDelivery({
          sessionId: "sess_support_1",
          messageId: "email-delivery:organization:org_2:track_1",
        }),
      ),
    );

    expect(authorizationChecks).toBe(1);
    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminEmailDeliveryTrackingNotFoundError",
        messageId: "email-delivery:organization:org_2:track_1",
      } satisfies AdminEmailDeliveryTrackingNotFoundError,
    });
  });

  it("masks missing suppression source tracking without privileged break-glass", async () => {
    const service = await Effect.runPromise(
      makeAdminEmailDeliveryService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          EmailDeliveryPostgresRepository,
          createEmailDeliveryRepositoryDouble({
            onFindRecipientSuppression: () =>
              Effect.succeed({
                suppressionId: "email-suppression:customer@example.com",
                recipient: "customer@example.com",
                reason: emailSuppressionReason.complained,
                sourceMessageId: "email-delivery:organization:org_2:missing",
                suppressedAt: "2026-05-05T06:47:00.000Z",
                createdAt: "2026-05-05T06:47:00.000Z",
                updatedAt: "2026-05-05T06:47:00.000Z",
              }),
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.inspectRecipientSuppression({
          sessionId: "sess_support_1",
          recipient: "customer@example.com",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminEmailRecipientSuppressionNotFoundError",
        recipient: "customer@example.com",
      } satisfies AdminEmailRecipientSuppressionNotFoundError,
    });
  });

  it("masks cross-tenant suppression inspection without break-glass", async () => {
    const authorizationScopeIds: string[] = [];
    const service = await Effect.runPromise(
      makeAdminEmailDeliveryService({
        authorization: createAuthorizationServiceDouble({
          onCheck: (input) => {
            authorizationScopeIds.push(input.requestContext.tenant.scopeId);

            return Effect.succeed({
              allowed: true,
              cacheKey: permissionScopeEmailManageCacheKey,
              reason: "allowed",
              auditRequired: false,
            });
          },
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          EmailDeliveryPostgresRepository,
          createEmailDeliveryRepositoryDouble(),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.inspectRecipientSuppression({
          sessionId: "sess_support_1",
          recipient: "customer@example.com",
        }),
      ),
    );

    expect(authorizationScopeIds).toEqual(["org_1"]);
    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminEmailRecipientSuppressionNotFoundError",
        recipient: "customer@example.com",
      } satisfies AdminEmailRecipientSuppressionNotFoundError,
    });
  });

  it("only exposes suppression source data integrity failures to privileged break-glass operators", async () => {
    const service = await Effect.runPromise(
      makeAdminEmailDeliveryService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          EmailDeliveryPostgresRepository,
          createEmailDeliveryRepositoryDouble({
            onFindRecipientSuppression: () =>
              Effect.succeed({
                suppressionId: "email-suppression:customer@example.com",
                recipient: "customer@example.com",
                reason: emailSuppressionReason.complained,
                sourceMessageId: "email-delivery:organization:org_2:missing",
                suppressedAt: "2026-05-05T06:47:00.000Z",
                createdAt: "2026-05-05T06:47:00.000Z",
                updatedAt: "2026-05-05T06:47:00.000Z",
              }),
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble({
            ...supportRequestContext,
            breakGlass: {
              approvedBy: "usr_platform_1",
              reason: "Investigate cross-tenant suppression integrity",
              expiresAt: "2099-01-01T00:00:00.000Z",
            },
          }),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.inspectRecipientSuppression({
          sessionId: "sess_support_1",
          recipient: "customer@example.com",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminEmailDeliveryDataIntegrityError",
        operation: "suppressionSourceTrackingLookup",
        sourceMessageId: "email-delivery:organization:org_2:missing",
      } satisfies AdminEmailDeliveryDataIntegrityError,
    });
  });
});
