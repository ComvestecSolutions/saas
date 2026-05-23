import { useEffect, useState } from "react";

/**
 * Honors the user's `prefers-reduced-motion` system setting.
 *
 * Operator Desk patterns (PulseRibbon, AlertsPulse, Workbench pane
 * transitions) must collapse animation duration to 0ms when this
 * returns `true`. SSR-safe default is `false`.
 */
export const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const handle = (event: MediaQueryListEvent) => {
      setReduced(event.matches);
    };
    query.addEventListener("change", handle);
    return () => {
      query.removeEventListener("change", handle);
    };
  }, []);

  return reduced;
};
