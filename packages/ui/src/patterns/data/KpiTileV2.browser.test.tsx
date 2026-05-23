import { describe, expect, it, vi } from "vitest";
import { KpiTileV2 } from "./KpiTileV2";
import { click, mount } from "../../testing/browser-test-utils";

describe("KpiTileV2", () => {
  it("renders label, value, and tone in the canonical interactive shape", () => {
    const host = mount(
      <KpiTileV2
        label="Pending proposals"
        value="3"
        tone="pending"
        onClick={() => undefined}
      />,
    );
    const tile = host.querySelector(
      "[data-pattern='kpi-tile-v2']",
    ) as HTMLButtonElement;
    expect(tile).not.toBeNull();
    expect(tile.getAttribute("data-tone")).toBe("pending");
    expect(tile.textContent).toContain("Pending proposals");
    expect(tile.textContent).toContain("3");
    expect(tile.tagName).toBe("BUTTON");
  });

  it("fires onClick when activated", () => {
    const onClick = vi.fn();
    const host = mount(
      <KpiTileV2 label="x" value="1" tone="error" onClick={onClick} />,
    );
    const tile = host.querySelector(
      "[data-pattern='kpi-tile-v2']",
    ) as HTMLButtonElement;
    click(tile);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders trend and hint slots when supplied", () => {
    const host = mount(
      <KpiTileV2
        label="Drifted configs"
        value="12"
        tone="drift"
        onClick={() => undefined}
        trend="▲ 4 since 24h"
        hint="open to triage"
      />,
    );
    expect(
      host.querySelector("[data-kpi-slot='trend']")?.textContent,
    ).toContain("▲ 4");
    expect(host.querySelector("[data-kpi-slot='hint']")?.textContent).toContain(
      "open to triage",
    );
  });
});
