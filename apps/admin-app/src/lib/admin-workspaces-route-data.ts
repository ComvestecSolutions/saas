import { Effect } from "effect";
import type { AdminWorkspace, RequestContext } from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  listAdminWorkspacesFromEnvironment,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the spec-canonical
 * `/admin/workspaces` admin-organization workspace tabs surface
 * (admin-app implementation plan §11 — Phase 7 admin-org screens
 * commit 7b-1). Backed live by
 * `listAdminWorkspacesFromEnvironment` (Phase 7a-1 canonical
 * alias of the existing `listWorkspacesFromEnvironment`
 * admin-workspaces helper).
 *
 * The list helper takes a `RequestContext` AND an
 * `ownerSubjectId`, so the loader composes two reads:
 * `resolveTrustedRequestContextFromSessionId` → `RequestContext`,
 * then `listAdminWorkspacesFromEnvironment({ requestContext,
 * ownerSubjectId })` where the owner is sourced from
 * `requestContext.actorId` (the trusted operator subject id).
 * A missing actor id reduces to stale-session because the
 * helper cannot identify the requesting operator without it.
 */
export type AdminWorkspacesInput = Record<string, never>;

export type AdminWorkspacesRouteData =
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
      readonly ownerSubjectId: string;
      readonly workspaces: ReadonlyArray<AdminWorkspace>;
    };

type ListAdminWorkspaces = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly ownerSubjectId: string;
  },
) => ReturnType<typeof listAdminWorkspacesFromEnvironment>;

type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminWorkspacesDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly listAdminWorkspaces: ListAdminWorkspaces;
};

const defaultDependencies: AdminWorkspacesDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  listAdminWorkspaces: listAdminWorkspacesFromEnvironment,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminWorkspacesRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Admin workspaces unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Admin workspaces could not be loaded from the current backend state. Retry shortly; if the problem persists the upstream admin-workspaces port is failing.",
});

export const loadAdminWorkspacesRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  dependencies: AdminWorkspacesDependencies = defaultDependencies,
): Effect.Effect<AdminWorkspacesRouteData, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies.resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap((requestContext) => {
            const ownerSubjectId = requestContext.actorId;
            if (ownerSubjectId === undefined || ownerSubjectId.length === 0) {
              return Effect.succeed({
                kind: "stale-session",
              } as const);
            }
            return dependencies
              .listAdminWorkspaces(environment, {
                requestContext,
                ownerSubjectId,
              })
              .pipe(
                Effect.map(
                  (workspaces): AdminWorkspacesRouteData => ({
                    kind: "ready",
                    ownerSubjectId,
                    workspaces,
                  }),
                ),
              );
          }),
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
