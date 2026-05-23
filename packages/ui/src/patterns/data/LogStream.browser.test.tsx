import { describe, expect, it, vi } from "vitest";
import { LogStream, type LogStreamEntry } from "./LogStream";
import { click, mount } from "../../testing/browser-test-utils";

const entries: readonly LogStreamEntry[] = [
  {
    id: "e1",
    timestamp: "2026-05-17T12:00:00Z",
    tone: "nominal",
    message: "config.applied identity/session.idleMinutes",
    actor: "ops@example.com",
    correlationId: "corr-1",
  },
  {
    id: "e2",
    timestamp: "2026-05-17T12:01:00Z",
    tone: "error",
    message: "webhook.delivery.failed billing.invoice.created",
    correlationId: "corr-2",
  },
];

describe("LogStream", () => {
  it("renders entries inside a log role region with the live-tail data-attr", () => {
    const host = mount(<LogStream entries={entries} liveTail />);
    const region = host.querySelector("[data-pattern='log-stream']");
    expect(region?.getAttribute("data-live-tail")).toBe("true");
    expect(host.querySelectorAll("[data-log-entry]")).toHaveLength(2);
  });

  it("renders the empty state when there are no entries", () => {
    const host = mount(<LogStream entries={[]} />);
    expect(host.querySelector("[data-log-stream-empty]")).not.toBeNull();
  });

  it("invokes onCorrelationSelect when a correlation chip is clicked", () => {
    const onCorrelationSelect = vi.fn();
    const host = mount(
      <LogStream entries={entries} onCorrelationSelect={onCorrelationSelect} />,
    );
    const chip = host.querySelector(
      "[data-log-entry-correlation='corr-2']",
    ) as HTMLButtonElement;
    click(chip);
    expect(onCorrelationSelect).toHaveBeenCalledWith("corr-2");
  });

  it("toggles facets through the supplied callback", () => {
    const onFacetToggle = vi.fn();
    const host = mount(
      <LogStream
        entries={entries}
        facets={[{ id: "f-error", label: "errors", tone: "error" }]}
        selectedFacets={new Set()}
        onFacetToggle={onFacetToggle}
      />,
    );
    const facet = host.querySelector(
      "[data-facet='f-error']",
    ) as HTMLButtonElement;
    click(facet);
    expect(onFacetToggle).toHaveBeenCalledWith("f-error");
  });

  it("toggles live-tail via the toolbar switch", () => {
    const onLiveTailToggle = vi.fn();
    const host = mount(
      <LogStream
        entries={entries}
        liveTail={false}
        onLiveTailToggle={onLiveTailToggle}
      />,
    );
    const toggle = host.querySelector(
      "[data-testid='log-stream-live-tail']",
    ) as HTMLButtonElement;
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    click(toggle);
    expect(onLiveTailToggle).toHaveBeenCalledWith(true);
  });
});
