import { afterEach, describe, expect, it } from "vitest";
import { platformScope } from "@comvestec/contracts";
import {
  createAdminBrowserFixtureState,
  type AdminBrowserFixtureState,
} from "../../../testing/admin-browser-fixtures";
import {
  changeInputValue,
  click,
  getFieldControlByLabel,
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "../../../testing/admin-browser-harness";
import { mockedLoaders } from "../../../testing/admin-browser-mock-state";

/**
 * Browser coverage for the spec-canonical `/r/legal-hold/$holdId`
 * Legal Hold Detail surface shipped by Phase 5 Support /
 * compliance / integrations operator screens commit 2
 * (admin-app implementation plan §8.11 + §11). Exercises the
 * `legal-hold-detail-{loader,route-data,route-server}` trio end
 * to end through the admin browser harness mock state.
 *
 * Covers: ready summary panel with release-hold CTA, denied
 * StateScreen, stale-session StateScreen, not-found error
 * StateScreen.
 */
const PATH = `/r/legal-hold/hold_org_01?scope=${platformScope.organization}&scopeId=org_demo`;

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/r/legal-hold/$holdId Legal Hold Detail route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
    mockedLoaders.releaseLegalHold.mockClear();
  });

  it("renders the ready legal hold workspace with the release CTA when active", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='legal-hold-detail-ready']",
        ) !== null,
      "Expected legal hold detail ready surface to render.",
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='legal-hold-detail-summary']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='legal-hold-detail-scope']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='legal-hold-detail-release-cta']",
      ),
    ).not.toBeNull();
  });

  it("invokes the release mutations-server flow through the high-risk guard", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='legal-hold-detail-release-cta']",
        ) !== null,
      "Expected legal hold release CTA to render.",
    );

    await click(
      rendered.container.querySelector<HTMLButtonElement>(
        "[data-testid='legal-hold-detail-release-cta']",
      )!,
    );

    await waitFor(
      () =>
        rendered?.container.ownerDocument.querySelector(
          "[data-testid='high-risk-body']",
        ) !== null,
      "Expected legal hold high-risk guard to open.",
    );

    await click(
      getFieldControlByLabel<HTMLInputElement>(
        rendered.container.ownerDocument,
        "Dispute resolved — release the legal hold",
        "input",
      ),
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "Evidence lock can be removed",
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
        mockedLoaders.releaseLegalHold.mock.calls.length === 1 &&
        rendered?.container.textContent?.includes("Release accepted for") ===
          true,
      "Expected legal hold release mutations-server flow to complete.",
    );

    expect(mockedLoaders.releaseLegalHold).toHaveBeenCalledWith({
      data: {
        legalHoldId: "hold_org_01",
      },
    });
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadLegalHoldDetail: async () => ({
          kind: "denied",
          reason: "The current operator session cannot review this legal hold.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected legal hold detail denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "The current operator session cannot review this legal hold.",
    );
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadLegalHoldDetail: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access legal hold detail.",
        ) ?? false,
      "Expected legal hold detail stale-session affordance.",
    );
  });

  it("surfaces a not-found error StateScreen when the hold is missing", async () => {
    const missingFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadLegalHoldDetail: async () => ({
          kind: "error",
          title: "Legal hold not found",
          description: "The requested legal hold is no longer available.",
        }),
      }),
    );

    rendered = await renderAdminApp(missingFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Legal hold not found") ??
        false,
      "Expected legal hold not-found state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "The requested legal hold is no longer available.",
    );
  });
});
