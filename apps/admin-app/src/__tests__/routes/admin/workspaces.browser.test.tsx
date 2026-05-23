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
  getInputByPlaceholder,
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "../../../testing/admin-browser-harness";
import { mockedLoaders } from "../../../testing/admin-browser-mock-state";

/**
 * Browser coverage for the spec-canonical `/admin/workspaces`
 * admin-organization workspace tabs surface shipped by Phase 7
 * commit 7b-1 (admin-app implementation plan §11).
 */
const PATH = "/admin/workspaces";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/admin/workspaces admin organization workspaces route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
    mockedLoaders.createAdminWorkspace.mockClear();
    mockedLoaders.deleteAdminWorkspace.mockClear();
  });

  it("renders the ready workspaces surface with owner id + table", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-workspaces-ready']",
        ) !== null,
      "Expected admin workspaces ready surface to render.",
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='admin-workspaces-owner-id']",
      )?.textContent?.length,
    ).toBeGreaterThan(0);
    expect(rendered.container.textContent).toContain("Tracked panes");
  });

  it("filters the workspace library by name", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-workspaces-ready']",
        ) !== null,
      "Expected admin workspaces ready surface to render.",
    );

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search workspace names or ids…",
      ),
      "Incident response",
    );
    await waitFor(
      () =>
        rendered?.container.querySelectorAll(
          "[data-testid='admin-workspaces-row']",
        ).length === 1,
      "Expected workspace search to narrow the library to one row.",
    );
    const tableText =
      rendered.container.querySelector("[data-testid='admin-workspaces-table']")
        ?.textContent ?? "";
    expect(tableText).toContain("Incident response");
    expect(tableText).not.toContain("Daily driver");
  });

  it("creates a workspace through the high-risk guard", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-workspaces-create-name']",
        ) !== null,
      "Expected admin workspace composer to render.",
    );

    await changeInputValue(
      rendered.container.querySelector<HTMLInputElement>(
        "[data-testid='admin-workspaces-create-name']",
      )!,
      "Vendor watchboard",
    );
    await changeSelectValue(
      rendered.container.querySelector<HTMLSelectElement>(
        "[data-testid='admin-workspaces-create-template']",
      )!,
      "vendor-watch",
    );
    await click(
      rendered.container.querySelector<HTMLButtonElement>(
        "[data-testid='admin-workspaces-create-cta']",
      )!,
    );

    await waitFor(
      () =>
        rendered?.container.ownerDocument.querySelector(
          "[data-testid='high-risk-body']",
        ) !== null,
      "Expected admin workspace create guard to open.",
    );

    await click(
      getFieldControlByLabel<HTMLInputElement>(
        rendered.container.ownerDocument,
        "Daily driver — create operator workspace",
        "input",
      ),
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "Create a focused vendor monitoring layout.",
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
        mockedLoaders.createAdminWorkspace.mock.calls.length === 1 &&
        rendered?.container.textContent?.includes(
          "Workspace created: Vendor watchboard.",
        ) === true,
      "Expected admin workspace create flow to complete.",
    );

    expect(mockedLoaders.createAdminWorkspace).toHaveBeenCalledWith({
      data: {
        ownerSubjectId: "usr_platform_operator",
        name: "Vendor watchboard",
        serializedLayout:
          '{"panes":[{"id":"vendors","resource":"vendors"},{"id":"runs","resource":"runs"},{"id":"notify","resource":"notify"}]}',
        reasonId: "admin-workspaces.create.daily-driver",
        reasonAttachmentText: "Create a focused vendor monitoring layout.",
      },
    });
  });

  it("deletes a workspace through the high-risk guard", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='admin-workspaces-delete-cta'][data-workspace-id='wsp_fixture_2']",
        ) !== null,
      "Expected admin workspace delete CTA to render.",
    );

    await click(
      rendered.container.querySelector<HTMLButtonElement>(
        "[data-testid='admin-workspaces-delete-cta'][data-workspace-id='wsp_fixture_2']",
      )!,
    );

    await waitFor(
      () =>
        rendered?.container.ownerDocument.querySelector(
          "[data-testid='high-risk-body']",
        ) !== null,
      "Expected admin workspace delete guard to open.",
    );

    await click(
      getFieldControlByLabel<HTMLInputElement>(
        rendered.container.ownerDocument,
        "Workspace stale — delete operator workspace",
        "input",
      ),
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "Retiring the duplicate incident response layout.",
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
        mockedLoaders.deleteAdminWorkspace.mock.calls.length === 1 &&
        rendered?.container.textContent?.includes(
          "Workspace deleted: wsp_fixture_2.",
        ) === true,
      "Expected admin workspace delete flow to complete.",
    );

    expect(mockedLoaders.deleteAdminWorkspace).toHaveBeenCalledWith({
      data: {
        ownerSubjectId: "usr_platform_operator",
        workspaceId: "wsp_fixture_2",
        reasonId: "admin-workspaces.delete.workspace-stale",
        reasonAttachmentText:
          "Retiring the duplicate incident response layout.",
      },
    });
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (f) => ({
        ...f,
        loadAdminWorkspaces: async () => ({ kind: "stale-session" }),
      }),
    );
    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access admin organization workspaces.",
        ) ?? false,
      "Expected admin workspaces stale-session affordance.",
    );
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (f) => ({
        ...f,
        loadAdminWorkspaces: async () => ({
          kind: "denied",
          reason: "Operator session not authorized for admin workspaces.",
        }),
      }),
    );
    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected admin workspaces denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Operator session not authorized for admin workspaces.",
    );
  });

  it("surfaces an error StateScreen when the loader errors", async () => {
    const fixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (f) => ({
        ...f,
        loadAdminWorkspaces: async () => ({
          kind: "error",
          title: "Admin workspaces unavailable",
          description: "Upstream admin-workspaces port unreachable.",
        }),
      }),
    );
    rendered = await renderAdminApp(fixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Admin workspaces unavailable",
        ) ?? false,
      "Expected admin workspaces error state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Upstream admin-workspaces port unreachable.",
    );
  });
});
