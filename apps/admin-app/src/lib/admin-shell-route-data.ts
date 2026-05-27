import { Effect } from "effect";
import {
  extractRequiredSubscriberJourneySessionId,
  getRunAsBannerStateFromEnvironment,
  getAdminOperatorProfileFromSessionId,
  isTaggedError,
  listAdminWorkspacesFromEnvironment,
  listSavedViewsFromEnvironment,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";
import { loadAdminCapabilitySnapshotV2RouteDataFromRequest } from "./capability-snapshot-v2-route-data";
import type {
  AdminOperatorProfile,
  AdminSavedView,
  AdminWorkspace,
  RunAsBannerState,
} from "@comvestec/contracts";

export type AdminShellReadyPayload = {
  readonly profile: AdminOperatorProfile;
  readonly workspaces: readonly AdminWorkspace[];
  readonly savedViews: readonly AdminSavedView[];
  readonly runAsBanner: RunAsBannerState;
};

export type AdminShellRouteData =
  | { readonly kind: "shell" }
  | { readonly kind: "stale-session" }
  | { readonly kind: "denied"; readonly reason: string }
  | {
      readonly kind: "error";
      readonly title: string;
      readonly description: string;
    }
  | ({ readonly kind: "ready" } & AdminShellReadyPayload);

type RefreshCapabilitySnapshotV2 = (
  request: Request,
  environment: unknown,
) => ReturnType<typeof loadAdminCapabilitySnapshotV2RouteDataFromRequest>;

const loadAdminShellReadyPayloadFromEnvironment = (
  environment: unknown,
  input: {
    readonly sessionId: string;
  },
) =>
  Effect.all({
    profile: getAdminOperatorProfileFromSessionId(environment, input),
    requestContext: resolveTrustedRequestContextFromSessionId(
      environment,
      input.sessionId,
    ),
  }).pipe(
    Effect.flatMap(({ profile, requestContext }) =>
      Effect.all({
        workspaces: listAdminWorkspacesFromEnvironment(environment, {
          requestContext,
          ownerSubjectId: profile.identity.actorId,
        }),
        savedViews: listSavedViewsFromEnvironment(environment, {
          requestContext,
          ownerSubjectId: profile.identity.actorId,
        }),
        runAsBannerView: getRunAsBannerStateFromEnvironment(environment, {
          requestContext,
        }),
      }).pipe(
        Effect.map(
          ({
            workspaces,
            savedViews,
            runAsBannerView,
          }): AdminShellReadyPayload => ({
            profile,
            workspaces,
            savedViews,
            runAsBanner: runAsBannerView.banner,
          }),
        ),
      ),
    ),
  );

type LoadAdminShellReadyPayload =
  typeof loadAdminShellReadyPayloadFromEnvironment;

/**
 * Fire-and-forget capability snapshot v2 refresh runs in
 * parallel with the operator profile fetch on every shell
 * load. The result is intentionally discarded — its only job
 * here is to warm the bounded snapshot cache that the Phase 2
 * Desk Center posture board (commit 2) reads through the
 * dedicated `capability-snapshot-v2-route-server.ts` server
 * function. Errors never poison the shell load; they surface
 * through that dedicated route data instead.
 */
const refreshCapabilitySnapshotV2InParallel = (
  request: Request,
  environment: unknown,
  refresh: RefreshCapabilitySnapshotV2,
) => Effect.forkDaemon(Effect.ignore(refresh(request, environment)));

const buildAdminShellErrorState = (
  error: unknown,
): Extract<AdminShellRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Admin workspace unavailable",
  description:
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : "The trusted operator session could not be established right now.",
});

const isAdminShellStaleSessionError = (error: unknown): boolean =>
  isTaggedError(error) &&
  (error._tag === "AdminGovernanceRequestContextNotFoundError" ||
    error._tag === "AdminGovernanceRequestContextMalformedError" ||
    error._tag === "IdentitySessionRequestContextNotFoundError" ||
    error._tag === "IdentitySessionRequestContextMalformedError" ||
    error._tag === "AdminGovernanceReadUnauthenticatedActorError");

const isAdminShellAccessDeniedError = (error: unknown): boolean =>
  isTaggedError(error) && error._tag === "AdminGovernanceReadAccessDeniedError";

export const loadAdminShellRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  loadAdminShellReadyPayload: LoadAdminShellReadyPayload = (
    currentEnvironment,
    input,
  ) => loadAdminShellReadyPayloadFromEnvironment(currentEnvironment, input),
  refreshCapabilitySnapshotV2: RefreshCapabilitySnapshotV2 = (
    currentRequest,
    currentEnvironment,
  ) =>
    loadAdminCapabilitySnapshotV2RouteDataFromRequest(
      currentRequest,
      currentEnvironment,
    ),
) =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.tap(() =>
      refreshCapabilitySnapshotV2InParallel(
        request,
        environment,
        refreshCapabilitySnapshotV2,
      ),
    ),
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        loadAdminShellReadyPayload(environment, { sessionId }).pipe(
          Effect.map(
            (ready): AdminShellRouteData => ({
              kind: "ready",
              ...ready,
            }),
          ),
        ),
      ),
    ),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
    ),
    Effect.catchAll((error) =>
      Effect.succeed(
        isAdminShellStaleSessionError(error)
          ? ({ kind: "stale-session" } as const)
          : isAdminShellAccessDeniedError(error)
            ? ({
                kind: "denied",
                reason:
                  "The current session is authenticated, but only platform and support operators can open the admin workspace.",
              } as const)
            : buildAdminShellErrorState(error),
      ),
    ),
  );
