import { Effect } from "effect";
import { isTaggedError } from "@comvestec/platform";

const transientAdminSessionReadinessTags = new Set([
  "AdminGovernanceRequestContextNotFoundError",
  "AdminGovernanceRequestContextMalformedError",
  "IdentitySessionRequestContextNotFoundError",
]);

const isTransientAdminSessionReadinessError = (error: unknown): boolean =>
  isTaggedError(error) && transientAdminSessionReadinessTags.has(error._tag);

export const retryTransientAdminSessionReadiness = <A, E, R>(
  createEffect: () => Effect.Effect<A, E, R>,
  remainingAttempts = 3,
): Effect.Effect<A, E, R> =>
  createEffect().pipe(
    Effect.catchAll((error) =>
      isTransientAdminSessionReadinessError(error) && remainingAttempts > 0
        ? Effect.sleep(120).pipe(
            Effect.flatMap(() =>
              retryTransientAdminSessionReadiness(
                createEffect,
                remainingAttempts - 1,
              ),
            ),
          )
        : Effect.fail(error),
    ),
  );
