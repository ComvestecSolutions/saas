import { afterEach, describe, expect, it } from "vitest";
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
 * Browser coverage for the spec-canonical `/desk/incident/$incidentId`
 * Incident detail surface shipped by Phase 5 Support / compliance
 * / integrations operator screens commit 1 (admin-app
 * implementation plan §8.8 + §11). Exercises the
 * `incident-detail-{loader,route-data,route-server}` trio end to
 * end through the admin browser harness mock state.
 *
 * Covers: ready posture board with release-grant CTA, denied
 * StateScreen, stale-session StateScreen, not-found error
 * StateScreen.
 */
const PATH = "/desk/incident/incident_case_01";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/desk/incident/$incidentId Incident detail route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
    mockedLoaders.releaseBreakGlassGrant.mockClear();
  });

  it("renders the ready incident workspace with the release-grant CTA", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='incident-detail-ready']",
        ) !== null,
      "Expected incident detail ready surface to render.",
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='incident-detail-summary']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='incident-detail-timeline']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='incident-detail-release-cta']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='incident-detail-countdown']",
      )?.textContent,
    ).toContain("1440 minutes remaining");
  });

  it("invokes the release mutations-server flow through the high-risk guard", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='incident-detail-release-cta']",
        ) !== null,
      "Expected incident release CTA to render.",
    );

    await click(
      rendered.container.querySelector<HTMLButtonElement>(
        "[data-testid='incident-detail-release-cta']",
      )!,
    );

    await waitFor(
      () =>
        rendered?.container.ownerDocument.querySelector(
          "[data-testid='high-risk-body']",
        ) !== null,
      "Expected incident high-risk guard to open.",
    );

    await click(
      getFieldControlByLabel<HTMLInputElement>(
        rendered.container.ownerDocument,
        "Incident closed — release the active grant",
        "input",
      ),
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "Responder confirmed the incident is closed",
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
        mockedLoaders.releaseBreakGlassGrant.mock.calls.length === 1 &&
        rendered?.container.textContent?.includes("Release accepted for") ===
          true,
      "Expected incident release mutations-server flow to complete.",
    );

    expect(mockedLoaders.releaseBreakGlassGrant).toHaveBeenCalledWith({
      data: {
        caseId: "incident_case_01",
        releaseReasonCatalogId: "manual-break-glass.release.incident-closed",
      },
    });
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadIncidentDetail: async () => ({
          kind: "denied",
          reason:
            "The current operator session cannot review break-glass incidents.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected incident detail denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "The current operator session cannot review break-glass incidents.",
    );
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadIncidentDetail: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access incident detail.",
        ) ?? false,
      "Expected incident detail stale-session affordance.",
    );
  });

  it("surfaces a not-found error StateScreen when the incident is missing", async () => {
    const missingFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadIncidentDetail: async () => ({
          kind: "error",
          title: "Incident not found",
          description: "The requested incident is no longer available.",
        }),
      }),
    );

    rendered = await renderAdminApp(missingFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Incident not found") ??
        false,
      "Expected incident not-found state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "The requested incident is no longer available.",
    );
  });
});
