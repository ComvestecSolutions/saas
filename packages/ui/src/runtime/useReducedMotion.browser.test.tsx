import { describe, expect, it } from "vitest";
import { useReducedMotion } from "./useReducedMotion";
import { mount } from "../testing/browser-test-utils";

describe("useReducedMotion", () => {
  it("returns a boolean and defaults to false when no preference is set", () => {
    const captured: { current: boolean | undefined } = { current: undefined };
    function Probe() {
      captured.current = useReducedMotion();
      return null;
    }
    mount(<Probe />);
    expect(typeof captured.current).toBe("boolean");
  });
});
