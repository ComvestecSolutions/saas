import { describe, expect, it } from "vitest";
import { PulseRibbon, type PulseSegment } from "./PulseRibbon";
import { mount } from "../../testing/browser-test-utils";

const segments: readonly PulseSegment[] = [
  { id: "config", label: "Configs", tone: "nominal" },
  { id: "support", label: "Support", tone: "error", count: 3 },
  { id: "audit", label: "Audit", tone: "pending", count: 12 },
];

describe("PulseRibbon responsive recomposition", () => {
  it.each(["desktop", "tablet"] as const)(
    "%s: renders ribbon variant with one segment per descriptor",
    (deviceClass) => {
      const host = mount(
        <PulseRibbon segments={segments} deviceClass={deviceClass} />,
      );
      const ribbon = host.querySelector(
        "[data-pattern='pulse-ribbon']",
      ) as HTMLElement;
      expect(ribbon.dataset["deviceClass"]).toBe(deviceClass);
      expect(ribbon.dataset["variant"]).toBe("ribbon");
      expect(host.querySelectorAll("[data-segment]")).toHaveLength(3);
    },
  );

  it("mobile: switches to carousel variant with horizontal scroll-snap", () => {
    const host = mount(
      <PulseRibbon segments={segments} deviceClass="mobile" />,
    );
    const ribbon = host.querySelector(
      "[data-pattern='pulse-ribbon']",
    ) as HTMLElement;
    expect(ribbon.dataset["deviceClass"]).toBe("mobile");
    expect(ribbon.dataset["variant"]).toBe("carousel");
    expect(ribbon.style.overflowX).toBe("auto");
    expect(ribbon.style.scrollSnapType).toBe("x mandatory");
  });
});
