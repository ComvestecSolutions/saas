import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { EdgeRail, type EdgeRailItem } from "./EdgeRail";
import { click, mount } from "../../testing/browser-test-utils";

const items: readonly EdgeRailItem[] = [
  {
    id: "tenants",
    label: "Tenants",
    description: "Workspace discovery and customer context.",
    current: true,
  },
  { id: "runs", label: "Runs", badge: "2" },
  { id: "incidents", label: "Incidents" },
];

describe("EdgeRail", () => {
  it("renders a navigation landmark labelled for screen readers", () => {
    const host = mount(<EdgeRail items={items} />);
    const nav = host.querySelector("[data-pattern='edge-rail']") as HTMLElement;
    expect(nav.getAttribute("role")).toBe("navigation");
    expect(nav.getAttribute("aria-label")).toBe("Pinned resources");
  });

  it("marks the current item with aria-current", () => {
    const host = mount(<EdgeRail items={items} />);
    expect(
      (host.querySelector("[data-pin='tenants']") as HTMLElement).getAttribute(
        "aria-current",
      ),
    ).toBe("true");
  });

  it("exposes the full label through aria-label and tooltip content", async () => {
    const host = mount(<EdgeRail items={items} />);
    const button = host.querySelector(
      "[data-pin='tenants']",
    ) as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toBe("Tenants");
    expect(button.getAttribute("title")).toBeNull();
    await act(async () => {
      button.focus();
      await Promise.resolve();
    });
    const tooltip = document.body.querySelector("[role='tooltip']");
    expect(tooltip?.textContent).toContain("Tenants");
    expect(tooltip?.textContent).toContain("Workspace discovery");
  });

  it("invokes onActivate with the clicked item", () => {
    const onActivate = vi.fn();
    const host = mount(<EdgeRail items={items} onActivate={onActivate} />);
    click(host.querySelector("[data-pin='runs']") as HTMLButtonElement);
    expect(onActivate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "runs" }),
    );
  });

  it("renders a badge slot when provided", () => {
    const host = mount(<EdgeRail items={items} />);
    expect(
      host.querySelector("[data-testid='rail-badge-runs']")?.textContent,
    ).toBe("2");
  });
});
