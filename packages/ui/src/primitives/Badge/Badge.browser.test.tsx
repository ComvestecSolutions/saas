import { describe, expect, it } from "vitest";
import { Badge } from "./Badge";
import { mount } from "../../testing/browser-test-utils";

describe("Badge", () => {
  it("renders the requested label with the neutral variant by default", () => {
    const host = mount(<Badge>applied</Badge>);
    const node = host.querySelector(".ops-badge") as HTMLElement;
    expect(node.textContent).toBe("applied");
    expect(node.dataset["variant"]).toBe("neutral");
  });

  it("renders 4px corner radius (chip-only rule)", () => {
    const host = mount(<Badge>x</Badge>);
    const node = host.querySelector(".ops-badge") as HTMLElement;
    expect(node.style.borderRadius).toBe("4px");
  });

  it("renders sm/md size tokens with the correct height", () => {
    const small = mount(<Badge size="sm">x</Badge>);
    const medium = mount(<Badge size="md">x</Badge>);
    expect(
      (small.querySelector(".ops-badge") as HTMLElement).style.height,
    ).toBe("16px");
    expect(
      (medium.querySelector(".ops-badge") as HTMLElement).style.height,
    ).toBe("20px");
  });

  it("renders the error variant with the error-status foreground token", () => {
    const host = mount(<Badge variant="error">blocked</Badge>);
    const node = host.querySelector(".ops-badge") as HTMLElement;
    expect(node.style.color).toContain("var(--status-error-fg)");
  });

  it("renders the active variant with the active-status foreground token", () => {
    const host = mount(<Badge variant="active">healthy</Badge>);
    const node = host.querySelector(".ops-badge") as HTMLElement;
    expect(node.style.color).toContain("var(--status-active-fg)");
  });
});
