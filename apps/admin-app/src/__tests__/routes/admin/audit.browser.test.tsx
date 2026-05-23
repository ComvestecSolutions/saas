import { afterEach, describe, expect, it } from "vitest";
import {
  adminOrganizationAuditAction,
  platformModuleId,
  platformScope,
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
 * Browser coverage for the spec-canonical `/admin/audit`
 * admin-organization-scoped audit feed surface shipped by
 * Phase 7 commit 7b-2-audit (admin-app implementation plan §11).
 */
const PATH = "/admin/audit";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/admin/audit admin organization audit feed route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the ready audit surface with KPI strip, focus cards, and stream rows", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-audit-ready']",
        ) !== null,
      "Expected admin audit ready surface to render.",
    );

    expect(
      rendered.container.querySelector("[data-testid='admin-audit-kpis']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector("[data-testid='admin-audit-focus']"),
    ).not.toBeNull();
    const rows = rendered.container.querySelectorAll(
      "[data-testid='admin-audit-row']",
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rendered.container.textContent).toContain("Governance stream");
  });

  it("filters the audit stream by search query and correlation state", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (f) => ({
        ...f,
        loadAdminAudit: async () => ({
          kind: "ready",
          events: [
            {
              eventId: "evt_admin_audit_filter_1",
              timestamp: new Date(0).toISOString(),
              actorId: "usr_platform_operator",
              moduleId: platformModuleId.adminOrganization,
              tenantScope: platformScope.platform,
              tenantScopeId: "platform",
              action: adminOrganizationAuditAction.memberInvited,
              target: "adm_member_alex",
              reason: "Coverage expansion",
              correlationId: "corr_admin_audit_filter_1",
            },
            {
              eventId: "evt_admin_audit_filter_2",
              timestamp: new Date(1000).toISOString(),
              actorId: "usr_platform_operator",
              moduleId: platformModuleId.adminOrganization,
              tenantScope: platformScope.platform,
              tenantScopeId: "platform",
              action: adminOrganizationAuditAction.memberRoleChanged,
              target: "adm_member_briar",
            },
            {
              eventId: "evt_admin_audit_filter_3",
              timestamp: new Date(2000).toISOString(),
              actorId: "usr_support_operator",
              moduleId: platformModuleId.adminOrganization,
              tenantScope: platformScope.organization,
              tenantScopeId: "org_ops",
              action: adminOrganizationAuditAction.memberRemoved,
              target: "adm_member_casey",
              reason: "Offboarding complete",
              correlationId: "corr_admin_audit_filter_3",
            },
          ],
        }),
      }),
    );
    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-audit-ready']",
        ) !== null,
      "Expected admin audit ready surface to render.",
    );

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search actor, action, target, scope, or correlation…",
      ),
      "adm_member_casey",
    );
    await waitFor(
      () =>
        rendered?.container.querySelectorAll("[data-testid='admin-audit-row']")
          .length === 1,
      "Expected audit search to narrow the stream to one row.",
    );
    const searchRows = Array.from(
      rendered.container.querySelectorAll("[data-testid='admin-audit-row']"),
    )
      .map((row) => row.textContent ?? "")
      .join(" ");
    expect(searchRows).toContain("Member removed");
    expect(searchRows).not.toContain("adm_member_alex");

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search actor, action, target, scope, or correlation…",
      ),
      "",
    );
    await click(getButtonByText(rendered.container, "Standalone"));
    await waitFor(
      () =>
        rendered?.container.querySelectorAll("[data-testid='admin-audit-row']")
          .length === 1,
      "Expected standalone filter to show only uncorrelated events.",
    );
    const standaloneRows = Array.from(
      rendered.container.querySelectorAll("[data-testid='admin-audit-row']"),
    )
      .map((row) => row.textContent ?? "")
      .join(" ");
    expect(standaloneRows).toContain("Member role changed");
    expect(standaloneRows).not.toContain("adm_member_casey");
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (f) => ({
        ...f,
        loadAdminAudit: async () => ({ kind: "stale-session" }),
      }),
    );
    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access the admin organization audit feed.",
        ) ?? false,
      "Expected admin audit stale-session affordance.",
    );
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (f) => ({
        ...f,
        loadAdminAudit: async () => ({
          kind: "denied",
          reason:
            "The current operator session cannot inspect admin organization audit activity.",
        }),
      }),
    );
    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected admin audit denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "admin organization audit activity",
    );
  });

  it("surfaces an error StateScreen when the loader errors", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (f) => ({
        ...f,
        loadAdminAudit: async () => ({
          kind: "error",
          title: "Admin organization audit feed unavailable",
          description: "Upstream admin-governance audit port unreachable.",
        }),
      }),
    );
    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Admin organization audit feed unavailable",
        ) ?? false,
      "Expected admin audit error state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Upstream admin-governance audit port unreachable.",
    );
  });

  it("renders the empty cell when the audit feed is empty", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (f) => ({
        ...f,
        loadAdminAudit: async () => ({
          kind: "ready",
          events: [],
        }),
      }),
    );
    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-audit-empty']",
        ) !== null,
      "Expected admin audit empty cell.",
    );
    expect(rendered.container.textContent).toContain(
      "No admin organization audit events match the current investigation view.",
    );
  });
});
