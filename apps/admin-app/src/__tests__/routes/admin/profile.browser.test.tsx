import { afterEach, describe, expect, it } from "vitest";
import {
  actorType,
  adminGovernanceActionPolicyId,
  adminOperatorCapability,
  adminRoutePath,
} from "@comvestec/contracts";
import {
  createAdminBrowserFixtureState,
  type AdminBrowserFixtureState,
} from "../../../testing/admin-browser-fixtures";
import {
  changeInputValue,
  click,
  getButtonByText,
  getInputByPlaceholder,
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "../../../testing/admin-browser-harness";

/**
 * Browser coverage for the spec-canonical `/admin/profile`
 * admin-organization operator profile surface shipped by Phase 7
 * commit 7b-1 (admin-app implementation plan §11).
 */
const PATH = "/admin/profile";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/admin/profile admin operator profile route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the ready profile surface with identity, session posture, and capability workspace", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-profile-ready']",
        ) !== null,
      "Expected admin profile ready surface to render.",
    );

    expect(
      rendered.container.querySelector("[data-testid='admin-profile-kpis']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='admin-profile-identity']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector("[data-testid='admin-profile-session']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='admin-profile-capability-table']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector("[data-testid='admin-profile-actor-id']")
        ?.textContent?.length,
    ).toBeGreaterThan(0);
  });

  it("filters the capability workspace by search query and access state", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (f) => ({
        ...f,
        loadAdminProfile: async () => ({
          kind: "ready",
          profile: {
            identity: {
              actorId: "usr_platform_operator",
              username: "operator@comvestec.com",
              email: "operator@comvestec.com",
              displayName: "Comvestec Platform Operator",
              actorType: actorType.platformOperator,
              enabled: true,
            },
            sessionId: "sess_admin_profile_fixture",
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
                capability: adminOperatorCapability.runtimeConfig,
                routePath: adminRoutePath.runtimeConfig,
                visible: true,
                allowed: false,
                label: "Runtime Config",
                reason: "Reviewer approval required before runtime changes.",
                actionPolicyIds: [
                  adminGovernanceActionPolicyId.runtimeConfigProposalReview,
                ],
              },
              {
                capability: adminOperatorCapability.auditLog,
                routePath: adminRoutePath.auditLog,
                visible: false,
                allowed: true,
                label: "Audit Log",
                actionPolicyIds: [],
              },
            ],
          },
        }),
      }),
    );
    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-profile-ready']",
        ) !== null,
      "Expected admin profile ready surface to render.",
    );

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search capabilities, routes, reasons, or policy ids…",
      ),
      "Runtime Config",
    );
    await waitFor(
      () =>
        rendered?.container.querySelectorAll(
          "[data-testid='admin-profile-capability-row']",
        ).length === 1,
      "Expected capability search to narrow the workspace to one row.",
    );
    const searchRows = Array.from(
      rendered.container.querySelectorAll(
        "[data-testid='admin-profile-capability-row']",
      ),
    )
      .map((row) => row.textContent ?? "")
      .join(" ");
    expect(searchRows).toContain("Runtime Config");
    expect(searchRows).toContain("Reviewer approval required");

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search capabilities, routes, reasons, or policy ids…",
      ),
      "",
    );
    await click(getButtonByText(rendered.container, "Constrained"));
    await waitFor(
      () =>
        rendered?.container.querySelectorAll(
          "[data-testid='admin-profile-capability-row']",
        ).length === 1,
      "Expected constrained filter to show one capability row.",
    );
    const constrainedRows = Array.from(
      rendered.container.querySelectorAll(
        "[data-testid='admin-profile-capability-row']",
      ),
    )
      .map((row) => row.textContent ?? "")
      .join(" ");
    expect(constrainedRows).toContain("Runtime Config");
    expect(constrainedRows).not.toContain("Operations Home");
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (f) => ({
        ...f,
        loadAdminProfile: async () => ({ kind: "stale-session" }),
      }),
    );
    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access the admin operator profile.",
        ) ?? false,
      "Expected admin profile stale-session affordance.",
    );
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (f) => ({
        ...f,
        loadAdminProfile: async () => ({
          kind: "denied",
          reason: "Operator session not authorized for admin profile.",
        }),
      }),
    );
    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected admin profile denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Operator session not authorized for admin profile.",
    );
  });

  it("surfaces an error StateScreen when the loader errors", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (f) => ({
        ...f,
        loadAdminProfile: async () => ({
          kind: "error",
          title: "Operator profile unavailable",
          description: "Upstream identity port unreachable.",
        }),
      }),
    );
    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Operator profile unavailable",
        ) ?? false,
      "Expected admin profile error state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Upstream identity port unreachable.",
    );
  });
});
