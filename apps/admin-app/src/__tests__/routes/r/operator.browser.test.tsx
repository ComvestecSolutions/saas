import { afterEach, describe, expect, it } from "vitest";
import { actorType } from "@comvestec/contracts";
import {
  createAdminBrowserFixtureState,
  type AdminBrowserFixtureState,
} from "../../../testing/admin-browser-fixtures";
import {
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "../../../testing/admin-browser-harness";

const CURRENT_OPERATOR_PATH = "/desk/operator/usr_platform_operator";
const DIRECTORY_OPERATOR_PATH = "/desk/operator/usr_support_operator";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/desk/operator/$id operator detail route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
  });

  it("renders the live current-operator detail surface", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      CURRENT_OPERATOR_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-operator-detail-ready']",
        ) !== null,
      "Expected admin operator detail route to render.",
    );

    expect(rendered.container.textContent).toContain(
      "Comvestec Platform Operator",
    );
    expect(
      rendered.container.querySelector(
        "[data-testid='admin-operator-capabilities-table']",
      ),
    ).not.toBeNull();
  }, 30_000);

  it("renders a directory-backed detail surface for another operator", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      DIRECTORY_OPERATOR_PATH,
    );

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-operator-detail-ready']",
        ) !== null,
      "Expected directory-backed operator detail route to render.",
    );

    expect(rendered.container.textContent).toContain("Directory snapshot");
    expect(rendered.container.textContent).toContain(
      "Capability posture unavailable",
    );
  });

  it("denies inspection of other operators for a support-operator session", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (base) => ({
        ...base,
        loadGovernanceAccessV2: async (input) => {
          const ready = await base.loadGovernanceAccessV2(input);
          if (ready.kind !== "ready") {
            return ready;
          }

          return {
            ...ready,
            memberships: {
              currentOperator: {
                ...ready.memberships.currentOperator,
                identity: {
                  ...ready.memberships.currentOperator.identity,
                  actorId: "usr_support_operator",
                  username: "support@comvestec.com",
                  email: "support@comvestec.com",
                  displayName: "Comvestec Support Operator",
                  actorType: actorType.supportOperator,
                },
              },
              operators: [],
            },
          };
        },
      }),
    );

    rendered = await renderAdminApp(fixture, CURRENT_OPERATOR_PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected support-operator denial state to render.",
    );

    expect(rendered.container.textContent).toContain(
      "Only platform operators may inspect other admin operators.",
    );
  });

  it("surfaces a not-found state for an unknown operator id", async () => {
    rendered = await renderAdminApp(
      createAdminBrowserFixtureState(),
      "/desk/operator/usr_missing_operator",
    );

    await waitFor(
      () =>
        rendered?.container.textContent?.includes("Operator not found") ??
        false,
      "Expected operator not-found state to render.",
    );
  });
});
