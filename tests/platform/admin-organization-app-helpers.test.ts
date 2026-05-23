import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  adminMemberRole,
  platformScope,
} from "@comvestec/contracts";
import {
  changeMemberRoleFromEnvironment,
  inviteMemberFromEnvironment,
  listMembersFromEnvironment,
  redeemInvitationFromEnvironment,
  removeMemberFromEnvironment,
  resolveCapabilitiesForFromEnvironment,
} from "@comvestec/platform";

/**
 * Smoke coverage for the six root-safe app helpers exposed by
 * `packages/platform/src/services/apps/admin-organization-actions.ts`.
 *
 * Each helper composes `loadRuntimeModuleOrDie` (the canonical
 * dynamic-import seam) with `runAdminOrganizationFromEnvironment`,
 * which boundary-decodes the operator environment via
 * `Schema.decodeUnknown(AdminOrganizationProcessEnvironmentSchema)`.
 *
 * The helpers themselves shape no `Request` / `Response` — this
 * file therefore asserts the two contract points we actually need
 * to lock in:
 *
 *   1. Each helper is dispatchable (the shared dynamic-import seam
 *      resolves without throwing at module-evaluation time).
 *   2. Each helper threads its environment through to the boundary
 *      decode: passing an empty environment surfaces the typed
 *      `ParseError` channel rather than a string fallback or a
 *      `TypeError` from a missing field.
 *
 * If a future refactor regresses (1) the dynamic-import or (2)
 * env-decoding pattern, these assertions fail with the exact
 * helper name in the test output.
 */
const baseRequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_admin_org_app_helpers_test",
  sessionId: "sess_admin_org_app_helpers_test",
  correlationId: "corr_admin_org_app_helpers_test",
  reason: "admin-org app helpers smoke",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
} as const;

const expectEnvParseFailure = async (
  effect: Effect.Effect<unknown, unknown>,
) => {
  const exit = await Effect.runPromiseExit(effect);
  expect(exit._tag).toBe("Failure");
  if (exit._tag === "Failure") {
    const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
    expect(failure).toBeDefined();
    expect(
      typeof failure === "object" &&
        failure !== null &&
        "_tag" in failure &&
        (failure as { readonly _tag: string })._tag === "ParseError",
    ).toBe(true);
  }
};

describe("admin-organization app helpers", () => {
  it("listMembersFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      listMembersFromEnvironment({}, { requestContext: baseRequestContext }),
    );
  });

  it("inviteMemberFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      inviteMemberFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          email: "smoke@example.com",
          invitedRole: adminMemberRole.viewer,
          invitedBy: "usr_smoke_inviter",
        },
      ),
    );
  });

  it("redeemInvitationFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      redeemInvitationFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          invitationToken: "amiv_smoke_token",
          keycloakSubjectId: "kc_smoke",
          displayName: "Smoke Redeemer",
        },
      ),
    );
  });

  it("changeMemberRoleFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      changeMemberRoleFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          memberId: "mem_smoke",
          newRole: adminMemberRole.viewer,
        },
      ),
    );
  });

  it("removeMemberFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      removeMemberFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          memberId: "mem_smoke_remove",
        },
      ),
    );
  });

  it("resolveCapabilitiesForFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      resolveCapabilitiesForFromEnvironment(
        {},
        {
          subjectId: "kc_smoke_subject",
          snapshot: {
            hasPrivilegedAccess: false,
            canImpersonate: false,
            canRevealSecrets: false,
            canReadAudit: false,
          },
        },
      ),
    );
  });

  it("re-uses the shared loadRuntimeModuleOrDie seam (no per-helper Effect.tryPromise duplication)", async () => {
    // The helpers' source has a single `loadAdminOrganizationRuntime`
    // factory wired through `loadRuntimeModuleOrDie`. Read the source
    // and assert the rule mechanically so any future refactor that
    // reintroduces a per-helper `Effect.tryPromise` is caught here.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        "packages/platform/src/services/apps/admin-organization-actions.ts",
      ),
      "utf8",
    );
    const sourceWithoutComments = source
      // Strip block comments
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // Strip line comments
      .replace(/^[\t ]*\/\/.*$/gm, "");
    const loadRuntimeModuleOrDieMatches = sourceWithoutComments.match(
      /loadRuntimeModuleOrDie\(/g,
    );
    expect(loadRuntimeModuleOrDieMatches).not.toBeNull();
    expect(loadRuntimeModuleOrDieMatches?.length).toBe(1);
    expect(sourceWithoutComments.includes("Effect.tryPromise")).toBe(false);
    expect(sourceWithoutComments.includes("new Request")).toBe(false);
    expect(sourceWithoutComments.includes("new Response")).toBe(false);
    expect(/\bResponse\.json\b/.test(sourceWithoutComments)).toBe(false);
  });
});
