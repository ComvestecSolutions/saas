import { Effect, Option } from "effect";
import type { RequestContext, WorkflowRunDetail } from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  getWorkflowRunsAdminDetailFromEnvironment,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the spec-canonical
 * `/r/run/$id` Workflow Run Detail v2 surface (admin-app
 * implementation plan §8.14 + §11 — Phase 6 vendor + workflow
 * operator screens commit 6b). Mirrors the v2 loader-trio
 * pattern shipped for `/r/incident/$incidentId`,
 * `/r/legal-hold/$holdId`, `/r/delivery/$deliveryId`, and
 * `/r/api-key/$keyId`.
 *
 * Backed live by `getWorkflowRunsAdminDetailFromEnvironment`
 * (admin-app implementation plan §9 item 15). The platform
 * service takes a `RequestContext` rather than a session id, so
 * the loader composes two reads through `Effect.all`:
 *
 *   - `resolveTrustedRequestContextFromSessionId` →
 *     `RequestContext`.
 *   - `getWorkflowRunsAdminDetailFromEnvironment` →
 *     `WorkflowRunDetail` (steps + payload projection + audit
 *     correlation id).
 *
 * The replay + cancel CTAs are wired through `HighRiskActionGuard`
 * at the route component level — the mutations-server handler
 * bodies for `replayWorkflowRunFromEnvironment` /
 * `cancelWorkflowRunFromEnvironment` are tracked under the
 * Admin app row's Phase 6 follow-ups in the implementation
 * tracker (mirrors the rotate / revoke CTAs on
 * `/r/api-key/$keyId`).
 */
export type AdminWorkflowRunDetailInput = {
  readonly runId: string;
};

export type AdminWorkflowRunDetailRouteData =
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
      readonly run: WorkflowRunDetail;
    };

type GetWorkflowRunsAdminDetail = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly runId: string;
  },
) => ReturnType<typeof getWorkflowRunsAdminDetailFromEnvironment>;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminWorkflowRunDetailDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly getWorkflowRunsAdminDetail: GetWorkflowRunsAdminDetail;
};

const defaultDependencies: AdminWorkflowRunDetailDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  getWorkflowRunsAdminDetail: getWorkflowRunsAdminDetailFromEnvironment,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminWorkflowRunDetailRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Workflow run detail unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Workflow run detail could not be loaded from the current backend state. Retry shortly; if the problem persists the upstream workflow-jobs admin port is failing and the platform has degraded to an unavailable state.",
});

const notFoundState: Extract<
  AdminWorkflowRunDetailRouteData,
  { readonly kind: "error" }
> = {
  kind: "error",
  title: "Workflow run not found",
  description:
    "The requested workflow run could not be located. The run id may be stale or pruned, or the workflow-jobs admin port may not yet expose this run.",
};

export const loadAdminWorkflowRunDetailRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminWorkflowRunDetailInput,
  dependencies: AdminWorkflowRunDetailDependencies = defaultDependencies,
): Effect.Effect<AdminWorkflowRunDetailRouteData, never> =>
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
              .getWorkflowRunsAdminDetail(environment, {
                requestContext,
                runId: input.runId,
              })
              .pipe(
                Effect.map(
                  (view): AdminWorkflowRunDetailRouteData =>
                    Option.match(view.detail, {
                      onNone: () => notFoundState,
                      onSome: (run) => ({ kind: "ready", run }) as const,
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
        reason:
          "The current operator session cannot inspect this workflow run.",
      } as const),
    ),
    Effect.catchTag("WorkflowRunsAdminMissingActorIdentity", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("WorkflowRunsAdminRunNotFound", () =>
      Effect.succeed(notFoundState),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
