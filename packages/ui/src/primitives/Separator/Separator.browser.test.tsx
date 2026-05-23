import { describe, expect, it } from "vitest";
import { Separator } from "./Separator";
import { mount } from "../../testing/browser-test-utils";

describe("Separator", () => {
  it("renders a 1px horizontal hairline by default", () => {
    const host = mount(<Separator />);
    const node = host.querySelector(".ops-separator") as HTMLElement;
    expect(node.style.height).toBe("1px");
    expect(node.style.width).toBe("100%");
  });

  it("renders a vertical hairline when orientation=vertical", () => {
    const host = mount(<Separator orientation="vertical" />);
    const node = host.querySelector(".ops-separator") as HTMLElement;
    expect(node.style.width).toBe("1px");
    expect(node.style.height).toBe("100%");
    expect(node.getAttribute("aria-orientation")).toBe("vertical");
  });

  it("renders with the low-alpha hairline token", () => {
    const host = mount(<Separator />);
    const node = host.querySelector(".ops-separator") as HTMLElement;
    expect(node.style.background).toContain("white");
  });

  it("renders with role=none when decorative", () => {
    const host = mount(<Separator decorative />);
    const node = host.querySelector(".ops-separator") as HTMLElement;
    // Radix Separator emits role=none for decorative separators so
    // assistive tech skips it.
    expect(node.getAttribute("role")).toBe("none");
  });

  it("is ignored by keyboard focus (no tabindex by default)", () => {
    const host = mount(<Separator />);
    const node = host.querySelector(".ops-separator") as HTMLElement;
    expect(node.hasAttribute("tabindex")).toBe(false);
    node.focus();
    expect(document.activeElement).not.toBe(node);
  });
});
