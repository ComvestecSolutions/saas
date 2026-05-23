import { describe, expect, it } from "vitest";
import { EdgeRail, type EdgeRailItem } from "./EdgeRail";
import { mount } from "../../testing/browser-test-utils";

const items: readonly EdgeRailItem[] = [
  { id: "tenant-a", label: "Tenant A" },
  { id: "tenant-b", label: "Tenant B", current: true },
];

describe("EdgeRail responsive recomposition", () => {
  it("desktop: renders 56px-wide rail with all pinned items", () => {
    const host = mount(<EdgeRail items={items} deviceClass="desktop" />);
    const rail = host.querySelector(
      "[data-pattern='edge-rail']",
    ) as HTMLElement;
    expect(rail.dataset["deviceClass"]).toBe("desktop");
    expect(rail.style.width).toBe("56px");
    expect(host.querySelectorAll("[data-pin]")).toHaveLength(2);
  });

  it("tablet: shrinks to a 48px peek rail", () => {
    const host = mount(<EdgeRail items={items} deviceClass="tablet" />);
    const rail = host.querySelector(
      "[data-pattern='edge-rail']",
    ) as HTMLElement;
    expect(rail.dataset["deviceClass"]).toBe("tablet");
    expect(rail.style.width).toBe("48px");
  });

  it("mobile: yields the surface entirely so the shell can summon it inside a Sheet", () => {
    const host = mount(<EdgeRail items={items} deviceClass="mobile" />);
    expect(host.querySelector("[data-pattern='edge-rail']")).toBeNull();
  });
});
