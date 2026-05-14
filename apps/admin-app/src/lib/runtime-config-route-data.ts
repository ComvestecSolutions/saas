import { Effect } from "effect";
import { platformModuleId } from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  listAdminRuntimeConfigOverridesFromSessionId,
  listAdminRuntimeConfigProposalsFromSessionId,
} from "@comvestec/platform";

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

type AdminRuntimeConfigOverride = Omit<RuntimeConfigOverride, "value"> & {
  readonly value: RuntimeConfigDisplayValue;
};

type AdminRuntimeConfigProposal = Omit<
  RuntimeConfigProposal,
  "value" | "runtimeValue" | "codeValue"
> & {
  readonly value: RuntimeConfigDisplayValue;
  readonly runtimeValue?: RuntimeConfigDisplayValue;
  readonly codeValue?: RuntimeConfigDisplayValue;
};

const stringifyRuntimeConfigValue = (
  value: unknown,
): RuntimeConfigDisplayValue => (value == null ? null : String(value));

export type AdminRuntimeConfigRouteData =
  | { readonly kind: "shell" }
  | { readonly kind: "stale-session" }
  | { readonly kind: "denied"; readonly reason: string }
  | {
      readonly kind: "ready";
      readonly overrides: readonly AdminRuntimeConfigOverride[];
      readonly proposals: readonly AdminRuntimeConfigProposal[];
    };

export const loadAdminRuntimeConfigRouteDataFromRequest = (
  request: Request,
  environment: unknown,
): Effect.Effect<AdminRuntimeConfigRouteData, never, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      Effect.all({
        overrides: listAdminRuntimeConfigOverridesFromSessionId(environment, {
          sessionId,
          moduleId: platformModuleId.runtimeConfig,
        }),
        proposals: listAdminRuntimeConfigProposalsFromSessionId(environment, {
          sessionId,
          moduleId: platformModuleId.runtimeConfig,
        }),
      }).pipe(
        Effect.map(
          ({ overrides, proposals }): AdminRuntimeConfigRouteData => ({
            kind: "ready",
            overrides: overrides.map((override) => {
              const { value, ...rest } = override;

              return {
                ...rest,
                value: stringifyRuntimeConfigValue(value),
              };
            }),
            proposals: proposals.map((proposal) => {
              const { value, runtimeValue, codeValue, ...rest } = proposal;

              return {
                ...rest,
                value: stringifyRuntimeConfigValue(value),
                ...(runtimeValue === undefined
                  ? {}
                  : {
                      runtimeValue: stringifyRuntimeConfigValue(runtimeValue),
                    }),
                ...(codeValue === undefined
                  ? {}
                  : {
                      codeValue: stringifyRuntimeConfigValue(codeValue),
                    }),
              };
            }),
          }),
        ),
      ),
    ),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
    ),
    Effect.catchAll(() => Effect.succeed({ kind: "stale-session" } as const)),
  );
