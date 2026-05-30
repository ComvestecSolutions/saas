import { Effect } from "effect";
import type {
  AdminMember,
  AdminMemberRole,
  RequestContext,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  listAdminOrganizationMembersFromEnvironment,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the spec-canonical
 * `/admin/members` admin-organization member roster surface
 * (admin-app implementation plan §11 — Phase 7 admin-org screens
 * commit 7b-1). Backed live by
 * `listAdminOrganizationMembersFromEnvironment` (Phase 7a-1
 * canonical alias of the existing `listMembersFromEnvironment`
 * admin-organization helper).
 *
 * The list helper takes a `RequestContext`, so the loader
 * composes two reads: `resolveTrustedRequestContextFromSessionId`
 * → `RequestContext`, then
 * `listAdminOrganizationMembersFromEnvironment({ requestContext,
 * filter })` → `ReadonlyArray<AdminMember>`. Mirrors the
 * `/desk/notify` + `/desk/runs` v2 list loader pattern.
 */
export type AdminMembersInput = {
  readonly filter?: {
    readonly role?: AdminMemberRole;
    readonly includeArchived?: boolean;
  };
};

export type AdminMembersRouteData =
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
      readonly members: ReadonlyArray<AdminMember>;
      readonly filter: AdminMembersInput["filter"];
    };

type ListAdminOrganizationMembers = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly filter?: AdminMembersInput["filter"];
  },
) => ReturnType<typeof listAdminOrganizationMembersFromEnvironment>;

type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminMembersDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly listAdminOrganizationMembers: ListAdminOrganizationMembers;
};

const defaultDependencies: AdminMembersDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  listAdminOrganizationMembers: listAdminOrganizationMembersFromEnvironment,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminMembersRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Admin members unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Admin organization members could not be loaded from the current backend state. Retry shortly; if the problem persists the upstream admin-organization port is failing.",
});

export const loadAdminMembersRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminMembersInput,
  dependencies: AdminMembersDependencies = defaultDependencies,
): Effect.Effect<AdminMembersRouteData, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies.resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap((requestContext) =>
            dependencies
              .listAdminOrganizationMembers(environment, {
                requestContext,
                filter: input.filter,
              })
              .pipe(
                Effect.map(
                  (members): AdminMembersRouteData => ({
                    kind: "ready",
                    members,
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
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
