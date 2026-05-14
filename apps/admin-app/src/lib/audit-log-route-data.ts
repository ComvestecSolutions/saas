import { Effect } from "effect";
import {
  extractRequiredSubscriberJourneySessionId,
  queryAdminAuditEventsByModuleFromSessionId,
} from "@comvestec/platform";
import { platformModuleId, type PlatformModuleId } from "@comvestec/contracts";
import type { AuditEvent } from "@comvestec/contracts";

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
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
    ),
    Effect.catchAll(() => Effect.succeed({ kind: "stale-session" } as const)),
  );
