import { Effect } from "effect";
import { platformModuleId, type PlatformModuleId } from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  listAdminFeatureFlagsFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Feature Flags v2 route data (admin-app implementation plan
 * §8.6 + §11 — Phase 3 Governance & access commit 1). Mirrors
 * the v2 loader-trio pattern shipped for `/r/tenants`,
 * `/r/tenant/$tenantId`, `/r/audit`, and `/r/config`: the
 * route component consumes a thin `shell | stale-session |
 * denied | error | ready` discriminated union.
 *
 * Backed live by `listAdminFeatureFlagsFromSessionId` in
 * `packages/platform/src/services/apps/admin-governance-actions.ts`,
 * gated through `resolveTrustedRequestContextFromSessionId`
 * (the platform helpers wrap that internally), with the
 * `AdminGovernanceReadAccessDenied{,RequestContextNotFound,RequestContextMalformed}Error`
 * braid mapped onto the discriminated union via `Effect.catchTag`.
 *
 * The optional `flagKey` filter is the seed for the
 * DiffApprovalDrawer detail (lifecycle ↔ runtime override ↔
 * pending proposal ↔ effective) wired in commit 3; the loader
 * narrows `selectedFlag` and otherwise round-trips the full
 * flag list so the route can paint the list + drawer
 * side-by-side.
 */
type FeatureFlag = Awaited<
  Effect.Effect.Success<ReturnType<typeof listAdminFeatureFlagsFromSessionId>>
>[number];

export type AdminGovernanceFlag = FeatureFlag;

export type AdminGovernanceFlagV2Input = {
  readonly moduleId?: PlatformModuleId;
  readonly flagKey?: string;
};

export type AdminGovernanceFlagV2RouteData =
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
      readonly moduleId: PlatformModuleId;
      readonly flags: readonly FeatureFlag[];
      readonly selectedFlagKey?: string;
      readonly selectedFlag?: FeatureFlag;
    };

type ListFlags = typeof listAdminFeatureFlagsFromSessionId;

export type AdminGovernanceFlagV2Dependencies = {
  readonly listFlags: ListFlags;
};

const defaultDependencies: AdminGovernanceFlagV2Dependencies = {
  listFlags: listAdminFeatureFlagsFromSessionId,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminGovernanceFlagV2RouteData, { readonly kind: "error" }> => {
  if (error instanceof Error && error.message.length > 0) {
    return {
      kind: "error",
      title: "Feature flags unavailable",
      description: error.message,
    };
  }
  return {
    kind: "error",
    title: "Feature flags unavailable",
    description:
      "Feature flags could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
  };
};

export const loadAdminGovernanceFlagV2RouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminGovernanceFlagV2Input = {},
  dependencies: AdminGovernanceFlagV2Dependencies = defaultDependencies,
): Effect.Effect<AdminGovernanceFlagV2RouteData, never> => {
  const moduleId = input.moduleId ?? platformModuleId.featureFlags;

  return extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies
          .listFlags(environment, {
            sessionId,
            moduleId,
          })
          .pipe(
            Effect.map((flags): AdminGovernanceFlagV2RouteData => {
              const selectedFlagKey =
                input.flagKey !== undefined && input.flagKey.length > 0
                  ? input.flagKey
                  : undefined;
              const selectedFlag =
                selectedFlagKey === undefined
                  ? undefined
                  : flags.find((flag) => flag.key === selectedFlagKey);

              return {
                kind: "ready",
                moduleId,
                flags,
                ...(selectedFlagKey === undefined ? {} : { selectedFlagKey }),
                ...(selectedFlag === undefined ? {} : { selectedFlag }),
              };
            }),
          ),
      ),
    ),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
    ),
    Effect.catchTag("AdminGovernanceReadAccessDeniedError", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot inspect governed feature flags.",
      } as const),
    ),
    Effect.catchTag("AdminGovernanceRequestContextNotFoundError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("AdminGovernanceRequestContextMalformedError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
};
