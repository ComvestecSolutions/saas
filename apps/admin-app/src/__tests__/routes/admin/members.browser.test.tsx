import { afterEach, describe, expect, it } from "vitest";
import { adminMemberRole } from "@comvestec/contracts";
import {
  createAdminBrowserFixtureState,
  type AdminBrowserFixtureState,
} from "../../../testing/admin-browser-fixtures";
import {
  changeSelectValue,
  changeInputValue,
  click,
  getButtonByText,
  getFieldControlByLabel,
  getInputByPlaceholder,
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "../../../testing/admin-browser-harness";
import { mockedLoaders } from "../../../testing/admin-browser-mock-state";

/**
 * Browser coverage for the spec-canonical `/admin/members`
 * admin-organization member roster surface shipped by Phase 7
 * commit 7b-1 (admin-app implementation plan §11).
 */
const PATH = "/admin/members";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/admin/members admin organization roster route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
    mockedLoaders.inviteAdminMember.mockClear();
    mockedLoaders.removeAdminMember.mockClear();
  });

  it("renders the ready roster surface with table + invite CTA", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-members-ready']",
        ) !== null,
      "Expected admin members ready surface to render.",
    );

    expect(
      rendered.container.querySelector("[data-testid='admin-members-table']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='admin-members-invite-cta']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelectorAll("[data-testid='admin-members-row']")
        .length,
    ).toBeGreaterThan(0);
    expect(rendered.container.textContent).toContain("Owners");
    expect(rendered.container.textContent).toContain("Active");
  });

  it("filters the roster by search query and role coverage", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-members-ready']",
        ) !== null,
      "Expected admin members ready surface to render.",
    );

    const search = getInputByPlaceholder(
      rendered.container,
      "Search members, email, or role…",
    );
    await changeInputValue(search, "Auditor");
    await waitFor(
      () =>
        rendered?.container.querySelectorAll(
          "[data-testid='admin-members-row']",
        ).length === 1,
      "Expected admin member search to narrow the roster to one match.",
    );
    expect(rendered.container.textContent).toContain("Admin Auditor Fixture");
    expect(rendered.container.textContent).not.toContain("Admin Owner Fixture");

    await changeInputValue(search, "");
    await click(getButtonByText(rendered.container, "Owners"));
    await waitFor(
      () =>
        rendered?.container.querySelectorAll(
          "[data-testid='admin-members-row']",
        ).length === 1,
      "Expected owner role filter to narrow the roster to owners.",
    );
    expect(rendered.container.textContent).toContain("Admin Owner Fixture");
    expect(rendered.container.textContent).not.toContain(
      "Admin Auditor Fixture",
    );
  });

  it("invites a member through the high-risk guard and reveals the one-shot invitation token", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-members-invite-email']",
        ) !== null,
      "Expected admin members invite composer to render.",
    );

    await changeInputValue(
      rendered.container.querySelector<HTMLInputElement>(
        "[data-testid='admin-members-invite-email']",
      )!,
      "ops-new@comvestec.com",
    );
    await changeSelectValue(
      rendered.container.querySelector<HTMLSelectElement>(
        "[data-testid='admin-members-invite-role']",
      )!,
      adminMemberRole.adminAdmin,
    );
    await click(
      rendered.container.querySelector<HTMLButtonElement>(
        "[data-testid='admin-members-invite-cta']",
      )!,
    );

    await waitFor(
      () =>
        rendered?.container.ownerDocument.querySelector(
          "[data-testid='high-risk-body']",
        ) !== null,
      "Expected admin member invite guard to open.",
    );

    await click(
      getFieldControlByLabel<HTMLInputElement>(
        rendered.container.ownerDocument,
        "Role coverage — invite admin member",
        "input",
      ),
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "Adding extra admin coverage for weekday support.",
    );
    await click(
      rendered.container.ownerDocument.querySelector<HTMLButtonElement>(
        "[data-testid='high-risk-arm']",
      )!,
    );
    await click(
      rendered.container.ownerDocument.querySelector<HTMLButtonElement>(
        "[data-testid='high-risk-confirm-final']",
      )!,
    );

    await waitFor(
      () =>
        mockedLoaders.inviteAdminMember.mock.calls.length === 1 &&
        rendered?.container.textContent?.includes(
          "Invitation issued for ops-new@comvestec.com.",
        ) === true &&
        rendered?.container.ownerDocument.body.textContent?.includes(
          "Admin invitation issued",
        ) === true,
      "Expected admin member invite flow to complete.",
    );

    expect(mockedLoaders.inviteAdminMember).toHaveBeenCalledWith({
      data: {
        email: "ops-new@comvestec.com",
        invitedRole: adminMemberRole.adminAdmin,
        reasonId: "admin-organization.member-invite.role-coverage",
        reasonAttachmentText:
          "Adding extra admin coverage for weekday support.",
      },
    });
    expect(rendered.container.ownerDocument.body.textContent).toContain(
      "Invitation token",
    );
    expect(rendered.container.ownerDocument.body.textContent).toContain(
      "invite_3_plaintext",
    );
  });

  it("removes a member through the high-risk guard", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-members-remove-cta'][data-member-id='adm_member_fixture_2']",
        ) !== null,
      "Expected admin member remove CTA to render.",
    );

    await click(
      rendered.container.querySelector<HTMLButtonElement>(
        "[data-testid='admin-members-remove-cta'][data-member-id='adm_member_fixture_2']",
      )!,
    );

    await waitFor(
      () =>
        rendered?.container.ownerDocument.querySelector(
          "[data-testid='high-risk-body']",
        ) !== null,
      "Expected admin member remove guard to open.",
    );

    await click(
      getFieldControlByLabel<HTMLInputElement>(
        rendered.container.ownerDocument,
        "Operator offboarding — remove admin member",
        "input",
      ),
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "Removing the archived audit rotation seat.",
    );
    await click(
      rendered.container.ownerDocument.querySelector<HTMLButtonElement>(
        "[data-testid='high-risk-arm']",
      )!,
    );
    await click(
      rendered.container.ownerDocument.querySelector<HTMLButtonElement>(
        "[data-testid='high-risk-confirm-final']",
      )!,
    );

    await waitFor(
      () =>
        mockedLoaders.removeAdminMember.mock.calls.length === 1 &&
        rendered?.container.textContent?.includes(
          "Member removed: adm_member_fixture_2.",
        ) === true,
      "Expected admin member removal flow to complete.",
    );

    expect(mockedLoaders.removeAdminMember).toHaveBeenCalledWith({
      data: {
        memberId: "adm_member_fixture_2",
        reasonId: "admin-organization.member-remove.offboarding",
        reasonAttachmentText: "Removing the archived audit rotation seat.",
      },
    });
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (f) => ({
        ...f,
        loadAdminMembers: async () => ({ kind: "stale-session" }),
      }),
    );
    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access admin organization members.",
        ) ?? false,
      "Expected admin members stale-session affordance.",
    );
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (f) => ({
        ...f,
        loadAdminMembers: async () => ({
          kind: "denied",
          reason: "Operator session not authorized for admin members.",
        }),
      }),
    );
    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected admin members denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Operator session not authorized for admin members.",
    );
  });

  it("surfaces an error StateScreen when the loader errors", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (f) => ({
        ...f,
        loadAdminMembers: async () => ({
          kind: "error",
          title: "Admin members unavailable",
          description: "Upstream admin-organization port unreachable.",
        }),
      }),
    );
    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Admin members unavailable",
        ) ?? false,
      "Expected admin members error state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Upstream admin-organization port unreachable.",
    );
  });
});
