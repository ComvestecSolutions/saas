import { describe, expect, it, vi } from "vitest";
import { PulseRibbon, type PulseSegment } from "./PulseRibbon";
import { click, mount } from "../../testing/browser-test-utils";

const segments: readonly PulseSegment[] = [
  { id: "config", label: "Configs", tone: "nominal" },
  { id: "support", label: "Support", tone: "error", count: 3 },
  { id: "audit", label: "Audit", tone: "pending", count: 12 },
];

describe("PulseRibbon", () => {
  it("renders one segment per provided descriptor with the tone attribute", () => {
    const host = mount(<PulseRibbon segments={segments} />);
    const buttons = host.querySelectorAll("[data-segment]");
    expect(buttons).toHaveLength(3);
    expect(
      (host.querySelector("[data-segment='support']") as HTMLElement).dataset[
        "tone"
      ],
    ).toBe("error");
  });

  it("fires onSelect with the clicked segment", () => {
    const onSelect = vi.fn();
    const host = mount(<PulseRibbon segments={segments} onSelect={onSelect} />);
    click(host.querySelector("[data-segment='audit']") as HTMLButtonElement);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "audit", count: 12 }),
    );
  });

  it("renders the count when present", () => {
    const host = mount(<PulseRibbon segments={segments} />);
    expect(
      (host.querySelector("[data-segment='support']") as HTMLElement)
        .textContent,
    ).toContain("3");
  });
});
