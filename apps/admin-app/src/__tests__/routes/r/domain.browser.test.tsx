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
 * Browser coverage for the spec-canonical
 * `/r/domain/$hostname` Custom-domain lifecycle surface
 * shipped by Phase 4 Domain operator screens commit 2
 * (admin-app implementation plan §8.10 + §11). Exercises the
 * `domain-detail-{loader,route-data,route-server}` trio end to
 * end through the admin browser harness mock state.
 *
 * Covers: ready (lifecycle chip + DNS records + verify CTA),
 * tenant-required error, copy-to-clipboard affordance fires,
 * empty DNS-proof state, not-found StateScreen,
 * verify-CTA arms the HighRiskActionGuard, denied StateScreen,
 * stale-session StateScreen, error StateScreen.
 */
const HOSTNAME = "ops.fixture.tenant.example";
const PATH_READY = `/r/domain/${encodeURIComponent(
  HOSTNAME,
)}?tenantScope=organization&tenantScopeId=org_demo`;
const PATH_MISSING_TENANT = `/r/domain/${encodeURIComponent(HOSTNAME)}`;

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/r/domain/$hostname Custom-domain lifecycle v2 route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
    mockedLoaders.verifyCustomDomain.mockClear();
  });

  it("renders the ready surface with lifecycle chip, DNS records, copy button, and verify CTA", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      PATH_READY,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='domain-detail-ready']",
        ) !== null,
      "Expected domain v2 ready surface to render.",
    );

    const lifecycleChip = rendered.container.querySelector(
      "[data-testid='domain-detail-lifecycle-chip']",
    );
    expect(lifecycleChip).not.toBeNull();
    expect(lifecycleChip?.getAttribute("data-lifecycle-state")).toBe(
      "verifying",
    );
    expect(
      rendered.container.querySelectorAll(
        "[data-testid='domain-detail-dns-row']",
      ).length,
    ).toBe(2);
    expect(
      rendered.container.querySelectorAll(
        "[data-testid='domain-detail-dns-copy']",
      ).length,
    ).toBe(2);
    expect(
      rendered.container.querySelector(
        "[data-testid='domain-detail-verify-cta']",
      ),
    ).not.toBeNull();
  }, 30_000);

  it("surfaces a tenant-required error when search params are missing", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      PATH_MISSING_TENANT,
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Domain tenant required") ??
        false,
      "Expected tenant-required error state.",
    );
  });

  it("arms the HighRiskActionGuard when the verify CTA is clicked", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      PATH_READY,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='domain-detail-verify-cta']",
        ) !== null,
      "Expected verify CTA to render.",
    );

    const cta = rendered.container.querySelector(
      "[data-testid='domain-detail-verify-cta']",
    ) as HTMLButtonElement | null;
    if (!(cta instanceof HTMLButtonElement)) {
      throw new TypeError("Expected verify CTA button.");
    }

    await click(cta);

    await waitFor(
      () => document.querySelector("[data-testid='high-risk-body']") !== null,
      "Expected HighRiskActionGuard to arm after verify CTA click.",
    );
  });

  it("invokes the verify mutations-server flow through the high-risk guard", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      PATH_READY,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='domain-detail-verify-cta']",
        ) !== null,
      "Expected domain verify CTA to render.",
    );

    await click(
      rendered.container.querySelector<HTMLButtonElement>(
        "[data-testid='domain-detail-verify-cta']",
      )!,
    );

    await waitFor(
      () =>
        rendered?.container.ownerDocument.querySelector(
          "[data-testid='high-risk-body']",
        ) !== null,
      "Expected domain high-risk guard to open.",
    );

    await click(
      getFieldControlByLabel<HTMLInputElement>(
        rendered.container.ownerDocument,
        "Activate custom domain after DNS verification",
        "input",
      ),
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "DNS ownership rechecked and approved",
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
        mockedLoaders.verifyCustomDomain.mock.calls.length === 1 &&
        rendered?.container.textContent?.includes("Domain activated for") ===
          true,
      "Expected domain verify mutations-server flow to complete.",
    );

    expect(mockedLoaders.verifyCustomDomain).toHaveBeenCalledWith({
      data: {
        hostname: HOSTNAME,
        scope: "organization",
        scopeId: "org_demo",
        reasonId: "tenant-branding.custom-domain.activate",
        approvalNotes: "DNS ownership rechecked and approved",
      },
    });
  });

  it("flips the copy button to copied state on click", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      PATH_READY,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='domain-detail-dns-copy']",
        ) !== null,
      "Expected copy buttons to render.",
    );

    const copyButton = rendered.container.querySelector(
      "[data-testid='domain-detail-dns-copy']",
    ) as HTMLButtonElement | null;
    if (!(copyButton instanceof HTMLButtonElement)) {
      throw new TypeError("Expected DNS copy button.");
    }

    await click(copyButton);

    await waitFor(
      () => copyButton?.getAttribute("data-copied") === "true",
      "Expected copy button to flip to copied state.",
    );
  });

  it("renders an honest empty state when the ready payload has no DNS proof rows", async () => {
    const emptyDnsFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadDomainDetail: async (input) => ({
          kind: "ready",
          hostname: input.hostname,
          tenant: input.tenant,
          lifecycleState: "verifying",
          dnsRecords: [],
          changedAt: new Date(0).toISOString(),
        }),
      }),
    );

    rendered = await renderAdminApp(emptyDnsFixture, PATH_READY);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "DNS proof not yet published",
        ) ?? false,
      "Expected empty DNS-proof state to render.",
    );
    expect(
      rendered.container.querySelector(
        "[data-testid='domain-detail-dns-empty']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='domain-detail-dns-copy']",
      ),
    ).toBeNull();
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadDomainDetail: async () => ({
          kind: "denied",
          reason:
            "The current operator session cannot inspect custom-domain lifecycle.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, PATH_READY);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected domain denied state to render.",
    );
  });

  it("surfaces a not-found StateScreen when the loader returns not-found", async () => {
    const notFoundFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadDomainDetail: async () => ({
          kind: "not-found",
          title: "Domain not found",
          description:
            "No custom-domain verification record was found for 'ops.fixture.tenant.example' under organization/org_demo.",
        }),
      }),
    );

    rendered = await renderAdminApp(notFoundFixture, PATH_READY);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Domain not found") ?? false,
      "Expected domain not-found state to render.",
    );
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadDomainDetail: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, PATH_READY);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access domain detail.",
        ) ?? false,
      "Expected domain stale-session affordance.",
    );
  });

  it("surfaces an error StateScreen when the loader errors", async () => {
    const errorFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadDomainDetail: async () => ({
          kind: "error",
          title: "Domain detail unavailable",
          description: "Upstream tenant-branding adapter unreachable.",
        }),
      }),
    );

    rendered = await renderAdminApp(errorFixture, PATH_READY);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Domain detail unavailable",
        ) ?? false,
      "Expected domain error state to render.",
    );
  });
});
