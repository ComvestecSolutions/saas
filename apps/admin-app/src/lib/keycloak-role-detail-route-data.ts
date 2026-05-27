import { Effect, Option } from "effect";
import {
  reasonCatalogId,
  type KeycloakRoleDetail,
  type PlatformScope,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  getKeycloakRoleByIdFromEnvironment,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

export type AdminKeycloakRoleDetailTenantTarget = {
  readonly scope: PlatformScope;
  readonly scopeId: string;
};

export type AdminKeycloakRoleDetailInput = {
  readonly roleId: string;
  readonly tenant: AdminKeycloakRoleDetailTenantTarget;
};

export type AdminKeycloakRoleDetailRouteData =
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
      readonly tenant: AdminKeycloakRoleDetailTenantTarget;
      readonly role: KeycloakRoleDetail;
      readonly isFresh: boolean;
    };

type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;
type GetKeycloakRoleById = typeof getKeycloakRoleByIdFromEnvironment;

export type AdminKeycloakRoleDetailDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly getKeycloakRoleById: GetKeycloakRoleById;
};

const defaultDependencies: AdminKeycloakRoleDetailDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  getKeycloakRoleById: getKeycloakRoleByIdFromEnvironment,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminKeycloakRoleDetailRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Keycloak role detail unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Keycloak role detail could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
});

export const loadAdminKeycloakRoleDetailRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminKeycloakRoleDetailInput,
  dependencies: AdminKeycloakRoleDetailDependencies = defaultDependencies,
): Effect.Effect<AdminKeycloakRoleDetailRouteData, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies.resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap((requestContext) =>
            dependencies
              .getKeycloakRoleById(environment, {
                requestContext,
                query: {
                  tenant: input.tenant,
                  roleId: input.roleId,
                  reasonCatalogId: reasonCatalogId.keycloakRoleRead,
                },
              })
              .pipe(
                Effect.map((viewOption) =>
                  Option.match(viewOption, {
                    onNone: (): AdminKeycloakRoleDetailRouteData => ({
                      kind: "not-found",
                      title: "Keycloak role not found",
                      description:
                        "The requested Keycloak role could not be found for the selected tenant target.",
                    }),
                    onSome: (view): AdminKeycloakRoleDetailRouteData => ({
                      kind: "ready",
                      tenant: input.tenant,
                      role: view.detail,
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
    Effect.catchTag("KeycloakRoleReadUnauthorized", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot inspect Keycloak role detail for this tenant target.",
      } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
