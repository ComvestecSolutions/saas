import { describe, expect, it } from "vitest";
import { useDeviceClass } from "./useDeviceClass";
import { DeviceProvider } from "./device";
import { mount } from "../testing/browser-test-utils";

describe("useDeviceClass", () => {
  it("returns the current device classification from DeviceProvider", () => {
    const captured: { current: string | undefined } = { current: undefined };
    function Probe() {
      captured.current = useDeviceClass();
      return null;
    }
    mount(
      <DeviceProvider>
        <Probe />
      </DeviceProvider>,
    );
    expect(["mobile", "tablet", "desktop"]).toContain(captured.current);
  });
});
