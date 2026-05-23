import { describe, expect, it, vi } from "vitest";
import { Textarea } from "./Textarea";
import { mount, rerender } from "../../testing/browser-test-utils";

describe("Textarea", () => {
  it("renders default state and applies min-height 32", () => {
    const host = mount(<Textarea aria-label="notes" />);
    const node = host.querySelector("textarea") as HTMLTextAreaElement;
    expect(node).not.toBeNull();
    expect(node.style.minHeight).toBe("32px");
  });

  it("supports controlled value updates", () => {
    const onChange = vi.fn();
    const host = mount(
      <Textarea aria-label="notes" value="one" onChange={onChange} />,
    );
    const node = host.querySelector("textarea") as HTMLTextAreaElement;
    expect(node.value).toBe("one");
    rerender(
      host,
      <Textarea aria-label="notes" value="two" onChange={onChange} />,
    );
    expect(node.value).toBe("two");
  });

  it("renders aria-invalid and error-status border when invalid", () => {
    const host = mount(<Textarea aria-label="notes" invalid />);
    const node = host.querySelector("textarea") as HTMLTextAreaElement;
    expect(node.getAttribute("aria-invalid")).toBe("true");
    expect(node.style.border).toContain("var(--status-error-border)");
  });

  it("blocks interaction when disabled", () => {
    const host = mount(<Textarea aria-label="notes" disabled />);
    const node = host.querySelector("textarea") as HTMLTextAreaElement;
    expect(node.disabled).toBe(true);
  });

  it.todo(
    "auto-resizes within min/max row bounds — covered by visual regression in slice 1b",
  );
});
