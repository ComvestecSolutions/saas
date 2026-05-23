import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Pane } from "@comvestec/ui";
import { adminRoutePath } from "@comvestec/contracts";
import { ScreenHeader } from "../../components/ui";
import { createAdminAppFileRoute } from "../../file-route";

type KnownResourceWorkspace = {
  readonly label: string;
  readonly path: string;
  readonly description: string;
  readonly keywords: readonly string[];
};

const knownResourceWorkspaces = [
  {
    label: "Tenant directory",
    path: adminRoutePath.tenantWorkspaceDiscovery,
    description:
      "Search tenants, inspect posture, and launch the full tenant workspace.",
    keywords: ["tenant", "tenants", "workspace", "fleet", "organization"],
  },
  {
    label: "Audit explorer",
    path: adminRoutePath.auditLog,
    description:
      "Trace incidents, reveals, and correlation trails in the live audit stream.",
    keywords: ["audit", "event", "log", "logs", "trail", "investigation"],
  },
  {
    label: "Runtime config",
    path: adminRoutePath.runtimeConfig,
    description:
      "Inspect defaults, overrides, proposals, and effective runtime values.",
    keywords: ["config", "runtime", "setting", "settings", "module"],
  },
  {
    label: "Feature flags",
    path: adminRoutePath.featureFlags,
    description:
      "Review rollout posture, dependencies, and lifecycle state for flags.",
    keywords: ["flag", "flags", "feature", "rollout", "experiment"],
  },
  {
    label: "Access control",
    path: adminRoutePath.accessControl,
    description:
      "Inspect tuples, policy posture, and operator access surfaces.",
    keywords: [
      "access",
      "auth",
      "authorization",
      "permission",
      "permissions",
      "tuple",
    ],
  },
  {
    label: "Billing operations",
    path: adminRoutePath.billing,
    description:
      "Review revenue posture, invoice issues, and reconciliation gaps.",
    keywords: ["billing", "revenue", "invoice", "meter", "usage", "payment"],
  },
  {
    label: "Branding studio",
    path: adminRoutePath.branding,
    description:
      "Manage brand posture, domains, and tenant-facing identity controls.",
    keywords: ["brand", "branding", "domain", "dns", "sender", "identity"],
  },
  {
    label: "Support command",
    path: adminRoutePath.supportOperations,
    description:
      "Handle support cases, break-glass grants, and incident pivots.",
    keywords: ["support", "incident", "case", "breakglass", "impersonation"],
  },
  {
    label: "Retention console",
    path: adminRoutePath.complianceRetention,
    description:
      "Review legal holds, retention policies, and scheduled purge pressure.",
    keywords: ["retention", "legal", "hold", "compliance", "purge"],
  },
  {
    label: "Webhook operations",
    path: adminRoutePath.webhooksApiAccess,
    description:
      "Inspect subscriptions, deliveries, API keys, and retry posture.",
    keywords: ["webhook", "delivery", "api", "key", "integration", "signature"],
  },
  {
    label: "Workflow runs",
    path: "/r/runs",
    description:
      "Inspect replay, cancel, and step-level workflow execution timelines.",
    keywords: ["workflow", "run", "runs", "job", "queue", "replay", "cancel"],
  },
  {
    label: "Notification center",
    path: "/r/notify",
    description:
      "Track notification delivery state, resend flows, and provider analytics.",
    keywords: ["notify", "notification", "message", "messages", "delivery"],
  },
  {
    label: "Vendor intelligence",
    path: "/r/vendors",
    description:
      "Review vendor health, latency, incidents, and deep-link handoffs.",
    keywords: ["vendor", "vendors", "service", "latency", "health", "provider"],
  },
  {
    label: "Mission control",
    path: adminRoutePath.operationsHome,
    description:
      "Return to the main command deck and reopen a trusted workbench route.",
    keywords: ["desk", "home", "mission", "control", "overview"],
  },
] as const satisfies ReadonlyArray<KnownResourceWorkspace>;

const defaultSuggestionPaths = new Set([
  adminRoutePath.tenantWorkspaceDiscovery,
  adminRoutePath.auditLog,
  "/r/runs",
  "/r/vendors",
]);

const tokenize = (value: string): readonly string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 0);

const scoreWorkspace = (
  workspace: KnownResourceWorkspace,
  requestedTokens: readonly string[],
): number => {
  if (requestedTokens.length === 0) {
    return defaultSuggestionPaths.has(workspace.path) ? 1 : 0;
  }

  const haystacks = [
    workspace.label.toLowerCase(),
    workspace.path.toLowerCase(),
    ...workspace.keywords,
  ];

  return requestedTokens.reduce((score, token) => {
    const directMatch = haystacks.some(
      (candidate) => candidate.includes(token) || token.includes(candidate),
    );
    return score + (directMatch ? 2 : 0);
  }, 0);
};

/**
 * `/r/$` — catch-all Operator Desk resource recovery workspace.
 *
 * Instead of dead-ending with a placeholder pane, unknown resource
 * paths now resolve to a recovery surface that echoes the requested
 * slug, suggests the closest shipped control surfaces, and gives the
 * operator quick links back into useful work.
 */
export const Route = createAdminAppFileRoute("/r/$")({
  component: ResourceCatchAllRoute,
});

function ResourceCatchAllRoute() {
  const params = Route.useParams() as Readonly<{ _splat?: string }>;
  const resource = params._splat ?? "";
  const requestedPath = resource.length === 0 ? "/r" : `/r/${resource}`;

  const rankedWorkspaces = useMemo(() => {
    const requestedTokens = tokenize(resource);
    return [...knownResourceWorkspaces]
      .map((workspace) => ({
        workspace,
        score: scoreWorkspace(workspace, requestedTokens),
      }))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return left.workspace.label.localeCompare(
          right.workspace.label,
          undefined,
          {
            sensitivity: "base",
          },
        );
      });
  }, [resource]);

  const primarySuggestions = rankedWorkspaces
    .filter(({ score }) => score > 0)
    .map(({ workspace }) => workspace)
    .slice(0, 4);

  const fallbackSuggestions = knownResourceWorkspaces.filter((workspace) =>
    defaultSuggestionPaths.has(workspace.path),
  );

  const suggestions =
    primarySuggestions.length > 0 ? primarySuggestions : fallbackSuggestions;

  const remainingWorkspaces = rankedWorkspaces
    .map(({ workspace }) => workspace)
    .filter(
      (workspace) =>
        suggestions.some((suggestion) => suggestion.path === workspace.path) ===
        false,
    );

  return (
    <Pane title={resource.length === 0 ? "Unknown resource" : resource}>
      <section
        data-testid="unknown-resource-ready"
        style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
      >
        <ScreenHeader
          title="Unknown resource workspace"
          breadcrumbs={[{ label: "Resources" }, { label: "Recovery" }]}
          subtitle={
            <>
              The requested path <span className="mono">{requestedPath}</span>{" "}
              does not map to a shipped Operator Desk workspace. Open one of the
              nearby surfaces below instead of losing the workbench context.
            </>
          }
        />

        <section
          data-testid="unknown-resource-summary"
          style={{
            display: "grid",
            gap: 8,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          }}
        >
          <RecoveryTile
            label="Requested slug"
            value={resource.length === 0 ? "none" : resource}
            description="Echoed exactly so the operator can confirm the bad deep link."
          />
          <RecoveryTile
            label="Closest matches"
            value={suggestions.length.toString()}
            description="Suggested from the requested slug and known resource keywords."
          />
          <RecoveryTile
            label="Known surfaces"
            value={knownResourceWorkspaces.length.toString()}
            description="Shipped command surfaces available from this recovery pane."
          />
        </section>

        <section
          data-testid="unknown-resource-suggestions"
          style={{ display: "grid", gap: 8 }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>Closest matches</p>
          <div
            style={{
              display: "grid",
              gap: 8,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            {suggestions.map((workspace) => (
              <ResourceLinkCard key={workspace.path} workspace={workspace} />
            ))}
          </div>
        </section>

        <section
          data-testid="unknown-resource-all-workspaces"
          style={{ display: "grid", gap: 8 }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>All resource surfaces</p>
          <div style={{ display: "grid", gap: 6 }}>
            {remainingWorkspaces.map((workspace) => (
              <div
                key={workspace.path}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: 8,
                  borderRadius: 8,
                  border: "1px solid var(--bg-2)",
                }}
              >
                <div style={{ display: "grid", gap: 2 }}>
                  <span>{workspace.label}</span>
                  <span className="ops-text-muted">
                    {workspace.description}
                  </span>
                </div>
                <Link className="ops-btn ops-btn--xs" to={workspace.path}>
                  Open
                </Link>
              </div>
            ))}
          </div>
        </section>
      </section>
    </Pane>
  );
}

function RecoveryTile({
  label,
  value,
  description,
}: {
  readonly label: string;
  readonly value: string;
  readonly description: string;
}) {
  return (
    <section
      style={{
        display: "grid",
        gap: 4,
        padding: 8,
        borderRadius: 8,
        border: "1px solid var(--bg-2)",
      }}
    >
      <span className="ops-text-muted">{label}</span>
      <span className="mono" style={{ fontSize: "1rem" }}>
        {value}
      </span>
      <span className="ops-text-muted">{description}</span>
    </section>
  );
}

function ResourceLinkCard({
  workspace,
}: {
  readonly workspace: KnownResourceWorkspace;
}) {
  return (
    <Link
      to={workspace.path}
      data-testid="unknown-resource-link"
      style={{
        display: "grid",
        gap: 6,
        padding: 8,
        borderRadius: 8,
        border: "1px solid var(--bg-2)",
        textDecoration: "none",
        color: "inherit",
        background: "rgba(255, 255, 255, 0.02)",
      }}
    >
      <div style={{ display: "grid", gap: 2 }}>
        <span style={{ fontWeight: 700 }}>{workspace.label}</span>
        <span className="ops-text-muted">{workspace.description}</span>
      </div>
      <span className="mono" style={{ opacity: 0.7 }}>
        {workspace.path}
      </span>
    </Link>
  );
}
