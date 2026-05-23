import { describe, expect, it, vi } from "vitest";
import { RadioGroup, type RadioOption } from "./RadioGroup";
import { click, mount, rerender } from "../../testing/browser-test-utils";

const options: ReadonlyArray<RadioOption> = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

describe("RadioGroup", () => {
  it("renders a radiogroup with the requested aria-label", () => {
    const host = mount(
      <RadioGroup name="env" options={options} aria-label="env" />,
    );
    const group = host.querySelector("[role='radiogroup']");
    expect(group?.getAttribute("aria-label")).toBe("env");
    expect(host.querySelectorAll("input[type='radio']").length).toBe(2);
  });

  it("respects defaultValue in uncontrolled mode", () => {
    const host = mount(
      <RadioGroup name="env" options={options} defaultValue="b" />,
    );
    const inputs = host.querySelectorAll(
      "input[type='radio']",
    ) as NodeListOf<HTMLInputElement>;
    expect(inputs[1]?.checked).toBe(true);
  });

  it("fires onValueChange when an option is clicked", () => {
    const onValueChange = vi.fn();
    const host = mount(
      <RadioGroup name="env" options={options} onValueChange={onValueChange} />,
    );
    const inputs = host.querySelectorAll("input[type='radio']");
    click(inputs[0]!);
    expect(onValueChange).toHaveBeenCalledWith("a");
  });

  it("blocks interaction when disabled", () => {
    const onValueChange = vi.fn();
    const host = mount(
      <RadioGroup
        name="env"
        options={options}
        disabled
        onValueChange={onValueChange}
      />,
    );
    const inputs = host.querySelectorAll(
      "input[type='radio']",
    ) as NodeListOf<HTMLInputElement>;
    inputs.forEach((input) => expect(input.disabled).toBe(true));
  });

  it("reflects external value updates when controlled and re-rendered", () => {
    const host = mount(<RadioGroup name="env" options={options} value="a" />);
    let inputs = host.querySelectorAll(
      "input[type='radio']",
    ) as NodeListOf<HTMLInputElement>;
    expect(inputs[0]?.checked).toBe(true);
    expect(inputs[1]?.checked).toBe(false);

    rerender(host, <RadioGroup name="env" options={options} value="b" />);
    inputs = host.querySelectorAll(
      "input[type='radio']",
    ) as NodeListOf<HTMLInputElement>;
    expect(inputs[0]?.checked).toBe(false);
    expect(inputs[1]?.checked).toBe(true);
  });
});
