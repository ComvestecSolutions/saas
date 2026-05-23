import { type ReactNode } from "react";
import { useDeviceClass, type DeviceClass } from "../../runtime/useDeviceClass";

/**
 * Edge Rail — 56px-wide vertical dock of operator-pinned resources.
 *
 * Intentionally not a navigation menu (admin-app spec): items are
 * user pins (tenants, runs, incidents, drafts, flags, configs). The
 * rail is matte canvas, not glass — it's the first depth layer
 * directly on the desk canvas.
 *
 * Responsive recomposition (admin-app spec §11 Phase 8):
 *   - desktop: 56px-wide rail
 *   - tablet:  48px peek-only rail
 *   - mobile:  hidden in this surface; the consuming app summons the
 *              same item list inside a `Sheet` from the command strip
 *              ("Left Edge Rail → collapses into Sheet").
 *
 * When the device class is `mobile` this component renders nothing
 * (returns `null`); the consumer is responsible for the Sheet binding
 * because the trigger location is shell-owned, not pattern-owned.
 */
export type EdgeRailItem = {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly badge?: ReactNode;
  readonly current?: boolean;
};

export type EdgeRailProps = {
  readonly items: readonly EdgeRailItem[];
  readonly onActivate?: (item: EdgeRailItem) => void;
  readonly ariaLabel?: string;
  readonly deviceClass?: DeviceClass;
};

export function EdgeRail({
  items,
  onActivate,
  ariaLabel = "Pinned resources",
  deviceClass: deviceClassProp,
}: EdgeRailProps) {
  const resolvedDeviceClass = useDeviceClass();
  const deviceClass = deviceClassProp ?? resolvedDeviceClass;
  if (deviceClass === "mobile") return null;
  const railWidth = deviceClass === "tablet" ? 48 : 56;
  const itemHeight = deviceClass === "tablet" ? 40 : 48;
  return (
    <nav
      role="navigation"
      aria-label={ariaLabel}
      data-pattern="edge-rail"
      data-device-class={deviceClass}
      style={{
        width: railWidth,
        background:
          "linear-gradient(180deg, color-mix(in oklab, white 2%, transparent), transparent 16%), linear-gradient(180deg, var(--canvas-900), var(--canvas-975))",
        borderRight: "var(--signal-seam)",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 4,
        padding: 4,
      }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          data-pin={item.id}
          aria-current={item.current === true ? "true" : undefined}
          onClick={() => onActivate?.(item)}
          title={item.label}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
            height: itemHeight,
            background:
              item.current === true
                ? "linear-gradient(180deg, color-mix(in oklab, white 7%, transparent), color-mix(in oklab, white 1%, transparent)), color-mix(in oklab, var(--canvas-825) 82%, transparent)"
                : "linear-gradient(180deg, color-mix(in oklab, white 2%, transparent), transparent), transparent",
            border:
              item.current === true
                ? "1px solid color-mix(in oklab, white 12%, transparent)"
                : "1px solid transparent",
            borderRadius: 10,
            color:
              item.current === true
                ? "var(--fg-elevated)"
                : "var(--fg-secondary)",
            cursor: onActivate === undefined ? "default" : "pointer",
            fontSize: "0.625rem",
            boxShadow:
              item.current === true
                ? "0 12px 22px -18px rgb(0 0 0 / 0.85)"
                : "none",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: deviceClass === "tablet" ? "0.82rem" : "0.9rem",
              lineHeight: 1,
            }}
          >
            {item.icon ?? item.label.slice(0, 2)}
          </span>
          <span
            style={{
              fontFamily: "var(--font-condensed)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color:
                item.current === true ? "var(--fg-default)" : "var(--fg-muted)",
            }}
          >
            {item.label.slice(0, deviceClass === "tablet" ? 1 : 3)}
          </span>
          {item.badge !== undefined ? (
            <span data-testid={`rail-badge-${item.id}`}>{item.badge}</span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}
