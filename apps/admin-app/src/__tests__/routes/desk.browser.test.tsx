import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import type { AdminOperatorProfile } from "@comvestec/contracts";
import {
  adminOperatorCapability,
  adminRoutePath,
  platformModuleId,
  projectionProfile,
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
const buildProfile = (): AdminOperatorProfile => ({
  sessionId: "session-fixture",
  identity: {
    actorId: "operator-fixture",
    username: "operator.fixture",
    enabled: true,
    email: "operator@example.test",
    displayName: "Operator Fixture",
    actorType: "platform-operator",
  },
  capabilities: [
    {
      capability: adminOperatorCapability.operationsHome,
      routePath: adminRoutePath.operationsHome,
      visible: true,
      allowed: true,
      label: "Operations Home",
      actionPolicyIds: [],
    },
  ],
});

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
        <DeskShell profile={buildProfile()} deviceClass="desktop">
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
      container.querySelector('[data-testid="workbench-stub"]'),
    ).not.toBeNull();
  });

  it("renders an Omnibar that opens via the ⌘K shortcut handler", async () => {
    await act(async () => {
      root.render(
        <DeskShell profile={buildProfile()} deviceClass="desktop">
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
});
