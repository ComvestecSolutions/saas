import { describe, expect, it } from "vitest";
import { AppDesk } from "./AppDesk";
import { mount } from "../../testing/browser-test-utils";

const baseSlots = {
  pulseRibbon: <div data-testid="ribbon">ribbon</div>,
  edgeRail: <div data-testid="rail">rail</div>,
  workbench: <div data-testid="work">work</div>,
  contextSpine: <div data-testid="spine">spine</div>,
  commandStrip: <div data-testid="strip">strip</div>,
} as const;

describe("AppDesk responsive recomposition", () => {
  it("desktop: keeps the rail and the spine grid areas mounted", () => {
    const host = mount(<AppDesk {...baseSlots} deviceClass="desktop" />);
    const root = host.querySelector("[data-pattern='app-desk']") as HTMLElement;
    expect(root.dataset["deviceClass"]).toBe("desktop");
    expect(host.querySelector("[data-testid='rail']")).not.toBeNull();
    expect(host.querySelector("[data-testid='spine']")).not.toBeNull();
  });

  it("tablet: still mounts rail and spine but tightens the rail column", () => {
    const host = mount(<AppDesk {...baseSlots} deviceClass="tablet" />);
    const root = host.querySelector("[data-pattern='app-desk']") as HTMLElement;
    expect(root.dataset["deviceClass"]).toBe("tablet");
    expect(host.querySelector("[data-testid='rail']")).not.toBeNull();
    expect(host.querySelector("[data-testid='spine']")).not.toBeNull();
    expect(root.style.gridTemplateColumns).toContain("48px");
  });

  it("mobile: drops the rail and the spine in favor of stacked work + sticky strip", () => {
    const host = mount(<AppDesk {...baseSlots} deviceClass="mobile" />);
    const root = host.querySelector("[data-pattern='app-desk']") as HTMLElement;
    expect(root.dataset["deviceClass"]).toBe("mobile");
    expect(host.querySelector("[data-testid='rail']")).toBeNull();
    expect(host.querySelector("[data-testid='spine']")).toBeNull();
    expect(host.querySelector("[data-testid='ribbon']")).not.toBeNull();
    expect(host.querySelector("[data-testid='work']")).not.toBeNull();
    expect(host.querySelector("[data-testid='strip']")).not.toBeNull();
  });
});
