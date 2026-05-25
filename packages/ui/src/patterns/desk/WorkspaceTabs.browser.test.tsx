import { describe, expect, it, vi } from "vitest";
import { WorkspaceTabs, type WorkspaceTab } from "./WorkspaceTabs";
import { click, mount } from "../../testing/browser-test-utils";

const tabs: readonly WorkspaceTab[] = [
  { id: "incidents", label: "Incidents", active: true },
  { id: "billing", label: "Billing reconciliation", dirty: true },
];

describe("WorkspaceTabs", () => {
  it("renders one tab per descriptor with the active selection state", () => {
    const host = mount(<WorkspaceTabs tabs={tabs} />);
    const tablist = host.querySelector(
      "[data-pattern='workspace-tabs']",
    ) as HTMLElement;
    const activeTab = host.querySelector(
      "[data-tab='incidents']",
    ) as HTMLElement;
    expect(tablist.getAttribute("role")).toBe("tablist");
    expect(activeTab.tagName).toBe("BUTTON");
    expect(activeTab.getAttribute("aria-selected")).toBe("true");
    expect(activeTab.querySelector("button")).toBeNull();
  });

  it("marks dirty tabs with a data-dirty attribute", () => {
    const host = mount(<WorkspaceTabs tabs={tabs} />);
    expect(
      (host.querySelector("[data-tab='billing']") as HTMLElement).dataset[
        "dirty"
      ],
    ).toBe("true");
  });

  it("invokes onActivate and onClose with the matching tab", () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();
    const host = mount(
      <WorkspaceTabs tabs={tabs} onActivate={onActivate} onClose={onClose} />,
    );
    click(
      host.querySelector("[data-tab-activate='billing']") as HTMLButtonElement,
    );
    expect(onActivate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "billing" }),
    );
    click(
      host.querySelector("[data-tab-close='incidents']") as HTMLButtonElement,
    );
    expect(onClose).toHaveBeenCalledWith(
      expect.objectContaining({ id: "incidents" }),
    );
  });
});
