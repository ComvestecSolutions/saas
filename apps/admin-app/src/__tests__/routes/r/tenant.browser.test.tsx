import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { authorizationRelation, platformScope } from "@comvestec/contracts";
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
 * Browser coverage for the Tenant workspace v2 route
 * (`/r/tenant/$tenantId`) shipped by Phase 2 Desk Core commit 4
 * (admin-app implementation plan §9 item 4). Exercises the v2
 * loader (`tenant-workspace-v2-loader`) end-to-end via the admin
 * browser harness mock state, and confirms the membership
 * mutation server-fns wired through the rehomed
 * `tenant-workspace-mutations-server` sibling (commit 5 teardown)
 * still resolve end-to-end.
 *
 * `partialFailures` rendering and ready / denied / stale-session
 * variants are asserted directly.
 */
const TENANT_PATH = "/r/tenant/org_demo?scope=organization";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/r/tenant/$tenantId v2 route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the ready snapshot via the v2 loader", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      TENANT_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='tenant-workspace-v2-ready']",
        ) !== null,
      "Expected v2 tenant workspace to render.",
    );

    expect(rendered.container.textContent).toContain("org_demo");
    expect(rendered.container.textContent).toContain("Tenant overview");
    expect(
      rendered.container.querySelector(
        "[data-testid='tenant-workspace-v2-launchpad']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='tenant-workspace-v2-focus']",
      ),
    ).not.toBeNull();
  });

  it("renders contextual cross-surface tabs instead of placeholder shells", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      TENANT_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='tenant-workspace-v2-ready']",
        ) !== null,
      "Expected v2 tenant workspace to render before tab pivots.",
    );

    await click(getButtonByText(rendered.container, "Billing"));
    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='tenant-workspace-v2-billing-pane']",
        ) !== null,
      "Expected billing pane to render on the Billing tab.",
    );

    await click(getButtonByText(rendered.container, "Branding"));
    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='tenant-workspace-v2-branding-pane']",
        ) !== null,
      "Expected branding pane to render on the Branding tab.",
    );

    await click(getButtonByText(rendered.container, "Audit"));
    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='tenant-workspace-v2-audit-pane']",
        ) !== null,
      "Expected audit pane to render on the Audit tab.",
    );

    await click(getButtonByText(rendered.container, "Repair"));
    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='tenant-workspace-v2-repair-pane']",
        ) !== null,
      "Expected repair handoff pane to render on the Repair tab.",
    );

    await click(getButtonByText(rendered.container, "Support"));
    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='tenant-workspace-v2-support-pane']",
        ) !== null,
      "Expected support pane to render on the Support tab.",
    );

    await click(getButtonByText(rendered.container, "Danger Zone"));
    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='tenant-workspace-v2-danger-pane']",
        ) !== null,
      "Expected danger-zone pane to render on the Danger Zone tab.",
    );
  });

  it("surfaces partialFailures as an inline notice on the ready variant", async () => {
    const baseFixture = createAdminBrowserFixtureState();
    const partialFixture = withFixtureTransform(baseFixture, (fixture) => ({
      ...fixture,
      loadTenantWorkspaceV2: async (input) => {
        const baseReady = await baseFixture.loadTenantWorkspaceV2(input);

        if (baseReady.kind !== "ready") {
          return baseReady;
        }

        const partialFailures = [
          {
            section: "openIncidents" as const,
            reason: "GlitchTip adapter unavailable.",
          },
        ];

        return {
          kind: "ready",
          snapshot: {
            ...baseReady.snapshot,
            partialFailures,
          },
          partialFailures,
        };
      },
    }));

    rendered = await renderAdminApp(partialFixture, TENANT_PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='tenant-workspace-v2-partial-failures']",
        ) !== null,
      "Expected partial-failures notice to render.",
    );

    const notice = rendered.container.querySelector(
      "[data-testid='tenant-workspace-v2-partial-failures']",
    );
    expect(notice?.textContent ?? "").toContain("openIncidents");
  });

  it("renders PermissionDeniedState when the v2 loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadTenantWorkspaceV2: async () => ({
          kind: "denied",
          reason:
            "Tenant workspace v2 currently depends on a trusted platform-operator session.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, TENANT_PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Tenant workspace v2 currently depends on a trusted platform-operator session.",
    );
  });

  it("renders the stale-session affordance when the v2 loader returns stale-session", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadTenantWorkspaceV2: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, TENANT_PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Session refresh required") ??
        false,
      "Expected stale-session affordance to render.",
    );
  });

  it("forwards Members & Invitations membership mutation through the existing server-fn boundary", async () => {
    const baseFixture = createAdminBrowserFixtureState();
    const mutationSpy = vi.fn(baseFixture.mutateTenantMembership);
    const fixture: AdminBrowserFixtureState = {
      ...baseFixture,
      mutateTenantMembership: (input) => mutationSpy(input),
    };

    rendered = await renderAdminApp(fixture, TENANT_PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Members & Invitations") ??
        false,
      "Expected v2 tabs to render before opening Members & Invitations.",
    );

    const membersTab = [
      ...rendered.container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.includes("Members & Invitations"));

    if (!(membersTab instanceof HTMLButtonElement)) {
      throw new TypeError("Expected Members & Invitations tab button.");
    }

    await act(async () => {
      membersTab.click();
    });

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Membership mutation") ??
        false,
      "Expected Members & Invitations tab content to render.",
    );

    const subjectInput = rendered.container.querySelector<HTMLInputElement>(
      "input[placeholder='user:employee@comvestec.com']",
    );
    const reasonInput = rendered.container.querySelector<HTMLInputElement>(
      "input[placeholder='Grant product oversight for audit readiness.']",
    );
    const applyButton = [
      ...rendered.container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent === "Apply membership change");

    if (
      !(subjectInput instanceof HTMLInputElement) ||
      !(reasonInput instanceof HTMLInputElement) ||
      !(applyButton instanceof HTMLButtonElement)
    ) {
      throw new TypeError(
        "Expected membership mutation form inputs to render.",
      );
    }

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (nativeInputValueSetter === undefined) {
      throw new TypeError(
        "Expected HTMLInputElement value setter to be defined.",
      );
    }

    await act(async () => {
      nativeInputValueSetter.call(subjectInput, "usr_auditor_org_demo");
      subjectInput.dispatchEvent(new Event("input", { bubbles: true }));
      nativeInputValueSetter.call(
        reasonInput,
        "Grant audit coverage for the new reviewer.",
      );
      reasonInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      applyButton.click();
    });

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='tenant-workspace-v2-membership-status']",
        ) !== null,
      "Expected membership mutation status to render.",
    );

    expect(mutationSpy).toHaveBeenCalledTimes(1);
    const callArg = mutationSpy.mock.calls[0]?.[0];
    expect(callArg).toMatchObject({
      data: {
        tenantId: "org_demo",
        scope: platformScope.organization,
        subject: "usr_auditor_org_demo",
      },
    });
  });

  it("forwards tenant invitation issue through the existing server-fn boundary", async () => {
    const baseFixture = createAdminBrowserFixtureState();
    const issueSpy = vi.fn(baseFixture.issueTenantInvitation);
    const fixture: AdminBrowserFixtureState = {
      ...baseFixture,
      issueTenantInvitation: (input) => issueSpy(input),
    };

    rendered = await renderAdminApp(fixture, TENANT_PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Members & Invitations") ??
        false,
      "Expected tenant tabs to render before opening Members & Invitations.",
    );

    await click(getButtonByText(rendered.container, "Members & Invitations"));

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Invitation actions") ??
        false,
      "Expected invitation actions pane to render.",
    );

    await changeInputValue(
      getInputByPlaceholder(rendered.container, "viewer@comvestec.com"),
      "security.reviewer@org-demo.test",
    );
    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Invite finance reviewer for billing oversight.",
      ),
      "Invite security reviewer for control-surface verification.",
    );
    await click(getButtonByText(rendered.container, "Issue invitation"));

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='tenant-workspace-v2-invitation-status']",
        ) !== null,
      "Expected invitation issue status feedback to render.",
    );

    expect(issueSpy).toHaveBeenCalledTimes(1);
    expect(issueSpy.mock.calls[0]?.[0]).toMatchObject({
      data: {
        tenantId: "org_demo",
        scope: platformScope.organization,
        recipientEmail: "security.reviewer@org-demo.test",
        relation: authorizationRelation.member,
        issueReason:
          "Invite security reviewer for control-surface verification.",
      },
    });
    expect(rendered.container.textContent).toContain(
      "Issued member access for security.reviewer@org-demo.test.",
    );
  });

  it("forwards tenant invitation revoke through the existing server-fn boundary", async () => {
    const baseFixture = createAdminBrowserFixtureState();
    const revokeSpy = vi.fn(baseFixture.revokeTenantInvitation);
    const fixture: AdminBrowserFixtureState = {
      ...baseFixture,
      revokeTenantInvitation: (input) => revokeSpy(input),
    };

    rendered = await renderAdminApp(fixture, TENANT_PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Members & Invitations") ??
        false,
      "Expected tenant tabs to render before opening Members & Invitations.",
    );

    await click(getButtonByText(rendered.container, "Members & Invitations"));

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Invitation actions") ??
        false,
      "Expected invitation actions pane to render.",
    );

    await changeInputValue(
      getInputByPlaceholder(rendered.container, "inv_org_demo_001"),
      "inv_org_demo",
    );
    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Cancel the duplicate onboarding invite.",
      ),
      "Cancel the superseded onboarding invite.",
    );
    await click(getButtonByText(rendered.container, "Revoke invitation"));

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='tenant-workspace-v2-invitation-status']",
        ) !== null,
      "Expected invitation revoke status feedback to render.",
    );

    expect(revokeSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy.mock.calls[0]?.[0]).toMatchObject({
      data: {
        tenantId: "org_demo",
        scope: platformScope.organization,
        invitationId: "inv_org_demo",
        revocationReason: "Cancel the superseded onboarding invite.",
      },
    });
    expect(rendered.container.textContent).toContain(
      "Revoked invitation inv_org_demo.",
    );
  });
});
