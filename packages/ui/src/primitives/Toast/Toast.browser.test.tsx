import { describe, expect, it } from "vitest";
import { Toast, ToastProvider, ToastViewport } from "./Toast";
import { mount, rerender } from "../../testing/browser-test-utils";

describe("Toast", () => {
  it("renders the viewport in the announce live-region role", () => {
    mount(
      <ToastProvider>
        <ToastViewport />
      </ToastProvider>,
    );
    const viewport = document.querySelector("[role='region']");
    expect(viewport).not.toBeNull();
  });

  it("renders an open toast with the requested variant data-attr", () => {
    mount(
      <ToastProvider>
        <Toast open variant="success" title="Saved">
          ok
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );
    const node = document.querySelector("[data-variant='success']");
    expect(node).not.toBeNull();
    expect(node?.textContent).toContain("Saved");
  });

  it("renders the error variant with the error-status foreground token", () => {
    mount(
      <ToastProvider>
        <Toast open variant="error" title="Broken">
          x
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );
    const node = document.querySelector(
      "[data-variant='error']",
    ) as HTMLElement;
    expect(node.style.color).toContain("var(--status-error-fg)");
  });

  it("respects the controlled open prop across re-renders", () => {
    const tree = (open: boolean) => (
      <ToastProvider>
        <Toast open={open} variant="success" title="Saved">
          ok
        </Toast>
        <ToastViewport />
      </ToastProvider>
    );
    const host = mount(tree(false));
    expect(document.querySelector("[data-variant='success']")).toBeNull();
    rerender(host, tree(true));
    expect(document.querySelector("[data-variant='success']")).not.toBeNull();
    rerender(host, tree(false));
    expect(document.querySelector("[data-variant='success']")).toBeNull();
  });

  it.todo("auto-dismiss after duration");
  it.todo("Escape dismisses focused toast");
});
