import { Effect } from "effect";
import type { AdminMember, RequestContext } from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  listAdminOrganizationMembersFromEnvironment,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

export type AdminMemberDetailInput = {
  readonly memberId: string;
};

export type AdminMemberDetailRouteData =
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
      readonly member: AdminMember;
    };

type ListAdminOrganizationMembers = (
  environment: unknown,
  input: { readonly requestContext: RequestContext },
) => ReturnType<typeof listAdminOrganizationMembersFromEnvironment>;

type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminMemberDetailDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly listAdminOrganizationMembers: ListAdminOrganizationMembers;
};

const defaultDependencies: AdminMemberDetailDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  listAdminOrganizationMembers: listAdminOrganizationMembersFromEnvironment,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminMemberDetailRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Admin member detail unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Admin member detail could not be loaded from the current backend state. Retry shortly; if the problem persists the upstream admin-organization port is failing.",
});

const buildNotFoundState = (
  memberId: string,
): Extract<AdminMemberDetailRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Admin member not found",
  description: `No admin organization member matched '${memberId}'.`,
});

export const loadAdminMemberDetailRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminMemberDetailInput,
  dependencies: AdminMemberDetailDependencies = defaultDependencies,
): Effect.Effect<AdminMemberDetailRouteData, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies.resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap((requestContext) =>
            dependencies
              .listAdminOrganizationMembers(environment, { requestContext })
              .pipe(
                Effect.map((members): AdminMemberDetailRouteData => {
                  const member = members.find(
                    (candidate) => candidate.id === input.memberId,
                  );

                  return member === undefined
                    ? buildNotFoundState(input.memberId)
                    : {
                        kind: "ready",
                        member,
                      };
                }),
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
