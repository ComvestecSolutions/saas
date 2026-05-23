import { Effect } from "effect";
import {
  fieldSecurityAuditAction,
  platformModuleId,
  platformScope,
  retentionDataType,
  retentionLegalHoldAuditAction,
  retentionLegalHoldStatus,
  type RequestContext,
} from "@comvestec/contracts";
import {
  AuditLogModule,
  type AuditLogModuleService,
  type AuthorizationModuleService,
  IdentitySessionModule,
  type IdentitySessionModuleService,
  RetentionLegalHoldModule,
  type RetentionLegalHoldModuleService,
} from "@comvestec/modules";
import {
  organizationRequestContext,
  supportRequestContext,
} from "../modules/_fixtures";
import {
  makeRetentionLegalHoldServiceWithAuthorization,
  type RetentionLegalHoldAccessDeniedError,
} from "../../packages/platform/src/services/governance/retention-legal-hold";

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
        cacheKey: "retention:manage",
        reason: "allowed",
        auditRequired: false,
      })),
});

const createAuditLogServiceDouble = (input?: {
  readonly appendEntries?: {
    readonly moduleId: string;
    readonly action: string;
    readonly target: string;
  }[];
}): AuditLogModuleService => ({
  append: (request) => {
    input?.appendEntries?.push({
      moduleId: request.moduleId,
      action: request.action,
      target: request.target,
    });

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
  },
  queryByModule: () => Effect.succeed([]),
  queryByTarget: () => Effect.succeed([]),
  queryByActor: () => Effect.succeed([]),
  queryByTenant: () => Effect.succeed([]),
  requirements: Effect.succeed([]),
});

const unexpectedRetentionModuleEffect = <A>() =>
  Effect.die(new Error("Unexpected retention legal hold module call."));

const createRetentionLegalHoldModuleDouble = (
  overrides: Partial<RetentionLegalHoldModuleService>,
): RetentionLegalHoldModuleService => ({
  upsertRetentionPolicy:
    overrides.upsertRetentionPolicy ??
    (() => unexpectedRetentionModuleEffect()),
  listRetentionPolicies:
    overrides.listRetentionPolicies ??
    (() => unexpectedRetentionModuleEffect()),
  placeRetentionLegalHold:
    overrides.placeRetentionLegalHold ??
    (() => unexpectedRetentionModuleEffect()),
  getRetentionLegalHoldRecord:
    overrides.getRetentionLegalHoldRecord ??
    (() => unexpectedRetentionModuleEffect()),
  releaseRetentionLegalHold:
    overrides.releaseRetentionLegalHold ??
    (() => unexpectedRetentionModuleEffect()),
  listRetentionLegalHolds:
    overrides.listRetentionLegalHolds ??
    (() => unexpectedRetentionModuleEffect()),
  checkRetentionGuard:
    overrides.checkRetentionGuard ?? (() => unexpectedRetentionModuleEffect()),
});

describe("platform retention legal hold service", () => {
  it("manages retention policies and legal holds for operator sessions", async () => {
    const seen = {
      auditEntries: [] as {
        moduleId: string;
        action: string;
        target: string;
      }[],
      authorizationScopeIds: [] as string[],
    };
    const module = createRetentionLegalHoldModuleDouble({
      upsertRetentionPolicy: (input) =>
        Effect.succeed({
          policyId: `retention-policy:${input.scope}:${input.scopeId}:${input.dataType}`,
          dataType: input.dataType,
          retentionDays: input.retentionDays,
          legalHoldActive: false,
        }),
      listRetentionPolicies: () =>
        Effect.succeed([
          {
            policyId: "retention-policy:organization:org_1:file-object",
            dataType: retentionDataType.fileObject,
            retentionDays: 365,
            legalHoldActive: true,
          },
        ]),
      placeRetentionLegalHold: (input) =>
        Effect.succeed({
          legalHoldId: "retention-legal-hold:organization:org_1:1",
          dataType: input.dataType,
          targetId: input.targetId,
          status: retentionLegalHoldStatus.active,
          placedAt: "2026-04-27T19:00:00.000Z",
          evidence: input.evidence,
          legalHoldActive: true,
        }),
      getRetentionLegalHoldRecord: () =>
        Effect.succeed({
          legalHoldId: "retention-legal-hold:organization:org_1:1",
          scope: platformScope.organization,
          scopeId: "org_1",
          dataType: retentionDataType.fileObject,
          targetId: "file_1",
          reason: "Compliance investigation",
          evidence: "case-42",
          status: retentionLegalHoldStatus.active,
          placedBy: "usr_support_1",
          placedAt: "2026-04-27T19:00:00.000Z",
        }),
      releaseRetentionLegalHold: () =>
        Effect.succeed({
          legalHoldId: "retention-legal-hold:organization:org_1:1",
          dataType: retentionDataType.fileObject,
          targetId: "file_1",
          status: retentionLegalHoldStatus.released,
          placedAt: "2026-04-27T19:00:00.000Z",
          releasedAt: "2026-04-27T20:00:00.000Z",
          evidence: "case-42",
          legalHoldActive: false,
        }),
      listRetentionLegalHolds: () =>
        Effect.succeed([
          {
            legalHoldId: "retention-legal-hold:organization:org_1:1",
            dataType: retentionDataType.fileObject,
            targetId: "file_1",
            status: retentionLegalHoldStatus.active,
            placedAt: "2026-04-27T19:00:00.000Z",
            evidence: "case-42",
            legalHoldActive: true,
          },
        ]),
    });
    const service = await Effect.runPromise(
      makeRetentionLegalHoldServiceWithAuthorization(
        createAuthorizationServiceDouble({
          onCheck: (input) => {
            seen.authorizationScopeIds.push(
              input.requestContext.tenant.scopeId,
            );

            return Effect.succeed({
              allowed: true,
              cacheKey: "retention:manage",
              reason: "allowed",
              auditRequired: false,
            });
          },
        }),
      ).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogServiceDouble({ appendEntries: seen.auditEntries }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        Effect.provideService(RetentionLegalHoldModule, module),
      ),
    );

    const createdPolicy = await Effect.runPromise(
      service.upsertRetentionPolicy({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
        dataType: retentionDataType.fileObject,
        retentionDays: 365,
      }),
    );
    const listedPolicies = await Effect.runPromise(
      service.listRetentionPolicies({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
      }),
    );
    const placedHold = await Effect.runPromise(
      service.placeRetentionLegalHold({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
        dataType: retentionDataType.fileObject,
        targetId: "file_1",
        reason: "Compliance investigation",
        evidence: "case-42",
      }),
    );
    const releasedHold = await Effect.runPromise(
      service.releaseRetentionLegalHold({
        sessionId: "sess_support_1",
        legalHoldId: "retention-legal-hold:organization:org_1:1",
      }),
    );
    const listedHolds = await Effect.runPromise(
      service.listRetentionLegalHolds({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
      }),
    );

    expect(seen.authorizationScopeIds).toEqual([
      "org_1",
      "org_1",
      "org_1",
      "org_1",
      "org_1",
    ]);
    expect(seen.auditEntries).toEqual([
      {
        moduleId: platformModuleId.retentionLegalHold,
        action: retentionLegalHoldAuditAction.policyUpserted,
        target: `${platformModuleId.retentionLegalHold}:retention-policy:organization:org_1:file-object:policy`,
      },
      {
        moduleId: platformModuleId.fieldSecurity,
        action: fieldSecurityAuditAction.sensitiveRead,
        target: `${platformModuleId.retentionLegalHold}:retention-policy:organization:org_1:file-object:policy:legalHoldActive`,
      },
      {
        moduleId: platformModuleId.fieldSecurity,
        action: fieldSecurityAuditAction.sensitiveRead,
        target: `${platformModuleId.retentionLegalHold}:organization:org_1:policies:legalHoldActive`,
      },
      {
        moduleId: platformModuleId.retentionLegalHold,
        action: retentionLegalHoldAuditAction.holdPlaced,
        target: `${platformModuleId.retentionLegalHold}:retention-legal-hold:organization:org_1:1:hold`,
      },
      {
        moduleId: platformModuleId.fieldSecurity,
        action: fieldSecurityAuditAction.sensitiveRead,
        target: `${platformModuleId.retentionLegalHold}:retention-legal-hold:organization:org_1:1:hold:legalHoldActive,targetId,evidence`,
      },
      {
        moduleId: platformModuleId.retentionLegalHold,
        action: retentionLegalHoldAuditAction.holdReleased,
        target: `${platformModuleId.retentionLegalHold}:retention-legal-hold:organization:org_1:1:hold`,
      },
      {
        moduleId: platformModuleId.fieldSecurity,
        action: fieldSecurityAuditAction.sensitiveRead,
        target: `${platformModuleId.retentionLegalHold}:retention-legal-hold:organization:org_1:1:hold:legalHoldActive,targetId,evidence`,
      },
      {
        moduleId: platformModuleId.fieldSecurity,
        action: fieldSecurityAuditAction.sensitiveRead,
        target: `${platformModuleId.retentionLegalHold}:organization:org_1:holds:legalHoldActive,targetId,evidence`,
      },
    ]);
    expect(createdPolicy).toMatchObject({
      dataType: retentionDataType.fileObject,
      retentionDays: 365,
    });
    expect(listedPolicies).toEqual([
      expect.objectContaining({
        dataType: retentionDataType.fileObject,
        legalHoldActive: true,
      }),
    ]);
    expect(placedHold).toMatchObject({
      legalHoldId: "retention-legal-hold:organization:org_1:1",
      targetId: "file_1",
      legalHoldActive: true,
    });
    expect(releasedHold).toMatchObject({
      legalHoldId: "retention-legal-hold:organization:org_1:1",
      status: retentionLegalHoldStatus.released,
      legalHoldActive: false,
    });
    expect(listedHolds).toHaveLength(1);
    expect(listedHolds[0]).toMatchObject({
      legalHoldId: "retention-legal-hold:organization:org_1:1",
      targetId: "file_1",
    });
  });

  it("denies cross-tenant retention management without break-glass", async () => {
    let authorizationChecks = 0;
    const service = await Effect.runPromise(
      makeRetentionLegalHoldServiceWithAuthorization(
        createAuthorizationServiceDouble({
          onCheck: () => {
            authorizationChecks += 1;

            return Effect.succeed({
              allowed: true,
              cacheKey: "retention:manage",
              reason: "allowed",
              auditRequired: false,
            });
          },
        }),
      ).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        Effect.provideService(
          RetentionLegalHoldModule,
          createRetentionLegalHoldModuleDouble({}),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.listRetentionPolicies({
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
        _tag: "RetentionLegalHoldAccessDeniedError",
        actorType: supportRequestContext.actorType,
      } satisfies RetentionLegalHoldAccessDeniedError,
    });
  });

  it("allows cross-tenant retention reads with break-glass and target-scoped authorization", async () => {
    const authorizationScopeIds: string[] = [];
    const service = await Effect.runPromise(
      makeRetentionLegalHoldServiceWithAuthorization(
        createAuthorizationServiceDouble({
          onCheck: (input) => {
            authorizationScopeIds.push(input.requestContext.tenant.scopeId);

            return Effect.succeed({
              allowed: true,
              cacheKey: "retention:manage",
              reason: "allowed",
              auditRequired: false,
            });
          },
        }),
      ).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble({
            ...supportRequestContext,
            breakGlass: {
              approvedBy: "usr_platform_1",
              reason: "Compliance escalation",
              expiresAt: "2099-01-01T00:00:00.000Z",
            },
          }),
        ),
        Effect.provideService(
          RetentionLegalHoldModule,
          createRetentionLegalHoldModuleDouble({
            listRetentionLegalHolds: () =>
              Effect.succeed([
                {
                  legalHoldId: "retention-legal-hold:organization:org_2:1",
                  dataType: retentionDataType.fileObject,
                  targetId: "file_2",
                  status: retentionLegalHoldStatus.active,
                  placedAt: "2026-04-27T19:00:00.000Z",
                  evidence: "case-99",
                  legalHoldActive: true,
                },
              ]),
          }),
        ),
      ),
    );

    const holds = await Effect.runPromise(
      service.listRetentionLegalHolds({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_2",
      }),
    );

    expect(authorizationScopeIds).toEqual(["org_2"]);
    expect(holds).toEqual([
      expect.objectContaining({
        legalHoldId: "retention-legal-hold:organization:org_2:1",
      }),
    ]);
  });

  it("hides cross-tenant legal hold existence on release without break-glass", async () => {
    let authorizationChecks = 0;
    const service = await Effect.runPromise(
      makeRetentionLegalHoldServiceWithAuthorization(
        createAuthorizationServiceDouble({
          onCheck: () => {
            authorizationChecks += 1;

            return Effect.succeed({
              allowed: true,
              cacheKey: "retention:manage",
              reason: "allowed",
              auditRequired: false,
            });
          },
        }),
      ).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        Effect.provideService(
          RetentionLegalHoldModule,
          createRetentionLegalHoldModuleDouble({
            getRetentionLegalHoldRecord: () =>
              Effect.succeed({
                legalHoldId: "retention-legal-hold:organization:org_2:1",
                scope: platformScope.organization,
                scopeId: "org_2",
                dataType: retentionDataType.fileObject,
                targetId: "file_2",
                reason: "Cross-tenant investigation",
                evidence: "case-99",
                status: retentionLegalHoldStatus.active,
                placedBy: "usr_support_2",
                placedAt: "2026-04-27T19:00:00.000Z",
              }),
          }),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.releaseRetentionLegalHold({
          sessionId: "sess_support_1",
          legalHoldId: "retention-legal-hold:organization:org_2:1",
        }),
      ),
    );

    expect(authorizationChecks).toBe(1);
    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "RetentionLegalHoldNotFoundError",
        legalHoldId: "retention-legal-hold:organization:org_2:1",
      },
    });
  });

  it("denies same-tenant release before hold lookup when retention permission is missing", async () => {
    let authorizationChecks = 0;
    let holdLookups = 0;
    const service = await Effect.runPromise(
      makeRetentionLegalHoldServiceWithAuthorization(
        createAuthorizationServiceDouble({
          onCheck: () => {
            authorizationChecks += 1;

            return Effect.succeed({
              allowed: false,
              cacheKey: "retention:manage",
              reason: "denied",
              auditRequired: false,
            });
          },
        }),
      ).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        Effect.provideService(
          RetentionLegalHoldModule,
          createRetentionLegalHoldModuleDouble({
            getRetentionLegalHoldRecord: () => {
              holdLookups += 1;

              return Effect.succeed({
                legalHoldId: "retention-legal-hold:organization:org_1:1",
                scope: platformScope.organization,
                scopeId: "org_1",
                dataType: retentionDataType.fileObject,
                targetId: "file_1",
                reason: "Same-tenant investigation",
                evidence: "case-42",
                status: retentionLegalHoldStatus.active,
                placedBy: "usr_support_1",
                placedAt: "2026-04-27T19:00:00.000Z",
              });
            },
          }),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.releaseRetentionLegalHold({
          sessionId: "sess_support_1",
          legalHoldId: "retention-legal-hold:organization:org_1:1",
        }),
      ),
    );

    expect(authorizationChecks).toBe(1);
    expect(holdLookups).toBe(0);
    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "RetentionLegalHoldAccessDeniedError",
        actorType: supportRequestContext.actorType,
      } satisfies RetentionLegalHoldAccessDeniedError,
    });
  });

  it("hides legal hold existence when break-glass is present but delegated retention permission is denied", async () => {
    let authorizationChecks = 0;
    const service = await Effect.runPromise(
      makeRetentionLegalHoldServiceWithAuthorization(
        createAuthorizationServiceDouble({
          onCheck: () => {
            authorizationChecks += 1;

            return Effect.succeed({
              allowed: false,
              cacheKey: "retention:manage",
              reason: "denied",
              auditRequired: false,
            });
          },
        }),
      ).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble({
            ...supportRequestContext,
            breakGlass: {
              approvedBy: "usr_platform_1",
              reason: "Compliance escalation",
              expiresAt: "2099-01-01T00:00:00.000Z",
            },
          }),
        ),
        Effect.provideService(
          RetentionLegalHoldModule,
          createRetentionLegalHoldModuleDouble({
            getRetentionLegalHoldRecord: () =>
              Effect.succeed({
                legalHoldId: "retention-legal-hold:organization:org_2:1",
                scope: platformScope.organization,
                scopeId: "org_2",
                dataType: retentionDataType.fileObject,
                targetId: "file_2",
                reason: "Escalated investigation",
                evidence: "case-100",
                status: retentionLegalHoldStatus.active,
                placedBy: "usr_support_2",
                placedAt: "2026-04-27T19:00:00.000Z",
              }),
          }),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.releaseRetentionLegalHold({
          sessionId: "sess_support_1",
          legalHoldId: "retention-legal-hold:organization:org_2:1",
        }),
      ),
    );

    expect(authorizationChecks).toBe(1);
    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "RetentionLegalHoldNotFoundError",
        legalHoldId: "retention-legal-hold:organization:org_2:1",
      },
    });
  });

  it("denies cross-tenant retention management with expired break-glass", async () => {
    let authorizationChecks = 0;
    const service = await Effect.runPromise(
      makeRetentionLegalHoldServiceWithAuthorization(
        createAuthorizationServiceDouble({
          onCheck: () => {
            authorizationChecks += 1;

            return Effect.succeed({
              allowed: true,
              cacheKey: "retention:manage",
              reason: "allowed",
              auditRequired: false,
            });
          },
        }),
      ).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble({
            ...supportRequestContext,
            breakGlass: {
              approvedBy: "usr_platform_1",
              reason: "Expired compliance escalation",
              expiresAt: "2000-01-01T00:00:00.000Z",
            },
          }),
        ),
        Effect.provideService(
          RetentionLegalHoldModule,
          createRetentionLegalHoldModuleDouble({}),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.listRetentionLegalHolds({
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
        _tag: "RetentionLegalHoldAccessDeniedError",
        actorType: supportRequestContext.actorType,
      } satisfies RetentionLegalHoldAccessDeniedError,
    });
  });

  it("denies non-operator sessions from managing retention workflows", async () => {
    const service = await Effect.runPromise(
      makeRetentionLegalHoldServiceWithAuthorization(
        createAuthorizationServiceDouble(),
      ).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(organizationRequestContext),
        ),
        Effect.provideService(
          RetentionLegalHoldModule,
          createRetentionLegalHoldModuleDouble({}),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.listRetentionPolicies({
          sessionId: "sess_member_1",
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "RetentionLegalHoldAccessDeniedError",
        actorType: organizationRequestContext.actorType,
      } satisfies RetentionLegalHoldAccessDeniedError,
    });
  });
});
