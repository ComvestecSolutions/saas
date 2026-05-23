import type { ReactNode } from "react";
import { StatusChip, type StatusChipTone } from "../data/StatusChip";

/**
 * VendorCard — per-vendor posture card for the right Context Spine
 * and the `/r/vendors` grid (admin-app spec §8.15).
 *
 * Surfaces: posture dot (tone) · vendor name · version · latency
 * (ms) · last incident · governed deep-link to the vendor console.
 *
 * The deep-link is "governed": the consumer must hand the resolved
 * url and label in via `deepLink`. The component does not synthesize
 * vendor urls; backend healthcheck schemas and vendor read helpers
 * are the source of truth.
 */
export type VendorCardDeepLink = {
  readonly href: string;
  readonly label: ReactNode;
};

export type VendorCardProps = {
  readonly service: ReactNode;
  readonly tone: StatusChipTone;
  readonly statusLabel?: ReactNode;
  readonly version?: ReactNode;
  readonly latencyMs?: number;
  readonly lastIncident?: ReactNode;
  readonly deepLink?: VendorCardDeepLink;
  readonly onOpenDetail?: () => void;
};

export function VendorCard({
  service,
  tone,
  statusLabel,
  version,
  latencyMs,
  lastIncident,
  deepLink,
  onOpenDetail,
}: VendorCardProps) {
  return (
    <article
      data-pattern="vendor-card"
      data-tone={tone}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 8,
        background: "color-mix(in oklab, var(--canvas-850) 60%, transparent)",
        border: "1px solid color-mix(in oklab, white 6%, transparent)",
        borderRadius: 8,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          aria-hidden="true"
          data-testid="vendor-card-dot"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: `var(--status-${
              tone === "success" || tone === "nominal"
                ? "active"
                : tone === "pending"
                  ? "pending"
                  : tone === "drift"
                    ? "drift"
                    : "error"
            }-fg)`,
            flexShrink: 0,
          }}
        />
        <h3
          style={{
            margin: 0,
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: "var(--fg-default)",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {service}
        </h3>
        {statusLabel !== undefined ? (
          <StatusChip tone={tone} size="sm">
            {statusLabel}
          </StatusChip>
        ) : null}
      </header>
      <dl
        style={{
          margin: 0,
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          rowGap: 2,
          columnGap: 6,
          fontSize: "0.75rem",
        }}
      >
        {version !== undefined ? (
          <>
            <dt style={{ color: "var(--fg-muted)" }}>version</dt>
            <dd
              data-testid="vendor-card-version"
              style={{ margin: 0, color: "var(--fg-default)" }}
            >
              {version}
            </dd>
          </>
        ) : null}
        {latencyMs !== undefined ? (
          <>
            <dt style={{ color: "var(--fg-muted)" }}>latency</dt>
            <dd
              data-testid="vendor-card-latency"
              style={{ margin: 0, color: "var(--fg-default)" }}
            >
              {latencyMs}ms
            </dd>
          </>
        ) : null}
        {lastIncident !== undefined ? (
          <>
            <dt style={{ color: "var(--fg-muted)" }}>last incident</dt>
            <dd style={{ margin: 0, color: "var(--fg-default)" }}>
              {lastIncident}
            </dd>
          </>
        ) : null}
      </dl>
      {deepLink !== undefined || onOpenDetail !== undefined ? (
        <footer
          style={{
            display: "flex",
            gap: 4,
            justifyContent: "flex-end",
          }}
        >
          {onOpenDetail !== undefined ? (
            <button
              type="button"
              data-testid="vendor-card-open"
              onClick={onOpenDetail}
              style={{
                height: 28,
                paddingInline: 6,
                background: "transparent",
                border: "1px solid color-mix(in oklab, white 8%, transparent)",
                borderRadius: 4,
                color: "var(--fg-default)",
                cursor: "pointer",
                font: "inherit",
                fontSize: "0.75rem",
              }}
            >
              Open detail
            </button>
          ) : null}
          {deepLink !== undefined ? (
            <a
              data-testid="vendor-card-deep-link"
              href={deepLink.href}
              rel="noreferrer noopener"
              target="_blank"
              style={{
                height: 28,
                display: "inline-flex",
                alignItems: "center",
                paddingInline: 6,
                background: "transparent",
                border: "1px solid color-mix(in oklab, white 8%, transparent)",
                borderRadius: 4,
                color: "var(--fg-default)",
                textDecoration: "none",
                fontSize: "0.75rem",
              }}
            >
              {deepLink.label} ↗
            </a>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}
