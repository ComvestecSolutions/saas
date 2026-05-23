import { describe, expect, it } from "vitest";
import { ContextSpine } from "./ContextSpine";
import { mount } from "../../testing/browser-test-utils";

describe("ContextSpine responsive recomposition", () => {
  it("desktop: renders expanded 320px spine with the actor body", () => {
    const host = mount(
      <ContextSpine deviceClass="desktop">
        <span data-testid="actor">actor</span>
      </ContextSpine>,
    );
    const spine = host.querySelector(
      "[data-pattern='context-spine']",
    ) as HTMLElement;
    expect(spine.dataset["deviceClass"]).toBe("desktop");
    expect(spine.style.width).toBe("320px");
    expect(host.querySelector("[data-testid='actor']")).not.toBeNull();
  });

  it("tablet: defaults to collapsed 56px peek with the toggle still reachable", () => {
    const host = mount(
      <ContextSpine deviceClass="tablet">
        <span data-testid="actor">actor</span>
      </ContextSpine>,
    );
    const spine = host.querySelector(
      "[data-pattern='context-spine']",
    ) as HTMLElement;
    expect(spine.dataset["deviceClass"]).toBe("tablet");
    expect(spine.dataset["collapsed"]).toBe("true");
    expect(spine.style.width).toBe("56px");
    expect(host.querySelector("[data-spine-toggle]")).not.toBeNull();
  });

  it("mobile: yields the surface entirely so the shell can summon it inside a Drawer", () => {
    const host = mount(
      <ContextSpine deviceClass="mobile">
        <span data-testid="actor">actor</span>
      </ContextSpine>,
    );
    expect(host.querySelector("[data-pattern='context-spine']")).toBeNull();
  });
});
