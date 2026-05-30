import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertsPulse,
  AppDesk,
  CommandStrip,
  ContextSpine,
  DeviceProvider,
  EdgeRail,
  HighRiskActionGuard,
  PulseRibbon,
  RunAsBanner,
  Workbench,
  WorkspaceTabs,
  type DeviceClass,
  type HighRiskReason,
} from "@comvestec/ui";
import {
  adminRoutePath,
  adminSavedViewResourceKind,
  reasonCatalogId,
  type AdminOperatorCapabilityEntry,
  type AdminOperatorProfile,
  type AdminSavedView,
  type AdminSavedViewResourceKind,
  type AdminWorkspace,
  type RunAsBannerState,
} from "@comvestec/contracts";
import { DeskShellOmnibar } from "../components/desk-shell/omnibar";
import { navigateAdminPath } from "../lib/browser-navigation";
import { adminPathMatchesRoute } from "../lib/admin-route-aliases";

/**
 * DeskShell — the universal admin-app Signal Deck shell. Uses the
 * trusted-session operator profile from `__root`, derives shell
 * posture directly from visible capabilities, and keeps every
 * non-auth route inside the same workbench frame.
 */
export type DeskShellProps = {
  readonly profile: AdminOperatorProfile;
  readonly workspaces: readonly AdminWorkspace[];
  readonly savedViews: readonly AdminSavedView[];
  readonly runAsBanner: RunAsBannerState;
  readonly children: ReactNode;
  readonly currentPath?: string;
  readonly onNavigate?: (path: string) => void;
  readonly onReleaseRunAsGrant?: (input: {
    readonly grantId: string;
    readonly reasonId: typeof reasonCatalogId.runAsBannerStateRelease;
    readonly reasonAttachmentText: string;
  }) => Promise<unknown> | unknown;
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
  adminPathMatchesRoute(currentPath, routePath);

const resolveDomainId = (routePath: string): DeskDomainId => {
  if (
    routePath === adminRoutePath.tenantWorkspaceDiscovery ||
    routePath.startsWith("/desk/tenant/") ||
    routePath.startsWith("/tenants")
  ) {
    return "tenants";
  }
  if (
    routePath.startsWith("/desk/config") ||
    routePath.startsWith("/desk/flag") ||
    routePath.startsWith("/desk/access") ||
    routePath.startsWith("/desk/audit") ||
    routePath.startsWith("/desk/domain") ||
    routePath.startsWith("/desk/kc-user") ||
    routePath.startsWith("/desk/kc-role") ||
    routePath.startsWith("/governance/")
  ) {
    return "governance";
  }
  if (
    routePath === adminRoutePath.billing ||
    routePath.startsWith("/desk/invoice/") ||
    routePath.startsWith("/desk/meter/")
  ) {
    return "revenue";
  }
  if (
    routePath === adminRoutePath.supportOperations ||
    routePath === adminRoutePath.complianceRetention ||
    routePath.startsWith("/desk/support") ||
    routePath.startsWith("/desk/incident/") ||
    routePath.startsWith("/desk/retention") ||
    routePath.startsWith("/desk/legal-hold/")
  ) {
    return "risk";
  }
  if (
    routePath === adminRoutePath.webhooksApiAccess ||
    routePath.startsWith("/desk/webhook") ||
    routePath.startsWith("/desk/delivery/") ||
    routePath.startsWith("/desk/api-key/") ||
    routePath.startsWith("/desk/runs") ||
    routePath.startsWith("/desk/run/") ||
    routePath.startsWith("/desk/vendors") ||
    routePath.startsWith("/desk/vendor/") ||
    routePath.startsWith("/desk/notify")
  ) {
    return "integrations";
  }
  if (
    routePath === adminRoutePath.profile ||
    routePath === adminRoutePath.repairOperations ||
    routePath === adminRoutePath.branding ||
    routePath.startsWith("/desk/operator") ||
    routePath.startsWith("/admin/")
  ) {
    return "admin";
  }
  if (
    routePath === adminRoutePath.operationsHome ||
    routePath === "/desk" ||
    routePath.startsWith("/desk/search") ||
    routePath.startsWith("/desk/")
  ) {
    return "mission";
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
  workspaces: readonly AdminWorkspace[],
  savedViews: readonly AdminSavedView[],
) => {
  const savedViewCountByPath = new Map<string, number>();

  for (const savedView of savedViews) {
    const routePath = resolveSavedViewRoutePath(savedView.resourceKind);
    if (routePath === undefined) {
      continue;
    }
    savedViewCountByPath.set(
      routePath,
      (savedViewCountByPath.get(routePath) ?? 0) + 1,
    );
  }

  let activeWorkspaceAssigned = false;
  const liveTabs = [...workspaces]
    .sort((left, right) => left.position - right.position)
    .map((workspace) => {
      const path = resolveWorkspaceRoutePath(workspace.serializedLayout);
      const active =
        activeWorkspaceAssigned === false && routeMatches(currentPath, path);

      if (active) {
        activeWorkspaceAssigned = true;
      }

      const savedViewCount = savedViewCountByPath.get(path) ?? 0;

      return {
        id: workspace.id,
        label: workspace.name,
        active,
        path,
        trailing:
          savedViewCount > 0 ? (
            <span
              aria-label={`${savedViewCount} saved view${savedViewCount === 1 ? "" : "s"}`}
              title={`${savedViewCount} saved view${savedViewCount === 1 ? "" : "s"}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 18,
                height: 18,
                paddingInline: 4,
                borderRadius: 999,
                background:
                  "color-mix(in oklab, var(--status-info-bg) 78%, transparent)",
                color: "var(--status-info-fg)",
                fontSize: "0.625rem",
                fontWeight: 700,
              }}
            >
              {savedViewCount}
            </span>
          ) : undefined,
      };
    });

  if (liveTabs.some((tab) => tab.active)) {
    return liveTabs;
  }

  return [
    {
      id: `current:${currentPath}`,
      label: resolveCurrentRouteLabel(currentPath, capabilities),
      active: true,
      path: currentPath,
    },
    ...liveTabs,
  ];
};

const workspacePaneResourceRoutePath = {
  "operations-home": adminRoutePath.operationsHome,
  support: adminRoutePath.supportOperations,
  audit: adminRoutePath.auditLog,
  vendors: "/desk/vendors",
  runs: "/desk/runs",
  notify: "/desk/notify",
  tenants: adminRoutePath.tenantWorkspaceDiscovery,
  config: adminRoutePath.runtimeConfig,
  "feature-flags": adminRoutePath.featureFlags,
  access: adminRoutePath.accessControl,
  billing: adminRoutePath.billing,
  retention: adminRoutePath.complianceRetention,
  webhook: adminRoutePath.webhooksApiAccess,
  profile: adminRoutePath.profile,
  "admin-members": "/admin/members",
  "admin-workspaces": "/admin/workspaces",
} as const satisfies Record<string, string>;

const resolveWorkspacePaneResources = (
  serializedLayout: string,
): readonly string[] => {
  try {
    const parsed: unknown = JSON.parse(serializedLayout);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("panes" in parsed) ||
      !Array.isArray(parsed.panes)
    ) {
      return [];
    }

    return parsed.panes.flatMap((pane) =>
      typeof pane === "object" &&
      pane !== null &&
      "resource" in pane &&
      typeof pane.resource === "string"
        ? [pane.resource]
        : [],
    );
  } catch {
    return [];
  }
};

const resolveWorkspaceRoutePath = (serializedLayout: string): string => {
  for (const resource of resolveWorkspacePaneResources(serializedLayout)) {
    if (resource in workspacePaneResourceRoutePath) {
      return workspacePaneResourceRoutePath[
        resource as keyof typeof workspacePaneResourceRoutePath
      ];
    }
  }

  return adminRoutePath.operationsHome;
};

const resolveSavedViewRoutePath = (
  resourceKind: AdminSavedViewResourceKind,
): string | undefined => {
  switch (resourceKind) {
    case adminSavedViewResourceKind.tenants:
      return adminRoutePath.tenantWorkspaceDiscovery;
    case adminSavedViewResourceKind.auditEvents:
      return adminRoutePath.auditLog;
    case adminSavedViewResourceKind.billingInvoices:
    case adminSavedViewResourceKind.openmeterUsage:
      return adminRoutePath.billing;
    case adminSavedViewResourceKind.featureFlags:
      return adminRoutePath.featureFlags;
    case adminSavedViewResourceKind.runtimeConfig:
      return adminRoutePath.runtimeConfig;
    case adminSavedViewResourceKind.webhookDeliveries:
      return adminRoutePath.webhooksApiAccess;
    case adminSavedViewResourceKind.workflowRuns:
      return "/desk/runs";
    case adminSavedViewResourceKind.notifications:
      return "/desk/notify";
    case adminSavedViewResourceKind.adminMembers:
      return "/admin/members";
    case adminSavedViewResourceKind.users:
    case adminSavedViewResourceKind.keycloakEvents:
      return undefined;
  }
};

const resolveSavedViewResourceLabel = (
  resourceKind: AdminSavedViewResourceKind,
): string => {
  switch (resourceKind) {
    case adminSavedViewResourceKind.tenants:
      return "Tenants";
    case adminSavedViewResourceKind.auditEvents:
      return "Audit events";
    case adminSavedViewResourceKind.users:
      return "Users";
    case adminSavedViewResourceKind.keycloakEvents:
      return "Keycloak events";
    case adminSavedViewResourceKind.billingInvoices:
      return "Billing invoices";
    case adminSavedViewResourceKind.openmeterUsage:
      return "OpenMeter usage";
    case adminSavedViewResourceKind.featureFlags:
      return "Feature flags";
    case adminSavedViewResourceKind.runtimeConfig:
      return "Runtime config";
    case adminSavedViewResourceKind.webhookDeliveries:
      return "Webhook deliveries";
    case adminSavedViewResourceKind.workflowRuns:
      return "Workflow runs";
    case adminSavedViewResourceKind.notifications:
      return "Notifications";
    case adminSavedViewResourceKind.adminMembers:
      return "Admin members";
  }
};

const runAsReleaseReasons = [
  {
    id: reasonCatalogId.runAsBannerStateRelease,
    label: "Release active run-as grant",
    description:
      "End the acting-as session and return to the operator identity.",
  },
] as const satisfies readonly HighRiskReason[];

const resolveShellActionErrorMessage = (
  error: unknown,
  fallback: string,
): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;

const resolveRunAsActorLabel = (runAsBanner: RunAsBannerState): string => {
  const parts = [
    runAsBanner.actingAsActorType,
    runAsBanner.actingAsActorId,
  ].filter((value): value is string => value !== undefined);

  return parts.length === 0 ? "delegated actor" : parts.join(" · ");
};

const resolveRunAsReason = (runAsBanner: RunAsBannerState): string =>
  runAsBanner.reasonText ?? runAsBanner.reasonId ?? "Break-glass grant active";

const navigateToPath = (
  path: string,
  onNavigate: ((path: string) => void) | undefined,
) => navigateAdminPath(path, onNavigate);

export function DeskShell({
  profile,
  workspaces,
  savedViews,
  runAsBanner,
  children,
  currentPath: currentPathProp,
  onNavigate,
  onReleaseRunAsGrant,
  deviceClass,
}: DeskShellProps) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [runAsReleaseArmed, setRunAsReleaseArmed] = useState(false);
  const [runAsReleaseError, setRunAsReleaseError] = useState<string | null>(
    null,
  );
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
  const activeRunAsBanner = runAsBanner.active ? runAsBanner : undefined;
  const gatedSurfaces = visibleCapabilities.filter(
    (capability) => !capability.allowed,
  );
  const pulseSegments = buildPulseSegments(currentPath, visibleCapabilities);
  const edgeRailItems = buildEdgeRailItems(currentPath, visibleCapabilities);
  const workspaceTabs = buildWorkspaceTabs(
    currentPath,
    visibleCapabilities,
    workspaces,
    savedViews,
  );
  const navigationLinks = visibleCapabilities.filter(
    (capability) => capability.allowed && !capability.routePath.includes("$"),
  );
  const savedViewLinks = useMemo(
    () =>
      [...savedViews]
        .sort((left, right) => {
          if (left.pinned !== right.pinned) {
            return left.pinned ? -1 : 1;
          }

          const leftTimestamp = left.lastUsedAt ?? left.updatedAt;
          const rightTimestamp = right.lastUsedAt ?? right.updatedAt;

          return rightTimestamp.localeCompare(leftTimestamp);
        })
        .map((savedView) => ({
          ...savedView,
          routePath: resolveSavedViewRoutePath(savedView.resourceKind),
          resourceLabel: resolveSavedViewResourceLabel(savedView.resourceKind),
        })),
    [savedViews],
  );
  const featuredSavedViews = useMemo(() => {
    const currentRouteMatches = savedViewLinks.filter(
      (savedView) =>
        savedView.routePath !== undefined &&
        routeMatches(currentPath, savedView.routePath),
    );

    if (currentRouteMatches.length > 0) {
      return currentRouteMatches.slice(0, 4);
    }

    return savedViewLinks.filter((savedView) => savedView.pinned).slice(0, 4);
  }, [currentPath, savedViewLinks]);

  useEffect(() => {
    document.documentElement.dataset.adminShellHydrated = "true";
    return () => {
      delete document.documentElement.dataset.adminShellHydrated;
    };
  }, []);

  useEffect(() => {
    if (!runAsBanner.active) {
      setRunAsReleaseArmed(false);
      setRunAsReleaseError(null);
    }
  }, [runAsBanner.active]);

  const handleRunAsReleaseConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    if (
      activeRunAsBanner?.grantId === undefined ||
      onReleaseRunAsGrant === undefined
    ) {
      return;
    }

    try {
      setRunAsReleaseError(null);
      await onReleaseRunAsGrant({
        grantId: activeRunAsBanner.grantId,
        reasonId: reasonCatalogId.runAsBannerStateRelease,
        reasonAttachmentText: input.note.trim(),
      });
      setRunAsReleaseArmed(false);
    } catch (error) {
      setRunAsReleaseError(
        resolveShellActionErrorMessage(
          error,
          "The active run-as grant could not be released.",
        ),
      );
    }
  };

  return (
    <DeviceProvider>
      <>
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
                  border:
                    "1px solid color-mix(in oklab, white 8%, transparent)",
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
                  data-testid="context-spine-route-card"
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
                  data-testid="context-spine-capability-posture-card"
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
                  <div
                    style={{ fontSize: "0.75rem", color: "var(--fg-muted)" }}
                  >
                    {gatedSurfaces.length === 0
                      ? "No gated surfaces in this session."
                      : `${gatedSurfaces.length} gated surface${gatedSurfaces.length === 1 ? "" : "s"} need higher privilege.`}
                  </div>
                </div>
                <div
                  data-testid="context-spine-saved-views"
                  style={{
                    padding: 6,
                    borderRadius: 10,
                    border:
                      "1px solid color-mix(in oklab, white 8%, transparent)",
                    background:
                      "color-mix(in oklab, var(--canvas-850) 84%, transparent)",
                    display: "grid",
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-condensed)",
                      fontSize: "0.66rem",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--fg-muted)",
                    }}
                  >
                    Saved views
                  </div>
                  {featuredSavedViews.length === 0 ? (
                    <div
                      style={{ fontSize: "0.75rem", color: "var(--fg-muted)" }}
                    >
                      No pinned saved views for this surface yet.
                    </div>
                  ) : (
                    featuredSavedViews.map((savedView) =>
                      savedView.routePath === undefined ? (
                        <div
                          key={savedView.id}
                          style={{
                            display: "grid",
                            gap: 2,
                            padding: "6px 8px",
                            borderRadius: 8,
                            background:
                              "color-mix(in oklab, white 4%, transparent)",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.8rem",
                              color: "var(--fg-elevated)",
                            }}
                          >
                            {savedView.name}
                          </span>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--fg-muted)",
                            }}
                          >
                            {savedView.resourceLabel}
                            {savedView.pinned ? " · pinned" : ""}
                          </span>
                        </div>
                      ) : (
                        <a
                          key={savedView.id}
                          href={savedView.routePath}
                          onClick={(event) => {
                            event.preventDefault();
                            navigateToPath(savedView.routePath!, onNavigate);
                          }}
                          style={{
                            display: "grid",
                            gap: 2,
                            padding: "6px 8px",
                            borderRadius: 8,
                            textDecoration: "none",
                            background: routeMatches(
                              currentPath,
                              savedView.routePath,
                            )
                              ? "color-mix(in oklab, white 6%, transparent)"
                              : "color-mix(in oklab, white 4%, transparent)",
                            color: "var(--fg-elevated)",
                          }}
                        >
                          <span style={{ fontSize: "0.8rem" }}>
                            {savedView.name}
                          </span>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--fg-muted)",
                            }}
                          >
                            {savedView.resourceLabel}
                            {savedView.pinned ? " · pinned" : ""}
                          </span>
                        </a>
                      ),
                    )
                  )}
                </div>
                {activeRunAsBanner?.expiresAt !== undefined ? (
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
                    <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      {resolveRunAsActorLabel(activeRunAsBanner)}
                    </div>
                    <div style={{ fontSize: "0.75rem", marginTop: 2 }}>
                      {resolveRunAsReason(activeRunAsBanner)}
                    </div>
                    <div
                      className="mono"
                      style={{ fontSize: "0.72rem", marginTop: 2 }}
                    >
                      until {activeRunAsBanner.expiresAt}
                    </div>
                  </div>
                ) : null}
                {runAsReleaseError !== null ? (
                  <div
                    data-testid="desk-shell-run-as-error"
                    style={{
                      padding: 6,
                      borderRadius: 10,
                      border: "1px solid var(--status-error-border)",
                      background:
                        "color-mix(in oklab, var(--status-error-bg) 84%, transparent)",
                      color: "var(--status-error-fg)",
                      fontSize: "0.75rem",
                    }}
                  >
                    {runAsReleaseError}
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
                  {activeRunAsBanner?.expiresAt !== undefined ? (
                    <RunAsBanner
                      actorLabel={resolveRunAsActorLabel(activeRunAsBanner)}
                      reason={resolveRunAsReason(activeRunAsBanner)}
                      expiresAtIso={activeRunAsBanner.expiresAt}
                      {...(activeRunAsBanner.releasable &&
                      activeRunAsBanner.grantId !== undefined &&
                      onReleaseRunAsGrant !== undefined
                        ? {
                            onRelease: () => {
                              setRunAsReleaseError(null);
                              setRunAsReleaseArmed(true);
                            },
                          }
                        : {})}
                    />
                  ) : null}
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
                </div>
              }
            />
          }
        />
        {runAsReleaseArmed && activeRunAsBanner?.grantId !== undefined ? (
          <HighRiskActionGuard
            action={{
              id: "run-as-banner-release",
              label: "Release active run-as grant",
            }}
            selection={[activeRunAsBanner.grantId]}
            reasons={runAsReleaseReasons}
            requireNote
            confirmLabel="Release"
            renderSelectionSummary={() => (
              <div style={{ display: "grid", gap: 4 }}>
                <strong>{resolveRunAsActorLabel(activeRunAsBanner)}</strong>
                <span style={{ fontSize: "0.75rem", color: "var(--fg-muted)" }}>
                  {resolveRunAsReason(activeRunAsBanner)}
                </span>
              </div>
            )}
            onConfirm={handleRunAsReleaseConfirm}
            onCancel={() => setRunAsReleaseArmed(false)}
          />
        ) : null}
      </>
    </DeviceProvider>
  );
}
