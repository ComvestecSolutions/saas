import { type ReactNode } from "react";

/**
 * Workspace Tabs — saved workbench layouts in the command strip.
 *
 * A workspace is a named workbench URL. Persistence is backend-owned
 * (admin-saved-views / admin-workspaces — §9 item 2). This component
 * is presentational and per-user.
 */
export type WorkspaceTab = {
  readonly id: string;
  readonly label: string;
  readonly active?: boolean;
  readonly dirty?: boolean;
  readonly trailing?: ReactNode;
};

export type WorkspaceTabsProps = {
  readonly tabs: readonly WorkspaceTab[];
  readonly onActivate?: (tab: WorkspaceTab) => void;
  readonly onClose?: (tab: WorkspaceTab) => void;
  readonly ariaLabel?: string;
};

export function WorkspaceTabs({
  tabs,
  onActivate,
  onClose,
  ariaLabel = "Workspace tabs",
}: WorkspaceTabsProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      data-pattern="workspace-tabs"
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 2,
        minWidth: 0,
        overflow: "auto",
      }}
    >
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.active === true ? "true" : "false"}
          data-tab={tab.id}
          data-dirty={tab.dirty === true ? "true" : undefined}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            height: 28,
            paddingInline: 6,
            background:
              tab.active === true
                ? "color-mix(in oklab, white 8%, transparent)"
                : "transparent",
            border: "1px solid color-mix(in oklab, white 6%, transparent)",
            borderRadius: 4,
            color: "var(--fg-default)",
            fontSize: "0.8125rem",
          }}
        >
          <button
            type="button"
            data-tab-activate={tab.id}
            onClick={() => onActivate?.(tab)}
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              padding: 0,
              font: "inherit",
              maxWidth: 160,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
            {tab.dirty === true ? (
              <span aria-label="unsaved changes" style={{ marginLeft: 4 }}>
                •
              </span>
            ) : null}
          </button>
          {tab.trailing}
          {onClose !== undefined ? (
            <button
              type="button"
              data-tab-close={tab.id}
              aria-label={`Close ${tab.label}`}
              onClick={() => onClose(tab)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--fg-muted)",
                cursor: "pointer",
                padding: 2,
              }}
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
