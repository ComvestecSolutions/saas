import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./Checkbox";
import { click, mount, rerender } from "../../testing/browser-test-utils";

describe("Checkbox", () => {
  it("renders default unchecked state with the correct aria attributes", () => {
    const host = mount(<Checkbox aria-label="agree" />);
    const button = host.querySelector("button[role='checkbox']");
    expect(button).not.toBeNull();
    expect(button?.getAttribute("aria-checked")).toBe("false");
  });

  it("toggles when clicked (uncontrolled)", () => {
    const onChange = vi.fn();
    const host = mount(
      <Checkbox aria-label="agree" onCheckedChange={onChange} />,
    );
    const button = host.querySelector(
      "button[role='checkbox']",
    ) as HTMLButtonElement;
    click(button);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("renders indeterminate state visually", () => {
    const host = mount(<Checkbox aria-label="agree" checked="indeterminate" />);
    const button = host.querySelector(
      "button[role='checkbox']",
    ) as HTMLButtonElement;
    expect(button.getAttribute("aria-checked")).toBe("mixed");
  });

  it("blocks interaction when disabled", () => {
    const onChange = vi.fn();
    const host = mount(
      <Checkbox aria-label="agree" disabled onCheckedChange={onChange} />,
    );
    const button = host.querySelector(
      "button[role='checkbox']",
    ) as HTMLButtonElement;
    click(button);
    expect(onChange).not.toHaveBeenCalled();
    expect(button.disabled).toBe(true);
  });

  it("supports controlled mode", () => {
    const host = mount(
      <Checkbox
        aria-label="agree"
        checked={false}
        onCheckedChange={() => {}}
      />,
    );
    rerender(
      host,
      <Checkbox aria-label="agree" checked onCheckedChange={() => {}} />,
    );
    const button = host.querySelector(
      "button[role='checkbox']",
    ) as HTMLButtonElement;
    expect(button.getAttribute("aria-checked")).toBe("true");
  });
});
