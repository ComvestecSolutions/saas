import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  adminOperatorCapability,
  adminRoutePath,
  platformScope,
  platformModuleId,
  projectionProfile,
  supportOperationsCasePriority,
  supportOperationsCaseStatus,
  workflowJobStatus,
} from "@comvestec/contracts";
import { subscriberJourneySessionCookieName } from "@comvestec/platform";
import { loadAdminTenantWorkspaceIndexRouteDataFromRequest } from "../../apps/admin-app/src/lib/tenant-workspace-index-route-data";

const capabilitySnapshot = {
  actorType: actorType.platformOperator,
  actorId: "usr_platform_operator",
  sessionId: "sess_admin_discovery",
  capabilities: [
    {
      capability: adminOperatorCapability.tenantWorkspace,
      routePath: adminRoutePath.tenantWorkspaceDiscovery,
      visible: true,
      allowed: true,
      label: "Tenant workspace",
      actionPolicyIds: [],
    },
  ],
} as const;

describe("tenant workspace discovery route data", () => {
  it("returns denied when the operator cannot access tenant workspace discovery", async () => {
    await expect(
      Effect.runPromise(
        loadAdminTenantWorkspaceIndexRouteDataFromRequest(
          new Request("http://localhost:3004/tenants", {
            headers: {
              cookie: `${subscriberJourneySessionCookieName}=sess_admin_discovery_denied`,
            },
          }),
          {},
          () =>
            Effect.succeed({
              ...capabilitySnapshot,
              capabilities: [
                {
                  ...capabilitySnapshot.capabilities[0],
                  allowed: false,
                  reason: "Tenant workspace access is disabled.",
                },
              ],
            }),
        ),
      ),
    ).resolves.toEqual({
      kind: "denied",
      reason: "Tenant workspace access is disabled.",
    });
  });

  it("deduplicates live tenant targets from support and repair signals", async () => {
    const result = await Effect.runPromise(
      loadAdminTenantWorkspaceIndexRouteDataFromRequest(
        new Request("http://localhost:3004/tenants", {
          headers: {
            cookie: `${subscriberJourneySessionCookieName}=sess_admin_discovery`,
          },
        }),
        {},
        () => Effect.succeed(capabilitySnapshot),
        () =>
          Effect.succeed([
            {
              caseId: "case_support_ent",
              supportAgent: "usr_support_operator",
              tenantScope: platformScope.enterprise,
              tenantScopeId: "ent_demo",
              summary: "Escalated enterprise onboarding issue",
              status: supportOperationsCaseStatus.open,
              priority: supportOperationsCasePriority.high,
              startedAt: "2026-05-12T10:00:00.000Z",
              lastUpdatedAt: "2026-05-12T10:30:00.000Z",
            },
            {
              caseId: "case_support_org",
              supportAgent: "usr_support_operator",
              tenantScope: platformScope.organization,
              tenantScopeId: "org_demo",
              summary: "Org billing follow-up",
              status: supportOperationsCaseStatus.open,
              priority: supportOperationsCasePriority.normal,
              startedAt: "2026-05-12T09:00:00.000Z",
              lastUpdatedAt: "2026-05-12T09:15:00.000Z",
            },
          ]),
        () =>
          Effect.succeed({
            jobs: [
              {
                jobId: "workflow-jobs:billing-repair:enterprise:ent_demo",
                tenantScope: platformScope.enterprise,
                tenantScopeId: "ent_demo",
                status: workflowJobStatus.blocked,
                attempts: 2,
                scheduledAt: "2026-05-12T11:00:00.000Z",
              },
            ],
          }),
      ),
    );

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") {
      throw new TypeError("Expected ready tenant discovery data.");
    }

    expect(result.targets).toHaveLength(2);
    const [firstTarget, secondTarget] = result.targets;

    if (firstTarget === undefined || secondTarget === undefined) {
      throw new TypeError("Expected discovery targets to include two entries.");
    }

    expect(firstTarget).toMatchObject({
      target: {
        scope: platformScope.enterprise,
        scopeId: "ent_demo",
      },
      lastTouchedAt: "2026-05-12T11:00:00.000Z",
    });
    expect(firstTarget.signals).toEqual([
      {
        signalId: "workflow-jobs:billing-repair:enterprise:ent_demo",
        kind: "repair-gap",
        status: workflowJobStatus.blocked,
        detail: "Tenant repair workflow currently needs operator attention.",
        timestamp: "2026-05-12T11:00:00.000Z",
      },
      {
        signalId: "case_support_ent",
        kind: "support-case",
        status: supportOperationsCaseStatus.open,
        detail: "Escalated enterprise onboarding issue",
        timestamp: "2026-05-12T10:30:00.000Z",
      },
    ]);
    expect(secondTarget).toMatchObject({
      target: {
        scope: platformScope.organization,
        scopeId: "org_demo",
      },
      lastTouchedAt: "2026-05-12T09:15:00.000Z",
    });
  });

  it("preserves distinct signal ids when repair gaps share the same detail and timestamp", async () => {
    const result = await Effect.runPromise(
      loadAdminTenantWorkspaceIndexRouteDataFromRequest(
        new Request("http://localhost:3004/tenants", {
          headers: {
            cookie: `${subscriberJourneySessionCookieName}=sess_admin_discovery_duplicate_signals`,
          },
        }),
        {},
        () => Effect.succeed(capabilitySnapshot),
        () => Effect.succeed([]),
        () =>
          Effect.succeed({
            jobs: [
              {
                jobId: "workflow-jobs:billing-repair:organization:org_demo:1",
                tenantScope: platformScope.organization,
                tenantScopeId: "org_demo",
                gapReason: "missing-subscription-state",
                status: workflowJobStatus.blocked,
                attempts: 1,
                scheduledAt: "2026-05-13T09:15:00.000Z",
              },
              {
                jobId: "workflow-jobs:billing-repair:organization:org_demo:2",
                tenantScope: platformScope.organization,
                tenantScopeId: "org_demo",
                gapReason: "missing-subscription-state",
                status: workflowJobStatus.blocked,
                attempts: 2,
                scheduledAt: "2026-05-13T09:15:00.000Z",
              },
            ],
          }),
      ),
    );

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") {
      throw new TypeError("Expected ready tenant discovery data.");
    }

    const [target] = result.targets;

    if (target === undefined) {
      throw new TypeError("Expected a tenant discovery target.");
    }

    expect(target.signals).toEqual([
      {
        signalId: "workflow-jobs:billing-repair:organization:org_demo:1",
        kind: "repair-gap",
        status: workflowJobStatus.blocked,
        detail: "missing-subscription-state",
        timestamp: "2026-05-13T09:15:00.000Z",
      },
      {
        signalId: "workflow-jobs:billing-repair:organization:org_demo:2",
        kind: "repair-gap",
        status: workflowJobStatus.blocked,
        detail: "missing-subscription-state",
        timestamp: "2026-05-13T09:15:00.000Z",
      },
    ]);
    expect(new Set(target.signals.map((signal) => signal.signalId)).size).toBe(
      target.signals.length,
    );
  });

  it("surfaces unexpected discovery backend failures as an explicit error state", async () => {
    await expect(
      Effect.runPromise(
        loadAdminTenantWorkspaceIndexRouteDataFromRequest(
          new Request("http://localhost:3004/tenants", {
            headers: {
              cookie: `${subscriberJourneySessionCookieName}=sess_admin_discovery_error`,
            },
          }),
          {},
          () => Effect.succeed(capabilitySnapshot),
          () =>
            Effect.fail({
              _tag: "SupportOperationsProjectionConfigurationError",
              moduleId: platformModuleId.supportOperations,
              profile: projectionProfile.supportSafe,
            } as const),
          () => Effect.succeed({ jobs: [] }),
        ),
      ),
    ).resolves.toEqual({
      kind: "error",
      title: "Tenant discovery unavailable",
      description:
        "Live tenant discovery could not be loaded from the current support or repair queues.",
    });
  });
});
