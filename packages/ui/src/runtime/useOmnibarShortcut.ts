import { useEffect } from "react";

/**
 * Global keyboard shortcut that opens the Operator Desk omnibar.
 *
 * Defaults to `Ctrl/Cmd + K` (the operator-desk binding). When the
 * shortcut fires, the supplied `onTrigger` callback runs and the
 * default browser behaviour (find-in-page on some platforms) is
 * cancelled. Honours the user's focused element only when it is an
 * input/textarea/contenteditable surface — the omnibar is global by
 * design.
 */
export type OmnibarShortcut = {
  readonly key: string;
  readonly metaOrCtrl: boolean;
};

export const defaultOmnibarShortcut: OmnibarShortcut = {
  key: "k",
  metaOrCtrl: true,
};

export const useOmnibarShortcut = (
  onTrigger: () => void,
  shortcut: OmnibarShortcut = defaultOmnibarShortcut,
): void => {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handle = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return;
      if (shortcut.metaOrCtrl && !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      onTrigger();
    };
    window.addEventListener("keydown", handle);
    return () => {
      window.removeEventListener("keydown", handle);
    };
  }, [onTrigger, shortcut.key, shortcut.metaOrCtrl]);
};
