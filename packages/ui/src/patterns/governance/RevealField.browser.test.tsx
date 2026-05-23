import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { RevealField } from "./RevealField";
import { click, mount } from "../../testing/browser-test-utils";

describe("RevealField", () => {
  it("renders the redacted stripe by default", () => {
    const host = mount(
      <RevealField
        label="API key"
        value="sk_live_abcdef"
        revealed={false}
        onReveal={() => undefined}
        onHide={() => undefined}
      />,
    );
    expect(
      host.querySelector("[data-testid='reveal-field-redaction']"),
    ).not.toBeNull();
    expect(host.querySelector("[data-testid='reveal-field-value']")).toBeNull();
  });

  it("renders the value and a Hide button when revealed", () => {
    const onHide = vi.fn();
    const host = mount(
      <RevealField
        label="API key"
        value="sk_live_abcdef"
        revealed
        onReveal={() => undefined}
        onHide={onHide}
      />,
    );
    expect(
      host.querySelector("[data-testid='reveal-field-value']")?.textContent,
    ).toBe("sk_live_abcdef");
    const hide = host.querySelector(
      "[data-testid='reveal-field-hide']",
    ) as HTMLButtonElement;
    click(hide);
    expect(onHide).toHaveBeenCalled();
  });

  it("requires a non-empty reason before calling onReveal and onAuditEcho", () => {
    const onReveal = vi.fn();
    const onAuditEcho = vi.fn();
    const host = mount(
      <RevealField
        label="API key"
        value="sk_live_abcdef"
        revealed={false}
        onReveal={onReveal}
        onHide={() => undefined}
        onAuditEcho={onAuditEcho}
        correlationId="corr-9"
      />,
    );
    const trigger = host.querySelector(
      "[data-testid='reveal-field-trigger']",
    ) as HTMLButtonElement;
    click(trigger);
    const confirm = document.querySelector(
      "[data-testid='reveal-field-confirm']",
    ) as HTMLButtonElement;
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    const textarea = document.querySelector(
      "[data-testid='reveal-field-reason']",
    ) as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    act(() => {
      setter?.call(textarea, "support escalation #42");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const confirmReady = document.querySelector(
      "[data-testid='reveal-field-confirm']",
    ) as HTMLButtonElement;
    click(confirmReady);
    expect(onReveal).toHaveBeenCalledWith({
      reason: "support escalation #42",
    });
    expect(onAuditEcho).toHaveBeenCalledWith({
      reason: "support escalation #42",
      correlationId: "corr-9",
    });
  });

  it("dismisses without calling onReveal when Cancel is clicked", () => {
    const onReveal = vi.fn();
    const host = mount(
      <RevealField
        label="API key"
        value="sk_live_abcdef"
        revealed={false}
        onReveal={onReveal}
        onHide={() => undefined}
      />,
    );
    const trigger = host.querySelector(
      "[data-testid='reveal-field-trigger']",
    ) as HTMLButtonElement;
    click(trigger);
    const cancel = document.querySelector(
      "[data-testid='reveal-field-cancel']",
    ) as HTMLButtonElement;
    click(cancel);
    expect(onReveal).not.toHaveBeenCalled();
  });
});
