import type { ReactNode } from "react";

type AdminNavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly isActive: boolean;
  readonly badge?: number;
  readonly allowed?: boolean;
};

type AdminNavGroup = {
  readonly label: string;
  readonly items: readonly AdminNavItem[];
};

export type RenderLinkFn = (props: {
  readonly href: string;
  readonly className: string;
  readonly title?: string;
  readonly "aria-current"?: "page";
  readonly children: ReactNode;
}) => ReactNode;

export type SideNavProps = {
  readonly appName?: string;
  readonly navGroups: readonly (AdminNavItem | AdminNavGroup)[];
  readonly collapsed: boolean;
  readonly renderLink?: RenderLinkFn;
};

const isNavGroup = (
  item: AdminNavItem | AdminNavGroup,
): item is AdminNavGroup => "items" in item;

const defaultRenderLink: RenderLinkFn = ({ href, children, ...rest }) => (
  <a href={href} {...rest}>
    {children}
  </a>
);

function NavItem({
  item,
  collapsed,
  renderLink,
}: {
  readonly item: AdminNavItem;
  readonly collapsed: boolean;
  readonly renderLink: RenderLinkFn;
}) {
  const isAllowed = item.allowed !== false;

  return renderLink({
    href: isAllowed ? item.href : "#",
    ...(item.isActive ? { "aria-current": "page" as const } : {}),
    ...(collapsed && item.label ? { title: item.label } : {}),
    className: "",
    children: (
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: collapsed ? "8px" : "8px 12px",
          borderRadius: "var(--ops-radius)",
          fontSize: "0.875rem",
          fontWeight: item.isActive ? 600 : 400,
          color: item.isActive
            ? "var(--ops-text)"
            : isAllowed
              ? "var(--ops-text-secondary)"
              : "var(--ops-text-muted)",
          background: item.isActive ? "var(--ops-surface-3)" : "transparent",
          cursor: isAllowed ? "pointer" : "not-allowed",
          opacity: isAllowed ? 1 : 0.5,
          transition: "background 0.12s, color 0.12s",
          width: "100%",
          textDecoration: "none",
          boxSizing: "border-box" as const,
          justifyContent: collapsed ? "center" : undefined,
          overflow: "hidden",
          whiteSpace: "nowrap",
          minHeight: "36px",
        }}
      >
        <span
          style={{
            flexShrink: 0,
            width: "16px",
            height: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: item.isActive ? "var(--ops-accent-text)" : "inherit",
          }}
        >
          {item.icon}
        </span>
        {!collapsed && (
          <>
            <span
              style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {item.label}
            </span>
            {item.badge !== undefined && item.badge > 0 && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: "18px",
                  height: "18px",
                  padding: "0 4px",
                  borderRadius: "var(--ops-radius-sm)",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  background: "var(--ops-accent-soft)",
                  color: "var(--ops-accent-text)",
                }}
              >
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </>
        )}
      </span>
    ),
  });
}

export function SideNav({
  appName = "Comvestec Operations",
  navGroups,
  collapsed,
  renderLink,
}: SideNavProps) {
  const effectiveRenderLink = renderLink ?? defaultRenderLink;
  return (
    <nav
      aria-label="Admin navigation"
      style={{
        display: "flex",
        flexDirection: "column",
        width: collapsed
          ? "var(--ops-sidebar-collapsed-width)"
          : "var(--ops-sidebar-width)",
        height: "100vh",
        background: "var(--ops-surface-1)",
        borderRight: "1px solid var(--ops-border)",
        overflow: "hidden",
        flexShrink: 0,
        transition: "width 0.2s",
      }}
    >
      {/* App title */}
      <div
        style={{
          padding: collapsed ? "16px 8px" : "16px",
          borderBottom: "1px solid var(--ops-border)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          minHeight: "var(--ops-header-height)",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "24px",
            height: "24px",
            borderRadius: "var(--ops-radius)",
            background: "var(--ops-accent)",
            color: "#fff",
            fontWeight: 800,
            fontSize: "0.75rem",
            flexShrink: 0,
          }}
        >
          CO
        </span>
        {!collapsed && (
          <span
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--ops-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {appName}
          </span>
        )}
      </div>

      {/* Nav items */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: collapsed ? "8px 4px" : "8px 6px",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        {navGroups.map((group, groupIndex) => {
          if (isNavGroup(group)) {
            return (
              <div
                key={groupIndex}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1px",
                  marginTop: groupIndex === 0 ? 0 : "8px",
                }}
              >
                {!collapsed && (
                  <span
                    style={{
                      padding: "4px 12px 2px",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--ops-text-muted)",
                    }}
                  >
                    {group.label}
                  </span>
                )}
                {group.items.map((item) => (
                  <NavItem
                    key={item.href}
                    item={item}
                    collapsed={collapsed}
                    renderLink={effectiveRenderLink}
                  />
                ))}
              </div>
            );
          }

          return (
            <NavItem
              key={group.href}
              item={group}
              collapsed={collapsed}
              renderLink={effectiveRenderLink}
            />
          );
        })}
      </div>
    </nav>
  );
}
