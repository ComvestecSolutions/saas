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
  "/desk/kc-role/kc_role_fixture_1?tenantScope=organization&tenantScopeId=org_demo";
const TENANT_MISSING_PATH = "/desk/kc-role/kc_role_fixture_1";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/desk/kc-role/$id Keycloak role detail route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the ready Keycloak role detail surface", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      READY_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='kc-role-detail-ready']",
        ) !== null,
      "Expected Keycloak role detail ready surface to render.",
    );

    expect(rendered.container.textContent).toContain("tenant-admin");
    expect(rendered.container.textContent).toContain("fixture.member");
  }, 30_000);

  it("surfaces an error StateScreen when required tenant search params are missing", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      TENANT_MISSING_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Keycloak role tenant required",
        ) ?? false,
      "Expected Keycloak role tenant-required error to render.",
    );
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadKeycloakRoleDetail: async () => ({
          kind: "denied",
          reason:
            "The current operator session cannot inspect Keycloak role detail.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, READY_PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected Keycloak role denied state to render.",
    );
  });

  it("surfaces a stale-session StateScreen when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadKeycloakRoleDetail: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, READY_PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access Keycloak role detail.",
        ) ?? false,
      "Expected Keycloak role stale-session affordance.",
    );
  });

  it("surfaces a not-found StateScreen when the loader cannot find the role", async () => {
    const notFoundFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadKeycloakRoleDetail: async () => ({
          kind: "not-found",
          title: "Keycloak role not found",
          description: "The requested Keycloak role could not be found.",
        }),
      }),
    );

    rendered = await renderAdminApp(notFoundFixture, READY_PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Keycloak role not found") ??
        false,
      "Expected Keycloak role not-found state to render.",
    );
  });
});
