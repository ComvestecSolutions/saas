import "../../styles/app.css";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { OpsPanel } from "./ops-panel";

describe("OpsPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("labels the region from the visible title", () => {
    act(() => {
      root.render(
        <OpsPanel title="Focused tenant" data-testid="panel">
          <p>Panel body</p>
        </OpsPanel>,
      );
    });

    const panel = container.querySelector("[data-testid='panel']");
    const title = container.querySelector(".ops-panel__title");

    if (!(panel instanceof HTMLElement) || !(title instanceof HTMLElement)) {
      throw new TypeError("Expected the ops panel and title to render.");
    }

    expect(panel.getAttribute("aria-labelledby")).toBe(title.id);
    expect(title.textContent).toBe("Focused tenant");
  });

  it("applies posture tones through semantic modifier classes", () => {
    act(() => {
      root.render(
        <OpsPanel title="Attention queue" tone="warn">
          <p>Needs review</p>
        </OpsPanel>,
      );
    });

    const panel = container.querySelector(".ops-panel");
    expect(panel?.classList.contains("ops-panel--warn")).toBe(true);
  });
});
