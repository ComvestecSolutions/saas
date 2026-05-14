import type { ReactNode } from "react";

type ContextChip = {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
};

export type ContextHeaderProps = {
  readonly chips: readonly ContextChip[];
  readonly trailing?: ReactNode;
  readonly mobileMenuButton?: ReactNode;
};

export function ContextHeader({
  chips,
  trailing,
  mobileMenuButton,
}: ContextHeaderProps) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "0 16px",
        height: "var(--ops-header-height)",
        background: "var(--ops-surface-1)",
        borderBottom: "1px solid var(--ops-border)",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {mobileMenuButton !== undefined && (
        <div style={{ marginRight: "4px" }}>{mobileMenuButton}</div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          flex: 1,
          overflow: "hidden",
        }}
      >
        {chips.map((chip) => (
          <span
            key={chip.label}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "var(--ops-radius)",
              border: "1px solid var(--ops-border-strong)",
              background: "var(--ops-surface-2)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              maxWidth: "220px",
            }}
          >
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--ops-text-muted)",
                flexShrink: 0,
              }}
            >
              {chip.label}
            </span>
            <span
              style={{
                fontSize: "0.78rem",
                fontWeight: 500,
                color: "var(--ops-text-secondary)",
                fontFamily: chip.mono ? "var(--ops-font-mono)" : undefined,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {chip.value}
            </span>
          </span>
        ))}
      </div>
      {trailing !== undefined && (
        <div style={{ flexShrink: 0 }}>{trailing}</div>
      )}
    </header>
  );
}
