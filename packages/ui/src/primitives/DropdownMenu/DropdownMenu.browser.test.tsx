import { describe, expect, it } from "vitest";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./DropdownMenu";
import { Button } from "../Button/Button";
import {
  click,
  mount,
  press,
  rerender,
} from "../../testing/browser-test-utils";

describe("DropdownMenu", () => {
  it("renders the trigger and keeps the menu closed by default", () => {
    const host = mount(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>menu</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>One</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(host.querySelector("button")).not.toBeNull();
    expect(document.querySelector("[role='menu']")).toBeNull();
  });

  it("opens when defaultOpen is set and renders menu items", () => {
    mount(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger asChild>
          <Button>menu</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>One</DropdownMenuItem>
          <DropdownMenuItem>Two</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const menu = document.querySelector("[role='menu']");
    expect(menu).not.toBeNull();
    expect(menu?.querySelectorAll("[role='menuitem']").length).toBe(2);
  });

  it("closes on Escape", () => {
    mount(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger asChild>
          <Button>menu</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>One</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const menu = document.querySelector("[role='menu']") as HTMLElement;
    press(menu, "Escape");
    expect(document.querySelector("[role='menu']")).toBeNull();
  });

  it("does not open when trigger is disabled", () => {
    const host = mount(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled>menu</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>One</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const trigger = host.querySelector("button") as HTMLButtonElement;
    click(trigger);
    expect(document.querySelector("[role='menu']")).toBeNull();
  });

  it("respects the controlled open prop across re-renders", () => {
    const tree = (open: boolean) => (
      <DropdownMenu open={open} onOpenChange={() => {}}>
        <DropdownMenuTrigger asChild>
          <Button>menu</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>One</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    const host = mount(tree(false));
    expect(document.querySelector("[role='menu']")).toBeNull();
    rerender(host, tree(true));
    expect(document.querySelector("[role='menu']")).not.toBeNull();
    rerender(host, tree(false));
    expect(document.querySelector("[role='menu']")).toBeNull();
  });
});
