import { Effect } from "effect";
import {
  billingAndMeteringFeatureFlag,
  billingEnforcementMode,
  billingMeteringMode,
  billingPaymentEventStatus,
  billingPlanInterval,
  billingPlanVisibility,
  billingSubscriptionStatus,
  billingWebhookEventType,
  platformModuleId,
  platformScope,
  projectionProfile,
  usageQuotaPeriod,
  workflowJobGapReason,
  workflowJobStatus,
} from "@comvestec/contracts";
import {
  adminBillingApiPath,
  createAdminBillingHttpHandler,
  platformAdapterServiceName,
  subscriberJourneySessionHeaderName,
  type AdminBillingService,
} from "@comvestec/platform";

const unexpectedAdminBillingServiceEffect = <A>() =>
  Effect.die(new Error("Unexpected admin billing test service call."));

const defaultCreateManagedBillingPlan: AdminBillingService["createManagedBillingPlan"] =
  () => unexpectedAdminBillingServiceEffect();

const defaultInspectBillingState: AdminBillingService["inspectBillingState"] =
  () => unexpectedAdminBillingServiceEffect();

const defaultListBillingRepairGaps: AdminBillingService["listBillingRepairGaps"] =
  () => unexpectedAdminBillingServiceEffect();

const defaultCancelBillingRepairGap: AdminBillingService["cancelBillingRepairGap"] =
  () => unexpectedAdminBillingServiceEffect();

const defaultReplayBillingRepairGap: AdminBillingService["replayBillingRepairGap"] =
  () => unexpectedAdminBillingServiceEffect();

const defaultRunManualBillingReconciliation: AdminBillingService["runManualBillingReconciliation"] =
  () => unexpectedAdminBillingServiceEffect();

const createAdminBillingServiceDouble = (
  overrides: Partial<AdminBillingService>,
): AdminBillingService => ({
  createManagedBillingPlan:
    overrides.createManagedBillingPlan ?? defaultCreateManagedBillingPlan,
  inspectBillingState:
    overrides.inspectBillingState ?? defaultInspectBillingState,
  listBillingRepairGaps:
    overrides.listBillingRepairGaps ?? defaultListBillingRepairGaps,
  cancelBillingRepairGap:
    overrides.cancelBillingRepairGap ?? defaultCancelBillingRepairGap,
  replayBillingRepairGap:
    overrides.replayBillingRepairGap ?? defaultReplayBillingRepairGap,
  runManualBillingReconciliation:
    overrides.runManualBillingReconciliation ??
    defaultRunManualBillingReconciliation,
});

const createTestHandler = (service: Partial<AdminBillingService>) =>
  createAdminBillingHttpHandler((use) =>
    use(createAdminBillingServiceDouble(service)),
  );

describe("platform admin billing http", () => {
  it("creates managed billing plans through the admin HTTP surface", async () => {
    const handler = createTestHandler({
      createManagedBillingPlan: (input) =>
        Effect.succeed({
          plan: {
            planId: "plan_scale",
            planKey: input.plan.planKey,
            displayName: input.plan.displayName,
            description: input.plan.description,
            active: true,
            prices: [
              {
                priceId: "price_scale_month_1",
                interval: input.plan.price.interval,
                currency: input.plan.price.currency,
                amountMinor: input.plan.price.amountMinor,
                active: true,
                providerPriceId: "polar_price_scale_month_1",
              },
            ],
            entitlements: input.plan.entitlements,
          },
          visibility: input.plan.visibility,
          provider: platformAdapterServiceName.polar,
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminBillingApiPath.createManagedPlan}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_admin_plan_create",
            },
            body: JSON.stringify({
              plan: {
                planKey: "scale",
                displayName: "Scale",
                description: "Operator-created recurring plan.",
                visibility: billingPlanVisibility.draft,
                price: {
                  interval: billingPlanInterval.month,
                  currency: "USD",
                  amountMinor: 4900,
                },
                entitlements: [
                  {
                    moduleId: platformModuleId.tenantManagement,
                    included: true,
                    meteringMode: billingMeteringMode.none,
                    enforcementMode: billingEnforcementMode.none,
                  },
                ],
              },
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        plan: expect.objectContaining({
          planKey: "scale",
          displayName: "Scale",
        }),
        visibility: billingPlanVisibility.draft,
        provider: platformAdapterServiceName.polar,
      }),
    );
  });

  it("returns 403 when plan management is not authorized", async () => {
    const handler = createTestHandler({
      createManagedBillingPlan: () =>
        Effect.fail({
          _tag: "ManagedBillingPlanAccessDeniedError",
          reason: "No matching authorization tuple was found.",
          auditRequired: false,
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminBillingApiPath.createManagedPlan}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_denied",
            },
            body: JSON.stringify({
              plan: {
                planKey: "scale",
                displayName: "Scale",
                visibility: billingPlanVisibility.draft,
                price: {
                  interval: billingPlanInterval.month,
                  currency: "USD",
                  amountMinor: 4900,
                },
                entitlements: [
                  {
                    moduleId: platformModuleId.tenantManagement,
                    included: true,
                    meteringMode: billingMeteringMode.none,
                    enforcementMode: billingEnforcementMode.none,
                  },
                ],
              },
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Billing plan management is not allowed for this session.",
    });
  });

  it("requires an explicit session header for managed billing plan creation", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminBillingApiPath.createManagedPlan}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              cookie: "comvestec_session=sess_cookie_only",
            },
            body: JSON.stringify({
              plan: {
                planKey: "scale",
                displayName: "Scale",
                visibility: billingPlanVisibility.draft,
                price: {
                  interval: billingPlanInterval.month,
                  currency: "USD",
                  amountMinor: 4900,
                },
                entitlements: [],
              },
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authenticated operator session is required.",
    });
  });

  it("inspects projected billing state through the admin HTTP surface", async () => {
    let capturedInput:
      | Parameters<AdminBillingService["inspectBillingState"]>[0]
      | undefined;
    const tenant = {
      scope: platformScope.organization,
      scopeId: "org_billing_inspection",
      organizationId: "org_billing_inspection",
    } as const;
    const handler = createTestHandler({
      inspectBillingState: (input) => {
        capturedInput = input;

        return Effect.succeed({
          tenant: input.tenant,
          billing: {
            plan: "plan_scale",
            billingInterval: billingPlanInterval.month,
            status: billingSubscriptionStatus.pastDue,
            usage: [
              {
                featureKey: billingAndMeteringFeatureFlag.apiRequests,
                quotaSnapshot: {
                  meteringMode: billingMeteringMode.rateLimit,
                  meterKey: billingAndMeteringFeatureFlag.apiRequests,
                  unit: "request",
                  quotaLimit: 60,
                  quotaPeriod: usageQuotaPeriod.minute,
                  enforcementMode: billingEnforcementMode.rateLimit,
                },
              },
            ],
            invoiceHistory: [
              {
                eventId: "evt_billing_failed",
                provider: platformAdapterServiceName.polar,
                providerEventId: "polar_evt_billing_failed",
                subscriptionId: "sub_scale",
                scope: platformScope.organization,
                scopeId: tenant.scopeId,
                eventType: billingWebhookEventType.paymentFailed,
                status: billingPaymentEventStatus.failed,
                amountMinor: 4900,
                currency: "USD",
                recordedAt: "2026-04-27T08:00:00.000Z",
              },
            ],
          },
        });
      },
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminBillingApiPath.inspectBillingState}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_billing_inspection",
            },
            body: JSON.stringify({
              tenant,
              inspectionReason: "  Investigate billing payment failures  ",
            }),
          },
        ),
      ),
    );

    expect(capturedInput).toEqual({
      sessionId: "sess_billing_inspection",
      tenant,
      inspectionReason: "Investigate billing payment failures",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      tenant,
      billing: expect.objectContaining({
        plan: "plan_scale",
        billingInterval: billingPlanInterval.month,
        status: billingSubscriptionStatus.pastDue,
        invoiceHistory: [
          expect.objectContaining({
            eventId: "evt_billing_failed",
            eventType: billingWebhookEventType.paymentFailed,
          }),
        ],
      }),
    });
  });

  it("returns 502 when repair-gap audit logging fails", async () => {
    const handler = createTestHandler({
      listBillingRepairGaps: () =>
        Effect.fail({
          _tag: "AuditLogPostgresRepositoryPersistenceError",
          operation: "insertAuditEvent",
          cause: new Error("audit log unavailable"),
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.listRepairGaps}`, {
          method: "GET",
          headers: {
            [subscriberJourneySessionHeaderName]: "sess_admin_repair_gaps",
          },
        }),
      ),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "A backend dependency request failed.",
    });
  });

  it("returns 502 when delegated authorization fails during repair-gap inspection", async () => {
    const handler = createTestHandler({
      listBillingRepairGaps: () =>
        Effect.fail({
          _tag: "AuthorizationDelegatedCheckError",
          reason: "Failed to evaluate persisted authorization relation.",
          cause: new Error("keto unavailable"),
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.listRepairGaps}`, {
          method: "GET",
          headers: {
            [subscriberJourneySessionHeaderName]: "sess_admin_repair_gaps",
          },
        }),
      ),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "A backend dependency request failed.",
    });
  });

  it("returns 500 when repair-gap projection configuration is missing", async () => {
    const handler = createTestHandler({
      listBillingRepairGaps: () =>
        Effect.fail({
          _tag: "AdminBillingProjectionConfigurationError",
          moduleId: platformModuleId.workflowJobs,
          profile: projectionProfile.admin,
          reason:
            "The workflow-jobs admin projection must be declared before repair-gap inspection can run.",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.listRepairGaps}`, {
          method: "GET",
          headers: {
            [subscriberJourneySessionHeaderName]: "sess_missing_projection",
          },
        }),
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Admin billing request failed.",
    });
  });

  it("returns a repair-gap-specific 403 when gap inspection is not authorized", async () => {
    const handler = createTestHandler({
      listBillingRepairGaps: () =>
        Effect.fail({
          _tag: "ManagedBillingPlanAccessDeniedError",
          reason: "No matching authorization tuple was found.",
          auditRequired: true,
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.listRepairGaps}`, {
          method: "GET",
          headers: {
            [subscriberJourneySessionHeaderName]: "sess_denied_repair_gaps",
          },
        }),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Billing repair gap inspection is not allowed for this session.",
    });
  });

  it("requires an explicit session header for admin repair-gap inspection", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.listRepairGaps}`, {
          method: "GET",
          headers: {
            cookie: "comvestec_session=sess_cookie_only",
          },
        }),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authenticated operator session is required.",
    });
  });

  it("cancels billing repair gaps through the admin HTTP surface", async () => {
    let capturedInput:
      | Parameters<AdminBillingService["cancelBillingRepairGap"]>[0]
      | undefined;
    const handler = createTestHandler({
      cancelBillingRepairGap: (input) => {
        capturedInput = input;

        return Effect.succeed({
          job: {
            jobId: input.jobId,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_gap",
            status: workflowJobStatus.canceled,
            attempts: 2,
            scheduledAt: "2026-04-20T09:00:00.000Z",
            completedAt: "2026-04-20T09:01:00.000Z",
          },
        });
      },
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.cancelRepairGap}`, {
          method: "POST",
          headers: {
            Authorization: "Bearer id-token-value",
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_repair_gap_cancel",
          },
          body: JSON.stringify({
            jobId: "workflow-jobs:billing-repair:org_gap",
            inspectionReason: "Investigate canceled tenant repair failures",
          }),
        }),
      ),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload).toEqual({
      job: expect.objectContaining({
        jobId: "workflow-jobs:billing-repair:org_gap",
        status: workflowJobStatus.canceled,
        attempts: 2,
      }),
    });
    expect(payload.job).not.toHaveProperty("lastError");
    expect(capturedInput).toEqual({
      sessionId: "sess_repair_gap_cancel",
      convexAuthToken: "id-token-value",
      jobId: "workflow-jobs:billing-repair:org_gap",
      inspectionReason: "Investigate canceled tenant repair failures",
    });
  });

  it("returns 404 when the requested repair gap cancellation target does not exist", async () => {
    const handler = createTestHandler({
      cancelBillingRepairGap: (input) =>
        Effect.fail({
          _tag: "AdminBillingRepairGapNotFoundError",
          jobId: input.jobId,
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.cancelRepairGap}`, {
          method: "POST",
          headers: {
            Authorization: "Bearer id-token-value",
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]:
              "sess_repair_gap_cancel_missing",
          },
          body: JSON.stringify({
            jobId: "workflow-jobs:billing-repair:missing",
          }),
        }),
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Requested billing repair gap was not found.",
    });
  });

  it("returns 409 when a repair gap is no longer eligible for cancellation", async () => {
    const handler = createTestHandler({
      cancelBillingRepairGap: (input) =>
        Effect.fail({
          _tag: "AdminBillingRepairGapCancelUnavailableError",
          jobId: input.jobId,
          status: workflowJobStatus.completed,
          reason:
            "Only unresolved scheduled, blocked, or stale running billing repair gaps can be canceled.",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.cancelRepairGap}`, {
          method: "POST",
          headers: {
            Authorization: "Bearer id-token-value",
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]:
              "sess_repair_gap_cancel_completed",
          },
          body: JSON.stringify({
            jobId: "workflow-jobs:billing-repair:completed",
          }),
        }),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Billing repair gap is no longer eligible for cancellation.",
    });
  });

  it("requires an explicit session header for admin repair-gap cancellation", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.cancelRepairGap}`, {
          method: "POST",
          headers: {
            Authorization: "Bearer id-token-value",
            "Content-Type": "application/json",
            cookie: "comvestec_session=sess_cookie_only",
          },
          body: JSON.stringify({
            jobId: "workflow-jobs:billing-repair:org_gap",
            inspectionReason: "Investigate replayed tenant repair failures",
          }),
        }),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authenticated operator session is required.",
    });
  });

  it("requires a bearer token for admin repair-gap cancellation", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.cancelRepairGap}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [subscriberJourneySessionHeaderName]: "sess_repair_gap_cancel",
          },
          body: JSON.stringify({
            jobId: "workflow-jobs:billing-repair:org_gap",
            inspectionReason: "Investigate replayed tenant repair failures",
          }),
        }),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Keycloak bearer token is required.",
    });
  });

  it("replays billing repair gaps through the admin HTTP surface", async () => {
    let capturedInput:
      | Parameters<AdminBillingService["replayBillingRepairGap"]>[0]
      | undefined;
    const handler = createTestHandler({
      replayBillingRepairGap: (input) => {
        capturedInput = input;

        return Effect.succeed({
          job: {
            jobId: input.jobId,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_gap",
            status: workflowJobStatus.completed,
            attempts: 2,
            scheduledAt: "2026-04-20T09:00:00.000Z",
            completedAt: "2026-04-20T09:01:00.000Z",
            lastError:
              "Previous replay attempt could not resolve the customer account mapping.",
          },
        });
      },
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.replayRepairGap}`, {
          method: "POST",
          headers: {
            Authorization: "Bearer id-token-value",
            "Content-Type": "application/json",
            "x-comvestec-session-id": "sess_repair_gap_replay",
          },
          body: JSON.stringify({
            jobId: "workflow-jobs:billing-repair:org_gap",
            inspectionReason: "Investigate replayed tenant repair failures",
          }),
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      job: expect.objectContaining({
        jobId: "workflow-jobs:billing-repair:org_gap",
        status: workflowJobStatus.completed,
        attempts: 2,
        lastError:
          "Previous replay attempt could not resolve the customer account mapping.",
      }),
    });
    expect(capturedInput).toEqual({
      sessionId: "sess_repair_gap_replay",
      convexAuthToken: "id-token-value",
      jobId: "workflow-jobs:billing-repair:org_gap",
      inspectionReason: "Investigate replayed tenant repair failures",
    });
  });

  it("accepts lowercase bearer auth schemes for repair-gap replay", async () => {
    let capturedInput:
      | Parameters<AdminBillingService["replayBillingRepairGap"]>[0]
      | undefined;
    const handler = createTestHandler({
      replayBillingRepairGap: (input) => {
        capturedInput = input;

        return Effect.succeed({
          job: {
            jobId: input.jobId,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_gap",
            status: workflowJobStatus.completed,
            attempts: 2,
            scheduledAt: "2026-04-20T09:00:00.000Z",
            completedAt: "2026-04-20T09:01:00.000Z",
          },
        });
      },
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.replayRepairGap}`, {
          method: "POST",
          headers: {
            Authorization: "bearer id-token-value",
            "Content-Type": "application/json",
            "x-comvestec-session-id": "sess_repair_gap_replay_lowercase",
          },
          body: JSON.stringify({
            jobId: "workflow-jobs:billing-repair:org_gap",
            inspectionReason: "Investigate replayed tenant repair failures",
          }),
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(capturedInput).toEqual({
      sessionId: "sess_repair_gap_replay_lowercase",
      convexAuthToken: "id-token-value",
      jobId: "workflow-jobs:billing-repair:org_gap",
      inspectionReason: "Investigate replayed tenant repair failures",
    });
  });

  it("returns 404 when the requested repair gap replay target does not exist", async () => {
    const handler = createTestHandler({
      replayBillingRepairGap: (input) =>
        Effect.fail({
          _tag: "AdminBillingRepairGapNotFoundError",
          jobId: input.jobId,
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.replayRepairGap}`, {
          method: "POST",
          headers: {
            Authorization: "Bearer id-token-value",
            "Content-Type": "application/json",
            "x-comvestec-session-id": "sess_repair_gap_replay_missing",
          },
          body: JSON.stringify({
            jobId: "workflow-jobs:billing-repair:missing",
          }),
        }),
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Requested billing repair gap was not found.",
    });
  });

  it("returns 409 when a repair gap is no longer eligible for replay", async () => {
    const handler = createTestHandler({
      replayBillingRepairGap: (input) =>
        Effect.fail({
          _tag: "AdminBillingRepairGapReplayUnavailableError",
          jobId: input.jobId,
          status: workflowJobStatus.completed,
          reason:
            "Only unresolved scheduled, blocked, or stale running billing repair gaps can be replayed.",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.replayRepairGap}`, {
          method: "POST",
          headers: {
            Authorization: "Bearer id-token-value",
            "Content-Type": "application/json",
            "x-comvestec-session-id": "sess_repair_gap_replay_completed",
          },
          body: JSON.stringify({
            jobId: "workflow-jobs:billing-repair:completed",
          }),
        }),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Billing repair gap is no longer eligible for replay.",
    });
  });

  it("returns 401 when repair-gap replay is missing the Convex auth token", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.replayRepairGap}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-comvestec-session-id": "sess_repair_gap_replay_missing_token",
          },
          body: JSON.stringify({
            jobId: "workflow-jobs:billing-repair:org_gap",
          }),
        }),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Keycloak bearer token is required.",
    });
  });

  it("requires an explicit session header for authenticated admin repair replays", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.replayRepairGap}`, {
          method: "POST",
          headers: {
            Authorization: "Bearer id-token-value",
            "Content-Type": "application/json",
            cookie: "comvestec_session=sess_cookie_only",
          },
          body: JSON.stringify({
            jobId: "workflow-jobs:billing-repair:org_gap",
          }),
        }),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authenticated operator session is required.",
    });
  });

  it("returns 403 when repair-gap replay is not authorized", async () => {
    const handler = createTestHandler({
      replayBillingRepairGap: () =>
        Effect.fail({
          _tag: "ManagedBillingPlanAccessDeniedError",
          reason: "No matching authorization tuple was found.",
          auditRequired: false,
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.replayRepairGap}`, {
          method: "POST",
          headers: {
            Authorization: "Bearer id-token-value",
            "Content-Type": "application/json",
            "x-comvestec-session-id": "sess_repair_gap_replay_denied",
          },
          body: JSON.stringify({
            jobId: "workflow-jobs:billing-repair:org_gap",
          }),
        }),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Billing repair replay is not allowed for this session.",
    });
  });

  it("returns 403 when repair-gap replay token provenance does not match the operator session", async () => {
    const handler = createTestHandler({
      replayBillingRepairGap: () =>
        Effect.fail({
          _tag: "AdminBillingWorkflowExecutionIdentityMismatchError",
          reason:
            "The Convex bearer token subject must match the authenticated platform-operator session actor.",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.replayRepairGap}`, {
          method: "POST",
          headers: {
            Authorization: "Bearer id-token-value",
            "Content-Type": "application/json",
            "x-comvestec-session-id":
              "sess_repair_gap_replay_identity_mismatch",
          },
          body: JSON.stringify({
            jobId: "workflow-jobs:billing-repair:org_gap",
          }),
        }),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Operator identity and Convex token provenance did not match.",
    });
  });

  it("returns 401 when Convex rejects the replay bearer token", async () => {
    const handler = createTestHandler({
      replayBillingRepairGap: () =>
        Effect.fail({
          _tag: "ConvexAdapterRequestError",
          operation: "runBillingConvergenceJob",
          cause: new Error("Unauthorized"),
          status: 401,
          body: "Unauthorized",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.replayRepairGap}`, {
          method: "POST",
          headers: {
            Authorization: "Bearer id-token-value",
            "Content-Type": "application/json",
            "x-comvestec-session-id": "sess_repair_gap_replay_convex_401",
          },
          body: JSON.stringify({
            jobId: "workflow-jobs:billing-repair:org_gap",
          }),
        }),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Keycloak bearer token is no longer valid for Convex execution.",
    });
  });

  it("returns route-specific Allow headers for unsupported admin billing methods", async () => {
    const handler = createTestHandler({});

    const plansResponse = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminBillingApiPath.createManagedPlan}`,
          {
            method: "GET",
          },
        ),
      ),
    );
    const repairGapsResponse = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.listRepairGaps}`, {
          method: "POST",
        }),
      ),
    );
    const inspectionResponse = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminBillingApiPath.inspectBillingState}`,
          {
            method: "GET",
          },
        ),
      ),
    );
    const replayResponse = await Effect.runPromise(
      handler(
        new Request(`http://localhost${adminBillingApiPath.replayRepairGap}`, {
          method: "GET",
        }),
      ),
    );

    expect(plansResponse.status).toBe(405);
    expect(plansResponse.headers.get("Allow")).toBe("POST");
    await expect(plansResponse.json()).resolves.toEqual({
      error: "Method not allowed.",
    });

    expect(repairGapsResponse.status).toBe(405);
    expect(repairGapsResponse.headers.get("Allow")).toBe("GET");
    await expect(repairGapsResponse.json()).resolves.toEqual({
      error: "Method not allowed.",
    });

    expect(inspectionResponse.status).toBe(405);
    expect(inspectionResponse.headers.get("Allow")).toBe("POST");
    await expect(inspectionResponse.json()).resolves.toEqual({
      error: "Method not allowed.",
    });

    expect(replayResponse.status).toBe(405);
    expect(replayResponse.headers.get("Allow")).toBe("POST");
    await expect(replayResponse.json()).resolves.toEqual({
      error: "Method not allowed.",
    });
  });

  it("runs manual billing reconciliation through the admin HTTP surface", async () => {
    let capturedInput:
      | Parameters<AdminBillingService["runManualBillingReconciliation"]>[0]
      | undefined;
    const handler = createTestHandler({
      runManualBillingReconciliation: (input) => {
        capturedInput = input;

        return Effect.succeed({
          jobs: [],
        });
      },
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminBillingApiPath.runManualReconciliation}`,
          {
            method: "POST",
            headers: {
              Authorization: "Bearer id-token-value",
              "Content-Type": "application/json",
              "x-comvestec-session-id": "sess_manual_reconciliation",
            },
            body: JSON.stringify({
              now: "2026-04-19T12:00:00.000Z",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ jobs: [] });
    expect(capturedInput).toEqual({
      sessionId: "sess_manual_reconciliation",
      convexAuthToken: "id-token-value",
      now: "2026-04-19T12:00:00.000Z",
    });
  });

  it("returns 400 when manual reconciliation now is not an ISO timestamp", async () => {
    const handler = createTestHandler({
      runManualBillingReconciliation: () =>
        Effect.die(new Error("Expected request parsing to fail first.")),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminBillingApiPath.runManualReconciliation}`,
          {
            method: "POST",
            headers: {
              Authorization: "Bearer id-token-value",
              "Content-Type": "application/json",
              "x-comvestec-session-id": "sess_manual_reconciliation",
            },
            body: JSON.stringify({
              now: "not-a-timestamp",
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

  it("returns 400 when manual reconciliation now is parseable but not ISO-shaped", async () => {
    const handler = createTestHandler({
      runManualBillingReconciliation: () =>
        Effect.die(new Error("Expected request parsing to fail first.")),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminBillingApiPath.runManualReconciliation}`,
          {
            method: "POST",
            headers: {
              Authorization: "Bearer id-token-value",
              "Content-Type": "application/json",
              "x-comvestec-session-id": "sess_manual_reconciliation",
            },
            body: JSON.stringify({
              now: "Tue, 19 Apr 2026 12:00:00 GMT",
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

  it("returns 400 when manual reconciliation now has an impossible ISO calendar date", async () => {
    const handler = createTestHandler({
      runManualBillingReconciliation: () =>
        Effect.die(new Error("Expected request parsing to fail first.")),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminBillingApiPath.runManualReconciliation}`,
          {
            method: "POST",
            headers: {
              Authorization: "Bearer id-token-value",
              "Content-Type": "application/json",
              "x-comvestec-session-id": "sess_manual_reconciliation",
            },
            body: JSON.stringify({
              now: "2026-02-31T12:00:00.000Z",
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

  it("returns 401 when manual reconciliation is missing the Convex auth token", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminBillingApiPath.runManualReconciliation}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-comvestec-session-id": "sess_manual_reconciliation",
            },
            body: JSON.stringify({}),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Keycloak bearer token is required.",
    });
  });

  it("requires an explicit session header for manual reconciliation", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminBillingApiPath.runManualReconciliation}`,
          {
            method: "POST",
            headers: {
              Authorization: "Bearer id-token-value",
              "Content-Type": "application/json",
              cookie: "comvestec_session=sess_cookie_only",
            },
            body: JSON.stringify({}),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authenticated operator session is required.",
    });
  });

  it("returns 403 when manual reconciliation token provenance does not match the operator session", async () => {
    const handler = createTestHandler({
      runManualBillingReconciliation: () =>
        Effect.fail({
          _tag: "AdminBillingWorkflowExecutionIdentityMismatchError",
          reason:
            "The Convex bearer token subject must match the authenticated platform-operator session actor.",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminBillingApiPath.runManualReconciliation}`,
          {
            method: "POST",
            headers: {
              Authorization: "Bearer id-token-value",
              "Content-Type": "application/json",
              "x-comvestec-session-id": "sess_manual_reconciliation",
            },
            body: JSON.stringify({}),
          },
        ),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Operator identity and Convex token provenance did not match.",
    });
  });

  it("returns 401 when Convex rejects the operator bearer token", async () => {
    const handler = createTestHandler({
      runManualBillingReconciliation: () =>
        Effect.fail({
          _tag: "ConvexAdapterRequestError",
          operation: "runDueBillingConvergenceJobs",
          cause: new Error("Unauthorized"),
          status: 401,
          body: "Unauthorized",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminBillingApiPath.runManualReconciliation}`,
          {
            method: "POST",
            headers: {
              Authorization: "Bearer id-token-value",
              "Content-Type": "application/json",
              "x-comvestec-session-id": "sess_manual_reconciliation",
            },
            body: JSON.stringify({}),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Keycloak bearer token is no longer valid for Convex execution.",
    });
  });

  it("lists unresolved billing repair gaps through the admin HTTP surface", async () => {
    const listBillingRepairGaps = vi.fn(() =>
      Effect.succeed({
        jobs: [
          {
            jobId: "workflow-jobs:billing-repair:org_gap",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_gap",
            status: workflowJobStatus.scheduled,
            attempts: 1,
            scheduledAt: new Date().toISOString(),
            gapReason: workflowJobGapReason.missingSubscriptionState,
            lastError: "Missing billing webhook receipt payload.",
          },
        ],
      }),
    );
    const handler = createTestHandler({
      listBillingRepairGaps,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminBillingApiPath.listRepairGaps}?inspectionReason=${encodeURIComponent(
            "Investigate unresolved org repair failures",
          )}`,
          {
            method: "GET",
            headers: {
              [subscriberJourneySessionHeaderName]: "sess_admin_repair_gaps",
            },
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobs: [
        expect.objectContaining({
          jobId: "workflow-jobs:billing-repair:org_gap",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_gap",
          status: workflowJobStatus.scheduled,
          attempts: 1,
          gapReason: workflowJobGapReason.missingSubscriptionState,
          lastError: "Missing billing webhook receipt payload.",
        }),
      ],
    });
    expect(listBillingRepairGaps).toHaveBeenCalledWith({
      sessionId: "sess_admin_repair_gaps",
      inspectionReason: "Investigate unresolved org repair failures",
    });
  });
});
