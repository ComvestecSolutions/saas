import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import type { AdminOperatorProfile } from "@comvestec/contracts";
import {
  actorType,
  adminOrgRole,
  adminOperatorCapability,
  adminRoutePath,
  adminSavedViewResourceKind,
  platformModuleId,
  projectionProfile,
  reasonCatalogId,
} from "@comvestec/contracts";
import { DeskShell } from "../../desk/desk-shell";

type ReactActGlobals = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
(globalThis as ReactActGlobals).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Slice 1b-tail browser coverage for the Operator Desk shell.
 *
 * Renders `<DeskShell>` directly so the test exercises the AppDesk
 * composition (PulseRibbon, EdgeRail, ContextSpine, CommandStrip,
 * Omnibar) without coupling to TanStack Router or the trusted-
 * session loader. The route component lives at `routes/desk.tsx`
 * and is covered by the workbench-pane rendering assertion below.
 */
type CapabilityFixture = AdminOperatorProfile["capabilities"][number];

const buildCapability = (
  capability: CapabilityFixture["capability"],
  routePath: CapabilityFixture["routePath"],
  label: string,
): CapabilityFixture => ({
  capability,
  routePath,
  visible: true,
  allowed: true,
  label,
  actionPolicyIds: [],
});

const buildProfile = (
  capabilities: readonly CapabilityFixture[] = [
    buildCapability(
      adminOperatorCapability.operationsHome,
      adminRoutePath.operationsHome,
      "Operations Home",
    ),
  ],
): AdminOperatorProfile => ({
  sessionId: "session-fixture",
  adminOrgRole: adminOrgRole.owner,
  identity: {
    actorId: "operator-fixture",
    username: "operator.fixture",
    enabled: true,
    email: "operator@example.test",
    displayName: "Operator Fixture",
    actorType: actorType.platformOperator,
  },
  capabilities: [...capabilities],
});

const buildPulseProfile = (): AdminOperatorProfile =>
  buildProfile([
    buildCapability(
      adminOperatorCapability.operationsHome,
      adminRoutePath.operationsHome,
      "Operations Home",
    ),
    buildCapability(
      adminOperatorCapability.tenantWorkspace,
      adminRoutePath.tenantWorkspaceDiscovery,
      "Tenants",
    ),
    buildCapability(
      adminOperatorCapability.runtimeConfig,
      adminRoutePath.runtimeConfig,
      "Runtime Config",
    ),
    buildCapability(
      adminOperatorCapability.billing,
      adminRoutePath.billing,
      "Billing",
    ),
    buildCapability(
      adminOperatorCapability.supportOperations,
      adminRoutePath.supportOperations,
      "Support",
    ),
    buildCapability(
      adminOperatorCapability.webhooksApiAccess,
      adminRoutePath.webhooksApiAccess,
      "Webhooks",
    ),
    buildCapability(
      adminOperatorCapability.branding,
      adminRoutePath.branding,
      "Branding",
    ),
  ]);

const buildFullProfile = (): AdminOperatorProfile =>
  buildProfile([
    buildCapability(
      adminOperatorCapability.operationsHome,
      adminRoutePath.operationsHome,
      "Operations Home",
    ),
    buildCapability(
      adminOperatorCapability.repairOperations,
      adminRoutePath.repairOperations,
      "Repair Operations",
    ),
    buildCapability(
      adminOperatorCapability.tenantWorkspace,
      adminRoutePath.tenantWorkspaceDiscovery,
      "Tenants",
    ),
    buildCapability(
      adminOperatorCapability.runtimeConfig,
      adminRoutePath.runtimeConfig,
      "Runtime Config",
    ),
    buildCapability(
      adminOperatorCapability.featureFlags,
      adminRoutePath.featureFlags,
      "Feature Flags",
    ),
    buildCapability(
      adminOperatorCapability.accessControl,
      adminRoutePath.accessControl,
      "Access Control",
    ),
    buildCapability(
      adminOperatorCapability.auditLog,
      adminRoutePath.auditLog,
      "Audit Log",
    ),
    buildCapability(
      adminOperatorCapability.supportOperations,
      adminRoutePath.supportOperations,
      "Support",
    ),
    buildCapability(
      adminOperatorCapability.branding,
      adminRoutePath.branding,
      "Branding",
    ),
    buildCapability(
      adminOperatorCapability.billing,
      adminRoutePath.billing,
      "Billing",
    ),
    buildCapability(
      adminOperatorCapability.complianceRetention,
      adminRoutePath.complianceRetention,
      "Retention",
    ),
    buildCapability(
      adminOperatorCapability.webhooksApiAccess,
      adminRoutePath.webhooksApiAccess,
      "Webhooks",
    ),
  ]);

const buildWorkspaces = () =>
  [
    {
      id: "wsp_fixture_1",
      ownerSubjectId: "operator-fixture",
      name: "Daily driver",
      position: 1,
      serializedLayout:
        '{"panes":[{"id":"mission-control","resource":"operations-home"}]}',
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
    {
      id: "wsp_fixture_2",
      ownerSubjectId: "operator-fixture",
      name: "Incident response",
      position: 2,
      serializedLayout:
        '{"panes":[{"id":"support","resource":"support"},{"id":"audit","resource":"audit"}]}',
      createdAt: new Date(500).toISOString(),
      updatedAt: new Date(1000).toISOString(),
    },
  ] as const;

const buildSavedViews = () =>
  [
    {
      id: "sv_fixture_1",
      ownerSubjectId: "operator-fixture",
      name: "Audit triage",
      resourceKind: adminSavedViewResourceKind.auditEvents,
      serializedView:
        '{"filters":{"action":["manual-break-glass.issue"]},"sort":{"field":"timestamp","direction":"desc"}}',
      pinned: true,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(1000).toISOString(),
      lastUsedAt: new Date(1500).toISOString(),
    },
  ] as const;

const inactiveRunAsBanner = {
  active: false,
  releasable: false,
} as const;

const waitForSelector = async (
  selector: string,
  timeoutMs = 1000,
): Promise<Element | null> => {
  const deadline = performance.now() + timeoutMs;

  while (performance.now() < deadline) {
    const match = document.querySelector(selector);
    if (match !== null) {
      return match;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 16));
  }

  return document.querySelector(selector);
};

void platformModuleId;
void projectionProfile;

describe("Operator Desk shell route", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("renders PulseRibbon, EdgeRail, ContextSpine, and CommandStrip around the workbench", async () => {
    await act(async () => {
      root.render(
        <DeskShell
          profile={buildProfile()}
          workspaces={buildWorkspaces()}
          savedViews={buildSavedViews()}
          runAsBanner={inactiveRunAsBanner}
          deviceClass="desktop"
        >
          <section data-testid="workbench-stub">Pane content</section>
        </DeskShell>,
      );
    });

    expect(await waitForSelector('[data-pattern="app-desk"]')).not.toBeNull();
    expect(
      await waitForSelector('[data-pattern="pulse-ribbon"]'),
    ).not.toBeNull();
    expect(await waitForSelector('[data-pattern="edge-rail"]')).not.toBeNull();
    expect(
      await waitForSelector('[data-pattern="context-spine"]'),
    ).not.toBeNull();
    expect(
      await waitForSelector('[data-pattern="command-strip"]'),
    ).not.toBeNull();
    expect(
      await waitForSelector('[data-testid="context-spine-actor-card"]'),
    ).not.toBeNull();
    expect(document.body.textContent).toContain("Operator Fixture");
    expect(document.body.textContent).toContain("operator@example.test");
    expect(
      container.querySelector('[data-testid="context-spine-actor-role"]')
        ?.textContent,
    ).toContain("Owner");
    expect(
      container.querySelector('[data-testid="context-spine-actor-type"]')
        ?.textContent,
    ).toContain(actorType.platformOperator);
    expect(document.body.textContent).toContain("Daily driver");
    expect(document.body.textContent).toContain("Incident response");
    expect(document.body.textContent).toContain("Audit triage");
    expect(
      container.querySelector('[data-testid="workbench-stub"]'),
    ).not.toBeNull();
  });

  it("renders canonical desk domain segments and dispatches navigation when a segment is selected", async () => {
    const onNavigate = vi.fn();
    const segmentTargets = [
      ["tenants", adminRoutePath.tenantWorkspaceDiscovery],
      ["governance", adminRoutePath.runtimeConfig],
      ["revenue", adminRoutePath.billing],
      ["risk", adminRoutePath.supportOperations],
      ["integrations", adminRoutePath.webhooksApiAccess],
      ["admin", adminRoutePath.branding],
    ] as const;

    await act(async () => {
      root.render(
        <DeskShell
          profile={buildPulseProfile()}
          workspaces={buildWorkspaces()}
          savedViews={buildSavedViews()}
          runAsBanner={inactiveRunAsBanner}
          currentPath={adminRoutePath.operationsHome}
          onNavigate={onNavigate}
          deviceClass="desktop"
        >
          <span />
        </DeskShell>,
      );
    });

    const setTimeoutSpy = vi
      .spyOn(window, "setTimeout")
      .mockImplementation((() => 0) as unknown as typeof window.setTimeout);

    try {
      for (const [segmentId, expectedPath] of segmentTargets) {
        const segment = await waitForSelector(`[data-segment="${segmentId}"]`);

        expect(segment).not.toBeNull();

        await act(async () => {
          segment?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onNavigate).toHaveBeenLastCalledWith(expectedPath);
      }
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("renders the full rail without truncating capabilities", async () => {
    await act(async () => {
      root.render(
        <DeskShell
          profile={buildFullProfile()}
          workspaces={buildWorkspaces()}
          savedViews={buildSavedViews()}
          runAsBanner={inactiveRunAsBanner}
          currentPath={adminRoutePath.operationsHome}
          deviceClass="desktop"
        >
          <span />
        </DeskShell>,
      );
    });

    const pins = await waitForSelector("[data-pin='webhooks-api-access']");
    expect(pins).not.toBeNull();
    expect(container.querySelectorAll("[data-pin]")).toHaveLength(12);
    expect(
      (
        container.querySelector(
          "[data-pin='webhooks-api-access']",
        ) as HTMLButtonElement | null
      )?.getAttribute("aria-label"),
    ).toBe("Webhooks");
  });

  it("opens the surfaces menu with descriptive navigation content", async () => {
    await act(async () => {
      root.render(
        <DeskShell
          profile={buildFullProfile()}
          workspaces={buildWorkspaces()}
          savedViews={buildSavedViews()}
          runAsBanner={inactiveRunAsBanner}
          currentPath={adminRoutePath.operationsHome}
          deviceClass="desktop"
        >
          <span />
        </DeskShell>,
      );
    });

    const menuButton = await waitForSelector(
      'button[aria-label="Open control surfaces"]',
    );
    expect(menuButton).not.toBeNull();

    await act(async () => {
      menuButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("Repair Operations");
    expect(document.body.textContent).toContain(
      "Repair queues, billing gap inspection",
    );
    expect(document.body.textContent).toContain("Webhook delivery posture");
  });

  it("dismisses the surfaces menu when the operator clicks outside it", async () => {
    await act(async () => {
      root.render(
        <DeskShell
          profile={buildFullProfile()}
          workspaces={buildWorkspaces()}
          savedViews={buildSavedViews()}
          runAsBanner={inactiveRunAsBanner}
          currentPath={adminRoutePath.operationsHome}
          deviceClass="desktop"
        >
          <span />
        </DeskShell>,
      );
    });

    const menuButton = await waitForSelector(
      'button[aria-label="Open control surfaces"]',
    );
    expect(menuButton).not.toBeNull();

    await act(async () => {
      menuButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(
      document.querySelector("[data-testid='desk-shell-navigation-menu']"),
    ).not.toBeNull();

    await act(async () => {
      document.body.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true }),
      );
      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(
      document.querySelector("[data-testid='desk-shell-navigation-menu']"),
    ).toBeNull();
  });

  it("compresses command-strip utility actions on mobile shells", async () => {
    await act(async () => {
      root.render(
        <DeskShell
          profile={buildFullProfile()}
          workspaces={buildWorkspaces()}
          savedViews={buildSavedViews()}
          runAsBanner={inactiveRunAsBanner}
          currentPath={adminRoutePath.operationsHome}
          deviceClass="mobile"
        >
          <span />
        </DeskShell>,
      );
    });

    const menuButton = container.querySelector(
      'button[aria-label="Open control surfaces"]',
    );
    const profileLink = container.querySelector(
      'a[aria-label="Open operator profile"]',
    );

    expect(menuButton?.textContent).toContain("Menu");
    expect(menuButton?.textContent).not.toContain("Surfaces");
    expect(profileLink?.textContent).toContain("Profile");
    expect(profileLink?.textContent).not.toContain("Operator profile");
  });

  it("renders an Omnibar that opens via the ⌘K shortcut handler", async () => {
    await act(async () => {
      root.render(
        <DeskShell
          profile={buildProfile()}
          workspaces={buildWorkspaces()}
          savedViews={buildSavedViews()}
          runAsBanner={inactiveRunAsBanner}
          deviceClass="desktop"
        >
          <span />
        </DeskShell>,
      );
    });

    // The Omnibar primitive renders unconditionally inside the
    // CommandStrip so the operator can always type into it; the ⌘K
    // shortcut toggles the open hint via `useOmnibarShortcut`.
    const omnibar = container.querySelector('[data-pattern="omnibar"]');
    expect(omnibar).not.toBeNull();
    expect(omnibar?.getAttribute("aria-label")).toBe("Operator omnibar");

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", metaKey: true }),
      );
    });

    const omnibarAfter = container.querySelector('[data-pattern="omnibar"]');
    expect(omnibarAfter?.getAttribute("aria-label")).toBe(
      "Operator omnibar (open)",
    );
  });

  it("arms a governed release flow for an active run-as banner", async () => {
    const onReleaseRunAsGrant = vi.fn(async () => undefined);

    await act(async () => {
      root.render(
        <DeskShell
          profile={buildProfile()}
          workspaces={buildWorkspaces()}
          savedViews={buildSavedViews()}
          runAsBanner={{
            active: true,
            grantId: "grant_fixture_1",
            actingAsActorId: "usr_tenant_fixture",
            actingAsActorType: actorType.individualUser,
            reasonId: "incident-review",
            reasonText: "Investigating tenant incident",
            grantedAt: new Date(0).toISOString(),
            expiresAt: new Date(60_000).toISOString(),
            secondsRemaining: 60,
            releasable: true,
          }}
          onReleaseRunAsGrant={onReleaseRunAsGrant}
          deviceClass="desktop"
        >
          <span />
        </DeskShell>,
      );
    });

    const releaseButton = container.querySelector(
      "button[data-run-as-release]",
    );

    expect(releaseButton).not.toBeNull();

    await act(async () => {
      releaseButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const reasonInput = (await waitForSelector(
      `input[value="${reasonCatalogId.runAsBannerStateRelease}"]`,
    )) as HTMLInputElement | null;
    const note = (await waitForSelector(
      '[data-testid="high-risk-note"]',
    )) as HTMLTextAreaElement | null;

    expect(reasonInput).not.toBeNull();
    expect(note).not.toBeNull();

    await act(async () => {
      if (reasonInput !== null) {
        reasonInput.click();
      }
      if (note !== null) {
        const setValue = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value",
        )?.set;

        setValue?.call(
          note,
          "Closing the delegated session after incident review.",
        );
        note.dispatchEvent(new Event("input", { bubbles: true }));
        note.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    const continueButton = (await waitForSelector(
      '[data-testid="high-risk-arm"]',
    )) as HTMLButtonElement | null;

    expect(continueButton).not.toBeNull();
    expect(continueButton?.disabled).toBe(false);

    await act(async () => {
      continueButton?.click();
    });

    const confirmButton = (await waitForSelector(
      '[data-testid="high-risk-confirm-final"]',
    )) as HTMLButtonElement | null;

    expect(confirmButton).not.toBeNull();

    await act(async () => {
      confirmButton?.click();
    });

    expect(onReleaseRunAsGrant).toHaveBeenCalledWith({
      grantId: "grant_fixture_1",
      reasonId: reasonCatalogId.runAsBannerStateRelease,
      reasonAttachmentText:
        "Closing the delegated session after incident review.",
    });
  });
});
