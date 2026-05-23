import { Effect } from "effect";
import {
  extractRequiredSubscriberJourneySessionId,
  queryAdminAuditEventsByModuleFromSessionId,
} from "@comvestec/platform";
import { platformModuleId, type PlatformModuleId } from "@comvestec/contracts";
import type { AuditEvent } from "@comvestec/contracts";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

export type AdminAuditLogRouteData =
  | { readonly kind: "shell" }
  | { readonly kind: "stale-session" }
  | { readonly kind: "denied"; readonly reason: string }
  | { readonly kind: "ready"; readonly events: readonly AuditEvent[] };

export const loadAdminAuditLogRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  moduleId: PlatformModuleId = platformModuleId.auditLog,
): Effect.Effect<AdminAuditLogRouteData, never, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        queryAdminAuditEventsByModuleFromSessionId(environment, {
          sessionId,
          moduleId,
        }).pipe(
          Effect.map(
            (events): AdminAuditLogRouteData => ({
              kind: "ready",
              events,
            }),
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
          "The current operator session cannot inspect audit activity for this module.",
      } as const),
    ),
    Effect.catchTag("AdminGovernanceRequestContextNotFoundError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("AdminGovernanceRequestContextMalformedError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchAll(() => Effect.succeed({ kind: "stale-session" } as const)),
  );
