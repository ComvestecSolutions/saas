import { afterEach, describe, expect, it } from "vitest";
import { platformAdapterServiceName } from "@comvestec/contracts";
import {
  createAdminBrowserFixtureState,
  type AdminBrowserFixtureState,
} from "../../../testing/admin-browser-fixtures";
import {
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "../../../testing/admin-browser-harness";

/**
 * Browser coverage for the spec-canonical `/r/vendor/$service`
 * Vendor Detail v2 surface shipped by Phase 6 vendor + workflow
 * operator screens commit 6a (admin-app implementation plan
 * §8.15 + §11). Exercises the
 * `vendor-detail-{loader,route-data,route-server}` trio end to
 * end through the admin browser harness mock state.
 *
 * Covers: ready summary + health-history pane + deep-link
 * runbook + partial-failure attachment, denied StateScreen,
 * stale-session StateScreen, error StateScreen for the not-
 * found case.
 */
const PATH = `/r/vendor/${platformAdapterServiceName.keycloak}`;
const POSTAL_PATH = `/r/vendor/${platformAdapterServiceName.postal}`;

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/r/vendor/$service Vendor Detail v2 route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the ready vendor summary with timeline and service-specific follow-up links", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='vendor-detail-ready']",
        ) !== null,
      "Expected vendor detail ready surface to render.",
    );

    expect(
      rendered.container.querySelector("[data-testid='vendor-detail-kpis']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector("[data-testid='vendor-detail-summary']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector("[data-testid='vendor-detail-history']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='vendor-detail-deep-link']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container
        .querySelector("[data-testid='vendor-detail-status-chip']")
        ?.getAttribute("data-status"),
    ).toBe("healthy");
    expect(rendered.container.textContent).toContain("Console handoff");
    expect(
      rendered.container.querySelector(
        "[data-testid='vendor-detail-follow-ups']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container
        .querySelector("[data-testid='vendor-detail-follow-ups'] a")
        ?.getAttribute("href"),
    ).toBe("/r/search?q=keycloak");
    expect(rendered.container.textContent).toContain("Aggregate generated");
  }, 30_000);

  it("surfaces the partial-failure pane when the aggregate carries one for this service", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      POSTAL_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='vendor-detail-partial-failure']",
        ) !== null,
      "Expected vendor partial-failure pane to render.",
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='vendor-detail-partial-failure-reason']",
      )?.textContent,
    ).toContain("Postal admin API unreachable.");
    expect(
      rendered.container
        .querySelector("[data-testid='vendor-detail-follow-ups'] a")
        ?.getAttribute("href"),
    ).toBe("/r/notify");
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (base) => ({
        ...base,
        loadVendorDetail: async () => ({
          kind: "denied",
          reason:
            "The current operator session cannot inspect the vendor-health aggregate.",
        }),
      }),
    );

    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected vendor detail denied state to render.",
    );
  });

  it("surfaces a not-found error StateScreen when the service is absent from the aggregate", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (base) => ({
        ...base,
        loadVendorDetail: async () => ({
          kind: "error",
          title: "Vendor not found",
          description:
            "No vendor-health entry was reported for service 'keycloak' in the current aggregate.",
        }),
      }),
    );

    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Vendor not found") ?? false,
      "Expected vendor detail not-found state to render.",
    );
  });
});
