import { Effect } from "effect";
import type {
  RequestContext,
  WorkflowRunsListFilters,
  WorkflowRunsListResult,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  listWorkflowRunsAdminFromEnvironment,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the spec-canonical
 * `/r/runs` Workflow Runs v2 list surface (admin-app
 * implementation plan §8.14 + §11 — Phase 6 vendor + workflow
 * operator screens commit 6b). Mirrors the v2 loader-trio
 * pattern shipped for `/r/vendors`, `/r/webhook`,
 * `/r/retention`, and `/r/notify`.
 *
 * Backed live by `listWorkflowRunsAdminFromEnvironment`
 * (admin-app implementation plan §9 item 15). The platform
 * service takes a `RequestContext` rather than a session id, so
 * the loader composes two reads through `Effect.all`:
 *
 *   - `resolveTrustedRequestContextFromSessionId` →
 *     `RequestContext`.
 *   - `listWorkflowRunsAdminFromEnvironment` →
 *     `WorkflowRunsListResult` (runs + pagination +
 *     partial-failures envelope).
 *
 * Filter inputs (module / status / since / until) flow through
 * URL search params; bad values are silently dropped at the
 * route-server boundary so the page renders an unfiltered list
 * rather than a typed error.
 *
 * Partial-failure semantics are preserved end-to-end: the
 * `partialFailures` array surfaces in the `ready` variant so the
 * route can render an inline partial-failure notice without
 * collapsing the page to `error`.
 */
export type AdminWorkflowRunsListInput = {
  readonly filters: WorkflowRunsListFilters;
  readonly pageSize: number;
  readonly pageToken?: string;
};

export type AdminWorkflowRunsListRouteData =
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
      readonly filters: WorkflowRunsListFilters;
      readonly result: WorkflowRunsListResult;
    };

type ListWorkflowRunsAdmin = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly filters: WorkflowRunsListFilters;
    readonly pageSize: number;
    readonly pageToken?: string;
  },
) => ReturnType<typeof listWorkflowRunsAdminFromEnvironment>;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminWorkflowRunsListDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly listWorkflowRunsAdmin: ListWorkflowRunsAdmin;
};

const defaultDependencies: AdminWorkflowRunsListDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  listWorkflowRunsAdmin: listWorkflowRunsAdminFromEnvironment,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminWorkflowRunsListRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Workflow runs unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Workflow runs could not be loaded from the current backend state. Retry shortly; if the problem persists the upstream workflow-jobs admin port is failing and the platform has degraded to an unavailable state.",
});

export const loadAdminWorkflowRunsListRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminWorkflowRunsListInput,
  dependencies: AdminWorkflowRunsListDependencies = defaultDependencies,
): Effect.Effect<AdminWorkflowRunsListRouteData, never> =>
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
              .listWorkflowRunsAdmin(environment, {
                requestContext,
                filters: input.filters,
                pageSize: input.pageSize,
                ...(input.pageToken === undefined
                  ? {}
                  : { pageToken: input.pageToken }),
              })
              .pipe(
                Effect.map(
                  (view): AdminWorkflowRunsListRouteData => ({
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
    Effect.catchTag("WorkflowRunsAdminUnauthorized", () =>
      Effect.succeed({
        kind: "denied",
        reason: "The current operator session cannot inspect workflow runs.",
      } as const),
    ),
    Effect.catchTag("WorkflowRunsAdminMissingActorIdentity", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
