import { describe, expect, it } from "vitest";
import { ContextSpine } from "./ContextSpine";
import { click, mount } from "../../testing/browser-test-utils";

describe("ContextSpine", () => {
  it("renders expanded with children visible by default", () => {
    const host = mount(
      <ContextSpine>
        <span data-testid="child">actor</span>
      </ContextSpine>,
    );
    const spine = host.querySelector(
      "[data-pattern='context-spine']",
    ) as HTMLElement;
    expect(spine.dataset["collapsed"]).toBe("false");
    expect(host.querySelector("[data-testid='child']")).not.toBeNull();
  });

  it("collapses when the toggle is pressed", () => {
    const host = mount(
      <ContextSpine>
        <span data-testid="child">actor</span>
      </ContextSpine>,
    );
    click(host.querySelector("[data-spine-toggle]") as HTMLButtonElement);
    const spine = host.querySelector(
      "[data-pattern='context-spine']",
    ) as HTMLElement;
    expect(spine.dataset["collapsed"]).toBe("true");
    expect(host.querySelector("[data-testid='child']")).toBeNull();
  });

  it("starts collapsed when defaultCollapsed is true", () => {
    const host = mount(
      <ContextSpine defaultCollapsed>
        <span data-testid="child">actor</span>
      </ContextSpine>,
    );
    const spine = host.querySelector(
      "[data-pattern='context-spine']",
    ) as HTMLElement;
    expect(spine.dataset["collapsed"]).toBe("true");
  });
});
