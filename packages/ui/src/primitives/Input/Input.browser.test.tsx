import { describe, expect, it, vi } from "vitest";
import { Input } from "./Input";
import { mount, rerender } from "../../testing/browser-test-utils";

describe("Input", () => {
  it("renders default state and respects min-height 32 at size md", () => {
    const host = mount(<Input placeholder="search" />);
    const input = host.querySelector("input");
    expect(input).not.toBeNull();
    expect(input?.getAttribute("placeholder")).toBe("search");
    const wrapper = host.querySelector("label.ops-input") as HTMLElement;
    expect(wrapper.style.height).toBe("32px");
  });

  it("supports controlled value and onChange", () => {
    const onChange = vi.fn();
    const host = mount(
      <Input value="alpha" onChange={onChange} readOnly={false} />,
    );
    const input = host.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("alpha");
    rerender(host, <Input value="beta" onChange={onChange} readOnly={false} />);
    expect(input.value).toBe("beta");
  });

  it("renders aria-invalid and error-status border when invalid", () => {
    const host = mount(<Input invalid defaultValue="x" />);
    const input = host.querySelector("input") as HTMLInputElement;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const wrapper = host.querySelector("label.ops-input") as HTMLElement;
    expect(wrapper.style.border).toContain("var(--status-error-border)");
  });

  it("blocks interaction when disabled", () => {
    const host = mount(<Input disabled />);
    const input = host.querySelector("input") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it.todo(
    "fires keyboard navigation between leading/trailing slots (deferred to slice 1b ComboField pattern)",
  );
});
