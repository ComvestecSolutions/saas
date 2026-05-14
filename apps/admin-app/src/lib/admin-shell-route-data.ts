import { Effect } from "effect";
import {
  extractRequiredSubscriberJourneySessionId,
  getAdminOperatorCapabilitySnapshotFromSessionId,
} from "@comvestec/platform";
import type { AdminOperatorCapabilitySnapshot } from "@comvestec/contracts";

export type AdminShellRouteData =
  | { readonly kind: "shell" }
  | { readonly kind: "stale-session" }
  | {
      readonly kind: "ready";
      readonly capabilities: AdminOperatorCapabilitySnapshot;
    };

type GetAdminOperatorCapabilitySnapshot = (
  environment: unknown,
  input: {
    readonly sessionId: string;
  },
) => ReturnType<typeof getAdminOperatorCapabilitySnapshotFromSessionId>;

export const loadAdminShellRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  getAdminOperatorCapabilitySnapshot: GetAdminOperatorCapabilitySnapshot = (
    currentEnvironment,
    input,
  ) =>
    getAdminOperatorCapabilitySnapshotFromSessionId(currentEnvironment, input),
) =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      getAdminOperatorCapabilitySnapshot(environment, { sessionId }).pipe(
        Effect.map(
          (capabilities): AdminShellRouteData => ({
            kind: "ready",
            capabilities,
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
    Effect.catchAll(() => Effect.succeed({ kind: "stale-session" } as const)),
  );
