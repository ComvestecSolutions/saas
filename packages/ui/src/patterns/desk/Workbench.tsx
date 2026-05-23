import { type ReactNode } from "react";
import { useDeviceClass, type DeviceClass } from "../../runtime/useDeviceClass";

/**
 * Workbench — center surface that hosts 1–4 resource panes.
 *
 * Layout is URL-driven through `useUrlPanes` (`runtime/useUrlPanes`).
 * The Workbench itself is layout-only: it does not own pane content,
 * it owns pane composition (1–4 columns on desktop/tablet; stacked
 * single-pane on mobile per admin-app spec §11 Phase 8 rule "Center
 * Workbench → stacks at single-pane").
 *
 * Spacing between adjacent panes is 4px (sum of paddings/margins
 * between adjacent surfaces ≤ 10px per spec rule 13).
 */
export type WorkbenchProps = {
  readonly children: ReactNode;
  readonly ariaLabel?: string;
  readonly deviceClass?: DeviceClass;
};

/**
 * Re-export the URL-encoding helpers so callers wiring loader-side
 * pane state import the same parser/serializer the Workbench itself
 * uses. Keeps callers honest about the canonical grammar.
 */
export {
  parsePanesParam,
  serializePanesParam,
} from "../../runtime/useUrlPanes";
export type {
  WorkbenchPaneDescriptor,
  PanesRouterAdapter,
  UseUrlPanesResult,
} from "../../runtime/useUrlPanes";

export function Workbench({
  children,
  ariaLabel = "Workbench",
  deviceClass: deviceClassProp,
}: WorkbenchProps) {
  const resolvedDeviceClass = useDeviceClass();
  const deviceClass = deviceClassProp ?? resolvedDeviceClass;
  const stackAsRows = deviceClass === "mobile";
  return (
    <main
      role="main"
      aria-label={ariaLabel}
      data-pattern="workbench"
      data-device-class={deviceClass}
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: "grid",
        gridAutoFlow: stackAsRows ? "row" : "column",
        gridAutoColumns: stackAsRows ? undefined : "minmax(0, 1fr)",
        gridAutoRows: stackAsRows ? "min-content" : undefined,
        gap: 6,
        padding: 6,
        background:
          "linear-gradient(180deg, color-mix(in oklab, white 1.5%, transparent), transparent), linear-gradient(180deg, var(--canvas-900), var(--canvas-975))",
        overflowY: stackAsRows ? "auto" : "hidden",
      }}
    >
      {children}
    </main>
  );
}
