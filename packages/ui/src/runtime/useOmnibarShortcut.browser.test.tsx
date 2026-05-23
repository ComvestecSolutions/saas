import { describe, expect, it, vi } from "vitest";
import { useOmnibarShortcut } from "./useOmnibarShortcut";
import { mount } from "../testing/browser-test-utils";
import { act } from "react";

describe("useOmnibarShortcut", () => {
  it("invokes onTrigger on Ctrl/Cmd+K and cancels default", () => {
    const onTrigger = vi.fn();
    function Probe() {
      useOmnibarShortcut(onTrigger);
      return null;
    }
    mount(<Probe />);

    const event = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not fire without the meta/ctrl modifier", () => {
    const onTrigger = vi.fn();
    function Probe() {
      useOmnibarShortcut(onTrigger);
      return null;
    }
    mount(<Probe />);

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", bubbles: true }),
      );
    });
    expect(onTrigger).not.toHaveBeenCalled();
  });
});
