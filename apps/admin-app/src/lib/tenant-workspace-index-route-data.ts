import { Effect } from "effect";
import { adminOperatorCapability } from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  getAdminOperatorCapabilitySnapshotFromSessionId,
  listBillingRepairGapsFromSessionId,
  listSupportCasesFromSessionId,
} from "@comvestec/platform";
import {
  buildAdminTenantTarget,
  serializeAdminTenantTarget,
  type AdminTenantTarget,
} from "./admin-tenant-target";
import { resolveAdminTenantTargetDisplayName } from "./admin-tenant-target-display-name";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

type AdminOperatorCapabilitySnapshot = Awaited<
  Effect.Effect.Success<
    ReturnType<typeof getAdminOperatorCapabilitySnapshotFromSessionId>
  >
>;

type SupportCase = Awaited<
  Effect.Effect.Success<ReturnType<typeof listSupportCasesFromSessionId>>
>[number];

type RepairGap = Awaited<
  Effect.Effect.Success<ReturnType<typeof listBillingRepairGapsFromSessionId>>
>["jobs"][number];

export type AdminTenantWorkspaceDiscoverySignal = {
  readonly signalId: string;
  readonly kind: "support-case" | "repair-gap";
  readonly status: string;
  readonly detail: string;
  readonly timestamp: string;
};

export type AdminTenantWorkspaceDiscoveryTarget = {
  readonly target: AdminTenantTarget;
  readonly displayName: string;
  readonly lastTouchedAt: string;
  readonly signals: readonly AdminTenantWorkspaceDiscoverySignal[];
};

export type AdminTenantWorkspaceIndexRouteData =
  | { readonly kind: "shell" }
  | { readonly kind: "stale-session" }
  | { readonly kind: "denied"; readonly reason: string }
  | {
      readonly kind: "error";
      readonly title: string;
      readonly description: string;
    }
  | {
      readonly kind: "ready";
      readonly targets: readonly AdminTenantWorkspaceDiscoveryTarget[];
    };

const buildAdminTenantWorkspaceIndexErrorState = (
  error: unknown,
): Extract<AdminTenantWorkspaceIndexRouteData, { readonly kind: "error" }> => {
  if (
    typeof error === "object" &&
    error !== null &&
    "reason" in error &&
    typeof error.reason === "string" &&
    error.reason.length > 0
  ) {
    return {
      kind: "error",
      title: "Tenant discovery unavailable",
      description: error.reason,
    };
  }

  if (error instanceof Error && error.message.length > 0) {
    return {
      kind: "error",
      title: "Tenant discovery unavailable",
      description: error.message,
    };
  }

  return {
    kind: "error",
    title: "Tenant discovery unavailable",
    description:
      "Live tenant discovery could not be loaded from the current support or repair queues.",
  };
};

const buildAdminTenantWorkspaceDiscoveryTargets = (input: {
  readonly cases: readonly SupportCase[];
  readonly repairGaps: readonly RepairGap[];
}): readonly AdminTenantWorkspaceDiscoveryTarget[] => {
  const targetMap = new Map<
    string,
    {
      target: AdminTenantTarget;
      lastTouchedAt: string;
      signals: AdminTenantWorkspaceDiscoverySignal[];
    }
  >();

  const registerSignal = (
    target: AdminTenantTarget | undefined,
    signal: AdminTenantWorkspaceDiscoverySignal,
  ) => {
    if (target === undefined) {
      return;
    }

    const key = serializeAdminTenantTarget(target);
    const current = targetMap.get(key);

    if (current === undefined) {
      targetMap.set(key, {
        target,
        lastTouchedAt: signal.timestamp,
        signals: [signal],
      });
      return;
    }

    current.signals.push(signal);
    if (signal.timestamp > current.lastTouchedAt) {
      current.lastTouchedAt = signal.timestamp;
    }
  };

  for (const supportCase of input.cases) {
    registerSignal(
      buildAdminTenantTarget({
        scope: supportCase.tenantScope,
        scopeId: supportCase.tenantScopeId,
      }),
      {
        signalId: supportCase.caseId,
        kind: "support-case",
        status: supportCase.status,
        detail: supportCase.summary,
        timestamp: supportCase.lastUpdatedAt,
      },
    );
  }

  for (const repairGap of input.repairGaps) {
    registerSignal(
      buildAdminTenantTarget({
        scope: repairGap.tenantScope,
        scopeId: repairGap.tenantScopeId,
      }),
      {
        signalId: repairGap.jobId,
        kind: "repair-gap",
        status: repairGap.status,
        detail:
          repairGap.gapReason ??
          "Tenant repair workflow currently needs operator attention.",
        timestamp: repairGap.completedAt ?? repairGap.scheduledAt,
      },
    );
  }

  return [...targetMap.values()]
    .map((entry) => ({
      target: entry.target,
      displayName: resolveAdminTenantTargetDisplayName(entry.target),
      lastTouchedAt: entry.lastTouchedAt,
      signals: [...entry.signals].sort((left, right) =>
        right.timestamp.localeCompare(left.timestamp),
      ),
    }))
    .sort((left, right) =>
      right.lastTouchedAt.localeCompare(left.lastTouchedAt),
    );
};

const resolveTenantWorkspaceCapability = (
  snapshot: AdminOperatorCapabilitySnapshot,
) =>
  snapshot.capabilities.find(
    (capability) =>
      capability.capability === adminOperatorCapability.tenantWorkspace,
  );

export const loadAdminTenantWorkspaceIndexRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  getCapabilitySnapshot: (
    currentEnvironment: unknown,
    input: { readonly sessionId: string },
  ) => ReturnType<typeof getAdminOperatorCapabilitySnapshotFromSessionId> = (
    currentEnvironment,
    input,
  ) =>
    getAdminOperatorCapabilitySnapshotFromSessionId(currentEnvironment, input),
  listSupportCases: (
    currentEnvironment: unknown,
    input: { readonly sessionId: string },
  ) => ReturnType<typeof listSupportCasesFromSessionId> = (
    currentEnvironment,
    input,
  ) => listSupportCasesFromSessionId(currentEnvironment, input),
  listRepairGaps: (
    currentEnvironment: unknown,
    input: { readonly sessionId: string },
  ) => ReturnType<typeof listBillingRepairGapsFromSessionId> = (
    currentEnvironment,
    input,
  ) => listBillingRepairGapsFromSessionId(currentEnvironment, input),
): Effect.Effect<AdminTenantWorkspaceIndexRouteData, never, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        getCapabilitySnapshot(environment, {
          sessionId,
        }).pipe(
          Effect.flatMap((capabilities) => {
            const tenantWorkspaceCapability =
              resolveTenantWorkspaceCapability(capabilities);

            if (tenantWorkspaceCapability?.allowed !== true) {
              return Effect.succeed({
                kind: "denied",
                reason:
                  tenantWorkspaceCapability?.reason ??
                  "The current operator session cannot open tenant workspace discovery.",
              } as const);
            }

            return Effect.all({
              cases: listSupportCases(environment, {
                sessionId,
              }),
              repairGaps: listRepairGaps(environment, {
                sessionId,
              }).pipe(Effect.map(({ jobs }) => jobs)),
            }).pipe(
              Effect.map(
                ({
                  cases,
                  repairGaps,
                }): AdminTenantWorkspaceIndexRouteData => ({
                  kind: "ready",
                  targets: buildAdminTenantWorkspaceDiscoveryTargets({
                    cases,
                    repairGaps,
                  }),
                }),
              ),
            );
          }),
        ),
      ),
    ),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
    ),
    Effect.catchTag("AdminGovernanceRequestContextNotFoundError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("AdminGovernanceRequestContextMalformedError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("IdentitySessionRequestContextNotFoundError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("SupportOperationsReadAccessDeniedError", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot inspect support queues for tenant workspace discovery.",
      } as const),
    ),
    Effect.catchTag("ManagedBillingPlanAccessDeniedError", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot inspect repair queues for tenant workspace discovery.",
      } as const),
    ),
    Effect.catchAll((error) =>
      Effect.succeed(buildAdminTenantWorkspaceIndexErrorState(error)),
    ),
  );
