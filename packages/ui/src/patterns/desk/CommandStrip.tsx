import { type CSSProperties, type ReactNode } from "react";
import { glassSurface } from "../../utils/glass";
import { useDeviceClass, type DeviceClass } from "../../runtime/useDeviceClass";

/**
 * Command Strip — 48px bottom liquid-glass strip.
 *
 * Composition slots (left → right):
 *   - omnibar (federated search; scoped prefixes t/ f/ c/ u/ inv/ d/ kc/ ev/)
 *   - workspaceTabs
 *   - alertsPulse
 *   - runAsBanner (optional; only visible while a session-bound
 *     break-glass grant is active)
 *
 * Responsive recomposition (admin-app spec §11 Phase 8 rule "Bottom
 * Command Strip → sticky reduced-density omnibar"):
 *   - desktop / tablet: full 48px strip with all four slots
 *   - mobile: 48px sticky-bottom strip; workspace tabs and alerts
 *             pulse are demoted (workspace tabs collapse into the
 *             omnibar prefix grammar; alerts pulse + run-as banner
 *             still render after the omnibar but the strip stays
 *             reduced-density via 4px gap and a single-row layout).
 */
export type CommandStripProps = {
  readonly omnibar?: ReactNode;
  readonly workspaceTabs?: ReactNode;
  readonly alertsPulse?: ReactNode;
  readonly runAsBanner?: ReactNode;
  readonly ariaLabel?: string;
  readonly deviceClass?: DeviceClass;
};

export function CommandStrip({
  omnibar,
  workspaceTabs,
  alertsPulse,
  runAsBanner,
  ariaLabel = "Operator command strip",
  deviceClass: deviceClassProp,
}: CommandStripProps) {
  const surface = glassSurface({ radius: "primitive" });
  const resolvedDeviceClass = useDeviceClass();
  const deviceClass = deviceClassProp ?? resolvedDeviceClass;
  const isMobile = deviceClass === "mobile";

  const stripStyle: CSSProperties = {
    ...surface.style,
    height: 48,
    display: "flex",
    alignItems: "center",
    gap: isMobile ? 4 : 6,
    padding: 4,
    borderRadius: 0,
    position: isMobile ? "sticky" : "static",
    bottom: isMobile ? 0 : undefined,
    zIndex: isMobile ? 10 : undefined,
    borderTop: "var(--signal-seam)",
  };

  return (
    <footer
      role="contentinfo"
      aria-label={ariaLabel}
      data-pattern="command-strip"
      data-device-class={deviceClass}
      data-variant={isMobile ? "reduced-density" : "full"}
      className={surface.className}
      style={stripStyle}
    >
      <div
        style={{
          flex: isMobile ? 1 : "0 0 auto",
          minWidth: 0,
        }}
        data-slot="omnibar"
      >
        {omnibar}
      </div>
      {isMobile ? null : (
        <div
          style={{ flex: 1, minWidth: 0, overflow: "hidden" }}
          data-slot="workspace-tabs"
        >
          {workspaceTabs}
        </div>
      )}
      <div style={{ flex: "0 0 auto" }} data-slot="alerts-pulse">
        {alertsPulse}
      </div>
      <div style={{ flex: "0 0 auto" }} data-slot="run-as-banner">
        {runAsBanner}
      </div>
    </footer>
  );
}
