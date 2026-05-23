import { Effect, Option } from "effect";
import type { NotificationDetail, RequestContext } from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  getNotificationCenterAdminDetailFromEnvironment,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the spec-canonical
 * `/r/notify/$id` Notification Center v2 detail surface
 * (admin-app implementation plan §8.16 + §11 — Phase 6 vendor +
 * workflow operator screens commit 6c). Mirrors the v2
 * loader-trio shape used by `/r/incident/$incidentId`,
 * `/r/legal-hold/$holdId`, `/r/delivery/$deliveryId`,
 * `/r/api-key/$keyId`, and `/r/run/$id`.
 *
 * Backed live by `getNotificationCenterAdminDetailFromEnvironment`
 * (admin-app implementation plan §9 item 16). The platform
 * service takes a `RequestContext` rather than a session id, so
 * the loader composes two reads through `Effect.all`:
 *
 *   - `resolveTrustedRequestContextFromSessionId` →
 *     `RequestContext`.
 *   - `getNotificationCenterAdminDetailFromEnvironment` →
 *     `NotificationDetail` (envelope summary + payload
 *     projection + provider metadata + audit correlation id).
 *
 * The resend CTA is wired through `HighRiskActionGuard` at the
 * route component level — the mutations-server handler body
 * for `resendNotificationFromEnvironment` is tracked under the
 * Admin app row's Phase 6 follow-ups in the implementation
 * tracker (mirrors the rotate / revoke CTAs on
 * `/r/api-key/$keyId` and the replay / cancel CTAs on
 * `/r/run/$id`).
 */
export type AdminNotifyDetailInput = {
  readonly notificationId: string;
};

export type AdminNotifyDetailRouteData =
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
      readonly notification: NotificationDetail;
    };

type GetNotificationCenterAdminDetail = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly notificationId: string;
  },
) => ReturnType<typeof getNotificationCenterAdminDetailFromEnvironment>;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminNotifyDetailDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly getNotificationCenterAdminDetail: GetNotificationCenterAdminDetail;
};

const defaultDependencies: AdminNotifyDetailDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  getNotificationCenterAdminDetail:
    getNotificationCenterAdminDetailFromEnvironment,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminNotifyDetailRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Notification detail unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Notification detail could not be loaded from the current backend state. Retry shortly; if the problem persists the upstream Novu admin port is failing and the platform has degraded to an unavailable state.",
});

const notFoundState: Extract<
  AdminNotifyDetailRouteData,
  { readonly kind: "error" }
> = {
  kind: "error",
  title: "Notification not found",
  description:
    "The requested notification could not be located. The notification id may be stale or pruned, or the upstream Novu admin port may not yet expose this envelope.",
};

export const loadAdminNotifyDetailRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminNotifyDetailInput,
  dependencies: AdminNotifyDetailDependencies = defaultDependencies,
): Effect.Effect<AdminNotifyDetailRouteData, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        Effect.all({
          requestContext: dependencies.resolveTrustedRequestContext(
            environment,
            sessionId,
          ),
        }).pipe(
          Effect.flatMap(({ requestContext }) =>
            dependencies
              .getNotificationCenterAdminDetail(environment, {
                requestContext,
                notificationId: input.notificationId,
              })
              .pipe(
                Effect.map(
                  (view): AdminNotifyDetailRouteData =>
                    Option.match(view.detail, {
                      onNone: () => notFoundState,
                      onSome: (notification) =>
                        ({ kind: "ready", notification }) as const,
                    }),
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
    Effect.catchTag("NotificationCenterAdminUnauthorized", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot inspect this notification.",
      } as const),
    ),
    Effect.catchTag("NotificationCenterAdminMissingActorIdentity", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("NotificationCenterAdminNotificationNotFound", () =>
      Effect.succeed(notFoundState),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
