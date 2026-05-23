import { afterEach, describe, expect, it } from "vitest";
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
 * Browser coverage for `/r/meter/$meterId` (admin-app
 * implementation plan §8.10 + §11 — Phase 4 commit 1). Exercises
 * the `meter-detail-{loader,route-data,route-server}` trio
 * end to end through the admin browser harness mock state.
 */
const READY_NO_USAGE_PATH =
  "/r/meter/events.fixture" +
  "?tenantScope=organization&tenantScopeId=org_demo";
const READY_WITH_USAGE_PATH =
  READY_NO_USAGE_PATH +
  "&subject=sub_1&granularity=DAY&windowFrom=2026-05-01T00%3A00%3A00.000Z&windowTo=2026-05-08T00%3A00%3A00.000Z";
const TENANT_MISSING_PATH = "/r/meter/events.fixture";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/r/meter/$meterId Meter detail route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the ready meter summary with the usage-empty affordance when no window is supplied", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      READY_NO_USAGE_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='meter-detail-ready']",
        ) !== null,
      "Expected meter detail ready surface to render.",
    );
    expect(
      rendered.container.querySelector(
        "[data-testid='meter-detail-usage-empty']",
      ),
    ).not.toBeNull();
  });

  it("renders the usage chart card when subject + granularity + window are supplied", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      READY_WITH_USAGE_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='meter-detail-usage-card']",
        ) !== null,
      "Expected meter detail usage card to render.",
    );
    expect(
      rendered.container.querySelector(
        "[data-testid='meter-detail-usage-chart']",
      ),
    ).not.toBeNull();
  });

  it("surfaces an error StateScreen when required tenant search params are missing", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      TENANT_MISSING_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Meter tenant required") ??
        false,
      "Expected meter tenant-required error to render.",
    );
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadMeterDetail: async () => ({
          kind: "denied",
          reason:
            "The current operator session cannot review OpenMeter usage data.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, READY_NO_USAGE_PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected meter denied state to render.",
    );
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadMeterDetail: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, READY_NO_USAGE_PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access meter detail.",
        ) ?? false,
      "Expected meter stale-session affordance.",
    );
  });

  it("surfaces an error StateScreen when the loader errors", async () => {
    const errorFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadMeterDetail: async () => ({
          kind: "error",
          title: "Meter detail unavailable",
          description: "Upstream OpenMeter usage query failed.",
        }),
      }),
    );

    rendered = await renderAdminApp(errorFixture, READY_NO_USAGE_PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Meter detail unavailable") ??
        false,
      "Expected meter error state to render.",
    );
  });
});
