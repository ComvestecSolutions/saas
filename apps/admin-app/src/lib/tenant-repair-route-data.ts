import { Effect } from "effect";
import {
  adminOperatorCapability,
  type BillingRepairGapListResult,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  getAdminOperationsHomeSummaryFromSessionId,
  listBillingRepairGapsFromSessionId,
  type AdminOperationsHomeSummary,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

export type AdminTenantRepairRouteLoaderInput = {
  readonly inspectionReason?: string;
};

export type AdminTenantRepairRouteData =
  | {
      readonly kind: "shell";
    }
  | {
      readonly kind: "stale-session";
    }
  | {
      readonly kind: "denied";
      readonly reason: string;
    }
  | {
      readonly kind: "ready";
      readonly summary: AdminOperationsHomeSummary;
      readonly jobs: BillingRepairGapListResult["jobs"];
    };

type ListBillingRepairGaps = (
  environment: unknown,
  input: {
    readonly sessionId: string;
    readonly inspectionReason?: string;
  },
) => ReturnType<typeof listBillingRepairGapsFromSessionId>;

type GetAdminOperationsHomeSummary = (
  environment: unknown,
  input: {
    readonly sessionId: string;
  },
) => ReturnType<typeof getAdminOperationsHomeSummaryFromSessionId>;

export const loadAdminTenantRepairRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  getAdminOperationsHomeSummary:
    | GetAdminOperationsHomeSummary
    | undefined = undefined,
  listBillingRepairGaps: ListBillingRepairGaps | undefined = undefined,
  input: AdminTenantRepairRouteLoaderInput = {},
) => {
  const resolvedGetAdminOperationsHomeSummary: GetAdminOperationsHomeSummary =
    getAdminOperationsHomeSummary ??
    ((currentEnvironment, requestInput) =>
      getAdminOperationsHomeSummaryFromSessionId(
        currentEnvironment,
        requestInput,
      ));
  const resolvedListBillingRepairGaps: ListBillingRepairGaps =
    listBillingRepairGaps ??
    ((currentEnvironment, requestInput) =>
      listBillingRepairGapsFromSessionId(currentEnvironment, requestInput));

  return extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        resolvedGetAdminOperationsHomeSummary(environment, {
          sessionId,
        }).pipe(
          Effect.flatMap((summary) => {
            const operationsHomeCapability =
              summary.capabilities.capabilities.find(
                (capability) =>
                  capability.capability ===
                  adminOperatorCapability.operationsHome,
              );
            const repairOperationsCapability =
              summary.capabilities.capabilities.find(
                (capability) =>
                  capability.capability ===
                  adminOperatorCapability.repairOperations,
              );

            if (operationsHomeCapability?.allowed !== true) {
              return Effect.succeed({
                kind: "denied",
                reason:
                  operationsHomeCapability?.reason ??
                  "The current operator session cannot open admin operations workflows.",
              } as const);
            }

            return (
              repairOperationsCapability?.allowed === true
                ? resolvedListBillingRepairGaps(environment, {
                    sessionId,
                    ...(input.inspectionReason === undefined
                      ? {}
                      : { inspectionReason: input.inspectionReason }),
                  }).pipe(Effect.map(({ jobs }) => jobs))
                : Effect.succeed([] as const)
            ).pipe(
              Effect.map(
                (jobs): AdminTenantRepairRouteData => ({
                  kind: "ready",
                  summary,
                  jobs,
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
    Effect.catchTag("ManagedBillingPlanAccessDeniedError", (error) =>
      Effect.succeed({
        kind: "denied",
        reason: error.reason,
      } as const),
    ),
  );
};
