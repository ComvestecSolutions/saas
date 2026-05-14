import { Effect } from "effect";
import {
  adminGovernanceActionPolicyId,
  adminQuerySortDirection,
  type AuthorizationNamespace,
  type AuthorizationRelation,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  listAdminAuthorizationTuplesFromSessionId,
  listAdminGovernanceActionPoliciesFromSessionId,
  listAdminGovernanceProjectionProfilesFromSessionId,
  type AdminGovernanceAuthorizationTupleQuery,
} from "@comvestec/platform";

type ProjectionProfile = Awaited<
  Effect.Effect.Success<
    ReturnType<typeof listAdminGovernanceProjectionProfilesFromSessionId>
  >
>[number];

type AuthorizationTupleQueryResult = Awaited<
  Effect.Effect.Success<
    ReturnType<typeof listAdminAuthorizationTuplesFromSessionId>
  >
>;

type ActionPolicy = Awaited<
  Effect.Effect.Success<
    ReturnType<typeof listAdminGovernanceActionPoliciesFromSessionId>
  >
>[number];

export type AdminAccessControlLoaderInput = {
  readonly namespace?: AuthorizationNamespace;
  readonly object?: string;
  readonly relation?: AuthorizationRelation;
  readonly subject?: string;
  readonly detailSubject?: string;
  readonly page?: number;
};

export type AdminAccessControlRouteData =
  | { readonly kind: "shell" }
  | { readonly kind: "stale-session" }
  | { readonly kind: "denied"; readonly reason: string }
  | {
      readonly kind: "ready";
      readonly profiles: readonly ProjectionProfile[];
      readonly actionPolicies: readonly ActionPolicy[];
      readonly tupleQuery?: AuthorizationTupleQueryResult;
    };

type ListProjectionProfiles = (
  environment: unknown,
  input: {
    readonly sessionId: string;
  },
) => ReturnType<typeof listAdminGovernanceProjectionProfilesFromSessionId>;

type ListAuthorizationTuples = (
  environment: unknown,
  input: {
    readonly sessionId: string;
    readonly query: AdminGovernanceAuthorizationTupleQuery;
  },
) => ReturnType<typeof listAdminAuthorizationTuplesFromSessionId>;

type ListActionPolicies = (
  environment: unknown,
  input: {
    readonly sessionId: string;
  },
) => ReturnType<typeof listAdminGovernanceActionPoliciesFromSessionId>;

const buildAuthorizationTupleQuery = (
  input: AdminAccessControlLoaderInput,
): AdminGovernanceAuthorizationTupleQuery | undefined =>
  input.namespace === undefined ||
  input.object === undefined ||
  input.relation === undefined
    ? undefined
    : {
        namespace: input.namespace,
        object: input.object,
        relation: input.relation,
        ...(input.subject === undefined ? {} : { subject: input.subject }),
        page: {
          page: input.page ?? 1,
          pageSize: 10,
        },
        sortField: "subject",
        sortDirection: adminQuerySortDirection.asc,
        exportMode: false,
        ...(input.detailSubject === undefined
          ? {}
          : {
              detailLookup: {
                namespace: input.namespace,
                object: input.object,
                relation: input.relation,
                subject: input.detailSubject,
              },
            }),
      };

export const loadAdminAccessControlRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminAccessControlLoaderInput = {},
  listProjectionProfiles: ListProjectionProfiles | undefined = undefined,
  listAuthorizationTuples: ListAuthorizationTuples | undefined = undefined,
  listActionPolicies: ListActionPolicies | undefined = undefined,
): Effect.Effect<AdminAccessControlRouteData, never, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      Effect.all({
        profiles: (
          listProjectionProfiles ??
          ((currentEnvironment, requestInput) =>
            listAdminGovernanceProjectionProfilesFromSessionId(
              currentEnvironment,
              requestInput,
            ))
        )(environment, {
          sessionId,
        }),
        actionPolicies: (
          listActionPolicies ??
          ((currentEnvironment, requestInput) =>
            listAdminGovernanceActionPoliciesFromSessionId(
              currentEnvironment,
              requestInput,
            ))
        )(environment, {
          sessionId,
        }).pipe(
          Effect.map((policies) =>
            policies.filter(
              (policy) =>
                policy.actionId ===
                  adminGovernanceActionPolicyId.authorizationTupleWrite ||
                policy.actionId ===
                  adminGovernanceActionPolicyId.authorizationTupleDelete,
            ),
          ),
        ),
        tupleQuery: (() => {
          const tupleQuery = buildAuthorizationTupleQuery(input);

          return tupleQuery === undefined
            ? Effect.succeed(undefined)
            : (
                listAuthorizationTuples ??
                ((currentEnvironment, requestInput) =>
                  listAdminAuthorizationTuplesFromSessionId(
                    currentEnvironment,
                    requestInput,
                  ))
              )(environment, {
                sessionId,
                query: tupleQuery,
              });
        })(),
      }).pipe(
        Effect.map(
          ({
            profiles,
            actionPolicies,
            tupleQuery,
          }): AdminAccessControlRouteData => ({
            kind: "ready",
            profiles,
            actionPolicies,
            ...(tupleQuery === undefined ? {} : { tupleQuery }),
          }),
        ),
      ),
    ),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
    ),
    Effect.catchTag("AdminGovernanceReadAccessDeniedError", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot review authorization tuples or projection profiles.",
      } as const),
    ),
    Effect.catchTag("AdminGovernanceRequestContextNotFoundError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("AdminGovernanceRequestContextMalformedError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchAll(() => Effect.succeed({ kind: "stale-session" } as const)),
  );
