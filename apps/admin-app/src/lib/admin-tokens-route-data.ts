import { Effect } from "effect";
import type {
  AdminOperatorTestTokenListInput,
  AdminOperatorTestTokenListResult,
  AdminOperatorTestTokenListStatusFilter,
  RequestContext,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  listAdminOperatorTestTokensFromEnvironment,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the spec-canonical
 * `/admin/tokens` admin-operator-test-tokens roster surface
 * (admin-app implementation plan §11 — Phase 7 admin-org screens
 * commit 7b-2-tokens). Backed live by the Phase 7a-2b-iii helper
 * `listAdminOperatorTestTokensFromEnvironment`, which gates
 * end-to-end through `resolveTrustedRequestContextFromSessionId`
 * and the platform service's admin-owner floor (only
 * `admin-owner` roster members may list / issue / revoke).
 *
 * Mirrors the `/admin/members` / `/admin/audit` v2 loader-trio
 * shape: shell on missing session, stale-session on identity
 * gaps, denied on the platform service's
 * `AdminOperatorTestTokensAccessDenied` tag, error on any other
 * upstream failure.
 */
export type AdminTokensInput = {
  readonly filter?: {
    readonly status?: AdminOperatorTestTokenListStatusFilter;
  };
  readonly pageSize?: number;
  readonly pageToken?: string;
};

export type AdminTokensRouteData =
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
      readonly generatedAt: AdminOperatorTestTokenListResult["tokens"][number]["expiresAt"];
      readonly result: AdminOperatorTestTokenListResult;
      readonly filter: AdminTokensInput["filter"];
    };

type ListAdminOperatorTestTokens = (
  environment: unknown,
  input: AdminOperatorTestTokenListInput,
) => ReturnType<typeof listAdminOperatorTestTokensFromEnvironment>;

type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminTokensDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly listAdminOperatorTestTokens: ListAdminOperatorTestTokens;
};

const defaultDependencies: AdminTokensDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  listAdminOperatorTestTokens: listAdminOperatorTestTokensFromEnvironment,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminTokensRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Admin operator test tokens unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Admin operator test tokens could not be loaded from the current backend state. Retry shortly; if the problem persists the upstream admin-operator-test-tokens port is failing.",
});

const buildListInput = (
  requestContext: RequestContext,
  input: AdminTokensInput,
): AdminOperatorTestTokenListInput => ({
  requestContext,
  ...(input.filter?.status === undefined
    ? {}
    : { status: input.filter.status }),
  ...(input.pageSize === undefined ? {} : { pageSize: input.pageSize }),
  ...(input.pageToken === undefined ? {} : { pageToken: input.pageToken }),
});

export const loadAdminTokensRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminTokensInput,
  dependencies: AdminTokensDependencies = defaultDependencies,
): Effect.Effect<AdminTokensRouteData, never> => {
  const generatedAt = new Date().toISOString();

  return extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies.resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap((requestContext) =>
            dependencies
              .listAdminOperatorTestTokens(
                environment,
                buildListInput(requestContext, input),
              )
              .pipe(
                Effect.map(
                  (result): AdminTokensRouteData => ({
                    kind: "ready",
                    generatedAt,
                    result,
                    filter: input.filter,
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
    Effect.catchTag("AdminOperatorTestTokensAccessDenied", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "Only admin-owner roster members may inspect admin-operator-test-tokens activity.",
      } as const),
    ),
    Effect.catchTag("AdminOperatorTestTokensMissingActor", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
};
