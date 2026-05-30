import { describe, expect, it } from "vitest";
import { Workbench } from "./Workbench";
import { mount } from "../../testing/browser-test-utils";

describe("Workbench responsive recomposition", () => {
  it.each(["desktop", "tablet"] as const)(
    "%s: panes flow horizontally and keep the workbench vertically scrollable",
    (deviceClass) => {
      const host = mount(
        <Workbench deviceClass={deviceClass}>
          <div data-testid="pane-a">A</div>
          <div data-testid="pane-b">B</div>
        </Workbench>,
      );
      const work = host.querySelector(
        "[data-pattern='workbench']",
      ) as HTMLElement;
      expect(work.dataset["deviceClass"]).toBe(deviceClass);
      expect(work.style.gridAutoFlow).toBe("column");
      expect(work.style.overflowX).toBe("hidden");
      expect(work.style.overflowY).toBe("auto");
    },
  );

  it("mobile: panes stack into a vertical scroll column", () => {
    const host = mount(
      <Workbench deviceClass="mobile">
        <div data-testid="pane-a">A</div>
        <div data-testid="pane-b">B</div>
      </Workbench>,
    );
    const work = host.querySelector(
      "[data-pattern='workbench']",
    ) as HTMLElement;
    expect(work.dataset["deviceClass"]).toBe("mobile");
    expect(work.style.gridAutoFlow).toBe("row");
    expect(work.style.overflowX).toBe("hidden");
    expect(work.style.overflowY).toBe("auto");
  });
});
