import "../../styles/app.css";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { Tabs } from "./tabs";

describe("Tabs", () => {
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

  it("keeps the rail horizontally scrollable without shrinking tab buttons", () => {
    act(() => {
      root.render(
        <Tabs
          value="overview"
          onChange={() => undefined}
          items={[
            { value: "overview", label: "Overview and posture" },
            { value: "members", label: "Members and invitations" },
            { value: "billing", label: "Billing and reconciliation" },
            { value: "domains", label: "Domains and sender identity" },
            { value: "audit", label: "Audit trails and reveals" },
          ]}
        />,
      );
    });

    const rail = container.querySelector(".ops-tabs");
    const firstTab = container.querySelector(".ops-tab");

    if (!(rail instanceof HTMLElement) || !(firstTab instanceof HTMLElement)) {
      throw new TypeError("Expected tabs rail and tab button to render.");
    }

    const railStyle = getComputedStyle(rail);
    const firstTabStyle = getComputedStyle(firstTab);

    expect(railStyle.overflowX).toBe("auto");
    expect(railStyle.flexWrap).toBe("nowrap");
    expect(firstTabStyle.flexGrow).toBe("0");
    expect(firstTabStyle.flexShrink).toBe("0");
    expect(firstTabStyle.whiteSpace).toBe("nowrap");
  });
});
