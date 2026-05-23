import { describe, expect, it, vi } from "vitest";
import { RunAsBanner } from "./RunAsBanner";
import { click, mount } from "../../testing/browser-test-utils";

describe("RunAsBanner", () => {
  it("renders the actor, reason, and expiry as a status landmark", () => {
    const host = mount(
      <RunAsBanner
        actorLabel="acme-support"
        reason="emergency billing reconciliation"
        expiresAtIso="2026-05-17T12:00:00Z"
      />,
    );
    const banner = host.querySelector(
      "[data-pattern='run-as-banner']",
    ) as HTMLElement;
    expect(banner.getAttribute("role")).toBe("status");
    expect(banner.textContent).toContain("acme-support");
    expect(banner.textContent).toContain("emergency billing reconciliation");
    expect(banner.querySelector("time")?.getAttribute("datetime")).toBe(
      "2026-05-17T12:00:00Z",
    );
  });

  it("fires onRelease when the release button is pressed", () => {
    const onRelease = vi.fn();
    const host = mount(
      <RunAsBanner
        actorLabel="a"
        reason="r"
        expiresAtIso="2026-05-17T12:00:00Z"
        onRelease={onRelease}
      />,
    );
    click(host.querySelector("[data-run-as-release]") as HTMLButtonElement);
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it("omits the release button when no handler is provided", () => {
    const host = mount(
      <RunAsBanner
        actorLabel="a"
        reason="r"
        expiresAtIso="2026-05-17T12:00:00Z"
      />,
    );
    expect(host.querySelector("[data-run-as-release]")).toBeNull();
  });
});
