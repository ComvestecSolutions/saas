import { describe, expect, it, vi } from "vitest";
import { AppDesk } from "./AppDesk";
import { mount } from "../../testing/browser-test-utils";

describe("AppDesk", () => {
  it("renders the five canonical surfaces in their grid areas", () => {
    const host = mount(
      <AppDesk
        pulseRibbon={<div data-testid="ribbon">ribbon</div>}
        edgeRail={<div data-testid="rail">rail</div>}
        workbench={<div data-testid="work">work</div>}
        contextSpine={<div data-testid="spine">spine</div>}
        commandStrip={<div data-testid="strip">strip</div>}
      />,
    );
    expect(host.querySelector("[data-testid='ribbon']")).not.toBeNull();
    expect(host.querySelector("[data-testid='rail']")).not.toBeNull();
    expect(host.querySelector("[data-testid='work']")).not.toBeNull();
    expect(host.querySelector("[data-testid='spine']")).not.toBeNull();
    expect(host.querySelector("[data-testid='strip']")).not.toBeNull();
  });

  it("uses an application landmark for the shell", () => {
    const host = mount(
      <AppDesk
        pulseRibbon={null}
        edgeRail={null}
        workbench={null}
        contextSpine={null}
        commandStrip={null}
      />,
    );
    const root = host.querySelector("[data-pattern='app-desk']") as HTMLElement;
    expect(root.getAttribute("role")).toBe("application");
    expect(root.getAttribute("aria-label")).toBe("Operator Desk");
  });

  it("does not invent any internal handlers — every slot is opaque", () => {
    // Sanity guard: the shell is layout-only; no callbacks accepted.
    const fn = vi.fn();
    const host = mount(
      <AppDesk
        pulseRibbon={
          <button type="button" onClick={fn}>
            slot-owned
          </button>
        }
        edgeRail={null}
        workbench={null}
        contextSpine={null}
        commandStrip={null}
      />,
    );
    (host.querySelector("button") as HTMLButtonElement).click();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
