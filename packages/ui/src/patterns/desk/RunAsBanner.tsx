import { type ReactNode } from "react";

/**
 * Run-As Banner — surfaces an active session-bound break-glass grant.
 *
 * Only renders when a grant is active. Release is one click that
 * triggers `onRelease`; the consuming app captures the operator's
 * release reason and calls the manual break-glass release endpoint
 * (admin-app plan §9 item 5 + §9 item 14). Authorization is
 * backend-owned; this component is a presentational banner only.
 */
export type RunAsBannerProps = {
  readonly actorLabel: ReactNode;
  readonly reason: ReactNode;
  readonly expiresAtIso: string;
  readonly onRelease?: () => void;
  readonly ariaLabel?: string;
};

export function RunAsBanner({
  actorLabel,
  reason,
  expiresAtIso,
  onRelease,
  ariaLabel = "Active break-glass grant",
}: RunAsBannerProps) {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      data-pattern="run-as-banner"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 28,
        paddingInline: 6,
        background:
          "color-mix(in oklab, var(--status-error-bg) 80%, transparent)",
        color: "var(--status-error-fg)",
        border: "1px solid var(--status-error-border)",
        borderRadius: 4,
        fontSize: "0.75rem",
        fontWeight: 600,
      }}
    >
      <span aria-hidden="true">⚠</span>
      <span>
        Run-as <strong>{actorLabel}</strong>
      </span>
      <span
        style={{ opacity: 0.85 }}
        title={typeof reason === "string" ? reason : undefined}
      >
        — {reason}
      </span>
      <time dateTime={expiresAtIso} style={{ opacity: 0.85 }}>
        until {expiresAtIso}
      </time>
      {onRelease !== undefined ? (
        <button
          type="button"
          data-run-as-release
          onClick={onRelease}
          style={{
            background: "transparent",
            border: "1px solid currentColor",
            color: "inherit",
            cursor: "pointer",
            borderRadius: 4,
            paddingInline: 6,
            height: 20,
            fontSize: "0.6875rem",
            fontWeight: 600,
          }}
        >
          Release
        </button>
      ) : null}
    </div>
  );
}
