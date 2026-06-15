import { type ReactNode } from "react";
import { useDeviceClass, type DeviceClass } from "../../runtime/useDeviceClass";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../primitives/Tooltip/Tooltip";

/**
 * Edge Rail — icon-led vertical dock of operator-pinned resources.
 *
 * Intentionally not a navigation menu (admin-app spec): items are
 * user pins (tenants, runs, incidents, drafts, flags, configs). The
 * rail is matte canvas, not glass — it's the first depth layer
 * directly on the desk canvas.
 *
 * Responsive recomposition (admin-app spec §11 Phase 8):
 *   - desktop: 72px rail
 *   - tablet:  60px peek-only rail
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
  readonly description?: string;
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
  const railWidth = deviceClass === "tablet" ? 60 : 72;
  const itemHeight = deviceClass === "tablet" ? 44 : 56;
  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <nav
        role="navigation"
        aria-label={ariaLabel}
        data-pattern="edge-rail"
        data-device-class={deviceClass}
        style={{
          width: railWidth,
          height: "100%",
          minHeight: 0,
          background:
            "linear-gradient(180deg, color-mix(in oklab, white 2%, transparent), transparent 20%), linear-gradient(180deg, color-mix(in oklab, var(--canvas-900) 86%, transparent), var(--canvas-975))",
          borderRight: "var(--signal-seam)",
          boxShadow:
            "inset -1px 0 0 color-mix(in oklab, white 4%, transparent)",
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 8,
          padding: deviceClass === "tablet" ? "8px 6px 10px" : "10px 8px 12px",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            fontFamily: "var(--font-condensed)",
            fontSize: deviceClass === "tablet" ? "0.6rem" : "0.66rem",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--fg-muted)",
            textAlign: "center",
            paddingBottom: 4,
          }}
        >
          Desk
        </div>
        <div
          data-testid="edge-rail-items"
          style={{
            display: "grid",
            gap: 6,
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            paddingRight: 2,
            alignContent: "start",
          }}
        >
          {items.map((item) => (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-pin={item.id}
                  aria-current={item.current === true ? "true" : undefined}
                  aria-label={item.label}
                  onClick={() => onActivate?.(item)}
                  style={{
                    position: "relative",
                    display: "grid",
                    placeItems: "center",
                    height: itemHeight,
                    background:
                      item.current === true
                        ? "linear-gradient(180deg, color-mix(in oklab, white 9%, transparent), transparent), color-mix(in oklab, var(--canvas-825) 84%, transparent)"
                        : "linear-gradient(180deg, color-mix(in oklab, white 2%, transparent), transparent), transparent",
                    border:
                      item.current === true
                        ? "1px solid color-mix(in oklab, white 14%, transparent)"
                        : "1px solid color-mix(in oklab, white 4%, transparent)",
                    borderRadius: 16,
                    color:
                      item.current === true
                        ? "var(--fg-elevated)"
                        : "var(--fg-secondary)",
                    cursor: onActivate === undefined ? "default" : "pointer",
                    boxShadow:
                      item.current === true
                        ? "0 18px 32px -26px rgb(0 0 0 / 0.92)"
                        : "none",
                    transition:
                      "transform 140ms ease, border-color 140ms ease, color 140ms ease, background 140ms ease",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 10,
                      bottom: 10,
                      width: 3,
                      borderRadius: 999,
                      background:
                        item.current === true
                          ? "linear-gradient(180deg, var(--signal-accent), color-mix(in oklab, var(--signal-accent) 22%, transparent))"
                          : "transparent",
                    }}
                  />
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: deviceClass === "tablet" ? 24 : 28,
                      height: deviceClass === "tablet" ? 24 : 28,
                      borderRadius: 10,
                      background:
                        item.current === true
                          ? "color-mix(in oklab, var(--signal-accent) 16%, transparent)"
                          : "color-mix(in oklab, white 3%, transparent)",
                      color:
                        item.current === true
                          ? "var(--fg-elevated)"
                          : "var(--fg-secondary)",
                    }}
                  >
                    {item.icon ?? item.label.charAt(0)}
                  </span>
                  {item.badge !== undefined ? (
                    <span
                      data-testid={`rail-badge-${item.id}`}
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        minWidth: 16,
                        height: 16,
                        paddingInline: 4,
                        borderRadius: 999,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.62rem",
                        color: "var(--fg-elevated)",
                        background:
                          "color-mix(in oklab, var(--signal-accent) 22%, var(--canvas-800))",
                        border:
                          "1px solid color-mix(in oklab, white 10%, transparent)",
                      }}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" align="center">
                <div style={{ display: "grid", gap: 4, maxWidth: 220 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-condensed)",
                      fontSize: "0.76rem",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--fg-elevated)",
                    }}
                  >
                    {item.label}
                  </span>
                  {item.description !== undefined ? (
                    <span
                      style={{
                        fontSize: "0.74rem",
                        lineHeight: 1.4,
                        color: "var(--fg-muted)",
                      }}
                    >
                      {item.description}
                    </span>
                  ) : null}
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </nav>
    </TooltipProvider>
  );
}
