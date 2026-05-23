/**
 * Shared browser-test helpers for `packages/ui` primitives.
 *
 * Mirrors the admin-app browser-test pattern: each suite mounts a
 * fresh container, the runtime is the Playwright-backed vitest
 * browser environment, and React 19 is run in act-environment mode.
 */
import { createRoot, type Root } from "react-dom/client";
import { act, type ReactNode } from "react";
import { afterEach } from "vitest";

type ReactActGlobals = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
(globalThis as ReactActGlobals).IS_REACT_ACT_ENVIRONMENT = true;

interface MountedEntry {
  readonly root: Root;
  readonly host: HTMLElement;
}

const mountedRoots = new Set<MountedEntry>();

export const mount = (node: ReactNode): HTMLElement => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  mountedRoots.add({ root, host });
  return host;
};

export const rerender = (host: HTMLElement, node: ReactNode): void => {
  for (const entry of mountedRoots) {
    if (entry.host === host) {
      act(() => {
        entry.root.render(node);
      });
      return;
    }
  }
  throw new Error("rerender called against an unmounted host");
};

afterEach(() => {
  for (const { root, host } of mountedRoots) {
    act(() => {
      root.unmount();
    });
    host.remove();
  }
  mountedRoots.clear();
});

export const press = (
  element: Element,
  key: string,
  init: KeyboardEventInit = {},
): void => {
  act(() => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, ...init }),
    );
    element.dispatchEvent(
      new KeyboardEvent("keyup", { key, bubbles: true, ...init }),
    );
  });
};

export const click = (element: Element): void => {
  act(() => {
    (element as HTMLElement).click();
  });
};
