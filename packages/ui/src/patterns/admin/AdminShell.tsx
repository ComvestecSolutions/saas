import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DeviceProvider,
  useResponsiveShell,
  useDeviceState,
} from "../../runtime/device";
import type { SideNavProps } from "./SideNav";
import { SideNav } from "./SideNav";

type AdminShellProps = {
  readonly navGroups: SideNavProps["navGroups"];
  readonly currentPath: string;
  readonly contextChips: ReadonlyArray<{
    readonly label: string;
    readonly value: string;
    readonly mono?: boolean;
  }>;
  readonly headerActions?: ReactNode;
  readonly renderLink?: SideNavProps["renderLink"];
  readonly children: ReactNode;
};

function AdminShellInner({
  navGroups,
  currentPath,
  contextChips,
  headerActions,
  renderLink,
  children,
}: AdminShellProps) {
  const shellMode = useResponsiveShell();
  const device = useDeviceState();
  const collapsed = shellMode === "sidebar-collapsed";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const previousPathRef = useRef(currentPath);

  useEffect(() => {
    if (!device.isMobile && mobileNavOpen) {
      setMobileNavOpen(false);
    }
  }, [device.isMobile, mobileNavOpen]);

  useEffect(() => {
    if (previousPathRef.current !== currentPath && mobileNavOpen) {
      setMobileNavOpen(false);
    }
    previousPathRef.current = currentPath;
  }, [currentPath, mobileNavOpen]);

  return (
    <div
      style={{
        display: "flex",
        height: "100dvh",
        minHeight: 0,
        overflow: "hidden",
        background: "var(--ops-bg)",
        color: "var(--ops-text)",
      }}
    >
      {/* Desktop / tablet sidebar */}
      {!device.isMobile && (
        <SideNav
          navGroups={navGroups}
          collapsed={collapsed}
          {...(renderLink !== undefined ? { renderLink } : {})}
        />
      )}

      {/* Main content area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minHeight: 0,
          minWidth: 0,
        }}
      >
        {/* Context header */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: device.isMobile ? "0 12px" : "0 14px",
            height: "var(--ops-header-height)",
            background: "var(--ops-surface-1)",
            borderBottom: "1px solid var(--ops-border)",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          {device.isMobile && (
            <button
              type="button"
              aria-label={
                mobileNavOpen ? "Close navigation" : "Open navigation"
              }
              onClick={() => setMobileNavOpen((open) => !open)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "40px",
                height: "40px",
                padding: "0 10px",
                borderRadius: "var(--ops-radius)",
                border: "1px solid var(--ops-border-strong)",
                background: "var(--ops-surface-3)",
                color: "var(--ops-text)",
                font: "inherit",
                fontSize: "0.8rem",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Menu
            </button>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              flex: 1,
              overflowX: "auto",
              overflowY: "hidden",
              scrollbarWidth: "none",
            }}
          >
            {contextChips.map((chip) => (
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
                  maxWidth: device.isMobile
                    ? "150px"
                    : device.isTablet
                      ? "180px"
                      : "220px",
                  flexShrink: 0,
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
          {headerActions !== undefined && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexShrink: 0,
              }}
            >
              {headerActions}
            </div>
          )}
        </header>

        {/* Scrollable page content */}
        <main
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            padding: device.isMobile
              ? "14px 12px 24px"
              : device.isTablet
                ? "18px 18px 28px"
                : "20px 20px 32px",
          }}
        >
          {children}
        </main>
      </div>

      {device.isMobile && mobileNavOpen && (
        <>
          <div
            role="presentation"
            onClick={() => setMobileNavOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(2, 6, 23, 0.68)",
              zIndex: 40,
            }}
          />
          <div
            role="dialog"
            aria-label="Navigation drawer"
            style={{
              position: "fixed",
              inset: "0 auto 0 0",
              zIndex: 50,
              width: "min(320px, 90vw)",
              maxWidth: "100%",
              boxShadow: "0 18px 60px rgba(2, 6, 23, 0.5)",
            }}
          >
            <SideNav
              navGroups={navGroups}
              collapsed={false}
              {...(renderLink !== undefined ? { renderLink } : {})}
            />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * AdminShell — the persistent routed shell for the admin app.
 *
 * Wraps the DeviceProvider so the shell and all children can use
 * `useDeviceType`, `useResponsiveShell`, and `useDeviceState`.
 */
export function AdminShell(props: AdminShellProps) {
  return (
    <DeviceProvider>
      <AdminShellInner {...props} />
    </DeviceProvider>
  );
}
