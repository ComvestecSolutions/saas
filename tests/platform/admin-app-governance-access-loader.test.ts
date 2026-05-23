/**
 * Admin-app governance-access v2 loader tests (admin-app
 * implementation plan §8.7 + §11 — Phase 3 Governance &
 * access commit 1). Covers the discriminated-union mapping of
 * the `/r/access` loader trio backed live by the
 * `*FromSessionId` helpers in
 * `packages/platform/src/services/apps/admin-{governance,operator-management}-actions.ts`:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `AdminGovernanceReadAccessDeniedError` → `denied`
 *   - `AdminOperatorManagementAccessDeniedError` → `denied`
 *     (carrying the upstream reason)
 *   - `AdminGovernanceRequestContext{NotFound,Malformed}Error` → `stale-session`
 *   - boundary error → `error`
 *   - happy path → `ready` carrying projectionProfiles +
 *     actionPolicies + memberships + permissionScopes
 *     (tupleQuery only when namespace+object+relation are
 *     supplied)
 *
 * Mirrors `tests/platform/admin-app-audit-log-v2-loader.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  adminGovernanceActionPolicyId,
  authorizationNamespace,
  authorizationRelation,
  permissionScopes,
} from "@comvestec/contracts";
import {
  loadAdminGovernanceAccessV2RouteDataFromRequest,
  type AdminGovernanceAccessV2Dependencies,
} from "../../apps/admin-app/src/lib/governance-access-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const sampleProjectionProfiles = [
  { profile: "operator-default", description: "Default operator projection" },
];

const sampleActionPolicies = [
  { actionId: adminGovernanceActionPolicyId.authorizationTupleWrite },
  { actionId: adminGovernanceActionPolicyId.authorizationTupleDelete },
  { actionId: "noise.policy.id" },
];

const sampleDirectory = {
  currentOperator: { userId: "usr_self", email: "self@example.com" },
  operators: [{ userId: "usr_self", email: "self@example.com" }],
};

const sampleTupleQueryPage = {
  rows: [],
  totalCount: 0,
};

const succeedingDependencies = {
  listProjectionProfiles: () => Effect.succeed(sampleProjectionProfiles),
  listAuthorizationTuples: () => Effect.succeed(sampleTupleQueryPage),
  listActionPolicies: () => Effect.succeed(sampleActionPolicies),
  getOperatorDirectory: () => Effect.succeed(sampleDirectory),
} as unknown as AdminGovernanceAccessV2Dependencies;

const failingDependencies = (
  tag: string,
  extra: Record<string, unknown> = {},
): AdminGovernanceAccessV2Dependencies =>
  ({
    listProjectionProfiles: () => Effect.fail({ _tag: tag, ...extra } as const),
    listAuthorizationTuples: () =>
      Effect.fail({ _tag: tag, ...extra } as const),
    listActionPolicies: () => Effect.fail({ _tag: tag, ...extra } as const),
    getOperatorDirectory: () => Effect.fail({ _tag: tag, ...extra } as const),
  }) as unknown as AdminGovernanceAccessV2Dependencies;

const throwingDependencies = (
  error: unknown,
): AdminGovernanceAccessV2Dependencies =>
  ({
    listProjectionProfiles: () => Effect.fail(error),
    listAuthorizationTuples: () => Effect.fail(error),
    listActionPolicies: () => Effect.fail(error),
    getOperatorDirectory: () => Effect.fail(error),
  }) as unknown as AdminGovernanceAccessV2Dependencies;

describe("admin-app governance-access v2 loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminGovernanceAccessV2RouteDataFromRequest(
        buildRequest(undefined),
        {},
        {},
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready without tupleQuery when no namespace+object+relation triple is provided", async () => {
    const result = await Effect.runPromise(
      loadAdminGovernanceAccessV2RouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        {},
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.projectionProfiles).toHaveLength(1);
    expect(result.memberships.operators).toHaveLength(1);
    expect(result.permissionScopes).toEqual(permissionScopes);
    expect(result.tupleQuery).toBeUndefined();
    expect(result.actionPolicies).toHaveLength(2);
  });

  it("includes tupleQuery when namespace+object+relation are supplied", async () => {
    const result = await Effect.runPromise(
      loadAdminGovernanceAccessV2RouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        {
          namespace: authorizationNamespace.tenant,
          object: "org_acme",
          relation: authorizationRelation.member,
        },
        succeedingDependencies,
      ),
    );
    if (result.kind !== "ready") return;
    expect(result.tupleQuery).toEqual(sampleTupleQueryPage);
  });

  it("returns denied when the platform helper raises AdminGovernanceReadAccessDeniedError", async () => {
    const result = await Effect.runPromise(
      loadAdminGovernanceAccessV2RouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        {},
        failingDependencies("AdminGovernanceReadAccessDeniedError"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns denied with the upstream reason when AdminOperatorManagementAccessDeniedError fires", async () => {
    const result = await Effect.runPromise(
      loadAdminGovernanceAccessV2RouteDataFromRequest(
        buildRequest("sess-denied-op"),
        {},
        {},
        failingDependencies("AdminOperatorManagementAccessDeniedError", {
          reason: "operator-directory-forbidden",
        }),
      ),
    );
    expect(result.kind).toBe("denied");
    if (result.kind !== "denied") return;
    expect(result.reason).toBe("operator-directory-forbidden");
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminGovernanceAccessV2RouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        {},
        failingDependencies("AdminGovernanceRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns stale-session when the request context is malformed", async () => {
    const result = await Effect.runPromise(
      loadAdminGovernanceAccessV2RouteDataFromRequest(
        buildRequest("sess-malformed"),
        {},
        {},
        failingDependencies("AdminGovernanceRequestContextMalformedError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns error when an upstream helper raises an untagged Error", async () => {
    const result = await Effect.runPromise(
      loadAdminGovernanceAccessV2RouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        {},
        throwingDependencies(
          new Error("Upstream access-control aggregate unavailable."),
        ),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Access control unavailable");
    expect(result.description).toBe(
      "Upstream access-control aggregate unavailable.",
    );
  });
});
