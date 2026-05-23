import { afterEach, describe, expect, it } from "vitest";
import {
  followLink,
  getLinkByText,
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "../../../testing/admin-browser-harness";
import { createAdminBrowserFixtureState } from "../../../testing/admin-browser-fixtures";

describe("/r/$ catch-all resource route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders a recovery workspace instead of a coming-soon placeholder", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      "/r/unknown-resource",
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='unknown-resource-ready']",
        ) !== null,
      "Expected the unknown resource recovery workspace to render.",
    );

    const text = rendered.container.textContent ?? "";
    expect(text).toContain("/r/unknown-resource");
    expect(text).not.toContain("Resource view coming soon");
    expect(text).toContain("Tenant directory");

    const tenantDirectoryLink = getLinkByText(
      rendered.container,
      "Tenant directory",
    );
    await followLink(rendered.router, tenantDirectoryLink);
    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='tenants-directory-ready']",
        ) !== null,
      "Expected the recovery link to open a useful tenant directory surface.",
    );
  });

  it("prioritizes resource suggestions that match the requested slug", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      "/r/vendor-latency",
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='unknown-resource-suggestions']",
        ) !== null,
      "Expected the suggested recovery links to render.",
    );

    const firstSuggestion = rendered.container.querySelector<HTMLAnchorElement>(
      "[data-testid='unknown-resource-link']",
    );
    expect(firstSuggestion?.textContent).toContain("Vendor intelligence");
    expect(firstSuggestion?.getAttribute("href")).toBe("/r/vendors");
  });
});
