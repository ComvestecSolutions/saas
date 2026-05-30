import { afterEach, describe, expect, it } from "vitest";
import { platformAdapterServiceName } from "@comvestec/contracts";
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
 * Browser coverage for the spec-canonical `/desk/vendors` Vendor
 * Health v2 surface shipped by Phase 6 vendor + workflow
 * operator screens commit 6a (admin-app implementation plan
 * §8.15 + §11). Exercises the
 * `vendor-list-{loader,route-data,route-server}` trio end to
 * end through the admin browser harness mock state.
 *
 * Covers: ready posture board with adapter table + deep-link
 * out, denied StateScreen, stale-session StateScreen, error
 * StateScreen.
 */
const PATH = "/desk/vendors";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/desk/vendors Vendor Health v2 route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the ready posture board with KPIs + per-vendor table + deep-link", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='vendor-list-ready']",
        ) !== null,
      "Expected vendor v2 ready surface to render.",
    );

    expect(
      rendered.container.querySelector("[data-testid='vendor-list-posture']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='vendor-list-entries-table']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelectorAll(
        "[data-testid='vendor-list-entry-row']",
      ).length,
    ).toBeGreaterThan(0);
    const links = Array.from(
      rendered.container.querySelectorAll<HTMLAnchorElement>(
        "[data-testid='vendor-list-entry-link']",
      ),
    );
    expect(links.length).toBeGreaterThan(0);
    expect(
      links.some((link) =>
        link
          .getAttribute("href")
          ?.includes(`/desk/vendor/${platformAdapterServiceName.keycloak}`),
      ),
    ).toBe(true);
    expect(
      rendered.container.querySelector(
        "[data-testid='vendor-list-partial-failures']",
      ),
    ).not.toBeNull();
    expect(rendered.container.textContent).toContain("Attention vendor");
    expect(rendered.container.textContent).toContain("Slowest adapter");
  });

  it("filters the vendor watchboard by search query and posture", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='vendor-list-ready']",
        ) !== null,
      "Expected vendor watchboard ready surface to render.",
    );

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search services, status, message, or failure reason…",
      ),
      "postal",
    );
    await waitFor(
      () =>
        rendered?.container.querySelectorAll(
          "[data-testid='vendor-list-entry-row']",
        ).length === 1,
      "Expected vendor search to narrow the watchboard to one row.",
    );
    const searchRows = Array.from(
      rendered.container.querySelectorAll(
        "[data-testid='vendor-list-entry-row']",
      ),
    )
      .map((row) => row.textContent ?? "")
      .join(" ");
    expect(searchRows).toContain("postal");
    expect(searchRows).not.toContain("keycloak");

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search services, status, message, or failure reason…",
      ),
      "",
    );
    await click(getButtonByText(rendered.container, "Degraded"));
    await waitFor(
      () =>
        rendered?.container.querySelectorAll(
          "[data-testid='vendor-list-entry-row']",
        ).length === 1,
      "Expected degraded posture filter to narrow the watchboard to one row.",
    );
    const degradedRows = Array.from(
      rendered.container.querySelectorAll(
        "[data-testid='vendor-list-entry-row']",
      ),
    )
      .map((row) => row.textContent ?? "")
      .join(" ");
    expect(degradedRows).toContain("novu");
    expect(degradedRows).not.toContain("postal");
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (base) => ({
        ...base,
        loadVendorList: async () => ({
          kind: "denied",
          reason:
            "The current operator session cannot inspect the vendor-health aggregate.",
        }),
      }),
    );

    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected vendor denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "cannot inspect the vendor-health aggregate",
    );
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (base) => ({
        ...base,
        loadVendorList: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access vendor posture.",
        ) ?? false,
      "Expected vendor stale-session affordance.",
    );
  });

  it("surfaces an error StateScreen when the loader errors", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (base) => ({
        ...base,
        loadVendorList: async () => ({
          kind: "error",
          title: "Vendor posture unavailable",
          description: "Upstream vendor-health aggregator unreachable.",
        }),
      }),
    );

    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Vendor posture unavailable",
        ) ?? false,
      "Expected vendor error state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Upstream vendor-health aggregator unreachable.",
    );
  });
});
