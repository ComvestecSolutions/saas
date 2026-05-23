import type { ReactNode } from "react";

export type KpiTone = "neutral" | "accent" | "good" | "warn" | "alert";

type KpiCardProps = {
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: ReactNode;
  readonly tone?: KpiTone;
  readonly icon?: ReactNode;
};

export function KpiCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: KpiCardProps) {
  const className = `ops-kpi${tone === "neutral" ? "" : ` ops-kpi--${tone}`}`;
  return (
    <div className={className}>
      <div className="ops-kpi__row">
        <p className="ops-kpi__label">{label}</p>
        {icon !== undefined && (
          <span className="ops-kpi__icon" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <p className="ops-kpi__value">{value}</p>
      {hint !== undefined && <span className="ops-kpi__hint">{hint}</span>}
    </div>
  );
}
