import { describe, expect, it, vi } from "vitest";
import { Sheet, SheetContent } from "./Sheet";
import { mount, press } from "../../testing/browser-test-utils";

describe("Sheet", () => {
  it("renders nothing when closed", () => {
    mount(
      <Sheet>
        <SheetContent title="t" description="Sheet description.">
          inside
        </SheetContent>
      </Sheet>,
    );
    expect(document.querySelector("[role='dialog']")).toBeNull();
  });

  it("renders content with role=dialog and the configured title when defaultOpen", () => {
    mount(
      <Sheet defaultOpen>
        <SheetContent
          title="Filters"
          description="Filter configuration for the current view."
          side="right"
        >
          inside
        </SheetContent>
      </Sheet>,
    );
    const dialog = document.querySelector("[role='dialog']");
    expect(dialog?.textContent).toContain("Filters");
    expect(dialog?.textContent).toContain("inside");
  });

  it("closes on Escape", () => {
    const onOpenChange = vi.fn();
    mount(
      <Sheet defaultOpen onOpenChange={onOpenChange}>
        <SheetContent title="t" description="Sheet description." side="bottom">
          inside
        </SheetContent>
      </Sheet>,
    );
    const dialog = document.querySelector("[role='dialog']") as HTMLElement;
    press(dialog, "Escape");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it.each(["left", "right", "bottom"] as const)(
    "positions the sheet for side=%s",
    (side) => {
      mount(
        <Sheet defaultOpen>
          <SheetContent
            title="t"
            description={`Sheet positioned on the ${side} side.`}
            side={side}
          >
            inside
          </SheetContent>
        </Sheet>,
      );
      const dialog = document.querySelector(
        "[role='dialog']",
      ) as HTMLElement | null;
      expect(dialog).not.toBeNull();
      if (side === "left") {
        expect(dialog!.style.left).toBe("0px");
        expect(dialog!.style.right).toBe("");
      } else if (side === "right") {
        expect(dialog!.style.right).toBe("0px");
        expect(dialog!.style.left).toBe("");
      } else {
        expect(dialog!.style.bottom).toBe("0px");
        expect(dialog!.style.left).toBe("0px");
        expect(dialog!.style.right).toBe("0px");
      }
    },
  );

  it("rejects SheetContent without a description (type-level)", () => {
    // @ts-expect-error SheetContent must receive a description.
    const _missing = <SheetContent title="t">inside</SheetContent>;
    void _missing;
    expect(true).toBe(true);
  });
});
