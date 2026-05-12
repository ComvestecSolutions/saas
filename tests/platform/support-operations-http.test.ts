import { Effect, Schema } from "effect";
import {
  actorType,
  platformModuleId,
  platformScope,
  supportOperationsCasePriority,
  supportOperationsCaseStatus,
  supportOperationsAuditAction,
  supportOperationsBreakGlassIncidentStatus,
  supportOperationsImpersonationSessionStatus,
  workflowJobGapReason,
  workflowJobStatus,
} from "@comvestec/contracts";
import {
  adminSupportOperationsApiPath,
  createAdminSupportOperationsHttpHandler,
  subscriberJourneySessionHeaderName,
  type SupportOperationsService,
} from "@comvestec/platform";

const unexpectedSupportOperationsServiceEffect = <A>() =>
  Effect.die(new Error("Unexpected support-operations service call."));

const createSupportOperationsServiceDouble = (
  overrides: Partial<SupportOperationsService>,
): SupportOperationsService => ({
  startImpersonation:
    overrides.startImpersonation ??
    (() => unexpectedSupportOperationsServiceEffect()),
  getTenantHealth:
    overrides.getTenantHealth ??
    (() => unexpectedSupportOperationsServiceEffect()),
  upsertCase:
    overrides.upsertCase ?? (() => unexpectedSupportOperationsServiceEffect()),
  listCases:
    overrides.listCases ?? (() => unexpectedSupportOperationsServiceEffect()),
  listImpersonationSessions:
    overrides.listImpersonationSessions ??
    (() => unexpectedSupportOperationsServiceEffect()),
  revokeImpersonationSession:
    overrides.revokeImpersonationSession ??
    (() => unexpectedSupportOperationsServiceEffect()),
  grantBreakGlassAccess:
    overrides.grantBreakGlassAccess ??
    (() => unexpectedSupportOperationsServiceEffect()),
  listBreakGlassIncidents:
    overrides.listBreakGlassIncidents ??
    (() => unexpectedSupportOperationsServiceEffect()),
  reviewBreakGlassIncident:
    overrides.reviewBreakGlassIncident ??
    (() => unexpectedSupportOperationsServiceEffect()),
});

const createTestHandler = (service: Partial<SupportOperationsService>) =>
  createAdminSupportOperationsHttpHandler((use) =>
    use(createSupportOperationsServiceDouble(service)),
  );

const createInternalParseError = () =>
  Effect.runSync(
    Effect.flip(
      Schema.decodeUnknown(
        Schema.Struct({
          required: Schema.NonEmptyString,
        }),
      )({}),
    ),
  );

describe("platform support-operations http", () => {
  it("does not trust body session ids when the trusted header is missing", async () => {
    const startImpersonation = vi.fn(() =>
      unexpectedSupportOperationsServiceEffect(),
    );
    const handler = createTestHandler({
      startImpersonation,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.startImpersonation}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sessionId: "sess_body_only_support",
              impersonatedActorId: "usr_member_1",
              reason: "Investigate tenant access issue",
              requestedDurationMinutes: 15,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authenticated operator session is required.",
    });
    expect(startImpersonation).not.toHaveBeenCalled();
  });

  it("starts impersonation through the support-operations surface", async () => {
    const handler = createTestHandler({
      startImpersonation: () =>
        Effect.succeed({
          grantedRequestContext: {
            actorType: actorType.supportOperator,
            actorId: "usr_support_operator_1",
            sessionId: "sess_support_operator_1",
            correlationId: "corr_support_operations_1",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_1",
              organizationId: "org_1",
            },
            impersonation: {
              impersonatedActorId: "usr_member_1",
              approvedBy: "usr_support_operator_1",
              reason: "Investigate tenant access issue",
            },
          },
          expiresAt: "2026-04-28T20:15:00.000Z",
          idToken: "id_token_support_impersonation_1",
          auditEvent: {
            eventId: "evt_impersonation_1",
            moduleId: platformModuleId.supportOperations,
            action: supportOperationsAuditAction.impersonationStarted,
            target: "organization:org_1:usr_member_1",
            actorId: "usr_support_operator_1",
            tenantScope: platformScope.platform,
            tenantScopeId: platformScope.platform,
            reason: "Investigate tenant access issue",
            correlationId: "corr_support_operations_1",
            timestamp: "2026-04-28T20:00:00.000Z",
          },
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.startImpersonation}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              impersonatedActorId: "usr_member_1",
              reason: "Investigate tenant access issue",
              requestedDurationMinutes: 15,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        expiresAt: "2026-04-28T20:15:00.000Z",
      }),
    );
  });

  it("returns tenant health through the support-operations surface", async () => {
    const handler = createTestHandler({
      getTenantHealth: () =>
        Effect.succeed({
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          cases: [
            {
              caseId: "case_support_case_1",
              supportAgent: "usr_support_operator_1",
              tenantScope: platformScope.organization,
              tenantScopeId: "org_1",
              summary: "Escalated tenant authentication investigation",
              status: supportOperationsCaseStatus.escalated,
              priority: supportOperationsCasePriority.high,
              startedAt: "2026-05-03T10:00:00.000Z",
              lastUpdatedAt: "2026-05-03T10:15:00.000Z",
            },
          ],
          repairGaps: [
            {
              jobId:
                "workflow-jobs:billing-repair:operator-requested:organization:org_1:checkout_1",
              tenantScope: platformScope.organization,
              tenantScopeId: "org_1",
              status: workflowJobStatus.blocked,
              attempts: 3,
              scheduledAt: "2026-05-03T10:30:00.000Z",
              gapReason: workflowJobGapReason.repairFailed,
            },
          ],
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.tenantHealth}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              tenantScope: platformScope.organization,
              tenantScopeId: "org_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      cases: [
        {
          caseId: "case_support_case_1",
          supportAgent: "usr_support_operator_1",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          summary: "Escalated tenant authentication investigation",
          status: supportOperationsCaseStatus.escalated,
          priority: supportOperationsCasePriority.high,
          startedAt: "2026-05-03T10:00:00.000Z",
          lastUpdatedAt: "2026-05-03T10:15:00.000Z",
        },
      ],
      repairGaps: [
        {
          jobId:
            "workflow-jobs:billing-repair:operator-requested:organization:org_1:checkout_1",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          status: workflowJobStatus.blocked,
          attempts: 3,
          scheduledAt: "2026-05-03T10:30:00.000Z",
          gapReason: workflowJobGapReason.repairFailed,
        },
      ],
    });
  });

  it("returns 502 when tenant-health workflow inspection fails", async () => {
    const handler = createTestHandler({
      getTenantHealth: () =>
        Effect.fail({
          _tag: "WorkflowJobsPostgresRepositoryQueryError",
          operation: "listRepairGapWorkflowJobs",
          cause: new Error("Simulated workflow repair-gap query failure."),
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.tenantHealth}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              tenantScope: platformScope.organization,
              tenantScopeId: "org_1",
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

  it("returns 400 when tenant health is requested for platform scope", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.tenantHealth}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              tenantScope: platformScope.platform,
              tenantScopeId: "plt_root",
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

  it("upserts support cases through the support-operations surface", async () => {
    const handler = createTestHandler({
      upsertCase: () =>
        Effect.succeed({
          caseId: "case_support_case_1",
          supportAgent: "usr_support_operator_1",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          summary: "Escalated tenant authentication investigation",
          status: supportOperationsCaseStatus.escalated,
          priority: supportOperationsCasePriority.high,
          startedAt: "2026-05-03T10:00:00.000Z",
          lastUpdatedAt: "2026-05-03T10:15:00.000Z",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.upsertCase}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              caseId: "case_support_case_1",
              tenantScope: platformScope.organization,
              tenantScopeId: "org_1",
              summary: "Escalated tenant authentication investigation",
              status: supportOperationsCaseStatus.escalated,
              priority: supportOperationsCasePriority.high,
              changeReason: "Escalated after repeated authentication failures.",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      caseId: "case_support_case_1",
      supportAgent: "usr_support_operator_1",
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      summary: "Escalated tenant authentication investigation",
      status: supportOperationsCaseStatus.escalated,
      priority: supportOperationsCasePriority.high,
      startedAt: "2026-05-03T10:00:00.000Z",
      lastUpdatedAt: "2026-05-03T10:15:00.000Z",
    });
  });

  it("returns 502 when support-case persistence fails", async () => {
    const handler = createTestHandler({
      upsertCase: () =>
        Effect.fail({
          _tag: "SupportOperationsCasePostgresRepositoryQueryError",
          operation: "upsertSupportCase",
          cause: new Error("Simulated support-case persistence failure."),
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.upsertCase}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              caseId: "case_support_case_1",
              tenantScope: platformScope.organization,
              tenantScopeId: "org_1",
              summary: "Escalated tenant authentication investigation",
              status: supportOperationsCaseStatus.escalated,
              priority: supportOperationsCasePriority.high,
              changeReason: "Escalated after repeated authentication failures.",
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

  it("lists support cases through the support-operations surface", async () => {
    const handler = createTestHandler({
      listCases: () =>
        Effect.succeed([
          {
            caseId: "case_support_case_1",
            supportAgent: "usr_support_operator_1",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
            summary: "Open tenant authentication investigation",
            status: supportOperationsCaseStatus.open,
            priority: supportOperationsCasePriority.high,
            startedAt: "2026-05-03T10:00:00.000Z",
            lastUpdatedAt: "2026-05-03T10:05:00.000Z",
          },
        ]),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.listCases}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        caseId: "case_support_case_1",
        supportAgent: "usr_support_operator_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        summary: "Open tenant authentication investigation",
        status: supportOperationsCaseStatus.open,
        priority: supportOperationsCasePriority.high,
        startedAt: "2026-05-03T10:00:00.000Z",
        lastUpdatedAt: "2026-05-03T10:05:00.000Z",
      },
    ]);
  });

  it("lists active impersonation sessions through the support-operations surface", async () => {
    const handler = createTestHandler({
      listImpersonationSessions: () =>
        Effect.succeed([
          {
            caseId: "sess_impersonation_usr_member_1",
            status: supportOperationsImpersonationSessionStatus.active,
            startedAt: "2026-04-28T20:00:00.000Z",
          },
        ]),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.listImpersonationSessions}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        caseId: "sess_impersonation_usr_member_1",
        status: supportOperationsImpersonationSessionStatus.active,
        startedAt: "2026-04-28T20:00:00.000Z",
      },
    ]);
  });

  it("revokes impersonation sessions through the support-operations surface", async () => {
    const handler = createTestHandler({
      revokeImpersonationSession: () =>
        Effect.succeed({
          caseId: "sess_impersonation_usr_member_1",
          status: supportOperationsImpersonationSessionStatus.revoked,
          startedAt: "2026-04-28T20:00:00.000Z",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.revokeImpersonationSession}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              caseId: "sess_impersonation_usr_member_1",
              revocationReason: "Support investigation complete.",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      caseId: "sess_impersonation_usr_member_1",
      status: supportOperationsImpersonationSessionStatus.revoked,
      startedAt: "2026-04-28T20:00:00.000Z",
    });
  });

  it("grants break-glass access through the support-operations surface", async () => {
    const handler = createTestHandler({
      grantBreakGlassAccess: () =>
        Effect.succeed({
          grantedRequestContext: {
            actorType: actorType.supportOperator,
            actorId: "usr_support_operator_1",
            sessionId: "sess_support_operator_1",
            correlationId: "corr_support_operations_1",
            tenant: {
              scope: platformScope.platform,
              scopeId: platformScope.platform,
            },
            reason: "Resolve emergency tenant outage",
            breakGlass: {
              approvedBy: "usr_support_operator_1",
              reason: "Resolve emergency tenant outage",
              expiresAt: "2026-04-28T20:15:00.000Z",
            },
          },
          expiresAt: "2026-04-28T20:15:00.000Z",
          auditEvent: {
            eventId: "evt_break_glass_1",
            moduleId: platformModuleId.supportOperations,
            action: supportOperationsAuditAction.breakGlassStarted,
            target: platformScope.platform,
            actorId: "usr_support_operator_1",
            tenantScope: platformScope.platform,
            tenantScopeId: platformScope.platform,
            reason: "Resolve emergency tenant outage",
            correlationId: "corr_support_operations_1",
            timestamp: "2026-04-28T20:00:00.000Z",
          },
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.grantBreakGlass}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              reason: "Resolve emergency tenant outage",
              expiresAt: "2026-04-28T20:15:00.000Z",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        expiresAt: "2026-04-28T20:15:00.000Z",
      }),
    );
  });

  it("lists support-safe break-glass incidents through the support-operations surface", async () => {
    const handler = createTestHandler({
      listBreakGlassIncidents: () =>
        Effect.succeed([
          {
            caseId: "evt_break_glass_1",
            status: supportOperationsBreakGlassIncidentStatus.pendingReview,
            startedAt: "2026-04-28T20:00:00.000Z",
          },
        ]),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.listBreakGlassIncidents}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              status: supportOperationsBreakGlassIncidentStatus.pendingReview,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        caseId: "evt_break_glass_1",
        status: supportOperationsBreakGlassIncidentStatus.pendingReview,
        startedAt: "2026-04-28T20:00:00.000Z",
      },
    ]);
  });

  it("returns 409 when a break-glass incident has already been reviewed", async () => {
    const handler = createTestHandler({
      reviewBreakGlassIncident: () =>
        Effect.fail({
          _tag: "BreakGlassIncidentAlreadyReviewedError",
          caseId: "evt_break_glass_1",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.reviewBreakGlassIncident}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              caseId: "evt_break_glass_1",
              reviewReason: "Post-incident review completed.",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Break-glass incident has already been reviewed.",
    });
  });

  it("returns 409 when an impersonation session has already been revoked", async () => {
    const handler = createTestHandler({
      revokeImpersonationSession: () =>
        Effect.fail({
          _tag: "SupportOperationsImpersonationSessionAlreadyRevokedError",
          caseId: "sess_impersonation_usr_member_1",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.revokeImpersonationSession}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              caseId: "sess_impersonation_usr_member_1",
              revocationReason: "Support investigation complete.",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Impersonation session has already been revoked.",
    });
  });

  it("returns 409 when an impersonation session is no longer active", async () => {
    const handler = createTestHandler({
      revokeImpersonationSession: () =>
        Effect.fail({
          _tag: "SupportOperationsImpersonationSessionNoLongerActiveError",
          caseId: "sess_impersonation_usr_member_1",
          status: supportOperationsImpersonationSessionStatus.expired,
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.revokeImpersonationSession}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              caseId: "sess_impersonation_usr_member_1",
              revocationReason: "Support investigation complete.",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Impersonation session is no longer active.",
    });
  });

  it("returns 502 when Keycloak revocation fails while a session is pending", async () => {
    const handler = createTestHandler({
      revokeImpersonationSession: () =>
        Effect.fail({
          _tag: "KeycloakAdapterRequestError",
          operation: "sessionRevocation",
          cause: "upstream failure",
          status: 500,
          body: "revocation failed",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.revokeImpersonationSession}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              caseId: "sess_impersonation_usr_member_1",
              revocationReason: "Support investigation complete.",
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

  it("returns 502 when Keycloak does not provide an impersonation session id", async () => {
    const handler = createTestHandler({
      startImpersonation: () =>
        Effect.fail({
          _tag: "KeycloakSessionIdentifierMissingError",
          realm: "comvestec",
          actorId: "usr_member_1",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.startImpersonation}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              impersonatedActorId: "usr_member_1",
              reason: "Investigate tenant access issue",
              requestedDurationMinutes: 15,
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

  it("returns 502 when Keycloak returns an impersonation token for the wrong actor", async () => {
    const handler = createTestHandler({
      startImpersonation: () =>
        Effect.fail({
          _tag: "KeycloakImpersonationActorMismatchError",
          realm: "comvestec",
          requestedActorId: "usr_member_1",
          sessionActorId: "usr_member_2",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.startImpersonation}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              impersonatedActorId: "usr_member_1",
              reason: "Investigate tenant access issue",
              requestedDurationMinutes: 15,
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

  it("returns 502 when Keycloak omits required impersonation claims", async () => {
    const handler = createTestHandler({
      startImpersonation: () =>
        Effect.fail({
          _tag: "ImpersonationActorTypeMissingError",
          actorId: "usr_member_1",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.startImpersonation}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              impersonatedActorId: "usr_member_1",
              reason: "Investigate tenant access issue",
              requestedDurationMinutes: 15,
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

  it("returns 502 when adapter-side impersonation cleanup fails", async () => {
    const handler = createTestHandler({
      startImpersonation: () =>
        Effect.fail({
          _tag: "KeycloakImpersonationCompensationError",
          sessionId: "sess_impersonation_usr_member_1",
          issuanceFailure: {
            _tag: "KeycloakImpersonationIdTokenMissingError",
            realm: "comvestec",
            clientId: "saas-platform",
            impersonatedActorId: "usr_member_1",
          },
          revocationFailure: {
            _tag: "KeycloakAdapterRequestError",
            operation: "sessionRevocation",
            cause: new Error("Keycloak unavailable"),
            status: 503,
          },
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.startImpersonation}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              impersonatedActorId: "usr_member_1",
              reason: "Investigate tenant access issue",
              requestedDurationMinutes: 15,
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

  it("returns 502 when adapter-side impersonation cleanup is unavailable", async () => {
    const handler = createTestHandler({
      startImpersonation: () =>
        Effect.fail({
          _tag: "KeycloakImpersonationCleanupUnavailableError",
          issuanceFailure: {
            _tag: "KeycloakSessionIdentifierMissingError",
            realm: "comvestec",
            actorId: "usr_member_1",
          },
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.startImpersonation}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              impersonatedActorId: "usr_member_1",
              reason: "Investigate tenant access issue",
              requestedDurationMinutes: 15,
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

  it("returns 502 when impersonation compensation fails", async () => {
    const handler = createTestHandler({
      startImpersonation: () =>
        Effect.fail({
          _tag: "SupportOperationsImpersonationCompensationError",
          sessionId: "sess_impersonation_usr_member_1",
          persistenceFailure: {
            _tag: "AuditLogPostgresRepositoryPersistenceError",
            operation: "insertAuditEvent",
            cause: new Error("Simulated audit write failure."),
          },
          revocationFailure: {
            _tag: "KeycloakAdapterRequestError",
            operation: "sessionRevocation",
            cause: new Error("Keycloak unavailable"),
            status: 503,
          },
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.startImpersonation}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              impersonatedActorId: "usr_member_1",
              reason: "Investigate tenant access issue",
              requestedDurationMinutes: 15,
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

  it("returns 502 when post-issuance impersonation cleanup fails", async () => {
    const handler = createTestHandler({
      startImpersonation: () =>
        Effect.fail({
          _tag: "SupportImpersonationGrantCleanupError",
          sessionId: "sess_impersonation_usr_member_1",
          grantFailure: {
            _tag: "ImpersonationActorTypeMissingError",
            actorId: "usr_member_1",
          },
          cleanupFailure: {
            _tag: "KeycloakAdapterRequestError",
            operation: "sessionRevocation",
            cause: new Error("Keycloak unavailable"),
            status: 503,
          },
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.startImpersonation}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              impersonatedActorId: "usr_member_1",
              reason: "Investigate tenant access issue",
              requestedDurationMinutes: 15,
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

  it("returns 500 when an internal parse failure escapes the service", async () => {
    const handler = createTestHandler({
      startImpersonation: () => Effect.fail(createInternalParseError()),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.startImpersonation}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              impersonatedActorId: "usr_member_1",
              reason: "Investigate tenant access issue",
              requestedDurationMinutes: 15,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Support operations request failed.",
    });
  });

  it("returns 502 when runtime bootstrap cannot connect to Postgres", async () => {
    const handler = createAdminSupportOperationsHttpHandler(() =>
      Effect.fail({
        _tag: "PostgresAdapterConnectionError",
        operation: "healthcheck",
        cause: new Error("Postgres unavailable"),
      }),
    );

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.startImpersonation}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              impersonatedActorId: "usr_member_1",
              reason: "Investigate tenant access issue",
              requestedDurationMinutes: 15,
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

  it("returns 400 when the request body does not match the expected schema", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminSupportOperationsApiPath.startImpersonation}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator_1",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_1",
              impersonatedActorId: "usr_member_1",
              reason: "",
              requestedDurationMinutes: 15,
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
});
