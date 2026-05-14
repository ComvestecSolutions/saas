/// <reference types="vite/client" />

import type { ReactNode } from "react";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { AdminShell, type SideNavProps } from "@comvestec/ui";
import {
  adminOperatorCapability,
  type AdminOperatorCapability,
} from "@comvestec/contracts";
import appCss from "../styles/app.css?url";
import { loadAdminShellLoaderData } from "../lib/admin-shell-loader";
import type { AdminShellRouteData } from "../lib/admin-shell-route-data";

export const Route = createRootRoute({
  head: () => ({
    links: [{ rel: "stylesheet", href: appCss }],
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Comvestec Operations" },
    ],
  }),
  loader: () => loadAdminShellLoaderData(),
  component: RootComponent,
});

// Icon SVGs — inline, no icon-library dependency
const HomeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M2 6.5L8 2l6 4.5V14a.5.5 0 01-.5.5h-4V10h-3v4.5h-4A.5.5 0 012 14V6.5z"
      stroke="currentColor"
      strokeWidth="1.4"
      fill="none"
    />
  </svg>
);

const WrenchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M11.5 2.5a3 3 0 00-3 3c0 .4.07.79.2 1.14L2 13.5 2.5 14l5.86-6.7c.35.13.74.2 1.14.2a3 3 0 000-6z"
      stroke="currentColor"
      strokeWidth="1.4"
      fill="none"
    />
  </svg>
);

const TenantIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect
      x="2"
      y="7"
      width="12"
      height="7"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.4"
      fill="none"
    />
    <path
      d="M5 7V5a3 3 0 016 0v2"
      stroke="currentColor"
      strokeWidth="1.4"
      fill="none"
    />
  </svg>
);

const ConfigIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle
      cx="8"
      cy="8"
      r="2"
      stroke="currentColor"
      strokeWidth="1.4"
      fill="none"
    />
    <path
      d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"
      stroke="currentColor"
      strokeWidth="1.3"
    />
  </svg>
);

const FlagIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M3 2v12M3 2h8l-2 4 2 4H3"
      stroke="currentColor"
      strokeWidth="1.4"
      fill="none"
    />
  </svg>
);

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect
      x="3"
      y="7"
      width="10"
      height="7"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.4"
      fill="none"
    />
    <path
      d="M5 7V5a3 3 0 016 0v2"
      stroke="currentColor"
      strokeWidth="1.4"
      fill="none"
    />
  </svg>
);

const AuditIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect
      x="3"
      y="2"
      width="10"
      height="12"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.4"
      fill="none"
    />
    <path d="M6 6h4M6 9h4M6 12h2" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

const SupportIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle
      cx="8"
      cy="8"
      r="6"
      stroke="currentColor"
      strokeWidth="1.4"
      fill="none"
    />
    <path
      d="M5.5 6a2.5 2.5 0 014.95.62c0 1.37-1.5 2.13-1.5 2.13M8 12v.5"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const BrandingIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M2 12l4-4 3 3 2-2 3 4H2z"
      stroke="currentColor"
      strokeWidth="1.4"
      fill="none"
    />
    <circle
      cx="11.5"
      cy="4.5"
      r="1.5"
      stroke="currentColor"
      strokeWidth="1.3"
      fill="none"
    />
  </svg>
);

const BillingIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect
      x="2"
      y="3"
      width="12"
      height="10"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.4"
      fill="none"
    />
    <path d="M2 7h12M6 10h1M9 10h1" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

const RetentionIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M8 2a6 6 0 100 12A6 6 0 008 2z"
      stroke="currentColor"
      strokeWidth="1.4"
      fill="none"
    />
    <path
      d="M8 5v3l2 2"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const WebhookIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M6 8a2 2 0 100-4 2 2 0 000 4z"
      stroke="currentColor"
      strokeWidth="1.3"
      fill="none"
    />
    <path
      d="M6 8l2 4h4M8 4H4a2 2 0 000 4"
      stroke="currentColor"
      strokeWidth="1.3"
      fill="none"
    />
  </svg>
);

type AdminRenderLinkProps = {
  href: string;
  className: string;
  title?: string;
  "aria-current"?: "page";
  children: ReactNode;
};

function AdminRenderLink({ href, children, ...rest }: AdminRenderLinkProps) {
  if (href === "#") {
    return (
      <span style={{ display: "block" }} {...rest}>
        {children}
      </span>
    );
  }

  return (
    <Link
      to={href as "/"}
      style={{ textDecoration: "none", display: "block" }}
      {...rest}
    >
      {children}
    </Link>
  );
}

type NavDefinition = {
  readonly capability: AdminOperatorCapability;
  readonly href: string;
  readonly label: string;
  readonly icon: ReactNode;
};

const primaryNavItems = [
  {
    capability: adminOperatorCapability.operationsHome,
    href: "/",
    label: "Operations Home",
    icon: <HomeIcon />,
  },
  {
    capability: adminOperatorCapability.repairOperations,
    href: "/repair-operations",
    label: "Repair Operations",
    icon: <WrenchIcon />,
  },
  {
    capability: adminOperatorCapability.tenantWorkspace,
    href: "/tenants",
    label: "Tenant Workspace",
    icon: <TenantIcon />,
  },
] as const satisfies readonly NavDefinition[];

const governanceNavItems = [
  {
    capability: adminOperatorCapability.runtimeConfig,
    href: "/governance/runtime-config",
    label: "Runtime Config",
    icon: <ConfigIcon />,
  },
  {
    capability: adminOperatorCapability.featureFlags,
    href: "/governance/feature-flags",
    label: "Feature Flags",
    icon: <FlagIcon />,
  },
  {
    capability: adminOperatorCapability.accessControl,
    href: "/governance/access-control",
    label: "Access Control",
    icon: <LockIcon />,
  },
  {
    capability: adminOperatorCapability.auditLog,
    href: "/governance/audit-log",
    label: "Audit Log",
    icon: <AuditIcon />,
  },
] as const satisfies readonly NavDefinition[];

const operationsNavItems = [
  {
    capability: adminOperatorCapability.supportOperations,
    href: "/support-operations",
    label: "Support Operations",
    icon: <SupportIcon />,
  },
  {
    capability: adminOperatorCapability.branding,
    href: "/branding",
    label: "Branding & Domains",
    icon: <BrandingIcon />,
  },
  {
    capability: adminOperatorCapability.billing,
    href: "/billing",
    label: "Billing & Entitlements",
    icon: <BillingIcon />,
  },
  {
    capability: adminOperatorCapability.complianceRetention,
    href: "/compliance-retention",
    label: "Compliance & Retention",
    icon: <RetentionIcon />,
  },
] as const satisfies readonly NavDefinition[];

const integrationNavItems = [
  {
    capability: adminOperatorCapability.webhooksApiAccess,
    href: "/integrations/webhooks-api-access",
    label: "Webhooks & API Access",
    icon: <WebhookIcon />,
  },
] as const satisfies readonly NavDefinition[];

const resolveNavItem = (
  currentPath: string,
  definition: NavDefinition,
  shellData: AdminShellRouteData,
) => {
  const capabilityEntry =
    shellData.kind === "ready"
      ? shellData.capabilities.capabilities.find(
          (entry) => entry.capability === definition.capability,
        )
      : undefined;

  if (shellData.kind === "ready" && capabilityEntry?.visible !== true) {
    return null;
  }

  return {
    href:
      shellData.kind === "ready" && capabilityEntry?.allowed === true
        ? definition.href
        : "#",
    label: definition.label,
    icon: definition.icon,
    isActive:
      definition.href === "/"
        ? currentPath === "/"
        : currentPath === definition.href ||
          currentPath.startsWith(`${definition.href}/`),
    allowed:
      shellData.kind === "ready" ? capabilityEntry?.allowed === true : false,
  };
};

function buildNavGroups(
  currentPath: string,
  shellData: AdminShellRouteData,
): SideNavProps["navGroups"] {
  const primaryItems = primaryNavItems
    .map((item) => resolveNavItem(currentPath, item, shellData))
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const governanceItems = governanceNavItems
    .map((item) => resolveNavItem(currentPath, item, shellData))
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const operationsItems = operationsNavItems
    .map((item) => resolveNavItem(currentPath, item, shellData))
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const integrationItems = integrationNavItems
    .map((item) => resolveNavItem(currentPath, item, shellData))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return [
    ...primaryItems,
    ...(governanceItems.length === 0
      ? []
      : [{ label: "Governance", items: governanceItems }]),
    ...(operationsItems.length === 0 ? [] : operationsItems),
    ...(integrationItems.length === 0
      ? []
      : [{ label: "Integrations", items: integrationItems }]),
  ] satisfies SideNavProps["navGroups"];
}

function RootComponent() {
  const shellData = Route.useLoaderData() ?? ({ kind: "shell" } as const);
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const tenantMatch = routerState.matches.find(
    (
      match,
    ): match is (typeof routerState.matches)[number] & {
      params: { tenantId: string };
    } =>
      typeof match.params === "object" &&
      match.params !== null &&
      "tenantId" in match.params,
  );
  const tenantId = tenantMatch?.params.tenantId;
  const navGroups = buildNavGroups(currentPath, shellData);
  const contextChips = [
    { label: "Env", value: "platform" },
    ...(shellData.kind === "ready"
      ? [
          {
            label: "Actor",
            value: shellData.capabilities.actorType,
          },
          ...(shellData.capabilities.actorId === undefined
            ? []
            : [
                {
                  label: "Actor ID",
                  value: shellData.capabilities.actorId,
                  mono: true,
                },
              ]),
          ...(shellData.capabilities.sessionId === undefined
            ? []
            : [
                {
                  label: "Session",
                  value: shellData.capabilities.sessionId,
                  mono: true,
                },
              ]),
        ]
      : [
          {
            label: "Session",
            value:
              shellData.kind === "stale-session"
                ? "stale-session"
                : "anonymous",
            mono: true,
          },
        ]),
    ...(tenantId === undefined
      ? []
      : [{ label: "Tenant", value: tenantId, mono: true }]),
  ];

  return (
    <RootDocument>
      <AdminShell
        navGroups={navGroups}
        currentPath={currentPath}
        contextChips={contextChips}
        renderLink={AdminRenderLink}
      >
        <Outlet />
      </AdminShell>
      <TanStackRouterDevtools position="bottom-right" />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
