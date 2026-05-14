import type { ReactNode } from "react";

type StateCardProps = {
  readonly icon?: ReactNode;
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
};

const cardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "12px",
  padding: "48px 24px",
  textAlign: "center",
  background: "var(--ops-surface-2)",
  border: "1px solid var(--ops-border)",
  borderRadius: "var(--ops-radius)",
  minHeight: "200px",
};

export function EmptyState({
  icon,
  title,
  description,
  action,
}: StateCardProps) {
  return (
    <div style={cardStyle}>
      {icon !== undefined && (
        <span style={{ fontSize: "2rem", color: "var(--ops-text-muted)" }}>
          {icon}
        </span>
      )}
      <p
        style={{
          margin: 0,
          fontWeight: 600,
          fontSize: "0.95rem",
          color: "var(--ops-text-secondary)",
        }}
      >
        {title}
      </p>
      {description !== undefined && (
        <p
          style={{
            margin: 0,
            fontSize: "0.85rem",
            color: "var(--ops-text-muted)",
            maxWidth: "40ch",
            lineHeight: 1.6,
          }}
        >
          {description}
        </p>
      )}
      {action !== undefined && action}
    </div>
  );
}

export function LoadingState({ title = "Loading…" }: { title?: string }) {
  return (
    <div style={cardStyle}>
      <span
        style={{
          width: "24px",
          height: "24px",
          border: "2px solid var(--ops-border-strong)",
          borderTopColor: "var(--ops-accent)",
          borderRadius: "50%",
          display: "inline-block",
          animation: "ops-spin 0.7s linear infinite",
        }}
        aria-hidden="true"
      />
      <p
        style={{
          margin: 0,
          fontSize: "0.85rem",
          color: "var(--ops-text-muted)",
        }}
      >
        {title}
      </p>
    </div>
  );
}

export function ErrorState({ title, description, action }: StateCardProps) {
  return (
    <div
      style={{
        ...cardStyle,
        border: "1px solid rgba(239,68,68,0.25)",
        background: "rgba(239,68,68,0.05)",
      }}
    >
      <span style={{ fontSize: "1.5rem", color: "var(--ops-status-error)" }}>
        ⚠
      </span>
      <p
        style={{
          margin: 0,
          fontWeight: 600,
          fontSize: "0.95rem",
          color: "var(--ops-status-error)",
        }}
      >
        {title}
      </p>
      {description !== undefined && (
        <p
          style={{
            margin: 0,
            fontSize: "0.85rem",
            color: "var(--ops-text-muted)",
            maxWidth: "40ch",
            lineHeight: 1.6,
          }}
        >
          {description}
        </p>
      )}
      {action !== undefined && action}
    </div>
  );
}

export function PermissionDeniedState({
  title = "Access denied",
  description,
  action,
}: StateCardProps) {
  return (
    <div
      style={{
        ...cardStyle,
        border: "1px solid rgba(245,158,11,0.25)",
        background: "rgba(245,158,11,0.04)",
      }}
    >
      <span style={{ fontSize: "1.5rem", color: "var(--ops-status-pending)" }}>
        🔒
      </span>
      <p
        style={{
          margin: 0,
          fontWeight: 600,
          fontSize: "0.95rem",
          color: "var(--ops-text)",
        }}
      >
        {title}
      </p>
      {description !== undefined && (
        <p
          style={{
            margin: 0,
            fontSize: "0.85rem",
            color: "var(--ops-text-muted)",
            maxWidth: "44ch",
            lineHeight: 1.6,
          }}
        >
          {description}
        </p>
      )}
      {action !== undefined && action}
    </div>
  );
}
