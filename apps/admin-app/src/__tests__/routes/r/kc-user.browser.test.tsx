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

const READY_PATH =
  "/r/kc-user/kc_usr_fixture_1?tenantScope=organization&tenantScopeId=org_demo";
const TENANT_MISSING_PATH = "/r/kc-user/kc_usr_fixture_1";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/r/kc-user/$id Keycloak user detail route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the ready Keycloak user detail surface", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      READY_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='kc-user-detail-ready']",
        ) !== null,
      "Expected Keycloak user detail ready surface to render.",
    );

    expect(rendered.container.textContent).toContain("fixture.operator");
    expect(rendered.container.textContent).toContain("UPDATE_PASSWORD");
  }, 30_000);

  it("surfaces an error StateScreen when required tenant search params are missing", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      TENANT_MISSING_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Keycloak user tenant required",
        ) ?? false,
      "Expected Keycloak user tenant-required error to render.",
    );
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadKeycloakUserDetail: async () => ({
          kind: "denied",
          reason:
            "The current operator session cannot inspect Keycloak user detail.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, READY_PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected Keycloak user denied state to render.",
    );
  });

  it("surfaces a stale-session StateScreen when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadKeycloakUserDetail: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, READY_PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access Keycloak user detail.",
        ) ?? false,
      "Expected Keycloak user stale-session affordance.",
    );
  });

  it("surfaces a not-found StateScreen when the loader cannot find the user", async () => {
    const notFoundFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadKeycloakUserDetail: async () => ({
          kind: "not-found",
          title: "Keycloak user not found",
          description: "The requested Keycloak user could not be found.",
        }),
      }),
    );

    rendered = await renderAdminApp(notFoundFixture, READY_PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Keycloak user not found") ??
        false,
      "Expected Keycloak user not-found state to render.",
    );
  });
});
