/**
 * Notification-center admin envelope app-helper smoke tests
 * (admin-app implementation plan §9 item 16 — final Phase 1
 * backend gap). Mirrors `workflow-runs-admin-actions.test.ts`
 * exactly: confirms the three canonical `*FromEnvironment`
 * helpers reach the env-bound boundary decoder through the
 * shared `loadRuntimeModuleOrDie` seam and that the helper
 * source contains no `Request` / `Response` shaping or
 * per-helper `Effect.tryPromise` duplication.
 */
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformScope,
  type RequestContext,
} from "@comvestec/contracts";
import {
  getNotificationCenterAdminDetailFromEnvironment,
  listNotificationCenterAdminFromEnvironment,
  resendNotificationFromEnvironment,
} from "@comvestec/platform";

const baseRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_notification_center_admin_helpers_test",
  sessionId: "sess_notification_center_admin_helpers_test",
  correlationId: "corr_notification_center_admin_helpers_test",
  reason: "notification-center admin app helpers smoke",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

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

describe("notification-center-admin app helpers", () => {
  it("exposes the three canonical *FromEnvironment helpers as functions", () => {
    expect(typeof listNotificationCenterAdminFromEnvironment).toBe("function");
    expect(listNotificationCenterAdminFromEnvironment.length).toBe(2);
    expect(typeof getNotificationCenterAdminDetailFromEnvironment).toBe(
      "function",
    );
    expect(getNotificationCenterAdminDetailFromEnvironment.length).toBe(2);
    expect(typeof resendNotificationFromEnvironment).toBe("function");
    expect(resendNotificationFromEnvironment.length).toBe(2);
  });

  it("listNotificationCenterAdminFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      listNotificationCenterAdminFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          filters: {},
          pageSize: 25,
        },
      ),
    );
  });

  it("getNotificationCenterAdminDetailFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      getNotificationCenterAdminDetailFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          notificationId: "ntf_target_detail",
        },
      ),
    );
  });

  it("resendNotificationFromEnvironment decodes the operator environment at the boundary", async () => {
    await expectEnvParseFailure(
      resendNotificationFromEnvironment(
        {},
        {
          requestContext: baseRequestContext,
          notificationId: "ntf_target_resend",
          reason: "notification-center-admin.resend",
          reasonAttachmentText: "ticket-link-or-evidence",
        },
      ),
    );
  });

  it("re-uses the shared loadRuntimeModuleOrDie seam and shapes no Request/Response payloads", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        "packages/platform/src/services/apps/notification-center-admin-actions.ts",
      ),
      "utf8",
    );
    const sourceWithoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[\t ]*\/\/.*$/gm, "");
    const loadRuntimeModuleOrDieMatches = sourceWithoutComments.match(
      /loadRuntimeModuleOrDie\(/g,
    );
    expect(loadRuntimeModuleOrDieMatches).not.toBeNull();
    expect(loadRuntimeModuleOrDieMatches?.length).toBe(1);
    expect(sourceWithoutComments.includes("Effect.tryPromise")).toBe(false);
    expect(sourceWithoutComments.includes("new Request(")).toBe(false);
    expect(sourceWithoutComments.includes("new Response(")).toBe(false);
    expect(/\bResponse\.json\b/.test(sourceWithoutComments)).toBe(false);
  });
});
