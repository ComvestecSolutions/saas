import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import {
  createAdminBrowserFixtureState,
  type AdminBrowserFixtureState,
} from "../../testing/admin-browser-fixtures";
import {
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "../../testing/admin-browser-harness";

/**
 * Browser coverage for the Phase 2 Desk Core commit 7
 * omnibar wrapper (admin-app implementation plan §9 item 11).
 *
 * MVP coverage per the commit-7 escape hatch on the prompt:
 *   - happy-path debounced search → suggestion render
 *   - selection → router navigation to the entry's permalink
 *
 * Rich keyboard map (↑/↓), the full-screen mobile sheet, the
 * denied / empty / error inline affordances, and the full
 * prefix-routing matrix are deferred to commit 8 follow-ups.
 */

const DESK_PATH = "/desk";

const setNativeInputValue = (input: HTMLInputElement, value: string) => {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (nativeSetter === undefined) {
    throw new TypeError("Expected HTMLInputElement value setter.");
  }
  nativeSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("DeskShellOmnibar — bottom Command Strip", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("debounces input, renders federated-search suggestions, and navigates to the entry permalink on selection", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (base) => ({
        ...base,
        loadUniversalSearch: async (input) => ({
          kind: "ready",
          fromCache: false,
          result: {
            query: input.query,
            entries: [
              {
                facet: "tenants",
                id: "ten_acme",
                label: "Acme Holdings",
                scopeTag: "tenant",
                permalink: "/desk/tenant/ten_acme",
                fieldClassification: "public",
              },
            ],
            partialFailures: [],
            indexFreshness: {
              lastReindexedAt: new Date(0).toISOString(),
              isFresh: true,
            },
            correlationId: "corr_test",
            generatedAt: new Date(0).toISOString(),
          },
        }),
      }),
    );

    rendered = await renderAdminApp(fixture, DESK_PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-component='desk-shell-omnibar']",
        ) !== null,
      "Expected the desk-shell omnibar to render in the CommandStrip.",
    );

    const omnibarRoot = rendered.container.querySelector<HTMLDivElement>(
      "[data-component='desk-shell-omnibar']",
    );
    if (!(omnibarRoot instanceof HTMLDivElement)) {
      throw new TypeError("Expected omnibar wrapper element.");
    }

    const input = omnibarRoot.querySelector<HTMLInputElement>(
      "input[type='search']",
    );
    if (!(input instanceof HTMLInputElement)) {
      throw new TypeError("Expected omnibar input element.");
    }

    expect(input.getAttribute("aria-label")).toBe("Operator omnibar");
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");

    await act(async () => {
      setNativeInputValue(input, "acme");
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    });

    await waitFor(
      () =>
        omnibarRoot.querySelector("[data-testid='omnibar-suggestions']") !==
        null,
      "Expected debounced search to render the suggestions listbox.",
      120,
    );

    const suggestionButton = omnibarRoot.querySelector<HTMLButtonElement>(
      "button[data-suggestion='tenants:ten_acme']",
    );
    if (!(suggestionButton instanceof HTMLButtonElement)) {
      throw new TypeError("Expected the tenant suggestion to render.");
    }

    expect(suggestionButton.textContent).toContain("Acme Holdings");

    await act(async () => {
      suggestionButton.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );
    });

    await act(async () => {
      await waitFor(
        () => window.location.pathname === "/desk/tenant/ten_acme",
        `Expected omnibar selection to navigate to /r/tenant/ten_acme (was ${window.location.pathname}).`,
      );
    });

    expect(input.value).toBe("");

    // Wait for the tenant workspace v2 route loader to finish so
    // its async mocked module imports resolve before the harness
    // teardown — otherwise pending router-load promises race the
    // vitest mocker shutdown and surface as an Unhandled Rejection.
    await act(async () => {
      await waitFor(
        () =>
          rendered?.container.querySelector(
            "[data-testid='tenant-workspace-v2-actor-card']",
          ) !== null ||
          rendered?.container.textContent?.includes("ten_acme") === true,
        "Expected tenant workspace v2 route to settle after omnibar navigation.",
      );
    });
  });

  it("routes a tenant prefix submission immediately on Enter", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      DESK_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-component='desk-shell-omnibar']",
        ) !== null,
      "Expected the desk-shell omnibar to render in the CommandStrip.",
    );

    const omnibarRoot = rendered.container.querySelector<HTMLDivElement>(
      "[data-component='desk-shell-omnibar']",
    );
    if (!(omnibarRoot instanceof HTMLDivElement)) {
      throw new TypeError("Expected omnibar wrapper element.");
    }

    const input = omnibarRoot.querySelector<HTMLInputElement>(
      "input[type='search']",
    );
    if (!(input instanceof HTMLInputElement)) {
      throw new TypeError("Expected omnibar input element.");
    }

    await act(async () => {
      setNativeInputValue(input, "t/ten_omnibar_fixture");
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    await act(async () => {
      await waitFor(
        () => window.location.pathname === "/desk/tenant/ten_omnibar_fixture",
        `Expected omnibar Enter submit to navigate to /r/tenant/ten_omnibar_fixture (was ${window.location.pathname}).`,
      );
    });

    expect(input.value).toBe("");

    await act(async () => {
      await waitFor(
        () =>
          rendered?.container.querySelector(
            "[data-testid='tenant-workspace-v2-actor-card']",
          ) !== null ||
          rendered?.container.textContent?.includes("ten_omnibar_fixture") ===
            true,
        "Expected tenant workspace v2 route to settle after omnibar Enter navigation.",
      );
    });
  });
});
