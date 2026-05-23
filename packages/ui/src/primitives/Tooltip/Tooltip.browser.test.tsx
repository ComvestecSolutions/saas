import { describe, expect, it } from "vitest";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./Tooltip";
import { Button } from "../Button/Button";
import { mount, rerender } from "../../testing/browser-test-utils";

describe("Tooltip", () => {
  it("renders the trigger and keeps content hidden until shown", () => {
    const host = mount(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button>hover me</Button>
          </TooltipTrigger>
          <TooltipContent>info</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(host.querySelector("button")).not.toBeNull();
    expect(document.querySelector("[role='tooltip']")).toBeNull();
  });

  it("renders tooltip with role=tooltip when defaultOpen", () => {
    mount(
      <TooltipProvider>
        <Tooltip defaultOpen>
          <TooltipTrigger asChild>
            <Button>x</Button>
          </TooltipTrigger>
          <TooltipContent>info</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    const tooltip = document.querySelector("[role='tooltip']");
    expect(tooltip?.textContent).toBe("info");
  });

  it("respects the controlled open prop across re-renders", () => {
    const tree = (open: boolean) => (
      <TooltipProvider>
        <Tooltip open={open} onOpenChange={() => {}}>
          <TooltipTrigger asChild>
            <Button>x</Button>
          </TooltipTrigger>
          <TooltipContent>info</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    const host = mount(tree(false));
    expect(document.querySelector("[role='tooltip']")).toBeNull();
    rerender(host, tree(true));
    expect(document.querySelector("[role='tooltip']")).not.toBeNull();
    rerender(host, tree(false));
    expect(document.querySelector("[role='tooltip']")).toBeNull();
  });

  it.todo("respects 120ms motion token");
  it.todo("does not render when trigger is disabled");
});
