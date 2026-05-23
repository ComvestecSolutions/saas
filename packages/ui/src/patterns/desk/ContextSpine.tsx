import { useState, type ReactNode } from "react";
import { glassSurface } from "../../utils/glass";
import { useDeviceClass, type DeviceClass } from "../../runtime/useDeviceClass";

/**
 * Context Spine — 320px right surface (collapses to 56px).
 *
 * Hosts read-only operator context: current actor, environment,
 * tenant, correlation id, capability set, audit echo, vendor card.
 * Collapsible to a 56px summary rail; on tablet defaults to 56px;
 * on mobile this surface yields entirely and the consuming app summons
 * the same content inside a `Drawer` from the command strip (admin-app
 * spec §11 Phase 8 rule "Right Context Spine → collapses to Drawer").
 *
 * Spine is glass; nested children must not be glass.
 */
export type ContextSpineProps = {
  readonly children: ReactNode;
  readonly defaultCollapsed?: boolean;
  readonly ariaLabel?: string;
  readonly deviceClass?: DeviceClass;
};

export function ContextSpine({
  children,
  defaultCollapsed = false,
  ariaLabel = "Operator context",
  deviceClass: deviceClassProp,
}: ContextSpineProps) {
  const resolvedDeviceClass = useDeviceClass();
  const deviceClass = deviceClassProp ?? resolvedDeviceClass;
  const initialCollapsed = defaultCollapsed || deviceClass === "tablet";
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const surface = glassSurface({ radius: "pane" });
  if (deviceClass === "mobile") return null;
  return (
    <aside
      role="complementary"
      aria-label={ariaLabel}
      aria-expanded={collapsed ? "false" : "true"}
      data-pattern="context-spine"
      data-device-class={deviceClass}
      data-collapsed={collapsed ? "true" : "false"}
      className={surface.className}
      style={{
        ...surface.style,
        width: collapsed ? 56 : 320,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        transition: "width 120ms ease",
        borderLeft: "var(--signal-seam)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          padding: 8,
          borderBottom: "var(--signal-seam)",
        }}
      >
        {collapsed ? null : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span
              style={{
                fontFamily: "var(--font-condensed)",
                fontSize: "0.68rem",
                color: "var(--fg-muted)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Context Spine
            </span>
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--fg-secondary)",
              }}
            >
              Operator state · live session
            </span>
          </div>
        )}
        <button
          type="button"
          data-spine-toggle
          aria-label={
            collapsed ? "Expand context spine" : "Collapse context spine"
          }
          onClick={() => setCollapsed((value) => !value)}
          style={{
            background:
              "linear-gradient(180deg, color-mix(in oklab, white 5%, transparent), transparent), color-mix(in oklab, var(--canvas-850) 68%, transparent)",
            border: "1px solid color-mix(in oklab, white 8%, transparent)",
            color: "var(--fg-secondary)",
            cursor: "pointer",
            padding: 4,
            borderRadius: 8,
            width: 28,
            height: 28,
          }}
        >
          {collapsed ? "‹" : "›"}
        </button>
      </header>
      {collapsed ? null : (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            padding: 6,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {children}
        </div>
      )}
    </aside>
  );
}
