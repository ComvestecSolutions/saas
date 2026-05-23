import { afterEach, describe, expect, it } from "vitest";
import {
  createAdminBrowserFixtureState,
  type AdminBrowserFixtureState,
} from "../../../testing/admin-browser-fixtures";
import {
  changeSelectValue,
  changeInputValue,
  click,
  getFieldControlByLabel,
  getButtonByText,
  getInputByPlaceholder,
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "../../../testing/admin-browser-harness";
import { mockedLoaders } from "../../../testing/admin-browser-mock-state";

/**
 * Browser coverage for the spec-canonical `/admin/tokens`
 * admin-operator-test-tokens roster surface shipped by Phase 7
 * commit 7b-2-tokens (admin-app implementation plan §11).
 */
const PATH = "/admin/tokens";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/admin/tokens admin operator test tokens route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
    mockedLoaders.issueAdminOperatorTestToken.mockClear();
    mockedLoaders.revokeAdminOperatorTestToken.mockClear();
  });

  it("renders the ready surface with KPI strip, table, and Issue CTA", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-tokens-ready']",
        ) !== null,
      "Expected admin tokens ready surface to render.",
    );

    expect(
      rendered.container.querySelector("[data-testid='admin-tokens-kpis']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector("[data-testid='admin-tokens-table']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='admin-tokens-issue-cta']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelectorAll("[data-testid='admin-tokens-row']")
        .length,
    ).toBeGreaterThan(0);
    expect(rendered.container.textContent).toContain("Owner-only tokens");
  });

  it("filters the token registry by search query and status", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-tokens-ready']",
        ) !== null,
      "Expected admin tokens ready surface to render.",
    );

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search labels, prefixes, or issuers…",
      ),
      "Rotation cleanup",
    );
    await waitFor(
      () =>
        rendered?.container.querySelectorAll("[data-testid='admin-tokens-row']")
          .length === 1,
      "Expected token search to narrow the registry to one row.",
    );
    expect(rendered.container.textContent).toContain("Rotation cleanup");
    expect(rendered.container.textContent).not.toContain("QA harness");

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search labels, prefixes, or issuers…",
      ),
      "",
    );
    await click(getButtonByText(rendered.container, "Revoked"));
    await waitFor(
      () =>
        rendered?.container.querySelectorAll("[data-testid='admin-tokens-row']")
          .length === 1,
      "Expected revoked filter to narrow the registry to revoked tokens.",
    );
    expect(rendered.container.textContent).toContain("Rotation cleanup");
  });

  it("issues a token through the high-risk guard and reveals the one-shot plaintext token", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-tokens-issue-label']",
        ) !== null,
      "Expected admin token composer to render.",
    );

    await changeInputValue(
      rendered.container.querySelector<HTMLInputElement>(
        "[data-testid='admin-tokens-issue-label']",
      )!,
      "Smoke harness token",
    );
    await changeSelectValue(
      rendered.container.querySelector<HTMLSelectElement>(
        "[data-testid='admin-tokens-issue-expiry']",
      )!,
      "24h",
    );
    await click(
      rendered.container.querySelector<HTMLButtonElement>(
        "[data-testid='admin-tokens-issue-cta']",
      )!,
    );

    await waitFor(
      () =>
        rendered?.container.ownerDocument.querySelector(
          "[data-testid='high-risk-body']",
        ) !== null,
      "Expected admin token issue guard to open.",
    );

    await click(
      getFieldControlByLabel<HTMLInputElement>(
        rendered.container.ownerDocument,
        "QA harness — issue admin-operator test token",
        "input",
      ),
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "Issuing a smoke token for regression verification.",
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
        mockedLoaders.issueAdminOperatorTestToken.mock.calls.length === 1 &&
        rendered?.container.textContent?.includes(
          "Token issued: Smoke harness token.",
        ) === true &&
        rendered?.container.ownerDocument.body.textContent?.includes(
          "Admin test token issued",
        ) === true,
      "Expected admin token issue flow to complete.",
    );

    expect(mockedLoaders.issueAdminOperatorTestToken).toHaveBeenCalledWith({
      data: {
        label: "Smoke harness token",
        expiresAt: expect.any(String),
        reasonCatalogId: "admin-operator-test-tokens.issue.qa",
        reasonAttachmentText:
          "Issuing a smoke token for regression verification.",
      },
    });
    expect(rendered.container.ownerDocument.body.textContent).toContain(
      "Plaintext token",
    );
    expect(rendered.container.ownerDocument.body.textContent).toContain(
      "aott_00000003_plaintext",
    );
  });

  it("revokes a token through the high-risk guard", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-tokens-revoke-cta'][data-token-id='aot_fixture_active']",
        ) !== null,
      "Expected admin token revoke CTA to render.",
    );

    await click(
      rendered.container.querySelector<HTMLButtonElement>(
        "[data-testid='admin-tokens-revoke-cta'][data-token-id='aot_fixture_active']",
      )!,
    );

    await waitFor(
      () =>
        rendered?.container.ownerDocument.querySelector(
          "[data-testid='high-risk-body']",
        ) !== null,
      "Expected admin token revoke guard to open.",
    );

    await click(
      getFieldControlByLabel<HTMLInputElement>(
        rendered.container.ownerDocument,
        "Rotation — revoke admin-operator test token",
        "input",
      ),
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "Rotating the long-lived active smoke token.",
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
        mockedLoaders.revokeAdminOperatorTestToken.mock.calls.length === 1 &&
        rendered?.container.textContent?.includes(
          "Token revoked: aot_fixture_active.",
        ) === true,
      "Expected admin token revoke flow to complete.",
    );

    expect(mockedLoaders.revokeAdminOperatorTestToken).toHaveBeenCalledWith({
      data: {
        tokenId: "aot_fixture_active",
        reasonCatalogId: "admin-operator-test-tokens.revoke.rotation",
        reasonAttachmentText: "Rotating the long-lived active smoke token.",
      },
    });
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (f) => ({
        ...f,
        loadAdminTokens: async () => ({ kind: "stale-session" }),
      }),
    );
    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access admin-operator test tokens.",
        ) ?? false,
      "Expected admin tokens stale-session affordance.",
    );
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (f) => ({
        ...f,
        loadAdminTokens: async () => ({
          kind: "denied",
          reason:
            "Only admin-owner roster members may inspect admin-operator-test-tokens activity.",
        }),
      }),
    );
    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected admin tokens denied state to render.",
    );
    expect(rendered.container.textContent).toContain("admin-owner");
  });

  it("surfaces an error StateScreen when the loader errors", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (f) => ({
        ...f,
        loadAdminTokens: async () => ({
          kind: "error",
          title: "Admin operator test tokens unavailable",
          description: "Upstream admin-operator-test-tokens port unreachable.",
        }),
      }),
    );
    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Admin operator test tokens unavailable",
        ) ?? false,
      "Expected admin tokens error state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Upstream admin-operator-test-tokens port unreachable.",
    );
  });
});
