import { afterEach, describe, expect, it } from "vitest";
import {
  createAdminBrowserFixtureState,
  type AdminBrowserFixtureState,
} from "../../../testing/admin-browser-fixtures";
import {
  changeInputValue,
  click,
  getButtonByText,
  getFieldControlByLabel,
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "../../../testing/admin-browser-harness";
import { mockedLoaders } from "../../../testing/admin-browser-mock-state";

/**
 * Browser coverage for the spec-canonical `/r/access` Access
 * Control v2 surface shipped by Phase 3 Governance & access
 * commit 4 (admin-app implementation plan §8.7 + §11). Exercises
 * the `governance-access-{loader,route-data,route-server}` trio
 * end to end through the admin browser harness mock state plus
 * the new `governance-access-mutations-server` sibling.
 *
 * Covers: tab switching via URL state (`?tab=`), ready render
 * per tab (Operators · Tuples · Projection profiles · Scopes &
 * permissions), denied StateScreen, stale-session StateScreen.
 */
const LIST_PATH = "/r/access";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/r/access Access Control v2 route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
    mockedLoaders.revokeAuthorizationTuple.mockClear();
  });

  it("renders the ready Operators tab by default", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      LIST_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='access-control-list-ready']",
        ) !== null,
      "Expected access-control v2 ready surface to render.",
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='access-control-tab-bar']",
      ),
    ).not.toBeNull();
    const operatorsTab = rendered.container.querySelector(
      "[data-testid='access-control-tab-operators']",
    );
    expect(operatorsTab?.getAttribute("data-selected")).toBe("true");
    expect(
      rendered.container.querySelector(
        "[data-testid='access-control-operators-table']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelectorAll(
        "[data-testid='access-control-operators-row']",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      rendered.container
        .querySelector("[data-testid='access-control-current-operator-link']")
        ?.getAttribute("href"),
    ).toBe("/r/operator/usr_platform_operator");
    expect(
      rendered.container
        .querySelector("[data-testid='access-control-operator-link']")
        ?.getAttribute("href"),
    ).toBe("/r/operator/usr_platform_operator");
  });

  it("renders the Projection profiles tab when ?tab=profiles is set", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      `${LIST_PATH}?tab=profiles`,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='access-control-profiles-table']",
        ) !== null,
      "Expected projection-profiles table to render.",
    );

    const profilesTab = rendered.container.querySelector(
      "[data-testid='access-control-tab-profiles']",
    );
    expect(profilesTab?.getAttribute("data-selected")).toBe("true");
    expect(
      rendered.container.querySelector(
        "[data-testid='access-control-operators-table']",
      ),
    ).toBeNull();
  });

  it("renders the Scopes & permissions tab when ?tab=scopes is set", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      `${LIST_PATH}?tab=scopes`,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='access-control-scopes-table']",
        ) !== null,
      "Expected scopes table to render.",
    );

    expect(
      rendered.container.querySelectorAll(
        "[data-testid='access-control-scopes-row']",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("renders the Tuples tab empty-state when no namespace+object+relation are supplied", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      `${LIST_PATH}?tab=tuples`,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='access-control-tuples-empty']",
        ) !== null,
      "Expected tuples empty-state to render without a query triple.",
    );
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadGovernanceAccessV2: async () => ({
          kind: "denied",
          reason:
            "Access-control inspection requires a trusted operator session.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, LIST_PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected access-control denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Access-control inspection requires a trusted operator session.",
    );
    expect(
      rendered.container.querySelector(
        "[data-testid='access-control-list-ready']",
      ),
    ).toBeNull();
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadGovernanceAccessV2: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, LIST_PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access authorization data.",
        ) ?? false,
      "Expected access-control stale-session affordance.",
    );
  });

  it("loads exact-scope tuples, validates the governed comment, and revokes the selected tuple", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      `${LIST_PATH}?tab=tuples`,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='access-control-tuples-empty']",
        ) !== null,
      "Expected tuple review empty-state to render before any exact-scope query is loaded.",
    );

    await changeInputValue(
      getFieldControlByLabel<HTMLInputElement>(
        rendered.container,
        "Object",
        "input",
      ),
      "org_demo",
    );
    await click(getButtonByText(rendered.container, "Load tuples"));

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Authorization tuples") ??
        false,
      "Expected exact-scope tuple review results to render.",
    );
    expect(rendered.container.textContent).toContain("Page 1 of 2");

    await changeInputValue(
      getFieldControlByLabel<HTMLInputElement>(
        rendered.container,
        "Subject filter",
        "input",
      ),
      "usr_target_revoke",
    );
    await click(getButtonByText(rendered.container, "Load tuples"));

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("usr_target_revoke") ?? false,
      "Expected tuple filtering to reveal the target subject.",
    );

    await click(getButtonByText(rendered.container, "Inspect"));
    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Tuple detail & revocation",
        ) ?? false,
      "Expected tuple detail card to render.",
    );

    await click(getButtonByText(rendered.container, "Revoke tuple"));
    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "This revocation policy requires an operator comment.",
        ) ?? false,
      "Expected governed revocation to require an operator comment.",
    );
    expect(mockedLoaders.revokeAuthorizationTuple).toHaveBeenCalledTimes(0);

    await changeInputValue(
      getFieldControlByLabel<HTMLTextAreaElement>(
        rendered.container,
        "Operator comment",
        "textarea",
      ),
      "Tenant offboarding approved.",
    );
    await click(getButtonByText(rendered.container, "Revoke tuple"));

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Revoked viewer access for usr_target_revoke.",
        ) ?? false,
      "Expected tuple revocation success feedback to render.",
    );
    expect(mockedLoaders.revokeAuthorizationTuple).toHaveBeenCalledTimes(1);
  });
});
