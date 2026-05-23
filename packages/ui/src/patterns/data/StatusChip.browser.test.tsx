import { describe, expect, it } from "vitest";
import { StatusChip, statusChipToneToBadgeVariant } from "./StatusChip";
import { mount } from "../../testing/browser-test-utils";

describe("StatusChip", () => {
  it("renders the children with the requested tone data-attr", () => {
    const host = mount(<StatusChip tone="nominal">healthy</StatusChip>);
    const chip = host.querySelector("[data-tone='nominal']") as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.textContent).toBe("healthy");
  });

  it("maps every tone onto the canonical Badge variant", () => {
    expect(statusChipToneToBadgeVariant("nominal")).toBe("active");
    expect(statusChipToneToBadgeVariant("pending")).toBe("pending");
    expect(statusChipToneToBadgeVariant("drift")).toBe("drift");
    expect(statusChipToneToBadgeVariant("error")).toBe("error");
    expect(statusChipToneToBadgeVariant("success")).toBe("active");
  });

  it("forwards Badge variant via data-variant for the error tone", () => {
    const host = mount(<StatusChip tone="error">failed</StatusChip>);
    const chip = host.querySelector("[data-tone='error']") as HTMLElement;
    expect(chip.getAttribute("data-variant")).toBe("error");
  });

  it("renders the success tone using the active palette (no separate variant)", () => {
    const host = mount(<StatusChip tone="success">applied</StatusChip>);
    const chip = host.querySelector("[data-tone='success']") as HTMLElement;
    expect(chip.getAttribute("data-variant")).toBe("active");
  });
});
