import { describe, expect, it, vi } from "vitest";
import { AlertsPulse } from "./AlertsPulse";
import { click, mount } from "../../testing/browser-test-utils";

describe("AlertsPulse", () => {
  it("renders the unread count and announces it via aria-label", () => {
    const host = mount(<AlertsPulse count={3} />);
    const button = host.querySelector(
      "[data-pattern='alerts-pulse']",
    ) as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toBe("Operator alerts: 3 unread");
    expect(button.textContent).toContain("3");
  });

  it("uses a neutral tone when count is zero and an error tone for ≥5", () => {
    const empty = mount(<AlertsPulse count={0} />);
    expect(
      empty.querySelector(".ops-badge")?.getAttribute("data-variant"),
    ).toBe("neutral");

    const burning = mount(<AlertsPulse count={7} />);
    expect(
      burning.querySelector(".ops-badge")?.getAttribute("data-variant"),
    ).toBe("error");
  });

  it("invokes onOpen when interactive", () => {
    const onOpen = vi.fn();
    const host = mount(<AlertsPulse count={1} onOpen={onOpen} />);
    click(
      host.querySelector("[data-pattern='alerts-pulse']") as HTMLButtonElement,
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("is disabled when no onOpen handler is provided", () => {
    const host = mount(<AlertsPulse count={0} />);
    expect(
      (host.querySelector("[data-pattern='alerts-pulse']") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
