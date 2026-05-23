import { type CSSProperties, type ReactNode } from "react";
import { glassSurface } from "../../utils/glass";
import { useDeviceClass, type DeviceClass } from "../../runtime/useDeviceClass";

/**
 * Pulse Ribbon — 32px top strip. Glass surface. Hosts per-domain
 * live posture segments. Each segment is colour-coded (tone) and
 * may report a count plus a peek hint. Clicking a segment pins the
 * matching resource into the workbench (handled by `onSelect`).
 *
 * Responsive recomposition (admin-app spec §11 Phase 8): on mobile
 * the row becomes a horizontal carousel with scroll-snap so each
 * segment becomes a swipeable card, preserving the same data shape.
 */
export type PulseTone = "nominal" | "pending" | "drift" | "error";

export type PulseSegment = {
  readonly id: string;
  readonly label: string;
  readonly tone: PulseTone;
  readonly count?: number;
  readonly hint?: ReactNode;
};

export type PulseRibbonProps = {
  readonly segments: readonly PulseSegment[];
  readonly onSelect?: (segment: PulseSegment) => void;
  readonly ariaLabel?: string;
  readonly deviceClass?: DeviceClass;
};

const toneVar: Record<PulseTone, string> = {
  nominal: "var(--status-active-fg)",
  pending: "var(--status-pending-fg)",
  drift: "var(--status-drift-fg)",
  error: "var(--status-error-fg)",
};

const toneBg: Record<PulseTone, string> = {
  nominal: "var(--status-active-bg)",
  pending: "var(--status-pending-bg)",
  drift: "var(--status-drift-bg)",
  error: "var(--status-error-bg)",
};

export function PulseRibbon({
  segments,
  onSelect,
  ariaLabel = "Live posture pulse",
  deviceClass: deviceClassProp,
}: PulseRibbonProps) {
  const surface = glassSurface({ radius: "primitive" });
  const resolvedDeviceClass = useDeviceClass();
  const deviceClass = deviceClassProp ?? resolvedDeviceClass;
  const isMobile = deviceClass === "mobile";

  const containerStyle: CSSProperties = isMobile
    ? {
        ...surface.style,
        height: 32,
        display: "flex",
        alignItems: "stretch",
        gap: 4,
        padding: 2,
        borderRadius: 0,
        overflowX: "auto",
        scrollSnapType: "x mandatory",
        WebkitOverflowScrolling: "touch",
        borderBottom: "var(--signal-seam)",
      }
    : {
        ...surface.style,
        height: 32,
        display: "flex",
        alignItems: "stretch",
        gap: 2,
        padding: 2,
        borderRadius: 0,
        borderBottom: "var(--signal-seam)",
      };

  const segmentBaseStyle: CSSProperties = isMobile
    ? {
        flex: "0 0 60%",
        scrollSnapAlign: "start",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        paddingInline: 8,
        background:
          "linear-gradient(180deg, color-mix(in oklab, white 4%, transparent), transparent), color-mix(in oklab, var(--canvas-850) 68%, transparent)",
        border: "1px solid color-mix(in oklab, white 8%, transparent)",
        borderRadius: 8,
        fontSize: "0.8125rem",
        fontWeight: 600,
        cursor: onSelect === undefined ? "default" : "pointer",
      }
    : {
        flex: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 4,
        paddingInline: 6,
        background:
          "linear-gradient(180deg, color-mix(in oklab, white 4%, transparent), transparent), color-mix(in oklab, var(--canvas-850) 68%, transparent)",
        border: "1px solid color-mix(in oklab, white 8%, transparent)",
        borderRadius: 8,
        fontSize: "0.75rem",
        fontWeight: 600,
        cursor: onSelect === undefined ? "default" : "pointer",
      };

  return (
    <div
      role={isMobile ? "region" : "region"}
      aria-label={ariaLabel}
      data-pattern="pulse-ribbon"
      data-device-class={deviceClass}
      data-variant={isMobile ? "carousel" : "ribbon"}
      className={surface.className}
      style={containerStyle}
    >
      {segments.map((segment) => (
        <div
          key={segment.id}
          role={onSelect === undefined ? undefined : "button"}
          tabIndex={onSelect === undefined ? undefined : 0}
          data-segment={segment.id}
          data-tone={segment.tone}
          onClick={() => onSelect?.(segment)}
          onKeyDown={(event) => {
            if (onSelect === undefined) {
              return;
            }
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(segment);
            }
          }}
          aria-label={[
            segment.label,
            segment.count === undefined ? undefined : `${segment.count} items`,
            typeof segment.hint === "string" ? segment.hint : undefined,
          ]
            .filter((value) => value !== undefined)
            .join(" · ")}
          title={typeof segment.hint === "string" ? segment.hint : undefined}
          style={{
            ...segmentBaseStyle,
            color: "var(--fg-elevated)",
            boxShadow:
              segment.tone === "nominal"
                ? "none"
                : `inset 0 0 0 1px ${toneVar[segment.tone]}`,
            outline: "none",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              minWidth: 0,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: toneVar[segment.tone],
                boxShadow: `0 0 0 3px ${toneBg[segment.tone]}`,
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-condensed)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontSize: isMobile ? "0.7rem" : "0.68rem",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {segment.label}
            </span>
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              color: toneVar[segment.tone],
              fontSize: "0.7rem",
            }}
          >
            {segment.count !== undefined ? (
              <>
                <span
                  aria-hidden="true"
                  title={`${segment.count} items`}
                  style={{
                    width: isMobile ? 10 : 12,
                    height: 10,
                    borderRadius: 999,
                    border: `1px solid ${toneVar[segment.tone]}`,
                    background:
                      "linear-gradient(180deg, color-mix(in oklab, white 10%, transparent), transparent), transparent",
                    boxShadow: `inset 0 0 0 ${Math.min(segment.count, 3)}px color-mix(in oklab, ${toneVar[segment.tone]} 30%, transparent)`,
                  }}
                />
                <span
                  aria-hidden="true"
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "0.04em",
                    lineHeight: 1,
                  }}
                >
                  {segment.count}
                </span>
              </>
            ) : null}
            {segment.hint !== undefined ? (
              <span
                style={{
                  color: "var(--fg-muted)",
                  maxWidth: isMobile ? 80 : 120,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {segment.hint}
              </span>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}
