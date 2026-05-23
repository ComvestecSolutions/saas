import { describe, expect, it } from "vitest";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./Select";
import { mount } from "../../testing/browser-test-utils";

const renderSelect = (defaultValue?: string) =>
  mount(
    <Select {...(defaultValue !== undefined ? { defaultValue } : {})}>
      <SelectTrigger aria-label="env">
        <SelectValue placeholder="pick" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="prod">prod</SelectItem>
        <SelectItem value="stg">stg</SelectItem>
      </SelectContent>
    </Select>,
  );

describe("Select", () => {
  it("renders the trigger with the requested aria-label", () => {
    const host = renderSelect();
    const trigger = host.querySelector("[aria-label='env']");
    expect(trigger).not.toBeNull();
  });

  it("reflects defaultValue in trigger contents (uncontrolled)", () => {
    const host = renderSelect("prod");
    const trigger = host.querySelector("[aria-label='env']") as HTMLElement;
    expect(trigger.textContent).toContain("prod");
  });

  it("blocks interaction when disabled", () => {
    const host = mount(
      <Select disabled>
        <SelectTrigger aria-label="env">
          <SelectValue placeholder="x" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">a</SelectItem>
        </SelectContent>
      </Select>,
    );
    const trigger = host.querySelector(
      "[aria-label='env']",
    ) as HTMLButtonElement;
    expect(trigger.getAttribute("data-disabled")).not.toBeNull();
  });

  it.todo(
    "opens content on Enter/Space and navigates with arrow keys (deferred — requires Radix portal assertions)",
  );
});
