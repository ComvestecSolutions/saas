import type { ReactNode } from "react";

type Crumb = { readonly label: string; readonly href?: string };

type ScreenHeaderProps = {
  readonly title: string;
  readonly subtitle?: ReactNode;
  readonly icon?: ReactNode;
  readonly breadcrumbs?: readonly Crumb[];
  readonly actions?: ReactNode;
};

export function ScreenHeader({
  title,
  subtitle,
  icon,
  breadcrumbs,
  actions,
}: ScreenHeaderProps) {
  return (
    <div className="ops-screen-header">
      {breadcrumbs !== undefined && breadcrumbs.length > 0 && (
        <nav className="ops-breadcrumb" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, idx) => (
            <span
              key={`${crumb.label}-${idx}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {idx > 0 && <span className="ops-breadcrumb__sep">/</span>}
              {crumb.href !== undefined ? (
                <a href={crumb.href}>{crumb.label}</a>
              ) : (
                <span>{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="ops-screen-header__row">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            minWidth: 0,
          }}
        >
          <h1 className="ops-screen-title">
            {icon !== undefined && (
              <span className="ops-screen-title__icon" aria-hidden="true">
                {icon}
              </span>
            )}
            {title}
          </h1>
          {subtitle !== undefined && (
            <p className="ops-screen-subtitle">{subtitle}</p>
          )}
        </div>
        {actions !== undefined && (
          <div className="ops-screen-actions">{actions}</div>
        )}
      </div>
    </div>
  );
}
