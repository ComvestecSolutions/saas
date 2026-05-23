import { describe, expect, it, vi } from "vitest";
import { Pane } from "./Pane";
import { click, mount } from "../../testing/browser-test-utils";

describe("Pane", () => {
  it("renders the title as a region with the title as accessible name by default", () => {
    const host = mount(<Pane title="Tenant: Acme">body</Pane>);
    const region = host.querySelector("[data-pattern='pane']") as HTMLElement;
    expect(region.getAttribute("role")).toBe("region");
    expect(region.getAttribute("aria-label")).toBe("Tenant: Acme");
  });

  it("renders toolbar, body and footer slots", () => {
    const host = mount(
      <Pane
        title="x"
        toolbar={<span data-testid="tb">tb</span>}
        footer={<span data-testid="ft">ft</span>}
      >
        <span data-testid="body">body</span>
      </Pane>,
    );
    expect(host.querySelector("[data-testid='tb']")).not.toBeNull();
    expect(host.querySelector("[data-testid='body']")).not.toBeNull();
    expect(host.querySelector("[data-testid='ft']")).not.toBeNull();
  });

  it("invokes onClose when the close button is pressed", () => {
    const onClose = vi.fn();
    const host = mount(
      <Pane title="x" onClose={onClose}>
        body
      </Pane>,
    );
    click(host.querySelector("[data-pane-close]") as HTMLButtonElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
