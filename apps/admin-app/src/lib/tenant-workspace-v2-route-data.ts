import { Effect } from "effect";
import {
  extractRequiredSubscriberJourneySessionId,
  getTenantWorkspaceSnapshotFromEnvironment,
  resolveTrustedRequestContextFromSessionId,
  type TenantWorkspaceSnapshot,
} from "@comvestec/platform";
import type {
  OperationsHomeKpi,
  OperationsHomePendingApproval,
  TenantWorkspaceMember,
  TenantWorkspaceOpenIncident,
  TenantWorkspaceOverview,
  TenantWorkspacePartialFailure,
  TenantWorkspaceRecentActivityEntry,
} from "@comvestec/contracts";
import {
  buildAdminTenantTarget,
  buildAdminTenantContext,
  type AdminTenantTargetScope,
} from "./admin-tenant-target";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the Tenant workspace v2
 * cutover (admin-app implementation plan §9 item 4 + Phase 2
 * Desk Core cutover). Mirrors `operations-home-route-data.ts`
 * and `capability-snapshot-v2-route-data.ts`: route consumes a
 * thin `shell | stale-session | denied | error | ready` shape,
 * and the `ready` variant surfaces both the snapshot envelope
 * and its `partialFailures` array so the route component can
 * render an inline notice without re-deriving it.
 *
 * Drops `kpi.drillFilters` from the transported usage-spotlight
 * shape (which reuses `OperationsHomeKpi`) for the same reason
 * the Operations Home loader does: the upstream
 * `Record<string, unknown>` is not serializable across the
 * TanStack Start server-function boundary, and the Phase 2
 * minimal cutover does not consume drill filters. The richer
 * Phase 2 posture board will project the live filters into a
 * typed view when drill targets are wired in.
 */
export type AdminTenantWorkspaceV2RouteUsageSpotlight = Omit<
  OperationsHomeKpi,
  "drillFilters"
>;

export type AdminTenantWorkspaceV2RouteSnapshot = {
  readonly generatedAt: TenantWorkspaceSnapshot["generatedAt"];
  readonly correlationId: TenantWorkspaceSnapshot["correlationId"];
  readonly tenant: TenantWorkspaceSnapshot["tenant"];
  readonly windowMinutes: TenantWorkspaceSnapshot["windowMinutes"];
  readonly tenantOverview: TenantWorkspaceOverview | null;
  readonly members: readonly TenantWorkspaceMember[];
  readonly recentActivity: readonly TenantWorkspaceRecentActivityEntry[];
  readonly openIncidents: readonly TenantWorkspaceOpenIncident[];
  readonly usageSpotlights: readonly AdminTenantWorkspaceV2RouteUsageSpotlight[];
  readonly pendingTenantApprovals: readonly OperationsHomePendingApproval[];
  readonly partialFailures: readonly TenantWorkspacePartialFailure[];
};

export type AdminTenantWorkspaceV2RouteData =
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
      readonly snapshot: AdminTenantWorkspaceV2RouteSnapshot;
      readonly partialFailures: readonly TenantWorkspacePartialFailure[];
    };

export type AdminTenantWorkspaceV2LoaderInput = {
  readonly tenantId: string;
  readonly scope?: AdminTenantTargetScope | undefined;
  readonly windowMinutes?: number | undefined;
  readonly membersLimit?: number | undefined;
  readonly recentActivityLimit?: number | undefined;
};

type GetTenantWorkspaceSnapshot =
  typeof getTenantWorkspaceSnapshotFromEnvironment;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

const projectUsageSpotlight = (
  kpi: OperationsHomeKpi,
): AdminTenantWorkspaceV2RouteUsageSpotlight => ({
  id: kpi.id,
  label: kpi.label,
  value: kpi.value,
  unit: kpi.unit,
  trend: kpi.trend,
  tone: kpi.tone,
  drillResourceKind: kpi.drillResourceKind,
});

const projectSnapshot = (
  snapshot: TenantWorkspaceSnapshot,
): AdminTenantWorkspaceV2RouteSnapshot => ({
  generatedAt: snapshot.generatedAt,
  correlationId: snapshot.correlationId,
  tenant: snapshot.tenant,
  windowMinutes: snapshot.windowMinutes,
  tenantOverview: snapshot.tenantOverview,
  members: snapshot.members,
  recentActivity: snapshot.recentActivity,
  openIncidents: snapshot.openIncidents,
  usageSpotlights: snapshot.usageSpotlights.map(projectUsageSpotlight),
  pendingTenantApprovals: snapshot.pendingTenantApprovals,
  partialFailures: snapshot.partialFailures,
});

const buildErrorState = (
  error: unknown,
): Extract<AdminTenantWorkspaceV2RouteData, { readonly kind: "error" }> => {
  if (error instanceof Error && error.message.length > 0) {
    return {
      kind: "error",
      title: "Tenant workspace unavailable",
      description: error.message,
    };
  }

  return {
    kind: "error",
    title: "Tenant workspace unavailable",
    description:
      "The tenant workspace snapshot could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
  };
};

export const loadAdminTenantWorkspaceV2RouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminTenantWorkspaceV2LoaderInput,
  resolveTrustedRequestContext: ResolveTrustedRequestContext = (
    env,
    sessionId,
  ) => resolveTrustedRequestContextFromSessionId(env, sessionId),
  getTenantWorkspaceSnapshot: GetTenantWorkspaceSnapshot = (
    env,
    snapshotInput,
  ) => getTenantWorkspaceSnapshotFromEnvironment(env, snapshotInput),
) =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      Effect.sync(() =>
        buildAdminTenantTarget({
          scope: input.scope,
          scopeId: input.tenantId,
        }),
      ).pipe(
        Effect.flatMap((target) =>
          target === undefined
            ? Effect.succeed({
                kind: "error",
                title: "Tenant target required",
                description:
                  "Choose a tenant from tenant discovery or use a link that includes an organization, enterprise, or individual scope.",
              } as const)
            : retryTransientAdminSessionReadiness(() =>
                resolveTrustedRequestContext(environment, sessionId).pipe(
                  Effect.flatMap((requestContext) =>
                    getTenantWorkspaceSnapshot(environment, {
                      requestContext,
                      tenant: buildAdminTenantContext(target),
                      ...(input.windowMinutes === undefined
                        ? {}
                        : { windowMinutes: input.windowMinutes }),
                      ...(input.membersLimit === undefined
                        ? {}
                        : { membersLimit: input.membersLimit }),
                      ...(input.recentActivityLimit === undefined
                        ? {}
                        : {
                            recentActivityLimit: input.recentActivityLimit,
                          }),
                    }).pipe(
                      Effect.map(
                        (snapshot): AdminTenantWorkspaceV2RouteData => {
                          const projected = projectSnapshot(snapshot);
                          return {
                            kind: "ready",
                            snapshot: projected,
                            partialFailures: projected.partialFailures,
                          };
                        },
                      ),
                    ),
                  ),
                ),
              ),
        ),
      ),
    ),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
    ),
    Effect.catchTag("IdentitySessionRequestContextNotFoundError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("TenantWorkspaceMissingActorIdentity", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("TenantWorkspaceCrossTenantAccessDenied", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot inspect tenant workspace data for this target.",
      } as const),
    ),
    Effect.catchTag("TenantWorkspaceUnavailable", () =>
      Effect.succeed({
        kind: "error",
        title: "Tenant workspace unavailable",
        description:
          "Every upstream source for the tenant workspace snapshot failed. Retry shortly; the platform has degraded to an unavailable state.",
      } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
