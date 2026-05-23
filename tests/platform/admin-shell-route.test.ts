import { Effect } from "effect";
import {
  actorType,
  adminOperatorCapability,
  adminRoutePath,
} from "@comvestec/contracts";
import { subscriberJourneySessionCookieName } from "@comvestec/platform";
import { loadAdminShellRouteDataFromRequest } from "../../apps/admin-app/src/lib/admin-shell-route-data";

const capabilitySnapshot = {
  actorType: actorType.platformOperator,
  actorId: "usr_platform_operator",
  sessionId: "sess_admin_shell",
  capabilities: [
    {
      capability: adminOperatorCapability.operationsHome,
      routePath: adminRoutePath.operationsHome,
      visible: true,
      allowed: true,
      label: "Operations Home",
      actionPolicyIds: [],
    },
    {
      capability: adminOperatorCapability.repairOperations,
      routePath: adminRoutePath.repairOperations,
      visible: true,
      allowed: true,
      label: "Repair Operations",
      actionPolicyIds: [],
    },
  ],
} as const;

const operatorProfile = {
  identity: {
    actorId: capabilitySnapshot.actorId,
    username: "operator@comvestec.com",
    email: "operator@comvestec.com",
    displayName: "Comvestec Platform Operator",
    actorType: actorType.platformOperator,
    enabled: true,
  },
  sessionId: capabilitySnapshot.sessionId,
  capabilities: capabilitySnapshot.capabilities,
} as const;

const failingProfileLookup = (
  error: unknown,
): NonNullable<Parameters<typeof loadAdminShellRouteDataFromRequest>[2]> =>
  (() => Effect.fail(error)) as unknown as NonNullable<
    Parameters<typeof loadAdminShellRouteDataFromRequest>[2]
  >;

describe("admin shell route data", () => {
  it("falls back to shell state when the operator session cookie is missing", async () => {
    await expect(
      Effect.runPromise(
        loadAdminShellRouteDataFromRequest(
          new Request("http://localhost:3004/"),
          {},
          () => Effect.succeed(operatorProfile),
        ),
      ),
    ).resolves.toEqual({ kind: "shell" });
  });

  it("reports stale-session when the request context can no longer be resolved", async () => {
    await expect(
      Effect.runPromise(
        loadAdminShellRouteDataFromRequest(
          new Request("http://localhost:3004/", {
            headers: {
              cookie: `${subscriberJourneySessionCookieName}=sess_admin_stale`,
            },
          }),
          {},
          () =>
            Effect.fail({
              _tag: "AdminGovernanceRequestContextNotFoundError",
              sessionId: "sess_admin_stale",
            } as const),
        ),
      ),
    ).resolves.toEqual({ kind: "stale-session" });
  });

  it("reports stale-session when the session loses its authenticated actor", async () => {
    await expect(
      Effect.runPromise(
        loadAdminShellRouteDataFromRequest(
          new Request("http://localhost:3004/", {
            headers: {
              cookie: `${subscriberJourneySessionCookieName}=sess_admin_missing_actor`,
            },
          }),
          {},
          () =>
            Effect.fail({
              _tag: "AdminGovernanceReadUnauthenticatedActorError",
            } as const),
        ),
      ),
    ).resolves.toEqual({ kind: "stale-session" });
  });

  it("returns denied when the trusted session is authenticated but not allowed to open the admin workspace", async () => {
    await expect(
      Effect.runPromise(
        loadAdminShellRouteDataFromRequest(
          new Request("http://localhost:3004/", {
            headers: {
              cookie: `${subscriberJourneySessionCookieName}=sess_admin_denied`,
            },
          }),
          {},
          () =>
            Effect.fail({
              _tag: "AdminGovernanceReadAccessDeniedError",
              actorType: actorType.individualUser,
            } as const),
        ),
      ),
    ).resolves.toEqual({
      kind: "denied",
      reason:
        "The current session is authenticated, but only platform and support operators can open the admin workspace.",
    });
  });

  it("returns the current operator profile for a trusted session", async () => {
    await expect(
      Effect.runPromise(
        loadAdminShellRouteDataFromRequest(
          new Request("http://localhost:3004/", {
            headers: {
              cookie: `${subscriberJourneySessionCookieName}=sess_admin_ready`,
            },
          }),
          {},
          () => Effect.succeed(operatorProfile),
        ),
      ),
    ).resolves.toEqual({
      kind: "ready",
      profile: operatorProfile,
    });
  });

  it("retries transient request-context misses before returning the ready shell", async () => {
    let attempts = 0;

    await expect(
      Effect.runPromise(
        loadAdminShellRouteDataFromRequest(
          new Request("http://localhost:3004/", {
            headers: {
              cookie: `${subscriberJourneySessionCookieName}=sess_admin_retry`,
            },
          }),
          {},
          () => {
            attempts += 1;

            if (attempts < 3) {
              return Effect.fail({
                _tag: "AdminGovernanceRequestContextNotFoundError",
                sessionId: "sess_admin_retry",
              } as const);
            }

            return Effect.succeed(operatorProfile);
          },
        ),
      ),
    ).resolves.toEqual({
      kind: "ready",
      profile: operatorProfile,
    });
    expect(attempts).toBe(3);
  });

  it("returns an error state instead of looping through stale-session for unexpected shell failures", async () => {
    await expect(
      Effect.runPromise(
        loadAdminShellRouteDataFromRequest(
          new Request("http://localhost:3004/", {
            headers: {
              cookie: `${subscriberJourneySessionCookieName}=sess_admin_boom`,
            },
          }),
          {},
          failingProfileLookup(
            new Error("Admin operator directory is unavailable."),
          ),
        ),
      ),
    ).resolves.toEqual({
      kind: "error",
      title: "Admin workspace unavailable",
      description: "Admin operator directory is unavailable.",
    });
  });
});
