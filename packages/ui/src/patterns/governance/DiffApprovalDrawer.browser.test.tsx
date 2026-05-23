import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import {
  DiffApprovalDrawer,
  type DiffApprovalLifecycleEvent,
  type DiffApprovalStream,
} from "./DiffApprovalDrawer";
import { click, mount } from "../../testing/browser-test-utils";

const streams: readonly DiffApprovalStream[] = [
  { key: "declaredDefault", label: "Declared default", value: "30" },
  { key: "runtimeOverride", label: "Runtime override", value: "60" },
  {
    key: "pendingProposal",
    label: "Pending proposal",
    value: "45",
    tone: "pending",
  },
  { key: "effective", label: "Effective", value: "60", tone: "drift" },
];

const lifecycle: readonly DiffApprovalLifecycleEvent[] = [
  {
    id: "ev-1",
    timestamp: "2026-05-17T08:00:00Z",
    label: "Proposed by ops@example.com",
  },
  {
    id: "ev-2",
    timestamp: "2026-05-17T09:00:00Z",
    label: "Awaiting approval",
    tone: "pending",
  },
];

describe("DiffApprovalDrawer", () => {
  it("renders the four streams + lifecycle in the lg dialog when open", () => {
    mount(
      <DiffApprovalDrawer
        open
        onOpenChange={() => undefined}
        title="identity/session.idleMinutes"
        streams={streams}
        lifecycle={lifecycle}
        onApprove={() => undefined}
      />,
    );
    const dialog = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.style.width).toBe("760px");
    expect(document.querySelectorAll("[data-stream]")).toHaveLength(4);
    expect(
      document.querySelector("[data-testid='diff-approval-lifecycle']"),
    ).not.toBeNull();
  });

  it("requires a non-empty reason before onApprove fires", () => {
    const onApprove = vi.fn();
    mount(
      <DiffApprovalDrawer
        open
        onOpenChange={() => undefined}
        title="x"
        streams={streams}
        onApprove={onApprove}
      />,
    );
    const approve = document.querySelector(
      "[data-testid='diff-approval-approve']",
    ) as HTMLButtonElement;
    expect(approve.getAttribute("aria-disabled")).toBe("true");

    const textarea = document.querySelector(
      "[data-testid='diff-approval-reason']",
    ) as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    act(() => {
      setter?.call(textarea, "rolling back");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const enabled = document.querySelector(
      "[data-testid='diff-approval-approve']",
    ) as HTMLButtonElement;
    click(enabled);
    expect(onApprove).toHaveBeenCalledWith({ reason: "rolling back" });
  });

  it("routes reject through onReject when supplied", () => {
    const onReject = vi.fn();
    mount(
      <DiffApprovalDrawer
        open
        onOpenChange={() => undefined}
        title="x"
        streams={streams}
        onApprove={() => undefined}
        onReject={onReject}
      />,
    );
    const textarea = document.querySelector(
      "[data-testid='diff-approval-reason']",
    ) as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    act(() => {
      setter?.call(textarea, "scope creep");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const reject = document.querySelector(
      "[data-testid='diff-approval-reject']",
    ) as HTMLButtonElement;
    click(reject);
    expect(onReject).toHaveBeenCalledWith({ reason: "scope creep" });
  });

  it("renders nothing in the document when closed", () => {
    mount(
      <DiffApprovalDrawer
        open={false}
        onOpenChange={() => undefined}
        title="hidden"
        streams={streams}
        onApprove={() => undefined}
      />,
    );
    expect(document.querySelector("[role='dialog']")).toBeNull();
  });
});
