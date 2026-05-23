import { Effect } from "effect";
import {
  extractRequiredSubscriberJourneySessionId,
  listWebhookSubscriptionsFromSessionId,
  listWebhookApiKeysFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";
import { buildAdminTenantTarget } from "./admin-tenant-target";

type WebhookSubscription = Awaited<
  Effect.Effect.Success<
    ReturnType<typeof listWebhookSubscriptionsFromSessionId>
  >
>[number];

type WebhookApiKey = Awaited<
  Effect.Effect.Success<ReturnType<typeof listWebhookApiKeysFromSessionId>>
>[number];

export type AdminWebhooksApiAccessRouteData =
  | { readonly kind: "shell" }
  | { readonly kind: "stale-session" }
  | { readonly kind: "denied"; readonly reason: string }
  | { readonly kind: "no-scope" }
  | {
      readonly kind: "ready";
      readonly subscriptions: readonly WebhookSubscription[];
      readonly apiKeys: readonly WebhookApiKey[];
    };

export const loadAdminWebhooksApiAccessRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  scope: string,
  scopeId: string,
): Effect.Effect<AdminWebhooksApiAccessRouteData, never, never> =>
  Effect.sync(() => buildAdminTenantTarget({ scope, scopeId })).pipe(
    Effect.flatMap((target) =>
      target === undefined
        ? Effect.succeed({ kind: "no-scope" } as const)
        : extractRequiredSubscriberJourneySessionId(request).pipe(
            Effect.flatMap((sessionId) =>
              retryTransientAdminSessionReadiness(() =>
                Effect.all({
                  subscriptions: listWebhookSubscriptionsFromSessionId(
                    environment,
                    {
                      sessionId,
                      scope: target.scope,
                      scopeId: target.scopeId,
                    },
                  ),
                  apiKeys: listWebhookApiKeysFromSessionId(environment, {
                    sessionId,
                    scope: target.scope,
                    scopeId: target.scopeId,
                  }),
                }).pipe(
                  Effect.map(
                    ({
                      subscriptions,
                      apiKeys,
                    }): AdminWebhooksApiAccessRouteData => ({
                      kind: "ready",
                      subscriptions,
                      apiKeys,
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
    Effect.catchTag("WebhooksApiAccessAccessDeniedError", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot inspect webhook subscriptions or API keys for this tenant target.",
      } as const),
    ),
    Effect.catchAll(() => Effect.succeed({ kind: "stale-session" } as const)),
  );
