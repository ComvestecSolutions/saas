import { Effect } from "effect";
import {
  listAdminRuntimeConfigOverridesFromSessionId,
  listRetentionPoliciesFromSessionId,
  listSupportCasesFromSessionId,
  listWebhookSubscriptionsFromSessionId,
} from "@comvestec/platform";
import { platformModuleId, platformScope } from "@comvestec/contracts";

describe("admin app action helpers", () => {
  it("delegates governance route reads through the app-safe helper seam", async () => {
    const request: Parameters<
      typeof listAdminRuntimeConfigOverridesFromSessionId
    >[1] = {
      sessionId: "sess_admin_governance",
      moduleId: platformModuleId.runtimeConfig,
    };
    const expected = [] as const;
    const listRuntimeConfigOverrides: NonNullable<
      Parameters<typeof listAdminRuntimeConfigOverridesFromSessionId>[2]
    > = vi.fn(() => Effect.succeed(expected));

    await expect(
      Effect.runPromise(
        listAdminRuntimeConfigOverridesFromSessionId(
          {},
          request,
          listRuntimeConfigOverrides,
        ),
      ),
    ).resolves.toBe(expected);

    expect(listRuntimeConfigOverrides).toHaveBeenCalledWith(request);
  });

  it("delegates support route reads through the app-safe helper seam", async () => {
    const request: Parameters<typeof listSupportCasesFromSessionId>[1] = {
      sessionId: "sess_admin_support",
    };
    const expected = [] as const;
    const listSupportCases: NonNullable<
      Parameters<typeof listSupportCasesFromSessionId>[2]
    > = vi.fn(() => Effect.succeed(expected));

    await expect(
      Effect.runPromise(
        listSupportCasesFromSessionId({}, request, listSupportCases),
      ),
    ).resolves.toBe(expected);

    expect(listSupportCases).toHaveBeenCalledWith(request);
  });

  it("delegates retention route reads through the app-safe helper seam", async () => {
    const request: Parameters<typeof listRetentionPoliciesFromSessionId>[1] = {
      sessionId: "sess_admin_retention",
      scope: platformScope.organization,
      scopeId: "org_demo",
    };
    const expected = [] as const;
    const listRetentionPolicies: NonNullable<
      Parameters<typeof listRetentionPoliciesFromSessionId>[2]
    > = vi.fn(() => Effect.succeed(expected));

    await expect(
      Effect.runPromise(
        listRetentionPoliciesFromSessionId({}, request, listRetentionPolicies),
      ),
    ).resolves.toBe(expected);

    expect(listRetentionPolicies).toHaveBeenCalledWith(request);
  });

  it("delegates webhooks route reads through the app-safe helper seam", async () => {
    const request: Parameters<typeof listWebhookSubscriptionsFromSessionId>[1] =
      {
        sessionId: "sess_admin_webhooks",
        scope: platformScope.organization,
        scopeId: "org_demo",
      };
    const expected = [] as const;
    const listWebhookSubscriptions: NonNullable<
      Parameters<typeof listWebhookSubscriptionsFromSessionId>[2]
    > = vi.fn(() => Effect.succeed(expected));

    await expect(
      Effect.runPromise(
        listWebhookSubscriptionsFromSessionId(
          {},
          request,
          listWebhookSubscriptions,
        ),
      ),
    ).resolves.toBe(expected);

    expect(listWebhookSubscriptions).toHaveBeenCalledWith(request);
  });
});
