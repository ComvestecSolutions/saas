import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";

export type OpsPanelTone = "neutral" | "warn" | "alert";

type OpsPanelProps = Omit<ComponentPropsWithoutRef<"section">, "title"> & {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly tone?: OpsPanelTone;
};

export function OpsPanel({
  title,
  description,
  actions,
  tone = "neutral",
  className,
  children,
  ...props
}: OpsPanelProps) {
  const titleId = useId();
  const classes = ["ops-panel", `ops-panel--${tone}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes} aria-labelledby={titleId} {...props}>
      <div className="ops-panel__head">
        <div className="ops-panel__heading">
          <h2 id={titleId} className="ops-panel__title">
            {title}
          </h2>
          {description !== undefined ? (
            <p className="ops-panel__description">{description}</p>
          ) : null}
        </div>
        {actions !== undefined ? (
          <div className="ops-panel__actions">{actions}</div>
        ) : null}
      </div>
      <div className="ops-panel__body">{children}</div>
    </section>
  );
}
