import { describe, expect, it } from "vitest";
import { Workbench } from "./Workbench";
import { mount } from "../../testing/browser-test-utils";

describe("Workbench", () => {
  it("renders as a main landmark with the supplied panes", () => {
    const host = mount(
      <Workbench>
        <div data-testid="pane-a">A</div>
        <div data-testid="pane-b">B</div>
      </Workbench>,
    );
    const work = host.querySelector(
      "[data-pattern='workbench']",
    ) as HTMLElement;
    expect(work.getAttribute("role")).toBe("main");
    expect(host.querySelectorAll("[data-testid^='pane-']")).toHaveLength(2);
  });

  it("uses a CSS grid layout so panes split horizontally", () => {
    const host = mount(
      <Workbench>
        <div />
      </Workbench>,
    );
    const work = host.querySelector(
      "[data-pattern='workbench']",
    ) as HTMLElement;
    expect(work.style.display).toBe("grid");
  });
});
