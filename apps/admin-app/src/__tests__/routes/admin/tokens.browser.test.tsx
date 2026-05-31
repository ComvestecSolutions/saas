import { afterEach, describe, expect, it } from "vitest";
import { reasonCatalogId } from "@comvestec/contracts";
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
import { mockedLoaders } from "../../../testing/admin-browser-mock-state";

const PATH = "/admin/tokens";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/admin/tokens admin operator token registry route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
    mockedLoaders.issueAdminOperatorTestToken.mockClear();
    mockedLoaders.revokeAdminOperatorTestToken.mockClear();
  });

  it("renders the ready registry with an urgent default focus", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-tokens-ready']",
        ) !== null,
      "Expected admin tokens ready surface to render.",
    );

    const focusSummary = rendered.container.querySelector(
      "[data-testid='admin-tokens-focus-summary']",
    );

    expect(focusSummary).not.toBeNull();
    expect(focusSummary?.getAttribute("data-token-id")).toBe(
      "aot_fixture_active",
    );
    expect(
      rendered.container.ownerDocument.documentElement.dataset
        .adminTokensHydrated,
    ).toBe("true");
    expect(rendered.container.textContent).toContain("QA harness — primary");
    expect(rendered.container.textContent).toContain("Expiring soon");
    expect(rendered.container.textContent).toContain("Owner-only tokens");
  });

  it("filters the roster and keeps focus aligned with visible rows", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-tokens-table']",
        ) !== null,
      "Expected admin tokens table to render.",
    );

    await click(getButtonByText(rendered.container, "Revoked"));
    await waitFor(
      () =>
        rendered?.container
          .querySelector("[data-testid='admin-tokens-focus-summary']")
          ?.getAttribute("data-token-id") === "aot_fixture_revoked",
      "Expected revoked filter to move focus onto the revoked token.",
    );

    expect(
      rendered.container.querySelectorAll("[data-testid='admin-tokens-row']")
        .length,
    ).toBe(1);

    await click(getButtonByText(rendered.container, "All"));
    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search by label, prefix, or issuer",
      ),
      "QA harness",
    );

    await waitFor(
      () =>
        rendered?.container
          .querySelector("[data-testid='admin-tokens-focus-summary']")
          ?.getAttribute("data-token-id") === "aot_fixture_active",
      "Expected search filtering to realign focus with the visible active token.",
    );
  });

  it("allows pinning a token and falls back when the pin leaves the roster", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-tokens-table']",
        ) !== null,
      "Expected admin tokens table to render.",
    );

    await click(
      rendered.container.querySelector<HTMLButtonElement>(
        "[data-testid='admin-tokens-focus-cta'][data-token-id='aot_fixture_revoked']",
      )!,
    );

    await waitFor(
      () =>
        rendered?.container
          .querySelector("[data-testid='admin-tokens-focus-summary']")
          ?.getAttribute("data-token-id") === "aot_fixture_revoked",
      "Expected row focus action to pin the revoked token.",
    );

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search by label, prefix, or issuer",
      ),
      "QA harness — primary",
    );

    await waitFor(
      () =>
        rendered?.container
          .querySelector("[data-testid='admin-tokens-focus-summary']")
          ?.getAttribute("data-token-id") === "aot_fixture_active",
      "Expected focus to fall back when the pinned token is no longer visible.",
    );
  });

  it("issues a token through the high-risk guard and focuses the new entry", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-tokens-issue-composer']",
        ) !== null,
      "Expected admin token issuance controls to render.",
    );

    await changeInputValue(
      rendered.container.querySelector<HTMLInputElement>(
        "[data-testid='admin-tokens-issue-label']",
      )!,
      "Smoke harness token",
    );
    await changeInputValue(
      rendered.container.querySelector<HTMLInputElement>(
        "[data-testid='admin-tokens-issue-ttl']",
      )!,
      "48",
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
      "Expected issue token guard to open.",
    );

    await click(
      rendered.container.ownerDocument.querySelector<HTMLInputElement>(
        "[data-testid='high-risk-body'] input[type='radio']",
      )!,
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "Issuing a smoke rehearsal token for admin validation.",
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
          "Issued test token Smoke harness token.",
        ) === true &&
        rendered?.container.ownerDocument.body.textContent?.includes(
          "aott_00000003_plaintext",
        ) === true,
      "Expected issue token flow to complete.",
    );

    expect(mockedLoaders.issueAdminOperatorTestToken).toHaveBeenCalledWith({
      data: {
        label: "Smoke harness token",
        expiresAt: expect.stringMatching(/T/),
        reasonCatalogId: reasonCatalogId.adminOperatorTestTokensIssue,
        reasonAttachmentText:
          "Issuing a smoke rehearsal token for admin validation.",
      },
    });
    expect(
      rendered.container
        .querySelector("[data-testid='admin-tokens-focus-summary']")
        ?.getAttribute("data-token-id"),
    ).toBe("aot_fixture_3");
    expect(rendered.container.textContent).toContain("Smoke harness token");
  }, 30_000);

  it("revokes a token through the high-risk guard and refreshes its status", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-tokens-table']",
        ) !== null,
      "Expected admin tokens table to render.",
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
      "Expected revoke token guard to open.",
    );

    await click(
      rendered.container.ownerDocument.querySelector<HTMLInputElement>(
        "[data-testid='high-risk-body'] input[type='radio']",
      )!,
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "Rotating the seeded token after validation coverage completed.",
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
          "Revoked test token aott_a1b2c3d4.",
        ) === true,
      "Expected revoke token flow to complete.",
    );

    expect(mockedLoaders.revokeAdminOperatorTestToken).toHaveBeenCalledWith({
      data: {
        tokenId: "aot_fixture_active",
        reasonCatalogId: reasonCatalogId.adminOperatorTestTokensRevoke,
        reasonAttachmentText:
          "Rotating the seeded token after validation coverage completed.",
      },
    });
    expect(
      rendered.container
        .querySelector("[data-testid='admin-tokens-focus-summary']")
        ?.getAttribute("data-token-id"),
    ).toBe("aot_fixture_active");
    expect(
      rendered.container
        .querySelector(
          "[data-testid='admin-tokens-row'][data-token-id='aot_fixture_active']",
        )
        ?.getAttribute("data-status"),
    ).toBe("revoked");
  }, 30_000);

  it("surfaces issue mutation failures", async () => {
    rendered = await renderAdminApp(
      withFixtureTransform(createAdminBrowserFixtureState(), (fixture) => ({
        ...fixture,
        issueAdminOperatorTestToken: async () => {
          throw new Error("Issue mutation failed");
        },
      })),
      PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-tokens-issue-cta']",
        ) !== null,
      "Expected admin token issue CTA to render.",
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
      "Expected issue token guard to open.",
    );

    await click(
      rendered.container.ownerDocument.querySelector<HTMLInputElement>(
        "[data-testid='high-risk-body'] input[type='radio']",
      )!,
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "Reproducing issue failure handling.",
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
        rendered?.container.textContent?.includes("Issue mutation failed") ===
        true,
      "Expected issue mutation failure to surface.",
    );
  });

  it("surfaces revoke mutation failures", async () => {
    rendered = await renderAdminApp(
      withFixtureTransform(createAdminBrowserFixtureState(), (fixture) => ({
        ...fixture,
        revokeAdminOperatorTestToken: async () => {
          throw new Error("Revoke mutation failed");
        },
      })),
      PATH,
    );

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
      "Expected revoke token guard to open.",
    );

    await click(
      rendered.container.ownerDocument.querySelector<HTMLInputElement>(
        "[data-testid='high-risk-body'] input[type='radio']",
      )!,
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "Reproducing revoke failure handling.",
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
        rendered?.container.textContent?.includes("Revoke mutation failed") ===
        true,
      "Expected revoke mutation failure to surface.",
    );
  });
});
