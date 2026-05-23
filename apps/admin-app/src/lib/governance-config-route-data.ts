import { Effect } from "effect";
import { platformModuleId, type PlatformModuleId } from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  listAdminRuntimeConfigOverridesFromSessionId,
  listAdminRuntimeConfigProposalsFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Runtime Config v2 route data (admin-app implementation plan
 * §8.5 + §11 — Phase 3 Governance & access commit 1). Mirrors
 * the v2 loader-trio pattern shipped for `/r/tenants`,
 * `/r/tenant/$tenantId`, and `/r/audit`: the route component
 * consumes a thin `shell | stale-session | denied | error |
 * ready` discriminated union.
 *
 * Backed live by the
 * `listAdminRuntimeConfig{Overrides,Proposals}FromSessionId`
 * helpers in
 * `packages/platform/src/services/apps/admin-governance-actions.ts`,
 * gated through `resolveTrustedRequestContextFromSessionId`
 * (the platform helpers wrap that internally), with the
 * `AdminGovernanceReadAccessDenied{,RequestContextNotFound,RequestContextMalformed}Error`
 * braid mapped onto the discriminated union via `Effect.catchTag`.
 *
 * The optional `key` filter is the seed for the 4-way
 * DiffApprovalDrawer detail (declared default ↔ runtime
 * override ↔ pending proposal ↔ effective) wired in commit 2;
 * the loader only narrows the `selected` slice from the list
 * and otherwise round-trips the full list/proposal envelope so
 * the route can paint the list + diff side-by-side.
 */
type RuntimeConfigOverride = Awaited<
  Effect.Effect.Success<
    ReturnType<typeof listAdminRuntimeConfigOverridesFromSessionId>
  >
>[number];

type RuntimeConfigProposal = Awaited<
  Effect.Effect.Success<
    ReturnType<typeof listAdminRuntimeConfigProposalsFromSessionId>
  >
>[number];

type RuntimeConfigDisplayValue = string | null;

export type AdminGovernanceConfigOverride = Omit<
  RuntimeConfigOverride,
  "value"
> & {
  readonly value: RuntimeConfigDisplayValue;
};

export type AdminGovernanceConfigProposal = Omit<
  RuntimeConfigProposal,
  "value" | "runtimeValue" | "codeValue"
> & {
  readonly value: RuntimeConfigDisplayValue;
  readonly runtimeValue?: RuntimeConfigDisplayValue;
  readonly codeValue?: RuntimeConfigDisplayValue;
};

export type AdminGovernanceConfigV2Input = {
  readonly moduleId?: PlatformModuleId;
  readonly key?: string;
};

export type AdminGovernanceConfigV2RouteData =
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
      readonly overrides: readonly AdminGovernanceConfigOverride[];
      readonly proposals: readonly AdminGovernanceConfigProposal[];
      readonly selectedKey?: string;
      readonly selectedOverride?: AdminGovernanceConfigOverride;
      readonly selectedProposals: readonly AdminGovernanceConfigProposal[];
    };

type ListOverrides = typeof listAdminRuntimeConfigOverridesFromSessionId;
type ListProposals = typeof listAdminRuntimeConfigProposalsFromSessionId;

export type AdminGovernanceConfigV2Dependencies = {
  readonly listOverrides: ListOverrides;
  readonly listProposals: ListProposals;
};

const defaultDependencies: AdminGovernanceConfigV2Dependencies = {
  listOverrides: listAdminRuntimeConfigOverridesFromSessionId,
  listProposals: listAdminRuntimeConfigProposalsFromSessionId,
};

const stringifyRuntimeConfigValue = (
  value: unknown,
): RuntimeConfigDisplayValue => (value == null ? null : String(value));

const normalizeOverride = (
  override: RuntimeConfigOverride,
): AdminGovernanceConfigOverride => {
  const { value, ...rest } = override;
  return {
    ...rest,
    value: stringifyRuntimeConfigValue(value),
  };
};

const normalizeProposal = (
  proposal: RuntimeConfigProposal,
): AdminGovernanceConfigProposal => {
  const { value, runtimeValue, codeValue, ...rest } = proposal;
  return {
    ...rest,
    value: stringifyRuntimeConfigValue(value),
    ...(runtimeValue === undefined
      ? {}
      : { runtimeValue: stringifyRuntimeConfigValue(runtimeValue) }),
    ...(codeValue === undefined
      ? {}
      : { codeValue: stringifyRuntimeConfigValue(codeValue) }),
  };
};

const buildErrorState = (
  error: unknown,
): Extract<AdminGovernanceConfigV2RouteData, { readonly kind: "error" }> => {
  if (error instanceof Error && error.message.length > 0) {
    return {
      kind: "error",
      title: "Runtime config unavailable",
      description: error.message,
    };
  }
  return {
    kind: "error",
    title: "Runtime config unavailable",
    description:
      "Runtime config could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
  };
};

export const loadAdminGovernanceConfigV2RouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminGovernanceConfigV2Input = {},
  dependencies: AdminGovernanceConfigV2Dependencies = defaultDependencies,
): Effect.Effect<AdminGovernanceConfigV2RouteData, never> => {
  const moduleId = input.moduleId ?? platformModuleId.runtimeConfig;

  return extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        Effect.all({
          overrides: dependencies.listOverrides(environment, {
            sessionId,
            moduleId,
          }),
          proposals: dependencies.listProposals(environment, {
            sessionId,
            moduleId,
          }),
        }).pipe(
          Effect.map(
            ({ overrides, proposals }): AdminGovernanceConfigV2RouteData => {
              const normalizedOverrides = overrides.map(normalizeOverride);
              const normalizedProposals = proposals.map(normalizeProposal);
              const selectedKey =
                input.key !== undefined && input.key.length > 0
                  ? input.key
                  : undefined;
              const selectedOverride =
                selectedKey === undefined
                  ? undefined
                  : normalizedOverrides.find(
                      (override) => override.key === selectedKey,
                    );
              const selectedProposals =
                selectedKey === undefined
                  ? []
                  : normalizedProposals.filter(
                      (proposal) => proposal.key === selectedKey,
                    );

              return {
                kind: "ready",
                moduleId,
                overrides: normalizedOverrides,
                proposals: normalizedProposals,
                ...(selectedKey === undefined ? {} : { selectedKey }),
                ...(selectedOverride === undefined ? {} : { selectedOverride }),
                selectedProposals,
              };
            },
          ),
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
          "The current operator session cannot inspect governed runtime configuration.",
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
