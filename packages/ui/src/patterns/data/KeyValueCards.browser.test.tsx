import { describe, expect, it, vi } from "vitest";
import { KeyValueCards, type KeyValueCard } from "./KeyValueCards";
import { click, mount } from "../../testing/browser-test-utils";

type DemoRow = { readonly id: string; readonly name: string };

const cards: readonly KeyValueCard<DemoRow>[] = [
  {
    id: "row-a",
    title: "Tenant A",
    status: <span data-testid="status-a">active</span>,
    entries: [
      { id: "plan", label: "Plan", value: "growth" },
      { id: "region", label: "Region", value: "eu-west-1" },
    ],
    row: { id: "row-a", name: "Tenant A" },
  },
  {
    id: "row-b",
    title: "Tenant B",
    entries: [{ id: "plan", label: "Plan", value: "starter" }],
    row: { id: "row-b", name: "Tenant B" },
  },
];

describe("KeyValueCards", () => {
  it("renders one card per row with label/value pairs", () => {
    const host = mount(<KeyValueCards cards={cards} />);
    expect(host.querySelectorAll("[data-card-id]")).toHaveLength(2);
    expect(host.querySelector("[data-testid='status-a']")).not.toBeNull();
    expect(host.querySelectorAll("[data-card-entry]")).toHaveLength(3);
  });

  it("renders the empty state when no cards are provided", () => {
    const host = mount(<KeyValueCards cards={[]} emptyState="Nothing yet" />);
    const region = host.querySelector(
      "[data-pattern='key-value-cards']",
    ) as HTMLElement;
    expect(region.dataset["empty"]).toBe("true");
    expect(region.textContent).toContain("Nothing yet");
  });

  it("invokes onSelect with the underlying row when the card title is activated", () => {
    const onSelect = vi.fn();
    const host = mount(<KeyValueCards cards={cards} onSelect={onSelect} />);
    click(host.querySelector("[data-card-open='row-b']") as HTMLButtonElement);
    expect(onSelect).toHaveBeenCalledWith({ id: "row-b", name: "Tenant B" });
  });
});
