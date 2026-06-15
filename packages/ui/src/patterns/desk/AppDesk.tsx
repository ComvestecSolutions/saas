import { type CSSProperties, type ReactNode } from "react";
import { useDeviceClass, type DeviceClass } from "../../runtime/useDeviceClass";

/**
 * AppDesk — the Operator Desk shell root.
 *
 * Composes the five surfaces (admin-app spec §Shell, ADR-022, §11
 * Phase 8 responsive hardening):
 *   - PulseRibbon  (top, 32px)
 *   - EdgeRail     (left, 72px; mobile: hidden, summoned via Sheet)
 *   - Workbench    (center; mobile: stacks single-pane)
 *   - ContextSpine (right, 320 / 56px; mobile: hidden, summoned via Drawer)
 *   - CommandStrip (bottom, 48px; mobile: reduced-density sticky omnibar)
 *
 * Layout is a CSS grid. The shell reads `useDeviceClass()` internally
 * by default and recomposes the grid template at three breakpoints:
 *
 *   desktop  → 72px rail | work | auto spine
 *   tablet   → 60px rail | work | auto spine
 *   mobile   → work only; rail + spine become summon-on-demand surfaces
 *              owned by the consuming app
 *
 * Consumers can override the resolved device class via `deviceClass`
 * for snapshot tests and SSR. Every slot is opaque `ReactNode` so the
 * consuming app retains full control of pane content.
 *
 * Spacing rule: this layout uses 0px between adjacent surfaces — the
 * 4–8px inner rhythm lives in each child (spec §12).
 */
export type AppDeskProps = {
  readonly pulseRibbon: ReactNode;
  readonly edgeRail: ReactNode;
  readonly workbench: ReactNode;
  readonly contextSpine: ReactNode;
  readonly commandStrip: ReactNode;
  readonly ariaLabel?: string;
  readonly deviceClass?: DeviceClass;
};

type GridTemplates = {
  readonly rows: string;
  readonly columns: string;
  readonly areas: string;
};

const deviceTemplates: Record<DeviceClass, GridTemplates> = {
  desktop: {
    rows: "32px 1fr 48px",
    columns: "72px 1fr auto",
    areas: `
      "pulse pulse pulse"
      "rail  work  spine"
      "strip strip strip"
    `,
  },
  tablet: {
    rows: "32px 1fr 48px",
    columns: "60px 1fr auto",
    areas: `
      "pulse pulse pulse"
      "rail  work  spine"
      "strip strip strip"
    `,
  },
  mobile: {
    rows: "32px 1fr 48px",
    columns: "1fr",
    areas: `
      "pulse"
      "work"
      "strip"
    `,
  },
};

export function AppDesk({
  pulseRibbon,
  edgeRail,
  workbench,
  contextSpine,
  commandStrip,
  ariaLabel = "Operator Desk",
  deviceClass: deviceClassProp,
}: AppDeskProps) {
  const resolvedDeviceClass = useDeviceClass();
  const deviceClass = deviceClassProp ?? resolvedDeviceClass;
  const template = deviceTemplates[deviceClass];
  const isMobile = deviceClass === "mobile";

  const gridStyle: CSSProperties = {
    display: "grid",
    gridTemplateRows: template.rows,
    gridTemplateColumns: template.columns,
    gridTemplateAreas: template.areas,
    width: "100%",
    minWidth: 0,
    minHeight: "100dvh",
    height: "100dvh",
    background:
      "radial-gradient(980px 620px at 0% -12%, color-mix(in oklab, #6f6a2f 11%, transparent), transparent 60%), radial-gradient(1160px 720px at 100% 0%, color-mix(in oklab, #1f6d78 14%, transparent), transparent 62%), radial-gradient(640px 420px at 52% 120%, color-mix(in oklab, #143b66 18%, transparent), transparent 70%), linear-gradient(180deg, var(--canvas-900), var(--canvas-975))",
    color: "var(--fg-default)",
    position: "relative",
    overflow: "hidden",
    isolation: "isolate",
  };

  return (
    <div
      role="application"
      aria-label={ariaLabel}
      data-pattern="app-desk"
      data-device-class={deviceClass}
      style={gridStyle}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--signal-grid)",
          backgroundSize: "var(--signal-grid-size)",
          opacity: 0.24,
          pointerEvents: "none",
        }}
      />
      <div style={{ gridArea: "pulse", minWidth: 0 }}>{pulseRibbon}</div>
      {isMobile ? null : (
        <div
          style={{
            gridArea: "rail",
            minHeight: 0,
            minWidth: 0,
            display: "flex",
          }}
        >
          {edgeRail}
        </div>
      )}
      <div
        style={{
          gridArea: "work",
          minWidth: 0,
          minHeight: 0,
          display: "flex",
        }}
      >
        {workbench}
      </div>
      {isMobile ? null : (
        <div
          style={{
            gridArea: "spine",
            minHeight: 0,
            minWidth: 0,
            display: "flex",
          }}
        >
          {contextSpine}
        </div>
      )}
      <div style={{ gridArea: "strip", minWidth: 0 }}>{commandStrip}</div>
    </div>
  );
}
