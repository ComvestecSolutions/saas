import { describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogTrigger } from "./Dialog";
import { Button } from "../Button/Button";
import { click, mount, press } from "../../testing/browser-test-utils";

describe("Dialog", () => {
  it("opens via trigger click and exposes role=dialog with the configured title", () => {
    const host = mount(
      <Dialog>
        <DialogTrigger asChild>
          <Button>open</Button>
        </DialogTrigger>
        <DialogContent title="Confirm" description="Confirm the action.">
          body
        </DialogContent>
      </Dialog>,
    );
    const trigger = host.querySelector("button") as HTMLButtonElement;
    click(trigger);
    const dialog = document.querySelector("[role='dialog']");
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Confirm");
  });

  it("renders the title in the sticky header", () => {
    const host = mount(
      <Dialog defaultOpen>
        <DialogContent title="Header" description="Header description.">
          child
        </DialogContent>
      </Dialog>,
    );
    const dialog = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dialog.textContent).toContain("Header");
    expect(dialog.textContent).toContain("child");
    host.remove();
  });

  it("dismisses on Escape", () => {
    const onOpenChange = vi.fn();
    mount(
      <Dialog defaultOpen onOpenChange={onOpenChange}>
        <DialogContent title="x" description="x description">
          y
        </DialogContent>
      </Dialog>,
    );
    const dialog = document.querySelector("[role='dialog']") as HTMLElement;
    press(dialog, "Escape");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it.each([
    ["sm", 360],
    ["md", 520],
    ["lg", 760],
  ] as const)("renders width %s = %ipx", (size, expected) => {
    mount(
      <Dialog defaultOpen>
        <DialogContent title="t" description="t description" size={size}>
          body
        </DialogContent>
      </Dialog>,
    );
    const dialog = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dialog.style.width).toBe(`${expected}px`);
  });

  it("auto-links aria-describedby when description is provided", () => {
    const host = mount(
      <Dialog defaultOpen>
        <DialogContent
          title="Approve"
          description="Approving releases the change set to operators."
        >
          body
        </DialogContent>
      </Dialog>,
    );
    const dialog = document.querySelector("[role='dialog']") as HTMLElement;
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(describedBy).not.toBe("");
    const describer = document.getElementById(describedBy ?? "");
    expect(describer).not.toBeNull();
    expect(describer?.textContent).toContain(
      "Approving releases the change set to operators.",
    );
    host.remove();
  });

  it("rejects DialogContent without a description (type-level)", () => {
    // @ts-expect-error DialogContent must receive a description.
    const _missing = <DialogContent title="missing">body</DialogContent>;
    void _missing;
    expect(true).toBe(true);
  });

  it("rejects caller-supplied aria-describedby overrides (type-level)", () => {
    const _external = (
      // @ts-expect-error DialogContent must receive a description instead of a raw aria-describedby id.
      <DialogContent
        title="External"
        aria-describedby="external-dialog-description"
      >
        body
      </DialogContent>
    );
    void _external;
    expect(true).toBe(true);
  });
});
