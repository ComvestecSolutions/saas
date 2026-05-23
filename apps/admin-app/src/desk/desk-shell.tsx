import { useState, type ReactNode } from "react";
import {
  AlertsPulse,
  AppDesk,
  CommandStrip,
  ContextSpine,
  DeviceProvider,
  EdgeRail,
  PulseRibbon,
  Workbench,
  WorkspaceTabs,
  type DeviceClass,
} from "@comvestec/ui";
import {
  adminRoutePath,
  type AdminOperatorCapabilityEntry,
  type AdminOperatorProfile,
} from "@comvestec/contracts";
import { DeskShellOmnibar } from "../components/desk-shell/omnibar";

/**
 * DeskShell — the universal admin-app Signal Deck shell. Uses the
 * trusted-session operator profile from `__root`, derives shell
 * posture directly from visible capabilities, and keeps every
 * non-auth route inside the same workbench frame.
 */
export type DeskShellProps = {
  readonly profile: AdminOperatorProfile;
  readonly children: ReactNode;
  readonly currentPath?: string;
  readonly onNavigate?: (path: string) => void;
  readonly deviceClass?: DeviceClass;
};

type DeskDomainId =
  | "mission"
  | "tenants"
  | "governance"
  | "revenue"
  | "risk"
  | "integrations"
  | "admin";

const resolveCurrentPath = (path: string | undefined): string =>
  path ??
  (typeof window === "undefined"
    ? adminRoutePath.operationsHome
    : window.location.pathname);

const routeMatches = (currentPath: string, routePath: string): boolean =>
  routePath === adminRoutePath.operationsHome
    ? currentPath === routePath || currentPath === "/desk"
    : currentPath === routePath || currentPath.startsWith(`${routePath}/`);

const resolveDomainId = (routePath: string): DeskDomainId => {
  if (
    routePath === adminRoutePath.operationsHome ||
    routePath === "/desk" ||
    routePath.startsWith("/desk/")
  ) {
    return "mission";
  }
  if (
    routePath === adminRoutePath.tenantWorkspaceDiscovery ||
    routePath.startsWith("/r/tenant/") ||
    routePath.startsWith("/tenants")
  ) {
    return "tenants";
  }
  if (
    routePath.startsWith("/r/config") ||
    routePath.startsWith("/r/flag") ||
    routePath.startsWith("/r/access") ||
    routePath.startsWith("/r/audit") ||
    routePath.startsWith("/governance/")
  ) {
    return "governance";
  }
  if (
    routePath === adminRoutePath.billing ||
    routePath.startsWith("/r/invoice/") ||
    routePath.startsWith("/r/meter/")
  ) {
    return "revenue";
  }
  if (
    routePath === adminRoutePath.supportOperations ||
    routePath === adminRoutePath.complianceRetention ||
    routePath.startsWith("/r/support") ||
    routePath.startsWith("/r/incident/") ||
    routePath.startsWith("/r/retention") ||
    routePath.startsWith("/r/legal-hold/")
  ) {
    return "risk";
  }
  if (
    routePath === adminRoutePath.webhooksApiAccess ||
    routePath.startsWith("/r/webhook") ||
    routePath.startsWith("/r/delivery/") ||
    routePath.startsWith("/r/api-key/") ||
    routePath.startsWith("/r/runs") ||
    routePath.startsWith("/r/run/") ||
    routePath.startsWith("/r/vendors") ||
    routePath.startsWith("/r/vendor/") ||
    routePath.startsWith("/r/notify")
  ) {
    return "integrations";
  }
  return "admin";
};

const resolveDomainLabel = (domainId: DeskDomainId): string => {
  switch (domainId) {
    case "mission":
      return "Mission";
    case "tenants":
      return "Tenants";
    case "governance":
      return "Governance";
    case "revenue":
      return "Revenue";
    case "risk":
      return "Risk";
    case "integrations":
      return "Integrations";
    case "admin":
    default:
      return "Admin";
  }
};

const resolveRouteInitials = (routePath: string): string => {
  switch (resolveDomainId(routePath)) {
    case "mission":
      return "MC";
    case "tenants":
      return "TN";
    case "governance":
      return "GV";
    case "revenue":
      return "RV";
    case "risk":
      return "RK";
    case "integrations":
      return "IN";
    case "admin":
    default:
      return "AD";
  }
};

const resolveCurrentRouteLabel = (
  currentPath: string,
  capabilities: readonly AdminOperatorCapabilityEntry[],
): string =>
  capabilities.find((capability) =>
    routeMatches(currentPath, capability.routePath),
  )?.label ?? "Mission Control";

const buildPulseSegments = (
  currentPath: string,
  capabilities: readonly AdminOperatorCapabilityEntry[],
) =>
  (
    [
      "mission",
      "tenants",
      "governance",
      "revenue",
      "risk",
      "integrations",
      "admin",
    ] as const
  )
    .map((domainId) => {
      const entries = capabilities.filter(
        (capability) => resolveDomainId(capability.routePath) === domainId,
      );
      if (entries.length === 0) {
        return undefined;
      }
      const allowedCount = entries.filter(
        (capability) => capability.allowed,
      ).length;
      const gatedCount = entries.filter(
        (capability) => !capability.allowed,
      ).length;
      const active = entries.some((capability) =>
        routeMatches(currentPath, capability.routePath),
      );
      return {
        id: domainId,
        label: resolveDomainLabel(domainId),
        tone:
          gatedCount > 0
            ? allowedCount > 0
              ? "pending"
              : "drift"
            : active
              ? "nominal"
              : "nominal",
        count: allowedCount,
        hint:
          gatedCount > 0
            ? allowedCount > 0
              ? "mixed access"
              : "gated"
            : active
              ? "in focus"
              : "ready",
      } as const;
    })
    .filter(
      (segment): segment is NonNullable<typeof segment> =>
        segment !== undefined,
    );

const buildEdgeRailItems = (
  currentPath: string,
  capabilities: readonly AdminOperatorCapabilityEntry[],
) =>
  capabilities
    .filter(
      (capability) =>
        capability.visible &&
        !capability.routePath.includes("$") &&
        capability.allowed,
    )
    .slice(0, 8)
    .map((capability) => ({
      id: capability.capability,
      label: capability.label,
      icon: resolveRouteInitials(capability.routePath),
      current: routeMatches(currentPath, capability.routePath),
    }));

const buildWorkspaceTabs = (
  currentPath: string,
  capabilities: readonly AdminOperatorCapabilityEntry[],
) => {
  const anchors = [
    {
      id: "mission-control",
      label: "Mission Control",
      path: adminRoutePath.operationsHome,
    },
    {
      id: "tenant-ops",
      label: "Fleet Ops",
      path: adminRoutePath.tenantWorkspaceDiscovery,
    },
    {
      id: "runtime-control",
      label: "Runtime Control",
      path: adminRoutePath.runtimeConfig,
    },
    {
      id: "admin-org",
      label: "Admin Org",
      path: adminRoutePath.profile,
    },
  ].filter((anchor) =>
    capabilities.some(
      (capability) =>
        capability.visible &&
        capability.allowed &&
        capability.routePath === anchor.path,
    ),
  );

  const currentLabel = resolveCurrentRouteLabel(currentPath, capabilities);

  return [
    {
      id: "current",
      label: currentLabel,
      active: true,
      path: currentPath,
    },
    ...anchors
      .filter((anchor) => !routeMatches(currentPath, anchor.path))
      .slice(0, 3)
      .map((anchor) => ({
        id: anchor.id,
        label: anchor.label,
        active: false,
        path: anchor.path,
      })),
  ];
};

const navigateToPath = (
  path: string,
  onNavigate: ((path: string) => void) | undefined,
) => {
  if (onNavigate !== undefined) {
    onNavigate(path);
    return;
  }

  if (typeof window !== "undefined") {
    window.location.assign(path);
  }
};

export function DeskShell({
  profile,
  children,
  currentPath: currentPathProp,
  onNavigate,
  deviceClass,
}: DeskShellProps) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const operator = profile.identity;
  const currentPath = resolveCurrentPath(currentPathProp);
  const deviceClassProps: { readonly deviceClass: DeviceClass } | {} =
    deviceClass === undefined ? {} : { deviceClass };
  const omnibarNavigationProps:
    | { readonly onNavigate: (path: string) => void }
    | {} = onNavigate === undefined ? {} : { onNavigate };
  const visibleCapabilities = profile.capabilities.filter(
    (capability) => capability.visible,
  );
  const activeBreakGlass = visibleCapabilities.find(
    (capability) => capability.reason !== undefined && capability.allowed,
  );
  const gatedSurfaces = visibleCapabilities.filter(
    (capability) => !capability.allowed,
  );
  const pulseSegments = buildPulseSegments(currentPath, visibleCapabilities);
  const edgeRailItems = buildEdgeRailItems(currentPath, visibleCapabilities);
  const workspaceTabs = buildWorkspaceTabs(currentPath, visibleCapabilities);
  const navigationLinks = visibleCapabilities.filter(
    (capability) => capability.allowed && !capability.routePath.includes("$"),
  );

  return (
    <DeviceProvider>
      <AppDesk
        {...deviceClassProps}
        pulseRibbon={
          <PulseRibbon
            {...deviceClassProps}
            segments={pulseSegments}
            onSelect={(segment) => {
              const firstRoute = visibleCapabilities.find(
                (capability) =>
                  resolveDomainId(capability.routePath) === segment.id,
              );
              if (firstRoute?.allowed !== true) {
                return;
              }
              navigateToPath(firstRoute.routePath, onNavigate);
            }}
          />
        }
        edgeRail={
          <EdgeRail
            {...deviceClassProps}
            items={edgeRailItems}
            onActivate={(item) => {
              const match = visibleCapabilities.find(
                (capability) => capability.capability === item.id,
              );
              if (match === undefined) {
                return;
              }
              navigateToPath(match.routePath, onNavigate);
            }}
          />
        }
        workbench={<Workbench {...deviceClassProps}>{children}</Workbench>}
        contextSpine={
          <ContextSpine {...deviceClassProps}>
            <section
              data-testid="context-spine-actor-card"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: 6,
                borderRadius: 10,
                border: "1px solid color-mix(in oklab, white 8%, transparent)",
                background:
                  "linear-gradient(180deg, color-mix(in oklab, white 4%, transparent), transparent), color-mix(in oklab, var(--canvas-850) 82%, transparent)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-condensed)",
                  fontSize: "0.68rem",
                  color: "var(--fg-muted)",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                Operator
              </span>
              <strong
                style={{ fontSize: "0.92rem", color: "var(--fg-elevated)" }}
              >
                {operator.displayName}
              </strong>
              <span style={{ fontSize: "0.75rem", color: "var(--fg-muted)" }}>
                {operator.email}
              </span>
              <span
                data-testid="context-spine-actor-role"
                style={{
                  fontSize: "0.68rem",
                  color: "var(--fg-muted)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {operator.actorType}
              </span>
            </section>
            <section
              style={{
                display: "grid",
                gap: 6,
              }}
            >
              <div
                style={{
                  padding: 6,
                  borderRadius: 10,
                  border:
                    "1px solid color-mix(in oklab, white 8%, transparent)",
                  background:
                    "color-mix(in oklab, var(--canvas-850) 84%, transparent)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-condensed)",
                    fontSize: "0.66rem",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--fg-muted)",
                    marginBottom: 4,
                  }}
                >
                  In focus
                </div>
                <div
                  style={{ fontSize: "0.9rem", color: "var(--fg-elevated)" }}
                >
                  {resolveCurrentRouteLabel(currentPath, visibleCapabilities)}
                </div>
                <div
                  className="mono"
                  style={{ fontSize: "0.72rem", color: "var(--fg-muted)" }}
                >
                  {currentPath}
                </div>
              </div>
              <div
                style={{
                  padding: 6,
                  borderRadius: 10,
                  border:
                    "1px solid color-mix(in oklab, white 8%, transparent)",
                  background:
                    "color-mix(in oklab, var(--canvas-850) 84%, transparent)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-condensed)",
                    fontSize: "0.66rem",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--fg-muted)",
                    marginBottom: 4,
                  }}
                >
                  Capability posture
                </div>
                <div
                  style={{ fontSize: "0.9rem", color: "var(--fg-elevated)" }}
                >
                  {
                    visibleCapabilities.filter(
                      (capability) => capability.allowed,
                    ).length
                  }{" "}
                  active surfaces
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--fg-muted)" }}>
                  {gatedSurfaces.length === 0
                    ? "No gated surfaces in this session."
                    : `${gatedSurfaces.length} gated surface${gatedSurfaces.length === 1 ? "" : "s"} need higher privilege.`}
                </div>
              </div>
              {activeBreakGlass?.reason !== undefined ? (
                <div
                  style={{
                    padding: 6,
                    borderRadius: 10,
                    border: "1px solid var(--status-error-border)",
                    background:
                      "color-mix(in oklab, var(--status-error-bg) 84%, transparent)",
                    color: "var(--status-error-fg)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-condensed)",
                      fontSize: "0.66rem",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    Run-as context
                  </div>
                  <div style={{ fontSize: "0.82rem" }}>
                    {activeBreakGlass.reason}
                  </div>
                </div>
              ) : null}
            </section>
          </ContextSpine>
        }
        commandStrip={
          <CommandStrip
            {...deviceClassProps}
            omnibar={<DeskShellOmnibar {...omnibarNavigationProps} />}
            workspaceTabs={
              <WorkspaceTabs
                tabs={workspaceTabs}
                onActivate={(tab) => {
                  const match = workspaceTabs.find(
                    (entry) => entry.id === tab.id,
                  );
                  if (match === undefined) {
                    return;
                  }
                  navigateToPath(match.path, onNavigate);
                }}
              />
            }
            alertsPulse={
              <AlertsPulse
                count={gatedSurfaces.length}
                tone={
                  gatedSurfaces.length === 0
                    ? "neutral"
                    : gatedSurfaces.length >= 3
                      ? "error"
                      : "pending"
                }
                ariaLabel="Gated admin surfaces"
              />
            }
            runAsBanner={
              <div
                style={{
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <button
                  type="button"
                  aria-label="Open navigation"
                  onClick={() => setNavigationOpen((current) => !current)}
                  style={{
                    height: 28,
                    paddingInline: 8,
                    borderRadius: 8,
                    border:
                      "1px solid color-mix(in oklab, white 8%, transparent)",
                    background:
                      "linear-gradient(180deg, color-mix(in oklab, white 4%, transparent), transparent), color-mix(in oklab, var(--canvas-850) 72%, transparent)",
                    color: "var(--fg-secondary)",
                    cursor: "pointer",
                  }}
                >
                  Menu
                </button>
                <a
                  href={adminRoutePath.profile}
                  onClick={(event) => {
                    event.preventDefault();
                    navigateToPath(adminRoutePath.profile, onNavigate);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 28,
                    paddingInline: 8,
                    borderRadius: 8,
                    border:
                      "1px solid color-mix(in oklab, white 8%, transparent)",
                    background:
                      "linear-gradient(180deg, color-mix(in oklab, white 4%, transparent), transparent), color-mix(in oklab, var(--canvas-850) 72%, transparent)",
                    color: "var(--fg-secondary)",
                    textDecoration: "none",
                  }}
                >
                  My profile
                </a>
                {navigationOpen ? (
                  <div
                    data-testid="desk-shell-navigation-menu"
                    style={{
                      position: "absolute",
                      right: 0,
                      bottom: "calc(100% + 6px)",
                      width: 240,
                      maxHeight: 280,
                      overflow: "auto",
                      padding: 6,
                      borderRadius: 10,
                      border:
                        "1px solid color-mix(in oklab, white 10%, transparent)",
                      background:
                        "linear-gradient(180deg, color-mix(in oklab, white 4%, transparent), transparent), color-mix(in oklab, var(--canvas-850) 94%, transparent)",
                      boxShadow: "0 22px 48px -28px rgb(0 0 0 / 0.82)",
                      display: "grid",
                      gap: 4,
                      zIndex: 20,
                    }}
                  >
                    {navigationLinks.map((capability) => (
                      <a
                        key={capability.capability}
                        href={capability.routePath}
                        onClick={(event) => {
                          event.preventDefault();
                          setNavigationOpen(false);
                          navigateToPath(capability.routePath, onNavigate);
                        }}
                        style={{
                          display: "grid",
                          gap: 2,
                          padding: "6px 8px",
                          borderRadius: 8,
                          textDecoration: "none",
                          background: routeMatches(
                            currentPath,
                            capability.routePath,
                          )
                            ? "color-mix(in oklab, white 6%, transparent)"
                            : "transparent",
                          color: "var(--fg-elevated)",
                        }}
                      >
                        <span>{capability.label}</span>
                        <span
                          className="mono"
                          style={{
                            fontSize: "0.7rem",
                            color: "var(--fg-muted)",
                          }}
                        >
                          {capability.routePath}
                        </span>
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            }
          />
        }
      />
    </DeviceProvider>
  );
}
