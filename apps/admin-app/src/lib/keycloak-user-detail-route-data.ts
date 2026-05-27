import { Effect, Option } from "effect";
import {
  reasonCatalogId,
  type KeycloakUserSummary,
  type PlatformScope,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  getKeycloakUserByIdFromEnvironment,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

export type AdminKeycloakUserDetailTenantTarget = {
  readonly scope: PlatformScope;
  readonly scopeId: string;
};

export type AdminKeycloakUserDetailInput = {
  readonly userId: string;
  readonly tenant: AdminKeycloakUserDetailTenantTarget;
};

export type AdminKeycloakUserDetailRouteData =
  | { readonly kind: "shell" }
  | { readonly kind: "stale-session" }
  | { readonly kind: "denied"; readonly reason: string }
  | {
      readonly kind: "not-found";
      readonly title: string;
      readonly description: string;
    }
  | {
      readonly kind: "error";
      readonly title: string;
      readonly description: string;
    }
  | {
      readonly kind: "ready";
      readonly tenant: AdminKeycloakUserDetailTenantTarget;
      readonly user: KeycloakUserSummary;
      readonly isFresh: boolean;
    };

type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;
type GetKeycloakUserById = typeof getKeycloakUserByIdFromEnvironment;

export type AdminKeycloakUserDetailDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly getKeycloakUserById: GetKeycloakUserById;
};

const defaultDependencies: AdminKeycloakUserDetailDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  getKeycloakUserById: getKeycloakUserByIdFromEnvironment,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminKeycloakUserDetailRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Keycloak user detail unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Keycloak user detail could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
});

export const loadAdminKeycloakUserDetailRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminKeycloakUserDetailInput,
  dependencies: AdminKeycloakUserDetailDependencies = defaultDependencies,
): Effect.Effect<AdminKeycloakUserDetailRouteData, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies.resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap((requestContext) =>
            dependencies
              .getKeycloakUserById(environment, {
                requestContext,
                query: {
                  tenant: input.tenant,
                  userId: input.userId,
                  reasonCatalogId: reasonCatalogId.keycloakUserRead,
                },
              })
              .pipe(
                Effect.map((viewOption) =>
                  Option.match(viewOption, {
                    onNone: (): AdminKeycloakUserDetailRouteData => ({
                      kind: "not-found",
                      title: "Keycloak user not found",
                      description:
                        "The requested Keycloak user could not be found for the selected tenant target.",
                    }),
                    onSome: (view): AdminKeycloakUserDetailRouteData => ({
                      kind: "ready",
                      tenant: input.tenant,
                      user: view.summary,
                      isFresh: view.isFresh,
                    }),
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
    Effect.catchTag("KeycloakUserReadUnauthorized", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot inspect Keycloak user detail for this tenant target.",
      } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
