import { describe, expect, it } from "vitest";
import { CommandStrip } from "./CommandStrip";
import { mount } from "../../testing/browser-test-utils";

describe("CommandStrip responsive recomposition", () => {
  it.each(["desktop", "tablet"] as const)(
    "%s: renders the full four-slot strip including workspace tabs",
    (deviceClass) => {
      const host = mount(
        <CommandStrip
          deviceClass={deviceClass}
          omnibar={<input data-testid="omni" />}
          workspaceTabs={<nav data-testid="tabs" />}
          alertsPulse={<div data-testid="alerts" />}
          runAsBanner={<div data-testid="run-as" />}
        />,
      );
      const strip = host.querySelector(
        "[data-pattern='command-strip']",
      ) as HTMLElement;
      expect(strip.dataset["deviceClass"]).toBe(deviceClass);
      expect(strip.dataset["variant"]).toBe("full");
      expect(host.querySelector("[data-slot='workspace-tabs']")).not.toBeNull();
      expect(strip.style.position).toBe("static");
    },
  );

  it("mobile: reduced-density variant pins the omnibar and drops workspace tabs", () => {
    const host = mount(
      <CommandStrip
        deviceClass="mobile"
        omnibar={<input data-testid="omni" />}
        workspaceTabs={<nav data-testid="tabs" />}
        alertsPulse={<div data-testid="alerts" />}
        runAsBanner={<div data-testid="run-as" />}
      />,
    );
    const strip = host.querySelector(
      "[data-pattern='command-strip']",
    ) as HTMLElement;
    expect(strip.dataset["deviceClass"]).toBe("mobile");
    expect(strip.dataset["variant"]).toBe("reduced-density");
    expect(strip.style.position).toBe("sticky");
    expect(host.querySelector("[data-slot='workspace-tabs']")).toBeNull();
    expect(host.querySelector("[data-slot='omnibar']")).not.toBeNull();
  });
});
