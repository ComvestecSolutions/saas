import { afterEach, describe, expect, it } from "vitest";
import { adminRoutePath } from "@comvestec/contracts";
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
 * Browser coverage for the spec §8.3 dense data table v2
 * cutover of `/r/tenants` (admin-app implementation plan §9 —
 * Phase 2 Desk Core commit 3). Rendered through the admin
 * browser harness so the loader-trio
 * (`tenants-directory-loader`, `tenants-directory-route-server`)
 * is exercised end-to-end via the mocked `loadTenantsDirectory`
 * fixture builder. Asserts ready / denied / shell variants and
 * the table/search/filter behavior on the live route surface.
 */
const TENANTS_PATH = adminRoutePath.tenantWorkspaceDiscovery;
const LEGACY_TENANTS_PATH = "/tenants";

const withTenantsFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/r/tenants resource route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the tenant workspace directory with posture, pivots, and search", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      TENANTS_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='tenants-directory-ready']",
        ) !== null,
      "Expected tenant directory workspace to render.",
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='tenants-directory-posture']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='tenants-directory-table']",
      ),
    ).not.toBeNull();
    expect(rendered.container.querySelectorAll("[data-row-id]").length).toBe(4);

    await click(getButtonByText(rendered.container, "Blocked"));
    await waitFor(
      () => rendered?.container.querySelectorAll("[data-row-id]").length === 1,
      "Expected blocked tab to narrow the directory to one tenant.",
    );
    expect(rendered.container.textContent).toContain("Umbrella");

    await click(getButtonByText(rendered.container, "All"));
    await waitFor(
      () => rendered?.container.querySelectorAll("[data-row-id]").length === 4,
      "Expected all tab to restore the full tenant roster.",
    );

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search tenants, scopes, or ids…",
      ),
      "ent_atlas",
    );
    await waitFor(
      () => rendered?.container.querySelectorAll("[data-row-id]").length === 1,
      "Expected search to narrow the directory to the matching tenant target.",
    );
    expect(rendered.container.textContent).toContain("Globex");
    expect(
      rendered.container.querySelector(
        "[data-testid='tenants-directory-workspace-link']",
      ),
    ).not.toBeNull();
  });

  it("redirects the legacy /tenants alias into the canonical tenant directory", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      LEGACY_TENANTS_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='tenants-directory-ready']",
        ) !== null,
      "Expected the legacy tenant alias to render the shared tenant directory.",
    );

    expect(rendered.container.textContent).toContain("Tenant Directory");
    expect(rendered.container.textContent).toContain("Open workspace");
    expect(rendered.router.state.location.pathname).toBe(TENANTS_PATH);
  });

  it("renders the tenant directory without dead bulk actions", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      TENANTS_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='tenants-directory-ready']",
        ) !== null,
      "Expected tenant directory workspace to render before bulk actions.",
    );

    expect(
      rendered.container.querySelector('[data-testid="select-all"]'),
    ).toBeNull();
    expect(
      rendered.container.querySelector("[data-bulk-action-bar]"),
    ).toBeNull();
    expect(
      rendered.container.querySelector('[data-bulk-action="freeze"]'),
    ).toBeNull();
  });

  it("renders the PermissionDeniedState when the loader returns denied", async () => {
    const baseFixture = createAdminBrowserFixtureState();
    const deniedFixture = withTenantsFixtureTransform(
      baseFixture,
      (fixture) => ({
        ...fixture,
        loadTenantsDirectory: async () => ({
          kind: "denied",
          reason:
            "Tenant directory currently requires a platform-operator session.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, TENANTS_PATH);

    const text = rendered.container.textContent ?? "";
    expect(text).toContain("Access denied");
    expect(text).toContain(
      "Tenant directory currently requires a platform-operator session.",
    );
    expect(
      rendered.container.querySelector('[data-pattern="dense-data-table"]'),
    ).toBeNull();
  });

  it("renders the AdminSessionRequiredState when the loader returns shell", async () => {
    const baseFixture = createAdminBrowserFixtureState();
    const shellFixture = withTenantsFixtureTransform(
      baseFixture,
      (fixture) => ({
        ...fixture,
        loadTenantsDirectory: async () => ({ kind: "shell" }),
      }),
    );

    rendered = await renderAdminApp(shellFixture, TENANTS_PATH);

    const text = rendered.container.textContent ?? "";
    expect(text).toContain("Operator session required");
    expect(
      rendered.container.querySelector('[data-pattern="dense-data-table"]'),
    ).toBeNull();
  });
});
