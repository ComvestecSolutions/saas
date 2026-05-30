import { Effect } from "effect";
import type {
  NotificationCenterAdminListFilters,
  NotificationCenterAdminListResult,
  RequestContext,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  listNotificationCenterAdminFromEnvironment,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the spec-canonical
 * `/desk/notify` Notification Center v2 list surface (admin-app
 * implementation plan §8.16 + §11 — Phase 6 vendor + workflow
 * operator screens commit 6b). Mirrors the v2 loader-trio
 * pattern shipped for `/desk/vendors`, `/desk/webhook`,
 * `/desk/retention`, and `/desk/support`.
 *
 * Backed live by `listNotificationCenterAdminFromEnvironment`
 * (admin-app implementation plan §9 item 16). The platform
 * service takes a `RequestContext` rather than a session id, so
 * the loader composes two reads through `Effect.all`:
 *
 *   - `resolveTrustedRequestContextFromSessionId` →
 *     `RequestContext` (the operator-trusted projection of the
 *     subscriber-journey session).
 *   - `listNotificationCenterAdminFromEnvironment` →
 *     `NotificationCenterAdminListResult` (notifications +
 *     pagination + partial-failures envelope).
 *
 * The `getNotificationCenterAdminDetailFromEnvironment` detail
 * helper and the `resendNotificationFromEnvironment` resend
 * mutation surface are tracked under the Admin app row's
 * Phase 6 follow-ups in the implementation tracker — spine
 * first, body second (mirrors the rotate / revoke CTA pattern
 * on `/desk/api-key/$keyId`). The list surface today exposes
 * deep-link affordances per row + a placeholder resend CTA
 * gated through `HighRiskActionGuard`.
 *
 * Partial-failure semantics are preserved end-to-end: the
 * `partialFailures` array surfaces in the `ready` variant so the
 * route can render an inline partial-failure notice without
 * collapsing the page to `error`.
 */
export type AdminNotifyListInput = {
  readonly filters: NotificationCenterAdminListFilters;
  readonly pageSize: number;
  readonly pageToken?: string;
};

export type AdminNotifyListRouteData =
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
      readonly filters: NotificationCenterAdminListFilters;
      readonly result: NotificationCenterAdminListResult;
    };

type ListNotificationCenterAdmin = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly filters: NotificationCenterAdminListFilters;
    readonly pageSize: number;
    readonly pageToken?: string;
  },
) => ReturnType<typeof listNotificationCenterAdminFromEnvironment>;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminNotifyListDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly listNotificationCenterAdmin: ListNotificationCenterAdmin;
};

const defaultDependencies: AdminNotifyListDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  listNotificationCenterAdmin: listNotificationCenterAdminFromEnvironment,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminNotifyListRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Notification center unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Notification center could not be loaded from the current backend state. Retry shortly; if the problem persists the upstream Novu admin port is failing and the platform has degraded to an unavailable state.",
});

export const loadAdminNotifyListRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminNotifyListInput,
  dependencies: AdminNotifyListDependencies = defaultDependencies,
): Effect.Effect<AdminNotifyListRouteData, never> =>
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
              .listNotificationCenterAdmin(environment, {
                requestContext,
                filters: input.filters,
                pageSize: input.pageSize,
                ...(input.pageToken === undefined
                  ? {}
                  : { pageToken: input.pageToken }),
              })
              .pipe(
                Effect.map(
                  (view): AdminNotifyListRouteData => ({
                    kind: "ready",
                    filters: input.filters,
                    result: view.result,
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
          "The current operator session cannot inspect the notification center.",
      } as const),
    ),
    Effect.catchTag("NotificationCenterAdminMissingActorIdentity", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
