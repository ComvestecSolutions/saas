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
 * Browser coverage for `/desk/invoice/$invoiceId` (admin-app
 * implementation plan §8.10 + §11 — Phase 4 commit 1). Exercises
 * the `invoice-detail-{loader,route-data,route-server}` trio
 * end to end through the admin browser harness mock state.
 */
const READY_PATH =
  "/desk/invoice/inv_demo_01" +
  "?tenantScope=organization&tenantScopeId=org_demo&customerId=cust_polar_01";
const SHELL_PATH = "/desk/invoice/inv_demo_01";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/desk/invoice/$invoiceId Invoice detail route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the ready customer card with deep-link refund affordance", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      READY_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='invoice-detail-ready']",
        ) !== null,
      "Expected invoice detail ready surface to render.",
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='invoice-detail-customer-card']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='invoice-detail-refund-deeplink']",
      ),
    ).not.toBeNull();
  });

  it("surfaces an error StateScreen when required tenant search params are missing", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      SHELL_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Invoice tenant required") ??
        false,
      "Expected invoice tenant-required error to render.",
    );
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadInvoiceDetail: async () => ({
          kind: "denied",
          reason: "The current operator session cannot review invoice detail.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, READY_PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected invoice denied state to render.",
    );
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadInvoiceDetail: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, READY_PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access invoice detail.",
        ) ?? false,
      "Expected invoice stale-session affordance.",
    );
  });

  it("surfaces an error StateScreen when the loader errors", async () => {
    const errorFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadInvoiceDetail: async () => ({
          kind: "error",
          title: "Invoice detail unavailable",
          description: "Upstream Polar customer endpoint timed out.",
        }),
      }),
    );

    rendered = await renderAdminApp(errorFixture, READY_PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Invoice detail unavailable",
        ) ?? false,
      "Expected invoice error state to render.",
    );
  });
});
