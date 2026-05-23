import { describe, expect, it, vi } from "vitest";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { Button } from "../Button/Button";
import {
  click,
  mount,
  press,
  rerender,
} from "../../testing/browser-test-utils";

describe("Popover", () => {
  it("opens on trigger click and renders the content panel", () => {
    const host = mount(
      <Popover>
        <PopoverTrigger asChild>
          <Button>open</Button>
        </PopoverTrigger>
        <PopoverContent aria-label="panel">inside</PopoverContent>
      </Popover>,
    );
    const trigger = host.querySelector("button") as HTMLButtonElement;
    click(trigger);
    const panel = document.querySelector("[aria-label='panel']");
    expect(panel?.textContent).toBe("inside");
  });

  it("respects defaultOpen (uncontrolled) and closes on Escape", () => {
    const onOpenChange = vi.fn();
    mount(
      <Popover defaultOpen onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button>x</Button>
        </PopoverTrigger>
        <PopoverContent aria-label="panel">inside</PopoverContent>
      </Popover>,
    );
    const panel = document.querySelector("[aria-label='panel']") as HTMLElement;
    expect(panel).not.toBeNull();
    press(panel, "Escape");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("blocks interaction when trigger disabled", () => {
    const host = mount(
      <Popover>
        <PopoverTrigger asChild>
          <Button disabled>x</Button>
        </PopoverTrigger>
        <PopoverContent>inside</PopoverContent>
      </Popover>,
    );
    const trigger = host.querySelector("button") as HTMLButtonElement;
    click(trigger);
    expect(
      document.querySelector("[data-radix-popper-content-wrapper]"),
    ).toBeNull();
  });

  it("supports controlled open prop with rerender", () => {
    const tree = (open: boolean) => (
      <Popover open={open} onOpenChange={() => {}}>
        <PopoverTrigger asChild>
          <Button>x</Button>
        </PopoverTrigger>
        <PopoverContent aria-label="panel">inside</PopoverContent>
      </Popover>
    );
    const host = mount(tree(false));
    expect(document.querySelector("[aria-label='panel']")).toBeNull();
    rerender(host, tree(true));
    expect(document.querySelector("[aria-label='panel']")).not.toBeNull();
    rerender(host, tree(false));
    expect(document.querySelector("[aria-label='panel']")).toBeNull();
  });
});
