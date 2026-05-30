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

const PATH = "/desk/admin-member/adm_member_fixture_1";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/desk/admin-member/$id admin member detail route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the ready member detail surface", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-member-detail-ready']",
        ) !== null,
      "Expected admin member detail ready surface to render.",
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='admin-member-detail-kpis']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='admin-member-detail-identity']",
      ),
    ).not.toBeNull();
    expect(rendered.container.textContent).toContain("Admin Owner Fixture");
    expect(rendered.container.textContent).toContain("owner@comvestec.com");
    expect(rendered.container.textContent).toContain("Owner");
    expect(rendered.container.textContent).toContain("kc_owner_fixture_1");
  });

  it("surfaces a stale-session state when the loader returns stale-session", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (base) => ({
        ...base,
        loadAdminMemberDetail: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access admin member detail.",
        ) ?? false,
      "Expected admin member detail stale-session state to render.",
    );
  });

  it("surfaces a denied state when the loader returns denied", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (base) => ({
        ...base,
        loadAdminMemberDetail: async () => ({
          kind: "denied",
          reason: "Operator session not authorized for admin member detail.",
        }),
      }),
    );

    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected admin member detail denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Operator session not authorized for admin member detail.",
    );
  });

  it("surfaces a not-found error state when the member is missing", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      "/desk/admin-member/adm_member_missing",
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Admin member not found") ??
        false,
      "Expected admin member detail not-found state to render.",
    );
    expect(rendered.container.textContent).toContain("adm_member_missing");
  });
});
