import { Effect } from "effect";
import {
  extractRequiredSubscriberJourneySessionId,
  listWebhookSubscriptionsFromSessionId,
  listWebhookApiKeysFromSessionId,
} from "@comvestec/platform";

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
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      Effect.all({
        subscriptions: listWebhookSubscriptionsFromSessionId(environment, {
          sessionId,
          scope: scope as "organization",
          scopeId,
        }),
        apiKeys: listWebhookApiKeysFromSessionId(environment, {
          sessionId,
          scope: scope as "organization",
          scopeId,
        }),
      }).pipe(
        Effect.map(
          ({ subscriptions, apiKeys }): AdminWebhooksApiAccessRouteData => ({
            kind: "ready",
            subscriptions,
            apiKeys,
          }),
        ),
      ),
    ),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
    ),
    Effect.catchAll(() => Effect.succeed({ kind: "stale-session" } as const)),
  );
