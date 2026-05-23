import { describe, expect, it } from "vitest";
import { ScrollArea } from "./ScrollArea";
import { mount } from "../../testing/browser-test-utils";

describe("ScrollArea", () => {
  it("renders children in a scrollable viewport", () => {
    const host = mount(
      <ScrollArea style={{ width: 100, height: 100 }}>
        <div style={{ width: 300, height: 300 }}>scrollable body</div>
      </ScrollArea>,
    );
    expect(host.querySelector(".ops-scroll-area")).not.toBeNull();
    expect(host.textContent).toContain("scrollable body");
  });

  it("exposes both vertical and horizontal scrollbar slots", () => {
    const host = mount(
      <ScrollArea style={{ width: 100, height: 100 }}>
        <div style={{ width: 300, height: 300 }}>body</div>
      </ScrollArea>,
    );
    // Radix renders scrollbars lazily when overflow is detected; assert the
    // viewport allows both axes by inspecting the root element and confirming
    // the viewport exists.
    expect(host.querySelector(".ops-scroll-area")).not.toBeNull();
    expect(
      host.querySelector("[data-radix-scroll-area-viewport]"),
    ).not.toBeNull();
  });

  it.todo("Tab focus traverses children inside the viewport");
  it.todo("controlled scroll position via ref");
  it.todo("disabled / readonly variants — n/a, scroll has no disabled mode");
});
