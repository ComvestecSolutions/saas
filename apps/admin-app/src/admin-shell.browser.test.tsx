import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { AdminShell } from "@comvestec/ui";

const baseNavGroups = [
  {
    href: "/",
    label: "Operations Home",
    icon: "O",
    isActive: true,
    allowed: true,
  },
  {
    label: "Governance",
    items: [
      {
        href: "/governance/runtime-config",
        label: "Runtime Config",
        icon: "R",
        isActive: false,
        allowed: true,
      },
      {
        href: "/governance/audit-log",
        label: "Audit Log",
        icon: "A",
        isActive: false,
        allowed: true,
      },
    ],
  },
] as const;

const setWindowWidth = (width: number) => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
};

describe("admin shell browser surface", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    setWindowWidth(1280);
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

  it("renders navigation groups, context chips, and page content on desktop", async () => {
    await act(async () => {
      root.render(
        <AdminShell
          navGroups={baseNavGroups}
          currentPath="/"
          contextChips={[
            { label: "Env", value: "platform" },
            { label: "Session", value: "sess_admin_shell", mono: true },
          ]}
        >
          <section>Admin dashboard content</section>
        </AdminShell>,
      );
    });

    expect(container.textContent).toContain("Operations Home");
    expect(container.textContent).toContain("Runtime Config");
    expect(container.textContent).toContain("Env");
    expect(container.textContent).toContain("sess_admin_shell");
    expect(container.textContent).toContain("Admin dashboard content");
  });

  it("opens the mobile navigation drawer on small viewports", async () => {
    setWindowWidth(390);

    await act(async () => {
      root.render(
        <AdminShell
          navGroups={baseNavGroups}
          currentPath="/"
          contextChips={[{ label: "Env", value: "platform" }]}
        >
          <section>Mobile shell</section>
        </AdminShell>,
      );
    });

    const toggle = container.querySelector(
      'button[aria-label="Open navigation"]',
    );

    expect(toggle).not.toBeNull();

    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Runtime Config");
    expect(
      container.querySelector(
        '[role="dialog"][aria-label="Navigation drawer"]',
      ),
    ).not.toBeNull();
  });

  it("closes the mobile navigation drawer when the active route changes", async () => {
    setWindowWidth(390);

    await act(async () => {
      root.render(
        <AdminShell
          navGroups={baseNavGroups}
          currentPath="/"
          contextChips={[{ label: "Env", value: "platform" }]}
        >
          <section>Mobile shell</section>
        </AdminShell>,
      );
    });

    const toggle = container.querySelector(
      'button[aria-label="Open navigation"]',
    );

    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(
      container.querySelector(
        '[role="dialog"][aria-label="Navigation drawer"]',
      ),
    ).not.toBeNull();

    await act(async () => {
      root.render(
        <AdminShell
          navGroups={baseNavGroups}
          currentPath="/governance/runtime-config"
          contextChips={[{ label: "Env", value: "platform" }]}
        >
          <section>Runtime config</section>
        </AdminShell>,
      );
    });

    expect(
      container.querySelector(
        '[role="dialog"][aria-label="Navigation drawer"]',
      ),
    ).toBeNull();
  });
});
