import { Effect } from "effect";
import {
  actorType,
  adminOperatorCapability,
  adminRoutePath,
  platformScope,
  workflowJobGapReason,
  workflowJobStatus,
  type BillingRepairGapListResult,
  type BillingRepairGapCancelResult,
  type BillingRepairGapReplayResult,
} from "@comvestec/contracts";
import { subscriberJourneySessionCookieName } from "@comvestec/platform";
import {
  createCancelAdminTenantRepairGap,
  createGetAdminTenantRepairData,
  createReplayAdminTenantRepairGap,
} from "../../apps/admin-app/src/lib/tenant-repair-route-server";
import { loadAdminTenantRepairRouteDataFromRequest } from "../../apps/admin-app/src/lib/tenant-repair-route-data";
import { createTanstackStartTestServerRuntime } from "../tanstack-start-test-runtime";

const operationsSummary = {
  capabilities: {
    actorType: actorType.platformOperator,
    actorId: "usr_platform_operator",
    sessionId: "sess_admin_ready",
    capabilities: [
      {
        capability: adminOperatorCapability.operationsHome,
        routePath: adminRoutePath.operationsHome,
        visible: true,
        allowed: true,
        label: "Operations Home",
        actionPolicyIds: [],
      },
      {
        capability: adminOperatorCapability.repairOperations,
        routePath: adminRoutePath.repairOperations,
        visible: true,
        allowed: true,
        label: "Repair Operations",
        actionPolicyIds: [],
      },
    ],
  },
  posture: {
    openRepairGaps: 1,
    blockedRepairGaps: 1,
    scheduledRepairGaps: 0,
    staleRunningRepairGaps: 0,
    openSupportCases: 0,
    escalatedSupportCases: 0,
    activeImpersonationSessions: 0,
    revocationPendingImpersonationSessions: 0,
    pendingBreakGlassIncidents: 0,
    pendingRuntimeConfigProposals: 0,
    pendingBrandingProposals: 0,
  },
  alerts: [],
  recentActivity: {
    pageInfo: {
      page: {
        page: 1,
        pageSize: 5,
      },
      totalItems: 0,
      totalPages: 0,
      exportMode: false,
    },
    items: [],
  },
} as const;

describe("admin tenant repair route data", () => {
  it("falls back to the shell when the operator session transport is missing", async () => {
    const listBillingRepairGaps = vi.fn(() => {
      throw new Error(
        "Expected the repair-gap helper not to run without a session cookie.",
      );
    });

    await expect(
      Effect.runPromise(
        loadAdminTenantRepairRouteDataFromRequest(
          new Request("http://localhost:3001/"),
          {},
          () => Effect.succeed(operationsSummary),
          listBillingRepairGaps,
        ),
      ),
    ).resolves.toEqual({ kind: "shell" });

    expect(listBillingRepairGaps).not.toHaveBeenCalled();
  });

  it("reports stale-session state when the session id no longer resolves", async () => {
    await expect(
      Effect.runPromise(
        loadAdminTenantRepairRouteDataFromRequest(
          new Request("http://localhost:3001/", {
            headers: {
              cookie: `${subscriberJourneySessionCookieName}=sess_admin_stale`,
            },
          }),
          {},
          () =>
            Effect.fail({
              _tag: "AdminGovernanceRequestContextNotFoundError",
              sessionId: "sess_admin_stale",
            } as const),
          () =>
            Effect.fail({
              _tag: "IdentitySessionRequestContextNotFoundError",
              sessionId: "sess_admin_stale",
            } as const),
        ),
      ),
    ).resolves.toEqual({ kind: "stale-session" });
  });

  it("reports denied state when the platform-operator authorization check fails", async () => {
    await expect(
      Effect.runPromise(
        loadAdminTenantRepairRouteDataFromRequest(
          new Request("http://localhost:3001/", {
            headers: {
              cookie: `${subscriberJourneySessionCookieName}=sess_admin_denied`,
            },
          }),
          {},
          () =>
            Effect.succeed({
              ...operationsSummary,
              capabilities: {
                ...operationsSummary.capabilities,
                capabilities: [
                  {
                    capability: adminOperatorCapability.operationsHome,
                    routePath: adminRoutePath.operationsHome,
                    visible: false,
                    allowed: false,
                    label: "Operations Home",
                    reason: "Denied by trusted operator capability resolution.",
                    actionPolicyIds: [],
                  },
                ],
              },
            }),
          () =>
            Effect.fail({
              _tag: "ManagedBillingPlanAccessDeniedError",
              reason:
                "Admin billing operations require a platform-operator session scoped to the platform tenant.",
              auditRequired: false,
            } as const),
        ),
      ),
    ).resolves.toEqual({
      kind: "denied",
      reason: "Denied by trusted operator capability resolution.",
    });
  });

  it("returns tenant repair gaps when the shared helper succeeds", async () => {
    const result = {
      jobs: [
        {
          jobId: "workflow-jobs:billing-repair:organization:org_admin_repair",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_admin_repair",
          status: workflowJobStatus.blocked,
          attempts: 2,
          scheduledAt: "2026-04-20T08:30:00.000Z",
          completedAt: "2026-04-20T08:31:00.000Z",
          gapReason: workflowJobGapReason.missingOnboarding,
          lastError: "Provisioning never completed.",
        },
      ],
    } satisfies BillingRepairGapListResult;

    await expect(
      Effect.runPromise(
        loadAdminTenantRepairRouteDataFromRequest(
          new Request("http://localhost:3001/", {
            headers: {
              cookie: `${subscriberJourneySessionCookieName}=sess_admin_ready`,
            },
          }),
          {},
          () => Effect.succeed(operationsSummary),
          () => Effect.succeed(result),
        ),
      ),
    ).resolves.toEqual({
      kind: "ready",
      summary: operationsSummary,
      jobs: result.jobs,
    });
  });

  it("forwards an inspection reason to the shared helper when the route requests failure details", async () => {
    let capturedInput:
      | {
          readonly sessionId: string;
          readonly inspectionReason?: string;
        }
      | undefined;

    await expect(
      Effect.runPromise(
        loadAdminTenantRepairRouteDataFromRequest(
          new Request("http://localhost:3001/", {
            headers: {
              cookie: `${subscriberJourneySessionCookieName}=sess_admin_reasoned`,
            },
          }),
          {},
          () => Effect.succeed(operationsSummary),
          (_environment, input) => {
            capturedInput = input;

            return Effect.succeed({ jobs: [] });
          },
          { inspectionReason: "Investigate org onboarding repair failures" },
        ),
      ),
    ).resolves.toEqual({
      kind: "ready",
      summary: operationsSummary,
      jobs: [],
    });

    expect(capturedInput).toEqual({
      sessionId: "sess_admin_reasoned",
      inspectionReason: "Investigate org onboarding repair failures",
    });
  });
});

describe("admin tenant repair route server boundary", () => {
  it("passes the TanStack Start server request through middleware before loading repair gaps", async () => {
    const environment = { ADMIN_APP_ENV: "test" };
    const serverRuntime = createTanstackStartTestServerRuntime(
      "http://localhost:3001/",
    );
    let capturedRequest: Request | undefined;
    let capturedEnvironment: unknown;
    const getAdminTenantRepairData = createGetAdminTenantRepairData(
      (request, currentEnvironment) => {
        capturedRequest = request;
        capturedEnvironment = currentEnvironment;

        return Effect.succeed({ kind: "shell" } as const);
      },
      environment,
      serverRuntime,
    );

    await expect(
      getAdminTenantRepairData.__executeServer({
        method: "GET",
        data: {
          inspectionReason: "Investigate tenant onboarding repair failures",
        },
        headers: {
          cookie: `${subscriberJourneySessionCookieName}=sess_admin_boundary`,
          "x-admin-home": "server-boundary",
        },
      }),
    ).resolves.toEqual({ kind: "shell" });

    expect(capturedEnvironment).toBe(environment);
    expect(capturedRequest).toBeInstanceOf(Request);
    expect(capturedRequest?.method).toBe("GET");
    expect(capturedRequest?.headers.get("cookie")).toBe(
      `${subscriberJourneySessionCookieName}=sess_admin_boundary`,
    );
    expect(capturedRequest?.headers.get("x-admin-home")).toBe(
      "server-boundary",
    );
  });

  it("extracts the request-backed session and forwards replay input to the shared helper", async () => {
    const environment = { ADMIN_APP_ENV: "test" };
    const serverRuntime = createTanstackStartTestServerRuntime(
      "http://localhost:3001/",
    );
    let capturedInput:
      | {
          readonly sessionId: string;
          readonly convexAuthToken: string;
          readonly jobId: string;
          readonly inspectionReason?: string;
        }
      | undefined;
    let capturedEnvironment: unknown;
    let capturedWorkflowExecutionSessionId: string | undefined;
    const replayAdminTenantRepairGap = createReplayAdminTenantRepairGap(
      (currentEnvironment, input) => {
        capturedEnvironment = currentEnvironment;
        capturedInput = input;

        return Effect.succeed({
          job: {
            jobId: input.jobId,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_admin_replay",
            status: workflowJobStatus.scheduled,
            attempts: 3,
            scheduledAt: "2026-04-20T08:45:00.000Z",
            gapReason: workflowJobGapReason.missingProvisioning,
          },
        } satisfies BillingRepairGapReplayResult);
      },
      environment,
      serverRuntime,
      (_, input) => {
        capturedWorkflowExecutionSessionId = input.sessionId;
        return Effect.succeed({
          convexAuthToken: "workflow-token-1",
        });
      },
    );

    await expect(
      replayAdminTenantRepairGap.__executeServer({
        method: "POST",
        data: {
          jobId: "workflow-jobs:billing-repair:organization:org_admin_replay",
          inspectionReason: "Investigate replayed tenant repair failures",
        },
        headers: {
          cookie: `${subscriberJourneySessionCookieName}=sess_admin_replay`,
        },
      }),
    ).resolves.toMatchObject({
      job: {
        tenantScopeId: "org_admin_replay",
      },
    });

    expect(capturedEnvironment).toBe(environment);
    expect(capturedWorkflowExecutionSessionId).toBe("sess_admin_replay");
    expect(capturedInput).toEqual({
      sessionId: "sess_admin_replay",
      convexAuthToken: "workflow-token-1",
      jobId: "workflow-jobs:billing-repair:organization:org_admin_replay",
      inspectionReason: "Investigate replayed tenant repair failures",
    });
  });

  it("extracts the request-backed session and forwards cancel input to the shared helper", async () => {
    const environment = { ADMIN_APP_ENV: "test" };
    const serverRuntime = createTanstackStartTestServerRuntime(
      "http://localhost:3001/",
    );
    let capturedInput:
      | {
          readonly sessionId: string;
          readonly convexAuthToken: string;
          readonly jobId: string;
          readonly inspectionReason?: string;
        }
      | undefined;
    let capturedEnvironment: unknown;
    let capturedWorkflowExecutionSessionId: string | undefined;
    const cancelAdminTenantRepairGap = createCancelAdminTenantRepairGap(
      (currentEnvironment, input) => {
        capturedEnvironment = currentEnvironment;
        capturedInput = input;

        return Effect.succeed({
          job: {
            jobId: input.jobId,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_admin_cancel",
            status: workflowJobStatus.canceled,
            attempts: 2,
            scheduledAt: "2026-04-20T08:45:00.000Z",
            completedAt: "2026-04-20T08:46:00.000Z",
            gapReason: workflowJobGapReason.missingOnboarding,
          },
        } satisfies BillingRepairGapCancelResult);
      },
      environment,
      serverRuntime,
      (_, input) => {
        capturedWorkflowExecutionSessionId = input.sessionId;
        return Effect.succeed({
          convexAuthToken: "workflow-token-2",
        });
      },
    );

    await expect(
      cancelAdminTenantRepairGap.__executeServer({
        method: "POST",
        data: {
          jobId: "workflow-jobs:billing-repair:organization:org_admin_cancel",
          inspectionReason: "Investigate canceled tenant repair failures",
        },
        headers: {
          cookie: `${subscriberJourneySessionCookieName}=sess_admin_cancel`,
        },
      }),
    ).resolves.toMatchObject({
      job: {
        tenantScopeId: "org_admin_cancel",
      },
    });

    expect(capturedEnvironment).toBe(environment);
    expect(capturedWorkflowExecutionSessionId).toBe("sess_admin_cancel");
    expect(capturedInput).toEqual({
      sessionId: "sess_admin_cancel",
      convexAuthToken: "workflow-token-2",
      jobId: "workflow-jobs:billing-repair:organization:org_admin_cancel",
      inspectionReason: "Investigate canceled tenant repair failures",
    });
  });
});
