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

describe("admin shell route data", () => {
  it("falls back to shell state when the operator session cookie is missing", async () => {
    await expect(
      Effect.runPromise(
        loadAdminShellRouteDataFromRequest(
          new Request("http://localhost:3004/"),
          {},
          () => Effect.succeed(capabilitySnapshot),
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

  it("returns the current operator capability snapshot for a trusted session", async () => {
    await expect(
      Effect.runPromise(
        loadAdminShellRouteDataFromRequest(
          new Request("http://localhost:3004/", {
            headers: {
              cookie: `${subscriberJourneySessionCookieName}=sess_admin_ready`,
            },
          }),
          {},
          () => Effect.succeed(capabilitySnapshot),
        ),
      ),
    ).resolves.toEqual({
      kind: "ready",
      capabilities: capabilitySnapshot,
    });
  });
});
