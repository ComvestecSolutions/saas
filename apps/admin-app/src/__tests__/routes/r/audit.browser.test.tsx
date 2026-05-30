import { afterEach, describe, expect, it } from "vitest";
import { platformModuleId } from "@comvestec/contracts";
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
 * Browser coverage for the spec-canonical `/desk/audit` route
 * shipped by Phase 2 Desk Core commit 6 (admin-app
 * implementation plan §9). Exercises the
 * `audit-log-v2-{loader,route-data,route-server}` trio end to
 * end through the admin browser harness mock state, asserting
 * the render / URL-filter state / live-tail toggle / denied /
 * empty / error variants.
 */
const AUDIT_PATH = "/desk/audit";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/desk/audit Audit Log v2 route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the ready discriminated-union variant with posture, focus, and correlation lanes", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      AUDIT_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='audit-log-v2-ready']",
        ) !== null,
      "Expected audit log v2 ready view to render.",
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='audit-log-v2-filter-rail']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelectorAll("[data-testid='audit-log-v2-row']")
        .length,
    ).toBeGreaterThan(0);
    expect(
      rendered.container.querySelector("[data-testid='audit-log-v2-posture']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='audit-log-v2-correlation-clusters']",
      ),
    ).not.toBeNull();
    expect(rendered.container.textContent).toContain(platformModuleId.auditLog);
    expect(rendered.container.textContent).toContain("Open tenant workspace");
  }, 30_000);

  it("supports local investigation pivots and search without mutating the routed query", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      AUDIT_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelectorAll("[data-testid='audit-log-v2-row']")
          .length === 28,
      "Expected default audit rows to render.",
    );

    await click(getButtonByText(rendered.container, "Correlated"));

    await waitFor(
      () =>
        rendered?.container.querySelectorAll("[data-testid='audit-log-v2-row']")
          .length === 5,
      "Expected correlated pivot to narrow the visible rows.",
    );

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search visible events, actors, targets, or reasons",
      ),
      "corr_25",
    );

    await waitFor(
      () =>
        rendered?.container.querySelectorAll("[data-testid='audit-log-v2-row']")
          .length === 1,
      "Expected local search to isolate a single correlated event.",
    );

    expect(rendered.container.textContent).toContain("corr_25");
    expect(decodeURIComponent(window.location.search)).not.toContain("corr_25");
  });

  it("expands an audit row to surface reveal controls for regulated-sensitive fields", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      AUDIT_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='audit-log-v2-row']",
        ) !== null,
      "Expected at least one audit row to render.",
    );

    const firstRowButton = rendered.container.querySelector<HTMLButtonElement>(
      "[data-testid='audit-log-v2-row-toggle']",
    );
    if (!(firstRowButton instanceof HTMLButtonElement)) {
      throw new TypeError("Expected audit row toggle button.");
    }

    await click(firstRowButton);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='audit-log-v2-row-detail']",
        ) !== null,
      "Expected audit row detail to expand after clicking the row.",
    );

    expect(
      rendered.container.querySelector("[data-testid='reveal-field-trigger']"),
    ).not.toBeNull();
  });

  it("round-trips the actor filter through the URL", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      AUDIT_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='audit-log-v2-filter-actor']",
        ) !== null,
      "Expected actor filter input to render.",
    );

    await changeInputValue(
      rendered.container.querySelector<HTMLInputElement>(
        "[data-testid='audit-log-v2-filter-actor']",
      )!,
      "usr_platform_operator_1",
    );

    await waitFor(
      () => window.location.search.includes("actor=usr_platform_operator_1"),
      "Expected actor filter to round-trip through the URL.",
    );
  });

  it("flips the live-tail URL flag when the toggle is clicked", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      AUDIT_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='audit-log-v2-live-tail-toggle']",
        ) !== null,
      "Expected live-tail toggle to render.",
    );

    const toggle = rendered.container.querySelector<HTMLButtonElement>(
      "[data-testid='audit-log-v2-live-tail-toggle']",
    );
    if (!(toggle instanceof HTMLButtonElement)) {
      throw new TypeError("Expected live-tail toggle button.");
    }

    expect(toggle.getAttribute("data-live-tail")).toBe("off");

    await click(toggle);

    await waitFor(
      () =>
        rendered?.container
          .querySelector("[data-testid='audit-log-v2-live-tail-toggle']")
          ?.getAttribute("data-live-tail") === "on",
      "Expected live-tail toggle to flip on.",
      300,
    );

    expect(decodeURIComponent(window.location.search)).toContain('tail="1"');
  });

  it("renders the PermissionDeniedState when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadAuditLogV2: async () => ({
          kind: "denied",
          reason:
            "The current operator session cannot inspect audit activity for the requested scope.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, AUDIT_PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "The current operator session cannot inspect audit activity",
    );
    expect(
      rendered.container.querySelector("[data-testid='audit-log-v2-ready']"),
    ).toBeNull();
  });

  it("renders the stale-session affordance when the loader requires re-authentication", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadAuditLogV2: async () => ({
          kind: "stale-session",
        }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, AUDIT_PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Session refresh required") ??
        false,
      "Expected stale-session state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Re-authenticate to continue investigating audit activity.",
    );
  });

  it("renders the empty affordance when the loader returns ready with zero events", async () => {
    const emptyFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadAuditLogV2: async () => ({
          kind: "ready",
          events: [],
          filters: {
            module: platformModuleId.auditLog,
            window: "24h",
            liveTail: false,
          },
          appliedQueryMode: "by-module",
          totalBeforeLocalFilter: 0,
        }),
      }),
    );

    rendered = await renderAdminApp(emptyFixture, AUDIT_PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("No audit events matched") ??
        false,
      "Expected empty state to render.",
    );
    expect(
      rendered.container.querySelector("[data-testid='audit-log-v2-row']"),
    ).toBeNull();
  });

  it("renders the error affordance when the loader returns error", async () => {
    const errorFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadAuditLogV2: async () => ({
          kind: "error",
          title: "Audit log unavailable",
          description: "Upstream audit aggregate degraded.",
        }),
      }),
    );

    rendered = await renderAdminApp(errorFixture, AUDIT_PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Audit log unavailable") ??
        false,
      "Expected error affordance to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Upstream audit aggregate degraded.",
    );
  });
});
