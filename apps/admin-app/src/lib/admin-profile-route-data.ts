import { Effect } from "effect";
import type { AdminOperatorProfile } from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  getAdminOperatorProfileFromEnvironment,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the spec-canonical
 * `/admin/profile` admin-organization operator profile surface
 * (admin-app implementation plan §11 — Phase 7 admin-org screens
 * commit 7b-1). Mirrors the v2 loader-trio shape used across
 * Phase 6 commit 6c (`/desk/notify/$id`) and Phase 5 commit 3
 * (`/desk/api-key/$keyId`).
 *
 * Backed live by `getAdminOperatorProfileFromEnvironment`
 * (admin-app implementation plan §9 item 1). The helper takes
 * an `AdminOperatorSessionLookup` (just `{ sessionId }`) and
 * returns an `AdminOperatorProfile` composed of the operator
 * identity, the session id, and the resolved capability snapshot.
 *
 * The dependency-injection seam lets loader tests assert the
 * shell / stale-session / denied / error / ready discriminator
 * without spinning the runtime.
 */
export type AdminProfileInput = Record<string, never>;

export type AdminProfileRouteData =
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
      readonly profile: AdminOperatorProfile;
    };

type GetAdminOperatorProfile = (
  environment: unknown,
  input: { readonly sessionId: string },
) => ReturnType<typeof getAdminOperatorProfileFromEnvironment>;

export type AdminProfileDependencies = {
  readonly getAdminOperatorProfile: GetAdminOperatorProfile;
};

const defaultDependencies: AdminProfileDependencies = {
  getAdminOperatorProfile: getAdminOperatorProfileFromEnvironment,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminProfileRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Operator profile unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Operator profile could not be loaded from the current backend state. Retry shortly; if the problem persists the upstream identity port is failing.",
});

export const loadAdminProfileRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  dependencies: AdminProfileDependencies = defaultDependencies,
): Effect.Effect<AdminProfileRouteData, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies.getAdminOperatorProfile(environment, { sessionId }).pipe(
          Effect.map(
            (profile): AdminProfileRouteData => ({
              kind: "ready",
              profile,
            }),
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
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
