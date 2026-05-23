import { describe, expect, it } from "vitest";
import { CommandStrip } from "./CommandStrip";
import { mount } from "../../testing/browser-test-utils";

describe("CommandStrip", () => {
  it("renders each slot in its labelled position", () => {
    const host = mount(
      <CommandStrip
        omnibar={<span data-testid="omni">omni</span>}
        workspaceTabs={<span data-testid="tabs">tabs</span>}
        alertsPulse={<span data-testid="alerts">alerts</span>}
        runAsBanner={<span data-testid="ras">ras</span>}
      />,
    );
    const strip = host.querySelector(
      "[data-pattern='command-strip']",
    ) as HTMLElement;
    expect(strip.getAttribute("role")).toBe("contentinfo");
    expect(strip.querySelector("[data-slot='omnibar']")?.textContent).toBe(
      "omni",
    );
    expect(
      strip.querySelector("[data-slot='workspace-tabs']")?.textContent,
    ).toBe("tabs");
    expect(strip.querySelector("[data-slot='alerts-pulse']")?.textContent).toBe(
      "alerts",
    );
    expect(
      strip.querySelector("[data-slot='run-as-banner']")?.textContent,
    ).toBe("ras");
  });

  it("renders empty slots when no children supplied (run-as off by default)", () => {
    const host = mount(<CommandStrip />);
    const strip = host.querySelector(
      "[data-pattern='command-strip']",
    ) as HTMLElement;
    expect(
      strip.querySelector("[data-slot='run-as-banner']")?.textContent,
    ).toBe("");
  });
});
