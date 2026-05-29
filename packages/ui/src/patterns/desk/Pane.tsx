import { type ReactNode, useId } from "react";
import { glassSurface } from "../../utils/glass";

/**
 * Pane — a single workbench resource view.
 *
 * Glass surface. Visual depth is two layers only (matte canvas +
 * glass); panes never nest inside another glass surface. Pane outer
 * padding must stay ≤ 10px (spec rule 13); inner content uses its
 * own 4–8px rhythm.
 */
export type PaneProps = {
  readonly title: ReactNode;
  readonly toolbar?: ReactNode;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
  readonly ariaLabel?: string;
  readonly onClose?: () => void;
  readonly scrollRegionFocusable?: boolean;
};

export function Pane({
  title,
  toolbar,
  footer,
  children,
  ariaLabel,
  onClose,
  scrollRegionFocusable = false,
}: PaneProps) {
  const surface = glassSurface({ radius: "pane" });
  const titleId = useId();
  const scrollRegionAccessibilityProps = scrollRegionFocusable
    ? ariaLabel !== undefined
      ? {
          tabIndex: 0,
          "aria-label": ariaLabel,
        }
      : {
          tabIndex: 0,
          "aria-labelledby": titleId,
        }
    : {};
  return (
    <section
      role="region"
      aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
      data-pattern="pane"
      className={surface.className}
      style={{
        ...surface.style,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        minWidth: 0,
        padding: 4,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          padding: "6px 8px",
          borderBottom: "var(--signal-seam)",
        }}
      >
        <h2
          id={titleId}
          style={{
            margin: 0,
            fontFamily: "var(--font-condensed)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontSize: "0.7rem",
            fontWeight: 600,
            color: "var(--fg-secondary)",
          }}
        >
          {title}
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {toolbar}
          {onClose !== undefined ? (
            <button
              type="button"
              data-pane-close
              aria-label="Close pane"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--fg-muted)",
                cursor: "pointer",
                padding: 4,
              }}
            >
              ×
            </button>
          ) : null}
        </div>
      </header>
      <div
        data-pane-body
        {...scrollRegionAccessibilityProps}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: 6,
          background:
            "linear-gradient(180deg, color-mix(in oklab, white 1.5%, transparent), transparent), color-mix(in oklab, var(--canvas-850) 88%, transparent)",
        }}
      >
        {children}
      </div>
      {footer !== undefined ? (
        <footer
          style={{
            padding: "6px 8px",
            borderTop: "var(--signal-seam)",
            background:
              "linear-gradient(180deg, color-mix(in oklab, white 2%, transparent), transparent)",
          }}
        >
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
