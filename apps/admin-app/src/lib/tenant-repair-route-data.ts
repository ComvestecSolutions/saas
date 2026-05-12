import { Effect } from "effect";
import type { BillingRepairGapListResult } from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  listBillingRepairGapsFromSessionId,
} from "@comvestec/platform";

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
      readonly jobs: BillingRepairGapListResult["jobs"];
    };

type ListBillingRepairGaps = (
  environment: unknown,
  input: {
    readonly sessionId: string;
    readonly inspectionReason?: string;
  },
) => ReturnType<typeof listBillingRepairGapsFromSessionId>;

export const loadAdminTenantRepairRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  listBillingRepairGaps: ListBillingRepairGaps | undefined = undefined,
  input: AdminTenantRepairRouteLoaderInput = {},
) => {
  const resolvedListBillingRepairGaps: ListBillingRepairGaps =
    listBillingRepairGaps ??
    ((currentEnvironment, requestInput) =>
      listBillingRepairGapsFromSessionId(currentEnvironment, requestInput));

  return extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      resolvedListBillingRepairGaps(environment, {
        sessionId,
        ...(input.inspectionReason === undefined
          ? {}
          : { inspectionReason: input.inspectionReason }),
      }),
    ),
    Effect.map(
      ({ jobs }): AdminTenantRepairRouteData => ({
        kind: "ready",
        jobs,
      }),
    ),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
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
