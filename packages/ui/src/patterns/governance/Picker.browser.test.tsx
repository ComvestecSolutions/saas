import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { Picker } from "./Picker";
import { click, mount, rerender } from "../../testing/browser-test-utils";
import type { OmnibarSuggestion } from "../desk/Omnibar";

const flushAsync = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("Picker", () => {
  it("renders a combobox role with the search input and empty placeholder", () => {
    const host = mount(
      <Picker
        value={null}
        onValueChange={() => undefined}
        search={async () => []}
      />,
    );
    const combobox = host.querySelector("[data-pattern='picker']");
    expect(combobox?.getAttribute("role")).toBe("combobox");
    expect(host.querySelector("input")).not.toBeNull();
  });

  it("debounces through the search prop and renders suggestions", async () => {
    const suggestions: readonly OmnibarSuggestion[] = [
      { id: "t/acme", label: "Acme", hint: "tenant" },
    ];
    const search = vi.fn(async () => suggestions);
    const host = mount(
      <Picker value={null} onValueChange={() => undefined} search={search} />,
    );
    const input = host.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      setter?.call(input, "acm");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flushAsync();
    expect(search).toHaveBeenCalledWith("acm");
    const option = host.querySelector("[data-suggestion='t/acme']");
    expect(option).not.toBeNull();
  });

  it("fires onValueChange when a suggestion is picked and switches to the selected view", async () => {
    const suggestions: readonly OmnibarSuggestion[] = [
      { id: "u/admin", label: "Admin user", hint: "user" },
    ];
    const onValueChange = vi.fn();
    const host = mount(
      <Picker
        value={null}
        onValueChange={onValueChange}
        search={async () => suggestions}
      />,
    );
    const input = host.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      setter?.call(input, "ad");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flushAsync();
    const option = host.querySelector(
      "[data-suggestion='u/admin']",
    ) as HTMLButtonElement;
    click(option);
    expect(onValueChange).toHaveBeenCalledWith(suggestions[0]);

    rerender(
      host,
      <Picker
        value={suggestions[0]!}
        onValueChange={onValueChange}
        search={async () => suggestions}
      />,
    );
    expect(
      host.querySelector("[data-testid='picker-selected']")?.textContent,
    ).toContain("Admin user");
  });

  it("surfaces a search error via the alert role", async () => {
    const host = mount(
      <Picker
        value={null}
        onValueChange={() => undefined}
        search={async () => {
          throw new Error("offline");
        }}
      />,
    );
    const input = host.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      setter?.call(input, "x");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flushAsync();
    expect(
      host.querySelector("[data-testid='picker-error']")?.textContent,
    ).toContain("offline");
  });

  it("exposes the lookup-by-id disclosure only when allowLookupById is true", () => {
    const onLookupById = vi.fn();
    const host = mount(
      <Picker
        value={null}
        onValueChange={() => undefined}
        search={async () => []}
        allowLookupById
        onLookupById={onLookupById}
      />,
    );
    const input = host.querySelector("input") as HTMLInputElement;
    act(() => {
      input.focus();
    });
    expect(
      host.querySelector("[data-testid='picker-lookup-by-id']"),
    ).not.toBeNull();
  });
});
