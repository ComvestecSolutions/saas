import { describe, expect, it, vi } from "vitest";
import { Omnibar, type OmnibarSuggestion } from "./Omnibar";
import { mount, press } from "../../testing/browser-test-utils";
import { act } from "react";

const suggestions: readonly OmnibarSuggestion[] = [
  { id: "t/acme", label: "Acme", hint: "tenant" },
  { id: "f/billing.allowExports", label: "billing.allowExports", hint: "flag" },
];

describe("Omnibar", () => {
  it("renders with the search landmark and a controlled value", () => {
    const host = mount(<Omnibar value="t/" onValueChange={() => undefined} />);
    const search = host.querySelector("[role='search']");
    expect(search).not.toBeNull();
    const input = host.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("t/");
  });

  it("opens the suggestion list on focus when suggestions are present", () => {
    const host = mount(
      <Omnibar
        value=""
        onValueChange={() => undefined}
        suggestions={suggestions}
      />,
    );
    const input = host.querySelector("input") as HTMLInputElement;
    act(() => {
      input.focus();
    });
    expect(
      host.querySelector("[data-testid='omnibar-suggestions']"),
    ).not.toBeNull();
  });

  it("submits on Enter via the onSubmit callback", () => {
    const onSubmit = vi.fn();
    const host = mount(
      <Omnibar
        value="acme"
        onValueChange={() => undefined}
        onSubmit={onSubmit}
      />,
    );
    const input = host.querySelector("input") as HTMLInputElement;
    act(() => {
      input.focus();
    });
    press(input, "Enter");
    expect(onSubmit).toHaveBeenCalledWith("acme");
  });

  it("invokes onValueChange when the input changes", () => {
    const onValueChange = vi.fn();
    const host = mount(<Omnibar value="" onValueChange={onValueChange} />);
    const input = host.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      setter?.call(input, "t/ac");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onValueChange).toHaveBeenCalledWith("t/ac");
  });
});
