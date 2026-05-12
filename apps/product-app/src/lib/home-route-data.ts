import { Effect } from "effect";
import {
  buildProductBootstrapFromSessionId,
  extractRequiredSubscriberJourneySessionId,
  type ProductBootstrapResult,
} from "@comvestec/platform";

export type ProductHomeRouteData =
  | {
      readonly kind: "shell";
    }
  | {
      readonly kind: "stale-session";
    }
  | {
      readonly kind: "bootstrap";
      readonly bootstrap: ProductBootstrapResult;
    };

type BuildProductBootstrap = (
  environment: unknown,
  input: { readonly sessionId: string },
) => ReturnType<typeof buildProductBootstrapFromSessionId>;

export const loadProductHomeRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  buildProductBootstrap: BuildProductBootstrap = (currentEnvironment, input) =>
    buildProductBootstrapFromSessionId(currentEnvironment, input),
) =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      buildProductBootstrap(environment, { sessionId }),
    ),
    Effect.map(
      (bootstrap): ProductHomeRouteData => ({
        kind: "bootstrap",
        bootstrap,
      }),
    ),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
    ),
    Effect.catchTag("IdentitySessionRequestContextNotFoundError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
  );
