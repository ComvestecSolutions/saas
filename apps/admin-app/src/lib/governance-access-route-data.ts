import { Effect } from "effect";
import {
  adminGovernanceActionPolicyId,
  adminQuerySortDirection,
  permissionScopes,
  type AdminOperatorDirectorySnapshot,
  type AuthorizationNamespace,
  type AuthorizationRelation,
  type PermissionScope,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  getAdminOperatorDirectorySnapshotFromSessionId,
  listAdminAuthorizationTuplesFromSessionId,
  listAdminGovernanceActionPoliciesFromSessionId,
  listAdminGovernanceProjectionProfilesFromSessionId,
  type AdminGovernanceAuthorizationTupleQuery,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Access Control v2 route data (admin-app implementation plan
 * §8.7 + §11 — Phase 3 Governance & access commit 1). Mirrors
 * the v2 loader-trio pattern shipped for `/desk/config` and
 * `/desk/flag`: the route component consumes a thin
 * `shell | stale-session | denied | error | ready`
 * discriminated union.
 *
 * Backed live by four `*FromSessionId` helpers in
 * `packages/platform/src/services/apps/admin-{governance,operator-management}-actions.ts`:
 *
 *   - `listAdminGovernanceProjectionProfilesFromSessionId` →
 *     `ready.projectionProfiles`
 *   - `listAdminAuthorizationTuplesFromSessionId` (only when a
 *     `namespace + object + relation` triple is provided) →
 *     `ready.tupleQuery`
 *   - `listAdminGovernanceActionPoliciesFromSessionId` →
 *     `ready.actionPolicies` (filtered to the access-tab
 *     write/delete policies)
 *   - `getAdminOperatorDirectorySnapshotFromSessionId` →
 *     `ready.memberships` (admin-org operator membership
 *     directory)
 *
 * The catalog of `permissionScope.*` literals is surfaced as
 * `ready.permissionScopes` so the Scopes & permissions tab
 * (commit 4) can render the static vocabulary alongside the
 * policy bindings without an extra round-trip.
 *
 * The `AdminGovernanceReadAccessDenied{,RequestContextNotFound,RequestContextMalformed}Error`
 * braid is mapped onto the discriminated union via
 * `Effect.catchTag`; the
 * `AdminOperatorManagementAccessDeniedError` raised by the
 * operator directory helper carries its own `reason` and is
 * forwarded onto `denied.reason`.
 */
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

export type AdminGovernanceAccessV2Input = {
  readonly namespace?: AuthorizationNamespace;
  readonly object?: string;
  readonly relation?: AuthorizationRelation;
  readonly subject?: string;
  readonly detailSubject?: string;
  readonly page?: number;
};

export type AdminGovernanceAccessV2RouteData =
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
      readonly projectionProfiles: readonly ProjectionProfile[];
      readonly actionPolicies: readonly ActionPolicy[];
      readonly memberships: AdminOperatorDirectorySnapshot;
      readonly permissionScopes: readonly PermissionScope[];
      readonly tupleQuery?: AuthorizationTupleQueryResult;
    };

type ListProjectionProfiles =
  typeof listAdminGovernanceProjectionProfilesFromSessionId;
type ListAuthorizationTuples = typeof listAdminAuthorizationTuplesFromSessionId;
type ListActionPolicies = typeof listAdminGovernanceActionPoliciesFromSessionId;
type GetOperatorDirectory =
  typeof getAdminOperatorDirectorySnapshotFromSessionId;

export type AdminGovernanceAccessV2Dependencies = {
  readonly listProjectionProfiles: ListProjectionProfiles;
  readonly listAuthorizationTuples: ListAuthorizationTuples;
  readonly listActionPolicies: ListActionPolicies;
  readonly getOperatorDirectory: GetOperatorDirectory;
};

const defaultDependencies: AdminGovernanceAccessV2Dependencies = {
  listProjectionProfiles: listAdminGovernanceProjectionProfilesFromSessionId,
  listAuthorizationTuples: listAdminAuthorizationTuplesFromSessionId,
  listActionPolicies: listAdminGovernanceActionPoliciesFromSessionId,
  getOperatorDirectory: getAdminOperatorDirectorySnapshotFromSessionId,
};

const buildAuthorizationTupleQuery = (
  input: AdminGovernanceAccessV2Input,
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

const buildErrorState = (
  error: unknown,
): Extract<AdminGovernanceAccessV2RouteData, { readonly kind: "error" }> => {
  if (error instanceof Error && error.message.length > 0) {
    return {
      kind: "error",
      title: "Access control unavailable",
      description: error.message,
    };
  }
  return {
    kind: "error",
    title: "Access control unavailable",
    description:
      "Access control state could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
  };
};

export const loadAdminGovernanceAccessV2RouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminGovernanceAccessV2Input = {},
  dependencies: AdminGovernanceAccessV2Dependencies = defaultDependencies,
): Effect.Effect<AdminGovernanceAccessV2RouteData, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        Effect.all({
          projectionProfiles: dependencies.listProjectionProfiles(environment, {
            sessionId,
          }),
          actionPolicies: dependencies
            .listActionPolicies(environment, { sessionId })
            .pipe(
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
          memberships: dependencies.getOperatorDirectory(environment, {
            sessionId,
          }),
          tupleQuery: (() => {
            const tupleQuery = buildAuthorizationTupleQuery(input);
            return tupleQuery === undefined
              ? Effect.succeed(undefined)
              : dependencies.listAuthorizationTuples(environment, {
                  sessionId,
                  query: tupleQuery,
                });
          })(),
        }).pipe(
          Effect.map(
            ({
              projectionProfiles,
              actionPolicies,
              memberships,
              tupleQuery,
            }): AdminGovernanceAccessV2RouteData => ({
              kind: "ready",
              projectionProfiles,
              actionPolicies,
              memberships,
              permissionScopes,
              ...(tupleQuery === undefined ? {} : { tupleQuery }),
            }),
          ),
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
          "The current operator session cannot review authorization tuples, projection profiles, or permission scopes.",
      } as const),
    ),
    Effect.catchTag("AdminOperatorManagementAccessDeniedError", (error) =>
      Effect.succeed({
        kind: "denied",
        reason: error.reason,
      } as const),
    ),
    Effect.catchTag("AdminGovernanceRequestContextNotFoundError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("AdminGovernanceRequestContextMalformedError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
