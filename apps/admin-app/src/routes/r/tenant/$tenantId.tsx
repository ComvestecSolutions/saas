import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Pane,
  PermissionDeniedState,
  StatusChip,
  resolveStatusVariant,
} from "@comvestec/ui";
import {
  authorizationRelation,
  tenantMembershipMutationAction,
  tenantMembershipRelations,
} from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../../file-route";
import { AdminSessionRequiredState } from "../../../components/admin-session-required-state";
import {
  ChevronLeft,
  FilterBar,
  KpiCard,
  Tabs,
  type KpiTone,
  ScreenHeader,
} from "../../../components/ui";
import {
  buildAdminTenantTarget,
  sanitizeAdminTenantTargetScope,
  type AdminTenantTarget,
} from "../../../lib/admin-tenant-target";
import {
  encodeAdminRouteTenantTargets,
  type AdminRouteTenantTarget,
} from "../../../lib/admin-route-tenant-targets";
import type {
  AdminTenantWorkspaceV2RouteSnapshot,
  AdminTenantWorkspaceV2RouteUsageSpotlight,
} from "../../../lib/tenant-workspace-v2-route-data";
import {
  issueAdminTenantInvitation,
  mutateAdminTenantMembership,
  revokeAdminTenantInvitation,
} from "../../../lib/tenant-workspace-mutations-server";

type TenantWorkspaceV2Search = {
  readonly scope?: ReturnType<typeof sanitizeAdminTenantTargetScope>;
};

type TenantWorkspaceTab =
  | "overview"
  | "members"
  | "billing"
  | "branding"
  | "audit"
  | "repair"
  | "support"
  | "danger-zone";

type MemberFilter =
  | "all"
  | "owners"
  | "admins"
  | "members"
  | "viewers"
  | "dormant";

type IncidentFilter = "all" | "critical" | "warning" | "info";

const tenantWorkspaceTabs: ReadonlyArray<TenantWorkspaceTab> = [
  "overview",
  "members",
  "billing",
  "branding",
  "audit",
  "repair",
  "support",
  "danger-zone",
] as const;

const tenantWorkspaceTabLabel: Record<TenantWorkspaceTab, string> = {
  overview: "Overview",
  members: "Members & Invitations",
  billing: "Billing",
  branding: "Branding",
  audit: "Audit",
  repair: "Repair",
  support: "Support",
  "danger-zone": "Danger Zone",
};

const canonicalAdminRoute = {
  tenants: "/r/tenants",
  billing: "/r/billing",
  branding: "/r/branding",
  retention: "/r/retention",
  webhook: "/r/webhook",
  support: "/r/support",
  audit: "/r/audit",
  runs: "/r/runs",
  repair: "/repair-operations",
  access: "/r/access",
} as const;

const paneGridStyle = {
  display: "grid",
  gap: 8,
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
} as const;

const parseTenantWorkspaceV2Search = (
  search: Record<string, unknown>,
): TenantWorkspaceV2Search => {
  const scope = sanitizeAdminTenantTargetScope(search.scope);
  return scope === undefined ? {} : { scope };
};

const formatActionError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "reason" in error &&
    typeof (error as { reason: unknown }).reason === "string"
  ) {
    return (error as { reason: string }).reason;
  }

  return "The tenant management action did not complete successfully.";
};

const formatTimestamp = (value: string | undefined): string =>
  value === undefined ? "—" : value.slice(0, 19).replace("T", " ");

const formatTtl = (ttlSeconds: number): string => {
  if (ttlSeconds >= 86_400) {
    return `${Math.ceil(ttlSeconds / 86_400)}d`;
  }
  if (ttlSeconds >= 3_600) {
    return `${Math.ceil(ttlSeconds / 3_600)}h`;
  }
  return `${Math.max(1, Math.ceil(ttlSeconds / 60))}m`;
};

const resolveUsageTone = (
  tone: AdminTenantWorkspaceV2RouteUsageSpotlight["tone"],
): KpiTone => {
  switch (tone) {
    case "nominal":
      return "good";
    case "pending":
      return "warn";
    case "error":
      return "alert";
    default:
      return "accent";
  }
};

const formatTrend = (
  spotlight: AdminTenantWorkspaceV2RouteUsageSpotlight,
): string => {
  const prefix =
    spotlight.trend.direction === "up"
      ? "up"
      : spotlight.trend.direction === "down"
        ? "down"
        : "flat";
  return `${prefix} ${Math.abs(spotlight.trend.delta)} in ${spotlight.trend.windowMinutes}m`;
};

const buildAuditWorkspacePath = (
  target: Readonly<AdminTenantTarget>,
): string => {
  const search = new URLSearchParams();
  search.set("tenantScope", target.scope);
  search.set("tenantScopeId", target.scopeId);
  return `${canonicalAdminRoute.audit}?${search.toString()}`;
};

const buildScopedResourcePath = (
  basePath: string,
  target: Readonly<AdminTenantTarget>,
): string => {
  const search = new URLSearchParams();
  search.set("scope", target.scope);
  search.set("scopeId", target.scopeId);
  return `${basePath}?${search.toString()}`;
};

const buildEncodedTenantResourcePath = (
  basePath: string,
  target: Readonly<AdminRouteTenantTarget>,
): string => {
  const encoded = encodeAdminRouteTenantTargets([target]);
  if (encoded === undefined) {
    return basePath;
  }
  const search = new URLSearchParams();
  search.set("tenants", JSON.stringify(encoded));
  return `${basePath}?${search.toString()}`;
};

const resolveApprovalTone = (ttlSeconds: number): KpiTone =>
  ttlSeconds <= 3_600 ? "alert" : ttlSeconds <= 14_400 ? "warn" : "accent";

const resolveRoleTone = (
  role: AdminTenantWorkspaceV2RouteSnapshot["members"][number]["role"],
): KpiTone => {
  switch (role) {
    case "owner":
      return "good";
    case "admin":
      return "accent";
    case "viewer":
      return "warn";
    default:
      return "neutral";
  }
};

const resolveFocusedSection = (
  snapshot: AdminTenantWorkspaceV2RouteSnapshot,
):
  | { readonly kind: "approval" }
  | { readonly kind: "incident" }
  | { readonly kind: "spotlight" }
  | { readonly kind: "activity" }
  | { readonly kind: "member" }
  | { readonly kind: "empty" } => {
  if (snapshot.pendingTenantApprovals.length > 0) {
    return { kind: "approval" };
  }
  if (snapshot.openIncidents.length > 0) {
    return { kind: "incident" };
  }
  if (snapshot.usageSpotlights.length > 0) {
    return { kind: "spotlight" };
  }
  if (snapshot.recentActivity.length > 0) {
    return { kind: "activity" };
  }
  if (snapshot.members.length > 0) {
    return { kind: "member" };
  }
  return { kind: "empty" };
};

export const Route = createAdminAppFileRoute("/r/tenant/$tenantId")({
  validateSearch: parseTenantWorkspaceV2Search,
  loaderDeps: ({ search }) => ({ scope: search.scope }),
  loader: ({ deps, params }) =>
    import("../../../lib/tenant-workspace-v2-loader").then(
      ({ loadAdminTenantWorkspaceV2LoaderData }) =>
        loadAdminTenantWorkspaceV2LoaderData({
          tenantId: params.tenantId,
          ...(deps.scope === undefined ? {} : { scope: deps.scope }),
        }),
    ),
  component: TenantWorkspaceV2Route,
  pendingComponent: () => <LoadingState title="Loading tenant workspace…" />,
});

function TenantWorkspaceV2Route() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const mutateMembership = useServerFn(mutateAdminTenantMembership);
  const issueInvitation = useServerFn(issueAdminTenantInvitation);
  const revokeInvitation = useServerFn(revokeAdminTenantInvitation);
  const [tab, setTab] = useState<TenantWorkspaceTab>("overview");
  const [memberFilter, setMemberFilter] = useState<MemberFilter>("all");
  const [memberSearch, setMemberSearch] = useState("");
  const [activitySearch, setActivitySearch] = useState("");
  const [approvalSearch, setApprovalSearch] = useState("");
  const [incidentFilter, setIncidentFilter] = useState<IncidentFilter>("all");
  const [incidentSearch, setIncidentSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [membershipSubject, setMembershipSubject] = useState("");
  const [membershipRelation, setMembershipRelation] = useState<
    (typeof tenantMembershipRelations)[number]
  >(authorizationRelation.member);
  const [membershipAction, setMembershipAction] = useState<
    | typeof tenantMembershipMutationAction.grant
    | typeof tenantMembershipMutationAction.revoke
  >(tenantMembershipMutationAction.grant);
  const [membershipReason, setMembershipReason] = useState("");
  const [membershipStatus, setMembershipStatus] = useState<{
    readonly kind: "success" | "error";
    readonly message: string;
  } | null>(null);
  const [invitationEmail, setInvitationEmail] = useState("");
  const [invitationRelation, setInvitationRelation] = useState<
    (typeof tenantMembershipRelations)[number]
  >(authorizationRelation.member);
  const [invitationReason, setInvitationReason] = useState("");
  const [invitationId, setInvitationId] = useState("");
  const [invitationRevocationReason, setInvitationRevocationReason] =
    useState("");
  const [invitationStatus, setInvitationStatus] = useState<{
    readonly kind: "success" | "error";
    readonly message: string;
  } | null>(null);

  if (data.kind === "shell") {
    return (
      <AdminSessionRequiredState
        title="Operator session required"
        description="Sign in with a platform-operator session to access the tenant workspace."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <AdminSessionRequiredState
        title="Session refresh required"
        description="Re-authenticate before accessing tenant workspace."
        stale
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <PermissionDeniedState title="Access denied" description={data.reason} />
    );
  }
  if (data.kind === "error") {
    return (
      <ErrorState
        title={data.title}
        description={data.description}
        action={
          <Link className="ops-btn" to={canonicalAdminRoute.tenants}>
            <ChevronLeft size={12} /> Return to tenant discovery
          </Link>
        }
      />
    );
  }

  const { snapshot, partialFailures } = data;
  const tenant = snapshot.tenant;
  const tenantScope = sanitizeAdminTenantTargetScope(tenant.scope);
  const tenantTarget = buildAdminTenantTarget({
    scope: tenant.scope,
    scopeId: tenant.scopeId,
  });

  if (tenantScope === undefined || tenantTarget === undefined) {
    return (
      <ErrorState
        title="Tenant workspace unavailable"
        description="The current route is missing a supported tenant scope."
      />
    );
  }

  const auditWorkspacePath = buildAuditWorkspacePath(tenantTarget);
  const billingWorkspacePath = buildEncodedTenantResourcePath(
    canonicalAdminRoute.billing,
    tenantTarget,
  );
  const brandingWorkspacePath = buildEncodedTenantResourcePath(
    canonicalAdminRoute.branding,
    tenantTarget,
  );
  const retentionWorkspacePath = buildScopedResourcePath(
    canonicalAdminRoute.retention,
    tenantTarget,
  );
  const webhookWorkspacePath = buildScopedResourcePath(
    canonicalAdminRoute.webhook,
    tenantTarget,
  );
  const partialFailureCount = partialFailures.length;
  const memberCount = snapshot.members.length;
  const recentActivityCount = snapshot.recentActivity.length;
  const incidentCount = snapshot.openIncidents.length;
  const usageSpotlightCount = snapshot.usageSpotlights.length;
  const pendingApprovalCount = snapshot.pendingTenantApprovals.length;
  const roleCounts = snapshot.members.reduce(
    (acc, member) => {
      acc[member.role] += 1;
      return acc;
    },
    { owner: 0, admin: 0, member: 0, viewer: 0 },
  );
  const dormantMembers = snapshot.members.filter(
    (member) => member.lastSeenAt === undefined,
  ).length;
  const criticalIncidents = snapshot.openIncidents.filter(
    (incident) => incident.severity === "critical",
  ).length;
  const focusKind = resolveFocusedSection(snapshot);
  const focusedApproval = snapshot.pendingTenantApprovals[0];
  const focusedIncident = snapshot.openIncidents[0];
  const focusedSpotlight = snapshot.usageSpotlights[0];
  const focusedActivity = snapshot.recentActivity[0];
  const focusedMember = snapshot.members[0];

  const filteredMembers = useMemo(
    () =>
      snapshot.members.filter((member) => {
        const matchesFilter =
          memberFilter === "all"
            ? true
            : memberFilter === "owners"
              ? member.role === "owner"
              : memberFilter === "admins"
                ? member.role === "admin"
                : memberFilter === "members"
                  ? member.role === "member"
                  : memberFilter === "viewers"
                    ? member.role === "viewer"
                    : member.lastSeenAt === undefined;
        const loweredSearch = memberSearch.trim().toLowerCase();
        const matchesSearch =
          loweredSearch.length === 0
            ? true
            : [member.subjectId, member.displayName, member.role]
                .join(" ")
                .toLowerCase()
                .includes(loweredSearch);
        return matchesFilter && matchesSearch;
      }),
    [memberFilter, memberSearch, snapshot.members],
  );

  const filteredActivity = useMemo(
    () =>
      snapshot.recentActivity.filter((entry) => {
        const loweredSearch = activitySearch.trim().toLowerCase();
        return (
          loweredSearch.length === 0 ||
          [
            entry.actor,
            entry.action,
            entry.target,
            entry.classification,
            formatTimestamp(entry.occurredAt),
          ]
            .join(" ")
            .toLowerCase()
            .includes(loweredSearch)
        );
      }),
    [activitySearch, snapshot.recentActivity],
  );

  const filteredApprovals = useMemo(
    () =>
      snapshot.pendingTenantApprovals.filter((approval) => {
        const loweredSearch = approvalSearch.trim().toLowerCase();
        return (
          loweredSearch.length === 0 ||
          [
            approval.kind,
            approval.target,
            approval.requestedBy,
            approval.reasonPreview,
          ]
            .join(" ")
            .toLowerCase()
            .includes(loweredSearch)
        );
      }),
    [approvalSearch, snapshot.pendingTenantApprovals],
  );

  const filteredIncidents = useMemo(
    () =>
      snapshot.openIncidents.filter((incident) => {
        const matchesFilter =
          incidentFilter === "all"
            ? true
            : incident.severity === incidentFilter;
        const loweredSearch = incidentSearch.trim().toLowerCase();
        const matchesSearch =
          loweredSearch.length === 0
            ? true
            : [incident.id, incident.vendor, incident.title, incident.summary]
                .join(" ")
                .toLowerCase()
                .includes(loweredSearch);
        return matchesFilter && matchesSearch;
      }),
    [incidentFilter, incidentSearch, snapshot.openIncidents],
  );

  const launchpadLinks = [
    {
      label: "Tenant directory",
      hint: "Return to the scoped discovery board.",
      href: canonicalAdminRoute.tenants,
    },
    {
      label: "Billing",
      hint: "Invoices, metering, and revenue posture.",
      href: billingWorkspacePath,
    },
    {
      label: "Branding",
      hint: "Brand state, domains, and publication.",
      href: brandingWorkspacePath,
    },
    {
      label: "Retention",
      hint: "Policies, holds, and schedule posture.",
      href: retentionWorkspacePath,
    },
    {
      label: "Webhooks",
      hint: "Endpoints, deliveries, and retry posture.",
      href: webhookWorkspacePath,
    },
    {
      label: "Audit",
      hint: "Tenant-scoped activity explorer.",
      href: auditWorkspacePath,
    },
    {
      label: "Support",
      hint: "Incidents, break-glass, and response queue.",
      href: canonicalAdminRoute.support,
    },
    {
      label: "Workflow runs",
      hint: "Automation and replay diagnostics.",
      href: canonicalAdminRoute.runs,
    },
    {
      label: "Repair operations",
      hint: "Gap repair and workflow retries.",
      href: canonicalAdminRoute.repair,
    },
  ] as const;

  const submitMembershipMutation = () => {
    const subject = membershipSubject.trim();
    const mutationReason = membershipReason.trim();

    if (subject.length === 0 || mutationReason.length === 0) {
      setMembershipStatus({
        kind: "error",
        message:
          "Subject and mutation reason are required before changing tenant memberships.",
      });
      return;
    }

    setMembershipStatus(null);
    startTransition(() => {
      void (async () => {
        try {
          const result = await mutateMembership({
            data: {
              tenantId: tenant.scopeId,
              scope: tenantScope,
              subject,
              relation: membershipRelation,
              action: membershipAction,
              mutationReason,
            },
          });
          setMembershipStatus({
            kind: "success",
            message: result.changed
              ? `${
                  result.action === tenantMembershipMutationAction.grant
                    ? "Granted"
                    : "Revoked"
                } ${result.relation} for ${result.subject}.`
              : `No membership change was required for ${result.subject}.`,
          });
          setMembershipReason("");
          await router.invalidate({ sync: true });
        } catch (error) {
          setMembershipStatus({
            kind: "error",
            message: formatActionError(error),
          });
        }
      })();
    });
  };

  const submitInvitationIssue = () => {
    const recipientEmail = invitationEmail.trim();
    const issueReason = invitationReason.trim();

    if (recipientEmail.length === 0 || issueReason.length === 0) {
      setInvitationStatus({
        kind: "error",
        message:
          "Recipient email and invitation reason are required before issuing a tenant invitation.",
      });
      return;
    }

    setInvitationStatus(null);
    startTransition(() => {
      void (async () => {
        try {
          const result = await issueInvitation({
            data: {
              tenantId: tenant.scopeId,
              scope: tenantScope,
              recipientEmail,
              relation: invitationRelation,
              issueReason,
            },
          });
          setInvitationStatus({
            kind: "success",
            message: `Issued ${result.invitation.relation} access for ${result.invitation.recipientEmail}.`,
          });
          setInvitationEmail("");
          setInvitationReason("");
          await router.invalidate({ sync: true });
        } catch (error) {
          setInvitationStatus({
            kind: "error",
            message: formatActionError(error),
          });
        }
      })();
    });
  };

  const submitInvitationRevoke = () => {
    const targetInvitationId = invitationId.trim();
    const revocationReason = invitationRevocationReason.trim();

    if (targetInvitationId.length === 0 || revocationReason.length === 0) {
      setInvitationStatus({
        kind: "error",
        message:
          "Invitation ID and revocation reason are required before revoking a tenant invitation.",
      });
      return;
    }

    setInvitationStatus(null);
    startTransition(() => {
      void (async () => {
        try {
          const result = await revokeInvitation({
            data: {
              tenantId: tenant.scopeId,
              scope: tenantScope,
              invitationId: targetInvitationId,
              revocationReason,
            },
          });
          setInvitationStatus({
            kind: "success",
            message: result.changed
              ? `Revoked invitation ${result.invitationId}.`
              : `Invitation ${result.invitationId} was already inactive.`,
          });
          setInvitationId("");
          setInvitationRevocationReason("");
          await router.invalidate({ sync: true });
        } catch (error) {
          setInvitationStatus({
            kind: "error",
            message: formatActionError(error),
          });
        }
      })();
    });
  };

  return (
    <div
      className="ops-screen"
      data-route="tenant-workspace-v3"
      data-testid="tenant-workspace-v2-ready"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <ScreenHeader
        title={snapshot.tenantOverview?.displayName ?? tenant.scopeId}
        breadcrumbs={[
          { label: "Resources" },
          { label: "Tenants", href: canonicalAdminRoute.tenants },
          { label: tenant.scopeId },
        ]}
        subtitle={
          <>
            <span className="mono">
              {tenant.scope}:{tenant.scopeId}
            </span>{" "}
            · window <span className="mono">{snapshot.windowMinutes}m</span> ·
            snapshot{" "}
            <span className="mono">
              {formatTimestamp(snapshot.generatedAt)}
            </span>
          </>
        }
        actions={
          <>
            <Link className="ops-btn" to={canonicalAdminRoute.tenants}>
              <ChevronLeft size={12} /> Back
            </Link>
            <Link className="ops-btn ops-btn--xs" to={billingWorkspacePath}>
              Billing
            </Link>
            <Link className="ops-btn ops-btn--xs" to={brandingWorkspacePath}>
              Branding
            </Link>
            <Link className="ops-btn ops-btn--xs" to={auditWorkspacePath}>
              Audit
            </Link>
          </>
        }
      />

      {partialFailureCount > 0 ? (
        <div
          className="ops-feedback warn"
          data-testid="tenant-workspace-v2-partial-failures"
          role="status"
        >
          <strong>Partial snapshot:</strong>{" "}
          {partialFailures.map((failure) => failure.section).join(", ")}{" "}
          degraded. Retry shortly to refresh the missing sections.
        </div>
      ) : null}

      <div className="ops-bento">
        <KpiCard
          label="Members"
          value={memberCount}
          hint={`${dormantMembers} dormant`}
        />
        <KpiCard
          label="Recent activity"
          value={recentActivityCount}
          tone={recentActivityCount > 0 ? "accent" : "neutral"}
          hint={`window ${snapshot.windowMinutes}m`}
        />
        <KpiCard
          label="Open incidents"
          value={incidentCount}
          tone={incidentCount > 0 ? "alert" : "good"}
          hint={`${criticalIncidents} critical`}
        />
        <KpiCard
          label="Usage spotlights"
          value={usageSpotlightCount}
          tone={usageSpotlightCount > 0 ? "accent" : "neutral"}
        />
        <KpiCard
          label="Pending approvals"
          value={pendingApprovalCount}
          tone={pendingApprovalCount > 0 ? "warn" : "neutral"}
        />
        <KpiCard
          label="Snapshot health"
          value={partialFailureCount}
          tone={partialFailureCount > 0 ? "warn" : "good"}
          hint={<span className="mono">{snapshot.correlationId}</span>}
        />
      </div>

      <div style={paneGridStyle}>
        <Pane title="Tenant posture" ariaLabel="Tenant posture">
          {snapshot.tenantOverview === null ? (
            <EmptyState
              title="Tenant overview unavailable"
              description="The snapshot did not return a current tenant overview record."
            />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <SignalBadge tone="accent">
                  plan {snapshot.tenantOverview.planTier}
                </SignalBadge>
                <SignalBadge
                  tone={
                    snapshot.tenantOverview.brandingState ===
                    "custom-domain-active"
                      ? "good"
                      : snapshot.tenantOverview.brandingState ===
                          "pending-review"
                        ? "warn"
                        : "neutral"
                  }
                >
                  branding {snapshot.tenantOverview.brandingState}
                </SignalBadge>
                <SignalBadge
                  tone={
                    snapshot.tenantOverview.legalHoldActive
                      ? "alert"
                      : "neutral"
                  }
                >
                  legal hold{" "}
                  {snapshot.tenantOverview.legalHoldActive ? "active" : "clear"}
                </SignalBadge>
                <SignalBadge
                  tone={
                    snapshot.tenantOverview.supportTier === "enterprise"
                      ? "good"
                      : snapshot.tenantOverview.supportTier === "priority"
                        ? "accent"
                        : "neutral"
                  }
                >
                  support {snapshot.tenantOverview.supportTier}
                </SignalBadge>
              </div>
              <div className="ops-meta-grid">
                <MetaRow
                  label="Display name"
                  value={snapshot.tenantOverview.displayName}
                />
                <MetaRow
                  label="Current MAU"
                  value={snapshot.tenantOverview.currentMau.toString()}
                  mono
                />
                <MetaRow
                  label="Open invoices"
                  value={snapshot.tenantOverview.openInvoiceCount.toString()}
                  mono
                />
                <MetaRow
                  label="Snapshot correlation"
                  value={snapshot.correlationId}
                  mono
                />
              </div>
            </div>
          )}
        </Pane>

        <Pane
          title="Launchpad"
          ariaLabel="Tenant launchpad"
          toolbar={
            <Link
              className="ops-btn ops-btn--xs"
              to={canonicalAdminRoute.tenants}
            >
              Directory
            </Link>
          }
        >
          <div
            data-testid="tenant-workspace-v2-launchpad"
            style={{ display: "grid", gap: 6 }}
          >
            {launchpadLinks.map((link) => (
              <Link
                key={link.label}
                className="ops-card-button"
                to={link.href}
                style={{
                  display: "grid",
                  gap: 2,
                  padding: 8,
                  borderRadius: 8,
                  border: "1px solid var(--bg-2)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <span style={{ fontWeight: 700 }}>{link.label}</span>
                <span
                  className="ops-text-muted"
                  style={{ fontSize: "0.75rem" }}
                >
                  {link.hint}
                </span>
              </Link>
            ))}
          </div>
        </Pane>

        <Pane title="Focused watch" ariaLabel="Focused watch">
          <div
            data-testid="tenant-workspace-v2-focus"
            style={{ display: "grid", gap: 8 }}
          >
            {focusKind.kind === "approval" ? (
              focusedApproval !== undefined ? (
                <>
                  <SignalBadge
                    tone={resolveApprovalTone(focusedApproval.ttlSeconds)}
                  >
                    Approval needs a decision
                  </SignalBadge>
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    {focusedApproval.kind}
                  </p>
                  <p style={{ margin: 0 }} className="ops-text-muted">
                    {focusedApproval.target}
                  </p>
                  <p style={{ margin: 0 }} className="ops-text-muted">
                    Requested by {focusedApproval.requestedBy} ·{" "}
                    {formatTtl(focusedApproval.ttlSeconds)} left
                  </p>
                </>
              ) : null
            ) : focusKind.kind === "incident" ? (
              focusedIncident !== undefined ? (
                <>
                  <StatusChip
                    status={focusedIncident.severity}
                    variant={resolveStatusVariant(focusedIncident.severity)}
                  />
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    {focusedIncident.title}
                  </p>
                  <p style={{ margin: 0 }} className="ops-text-muted">
                    {focusedIncident.summary}
                  </p>
                  <p style={{ margin: 0 }} className="ops-text-muted">
                    {focusedIncident.vendor} ·{" "}
                    {formatTimestamp(focusedIncident.openedAt)}
                  </p>
                </>
              ) : null
            ) : focusKind.kind === "spotlight" ? (
              focusedSpotlight !== undefined ? (
                <>
                  <SignalBadge tone={resolveUsageTone(focusedSpotlight.tone)}>
                    Usage spotlight
                  </SignalBadge>
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    {focusedSpotlight.label}
                  </p>
                  <p style={{ margin: 0 }} className="ops-text-muted">
                    {focusedSpotlight.value} {focusedSpotlight.unit}
                  </p>
                  <p style={{ margin: 0 }} className="ops-text-muted">
                    {formatTrend(focusedSpotlight)}
                  </p>
                </>
              ) : null
            ) : focusKind.kind === "activity" ? (
              focusedActivity !== undefined ? (
                <>
                  <SignalBadge tone="accent">Latest activity</SignalBadge>
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    {focusedActivity.actor}
                  </p>
                  <p style={{ margin: 0 }} className="ops-text-muted">
                    {focusedActivity.action} → {focusedActivity.target}
                  </p>
                  <p style={{ margin: 0 }} className="ops-text-muted">
                    {formatTimestamp(focusedActivity.occurredAt)}
                  </p>
                </>
              ) : null
            ) : focusKind.kind === "member" ? (
              focusedMember !== undefined ? (
                <>
                  <SignalBadge tone={resolveRoleTone(focusedMember.role)}>
                    Member coverage
                  </SignalBadge>
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    {focusedMember.displayName}
                  </p>
                  <p style={{ margin: 0 }} className="ops-text-muted">
                    {focusedMember.role} ·{" "}
                    <span className="mono">{focusedMember.subjectId}</span>
                  </p>
                  <p style={{ margin: 0 }} className="ops-text-muted">
                    Last seen {formatTimestamp(focusedMember.lastSeenAt)}
                  </p>
                </>
              ) : null
            ) : (
              <EmptyState
                title="No highlighted watch item"
                description="This tenant snapshot is currently quiet. Use the launchpad to inspect billing, audit, or workflow detail."
              />
            )}
          </div>
        </Pane>
      </div>

      <Tabs<TenantWorkspaceTab>
        value={tab}
        onChange={setTab}
        items={tenantWorkspaceTabs.map((value) => ({
          value,
          label: tenantWorkspaceTabLabel[value],
          ...(value === "members" ? { count: memberCount } : {}),
          ...(value === "billing" ? { count: pendingApprovalCount } : {}),
          ...(value === "audit" ? { count: recentActivityCount } : {}),
          ...(value === "support" ? { count: incidentCount } : {}),
        }))}
      />

      {tab === "overview" ? (
        <div style={paneGridStyle}>
          <Pane title="Tenant overview" ariaLabel="Tenant overview">
            {snapshot.tenantOverview === null ? (
              <EmptyState
                title="Tenant overview unavailable"
                description="The current snapshot does not include tenant overview data."
              />
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                <div className="ops-bento">
                  <KpiCard
                    label="Plan tier"
                    value={snapshot.tenantOverview.planTier}
                    tone="accent"
                  />
                  <KpiCard
                    label="Branding state"
                    value={snapshot.tenantOverview.brandingState}
                    tone={
                      snapshot.tenantOverview.brandingState ===
                      "custom-domain-active"
                        ? "good"
                        : snapshot.tenantOverview.brandingState ===
                            "pending-review"
                          ? "warn"
                          : "neutral"
                    }
                  />
                  <KpiCard
                    label="Support tier"
                    value={snapshot.tenantOverview.supportTier}
                    tone={
                      snapshot.tenantOverview.supportTier === "enterprise"
                        ? "good"
                        : snapshot.tenantOverview.supportTier === "priority"
                          ? "accent"
                          : "neutral"
                    }
                  />
                  <KpiCard
                    label="Legal hold"
                    value={
                      snapshot.tenantOverview.legalHoldActive ? "Yes" : "No"
                    }
                    tone={
                      snapshot.tenantOverview.legalHoldActive
                        ? "alert"
                        : "neutral"
                    }
                  />
                </div>
                <div className="ops-meta-grid">
                  <MetaRow
                    label="Tenant"
                    value={snapshot.tenantOverview.displayName}
                  />
                  <MetaRow
                    label="Current MAU"
                    value={snapshot.tenantOverview.currentMau.toString()}
                    mono
                  />
                  <MetaRow
                    label="Open invoices"
                    value={snapshot.tenantOverview.openInvoiceCount.toString()}
                    mono
                  />
                  <MetaRow
                    label="Snapshot generated"
                    value={formatTimestamp(snapshot.generatedAt)}
                    mono
                  />
                </div>
              </div>
            )}
          </Pane>

          <Pane title="Usage spotlights" ariaLabel="Usage spotlights">
            <UsageSpotlightGrid
              data-testid="tenant-workspace-v2-usage-grid"
              spotlights={snapshot.usageSpotlights}
            />
          </Pane>

          <Pane
            title="Approval queue"
            ariaLabel="Approval queue"
            toolbar={
              <Link className="ops-btn ops-btn--xs" to={auditWorkspacePath}>
                Open audit
              </Link>
            }
          >
            <ApprovalTable
              approvals={snapshot.pendingTenantApprovals}
              emptyTitle="No tenant approvals"
              emptyDescription="No approvals are waiting on this tenant at the moment."
            />
          </Pane>

          <Pane
            title="Recent tenant activity"
            ariaLabel="Recent tenant activity"
            toolbar={
              <Link className="ops-btn ops-btn--xs" to={auditWorkspacePath}>
                Full audit
              </Link>
            }
          >
            <RecentActivityList
              entries={snapshot.recentActivity}
              emptyTitle="No recent tenant activity"
              emptyDescription="No tenant-scoped activity entries were returned for the current snapshot window."
            />
          </Pane>
        </div>
      ) : null}

      {tab === "members" ? (
        <div style={paneGridStyle}>
          <Pane
            title="Members & invitations"
            ariaLabel="Members and invitations"
            toolbar={
              <SignalBadge tone={memberCount > 0 ? "accent" : "neutral"}>
                {filteredMembers.length} shown
              </SignalBadge>
            }
          >
            <div style={{ display: "grid", gap: 8 }}>
              <div className="ops-bento">
                <KpiCard label="Owners" value={roleCounts.owner} tone="good" />
                <KpiCard
                  label="Admins"
                  value={roleCounts.admin}
                  tone="accent"
                />
                <KpiCard
                  label="Members"
                  value={roleCounts.member}
                  tone="neutral"
                />
                <KpiCard
                  label="Viewers"
                  value={roleCounts.viewer}
                  tone="warn"
                />
                <KpiCard
                  label="Dormant"
                  value={dormantMembers}
                  tone={dormantMembers > 0 ? "warn" : "neutral"}
                />
              </div>
              {memberCount > 0 ? (
                <>
                  <Tabs<MemberFilter>
                    value={memberFilter}
                    onChange={setMemberFilter}
                    items={[
                      { value: "all", label: "All", count: memberCount },
                      {
                        value: "owners",
                        label: "Owners",
                        count: roleCounts.owner,
                      },
                      {
                        value: "admins",
                        label: "Admins",
                        count: roleCounts.admin,
                      },
                      {
                        value: "members",
                        label: "Members",
                        count: roleCounts.member,
                      },
                      {
                        value: "viewers",
                        label: "Viewers",
                        count: roleCounts.viewer,
                      },
                      {
                        value: "dormant",
                        label: "Dormant",
                        count: dormantMembers,
                      },
                    ]}
                  />
                  <FilterBar
                    searchValue={memberSearch}
                    onSearchChange={setMemberSearch}
                    searchPlaceholder="Search members, roles, or subject ids…"
                  />
                  {filteredMembers.length === 0 ? (
                    <EmptyState
                      title="No members match"
                      description="Adjust the current member search or role pivot to restore the roster."
                    />
                  ) : (
                    <div className="ops-table-wrapper">
                      <table
                        className="ops-table"
                        data-testid="tenant-workspace-v2-members-table"
                      >
                        <thead>
                          <tr>
                            <th>Display name</th>
                            <th>Role</th>
                            <th>Subject</th>
                            <th>Last seen</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredMembers.map((member) => (
                            <tr key={member.subjectId}>
                              <td>{member.displayName}</td>
                              <td>
                                <SignalBadge
                                  tone={resolveRoleTone(member.role)}
                                >
                                  {member.role}
                                </SignalBadge>
                              </td>
                              <td className="mono ops-redacted">
                                {member.subjectId}
                              </td>
                              <td className="mono">
                                {formatTimestamp(member.lastSeenAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState
                  title="No members"
                  description="This tenant has no projected members in the current snapshot."
                />
              )}
            </div>
          </Pane>

          <Pane title="Membership mutation" ariaLabel="Membership mutation">
            {membershipStatus !== null ? (
              <div
                className={`ops-feedback ${membershipStatus.kind}`}
                data-testid="tenant-workspace-v2-membership-status"
              >
                {membershipStatus.message}
              </div>
            ) : null}
            <div style={{ display: "grid", gap: 8 }}>
              <div className="ops-toolbar" style={{ flexWrap: "wrap" }}>
                <label className="ops-field" style={{ minWidth: 220, flex: 1 }}>
                  <span className="ops-field-label">Subject</span>
                  <input
                    className="ops-search__input"
                    type="text"
                    value={membershipSubject}
                    onChange={(event) =>
                      setMembershipSubject(event.target.value)
                    }
                    placeholder="user:employee@comvestec.com"
                    autoComplete="off"
                  />
                </label>
                <label className="ops-field" style={{ minWidth: 170 }}>
                  <span className="ops-field-label">Relation</span>
                  <select
                    className="ops-select"
                    value={membershipRelation}
                    onChange={(event) =>
                      setMembershipRelation(
                        event.target
                          .value as (typeof tenantMembershipRelations)[number],
                      )
                    }
                  >
                    {tenantMembershipRelations.map((relation) => (
                      <option key={relation} value={relation}>
                        {relation}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ops-field" style={{ minWidth: 150 }}>
                  <span className="ops-field-label">Action</span>
                  <select
                    className="ops-select"
                    value={membershipAction}
                    onChange={(event) =>
                      setMembershipAction(
                        event.target.value as
                          | typeof tenantMembershipMutationAction.grant
                          | typeof tenantMembershipMutationAction.revoke,
                      )
                    }
                  >
                    <option value={tenantMembershipMutationAction.grant}>
                      Grant
                    </option>
                    <option value={tenantMembershipMutationAction.revoke}>
                      Revoke
                    </option>
                  </select>
                </label>
                <label
                  className="ops-field"
                  style={{ minWidth: 260, flex: 1.2 }}
                >
                  <span className="ops-field-label">Reason</span>
                  <input
                    className="ops-search__input"
                    type="text"
                    value={membershipReason}
                    onChange={(event) =>
                      setMembershipReason(event.target.value)
                    }
                    placeholder="Grant product oversight for audit readiness."
                    autoComplete="off"
                  />
                </label>
                <button
                  type="button"
                  className="ops-btn ops-btn--primary"
                  disabled={isPending}
                  onClick={submitMembershipMutation}
                >
                  Apply membership change
                </button>
              </div>
              <p className="ops-text-muted" style={{ margin: 0 }}>
                Use this to align owner, admin, member, and viewer access
                without leaving the tenant cockpit.
              </p>
            </div>
          </Pane>

          <Pane title="Invitation actions" ariaLabel="Invitation actions">
            {invitationStatus !== null ? (
              <div
                className={`ops-feedback ${invitationStatus.kind}`}
                data-testid="tenant-workspace-v2-invitation-status"
              >
                {invitationStatus.message}
              </div>
            ) : null}
            <div style={{ display: "grid", gap: 8 }}>
              <div className="ops-toolbar" style={{ flexWrap: "wrap" }}>
                <label className="ops-field" style={{ minWidth: 220, flex: 1 }}>
                  <span className="ops-field-label">Recipient email</span>
                  <input
                    className="ops-search__input"
                    type="email"
                    value={invitationEmail}
                    onChange={(event) => setInvitationEmail(event.target.value)}
                    placeholder="viewer@comvestec.com"
                    autoComplete="off"
                  />
                </label>
                <label className="ops-field" style={{ minWidth: 170 }}>
                  <span className="ops-field-label">Relation</span>
                  <select
                    className="ops-select"
                    value={invitationRelation}
                    onChange={(event) =>
                      setInvitationRelation(
                        event.target
                          .value as (typeof tenantMembershipRelations)[number],
                      )
                    }
                  >
                    {tenantMembershipRelations.map((relation) => (
                      <option key={relation} value={relation}>
                        {relation}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  className="ops-field"
                  style={{ minWidth: 280, flex: 1.2 }}
                >
                  <span className="ops-field-label">Issue reason</span>
                  <input
                    className="ops-search__input"
                    type="text"
                    value={invitationReason}
                    onChange={(event) =>
                      setInvitationReason(event.target.value)
                    }
                    placeholder="Invite finance reviewer for billing oversight."
                    autoComplete="off"
                  />
                </label>
                <button
                  type="button"
                  className="ops-btn ops-btn--primary"
                  disabled={isPending}
                  onClick={submitInvitationIssue}
                >
                  Issue invitation
                </button>
              </div>
              <div className="ops-toolbar" style={{ flexWrap: "wrap" }}>
                <label className="ops-field" style={{ minWidth: 220, flex: 1 }}>
                  <span className="ops-field-label">Invitation ID</span>
                  <input
                    className="ops-search__input"
                    type="text"
                    value={invitationId}
                    onChange={(event) => setInvitationId(event.target.value)}
                    placeholder="inv_org_demo_001"
                    autoComplete="off"
                  />
                </label>
                <label
                  className="ops-field"
                  style={{ minWidth: 260, flex: 1.2 }}
                >
                  <span className="ops-field-label">Revocation reason</span>
                  <input
                    className="ops-search__input"
                    type="text"
                    value={invitationRevocationReason}
                    onChange={(event) =>
                      setInvitationRevocationReason(event.target.value)
                    }
                    placeholder="Cancel the duplicate onboarding invite."
                    autoComplete="off"
                  />
                </label>
                <button
                  type="button"
                  className="ops-btn"
                  disabled={isPending}
                  onClick={submitInvitationRevoke}
                >
                  Revoke invitation
                </button>
              </div>
              <p className="ops-text-muted" style={{ margin: 0 }}>
                Invitation issuance and revocation stay available even before a
                dedicated invitation registry is projected into this snapshot.
              </p>
            </div>
          </Pane>
        </div>
      ) : null}

      {tab === "billing" ? (
        <div style={paneGridStyle}>
          <Pane
            title="Revenue & approvals posture"
            ariaLabel="Revenue and approvals posture"
            toolbar={
              <Link className="ops-btn ops-btn--xs" to={billingWorkspacePath}>
                Open billing
              </Link>
            }
          >
            {snapshot.tenantOverview === null ? (
              <EmptyState
                title="Billing posture unavailable"
                description="The tenant overview section did not return the billing posture fields."
              />
            ) : (
              <div
                data-testid="tenant-workspace-v2-billing-pane"
                style={{ display: "grid", gap: 8 }}
              >
                <div className="ops-bento">
                  <KpiCard
                    label="Plan tier"
                    value={snapshot.tenantOverview.planTier}
                    tone="accent"
                  />
                  <KpiCard
                    label="Open invoices"
                    value={snapshot.tenantOverview.openInvoiceCount}
                    tone={
                      snapshot.tenantOverview.openInvoiceCount > 0
                        ? "warn"
                        : "good"
                    }
                  />
                  <KpiCard
                    label="Current MAU"
                    value={snapshot.tenantOverview.currentMau}
                    tone="neutral"
                  />
                  <KpiCard
                    label="Approval queue"
                    value={pendingApprovalCount}
                    tone={pendingApprovalCount > 0 ? "warn" : "neutral"}
                  />
                </div>
                <p className="ops-text-muted" style={{ margin: 0 }}>
                  This pane keeps the billing conversation grounded in tenant
                  context before you pivot into the full revenue workspace.
                </p>
                <ApprovalTable
                  approvals={snapshot.pendingTenantApprovals}
                  emptyTitle="No billing-affecting approvals surfaced"
                  emptyDescription="No pending approvals were projected into this tenant snapshot."
                />
              </div>
            )}
          </Pane>

          <Pane title="Usage spotlights" ariaLabel="Billing usage spotlights">
            <UsageSpotlightGrid
              spotlights={snapshot.usageSpotlights}
              emptyTitle="No usage spotlights"
              emptyDescription="The current snapshot did not surface billing or usage spotlights for this tenant."
            />
          </Pane>

          <Pane title="Billing handoff" ariaLabel="Billing handoff">
            <div style={{ display: "grid", gap: 6 }}>
              <Link className="ops-btn" to={billingWorkspacePath}>
                Open tenant billing workspace
              </Link>
              <Link className="ops-btn ops-btn--xs" to={retentionWorkspacePath}>
                Review retention posture
              </Link>
              <Link className="ops-btn ops-btn--xs" to={auditWorkspacePath}>
                Open audit trail
              </Link>
              <p className="ops-text-muted" style={{ margin: 0 }}>
                Use the scoped billing route for invoice detail, metering, and
                anomalies. Keep audit and retention close when approvals or
                holds could affect revenue operations.
              </p>
            </div>
          </Pane>
        </div>
      ) : null}

      {tab === "branding" ? (
        <div style={paneGridStyle}>
          <Pane
            title="Brand publication"
            ariaLabel="Brand publication"
            toolbar={
              <Link className="ops-btn ops-btn--xs" to={brandingWorkspacePath}>
                Open branding
              </Link>
            }
          >
            {snapshot.tenantOverview === null ? (
              <EmptyState
                title="Brand posture unavailable"
                description="The tenant overview section did not return branding posture."
              />
            ) : (
              <div
                data-testid="tenant-workspace-v2-branding-pane"
                style={{ display: "grid", gap: 8 }}
              >
                <div className="ops-bento">
                  <KpiCard
                    label="Brand state"
                    value={snapshot.tenantOverview.brandingState}
                    tone={
                      snapshot.tenantOverview.brandingState ===
                      "custom-domain-active"
                        ? "good"
                        : snapshot.tenantOverview.brandingState ===
                            "pending-review"
                          ? "warn"
                          : "neutral"
                    }
                  />
                  <KpiCard
                    label="Support tier"
                    value={snapshot.tenantOverview.supportTier}
                    tone={
                      snapshot.tenantOverview.supportTier === "enterprise"
                        ? "good"
                        : snapshot.tenantOverview.supportTier === "priority"
                          ? "accent"
                          : "neutral"
                    }
                  />
                  <KpiCard
                    label="Legal hold"
                    value={
                      snapshot.tenantOverview.legalHoldActive ? "Yes" : "No"
                    }
                    tone={
                      snapshot.tenantOverview.legalHoldActive
                        ? "alert"
                        : "neutral"
                    }
                  />
                  <KpiCard
                    label="Open approvals"
                    value={pendingApprovalCount}
                    tone={pendingApprovalCount > 0 ? "warn" : "neutral"}
                  />
                </div>
                <p className="ops-text-muted" style={{ margin: 0 }}>
                  Publication review, domain activation, and sender identity
                  flows stay in the branding workspace, but this cockpit keeps
                  the brand posture visible in tenant context.
                </p>
              </div>
            )}
          </Pane>

          <Pane title="Publication checklist" ariaLabel="Publication checklist">
            <div style={{ display: "grid", gap: 6 }}>
              <ChecklistRow
                label="Branding state known"
                done={snapshot.tenantOverview !== null}
              />
              <ChecklistRow
                label="Legal hold clear"
                done={snapshot.tenantOverview?.legalHoldActive !== true}
              />
              <ChecklistRow
                label="Approval queue empty"
                done={pendingApprovalCount === 0}
              />
              <ChecklistRow
                label="Critical incidents clear"
                done={criticalIncidents === 0}
              />
            </div>
          </Pane>

          <Pane title="Cross-surface pivots" ariaLabel="Cross-surface pivots">
            <div style={{ display: "grid", gap: 6 }}>
              <Link className="ops-btn" to={brandingWorkspacePath}>
                Open branding workspace
              </Link>
              <Link className="ops-btn ops-btn--xs" to={retentionWorkspacePath}>
                Review retention posture
              </Link>
              <Link className="ops-btn ops-btn--xs" to={webhookWorkspacePath}>
                Check webhooks
              </Link>
              <Link className="ops-btn ops-btn--xs" to={auditWorkspacePath}>
                Audit brand changes
              </Link>
            </div>
          </Pane>
        </div>
      ) : null}

      {tab === "audit" ? (
        <div style={paneGridStyle}>
          <Pane
            title="Tenant audit explorer"
            ariaLabel="Tenant audit explorer"
            toolbar={
              <Link className="ops-btn ops-btn--xs" to={auditWorkspacePath}>
                Full audit
              </Link>
            }
          >
            <div
              data-testid="tenant-workspace-v2-audit-pane"
              style={{ display: "grid", gap: 8 }}
            >
              <div className="ops-bento">
                <KpiCard
                  label="Activity entries"
                  value={recentActivityCount}
                  tone={recentActivityCount > 0 ? "accent" : "neutral"}
                />
                <KpiCard
                  label="Pending approvals"
                  value={pendingApprovalCount}
                  tone={pendingApprovalCount > 0 ? "warn" : "neutral"}
                />
                <KpiCard
                  label="Partial failures"
                  value={partialFailureCount}
                  tone={partialFailureCount > 0 ? "warn" : "neutral"}
                />
              </div>
              <FilterBar
                searchValue={activitySearch}
                onSearchChange={setActivitySearch}
                searchPlaceholder="Search actors, actions, targets, or classifications…"
              />
              <RecentActivityList
                data-testid="tenant-workspace-v2-activity-list"
                entries={filteredActivity}
                emptyTitle="No matching activity"
                emptyDescription="Adjust the current activity search to restore matching audit entries."
              />
            </div>
          </Pane>

          <Pane title="Pending approvals" ariaLabel="Pending approvals">
            <div style={{ display: "grid", gap: 8 }}>
              <FilterBar
                searchValue={approvalSearch}
                onSearchChange={setApprovalSearch}
                searchPlaceholder="Search approvals, targets, or requesters…"
              />
              <ApprovalTable
                data-testid="tenant-workspace-v2-approvals-list"
                approvals={filteredApprovals}
                emptyTitle="No approvals match"
                emptyDescription="Adjust the current approval search to restore matching approval requests."
              />
            </div>
          </Pane>
        </div>
      ) : null}

      {tab === "repair" ? (
        <div style={paneGridStyle}>
          <Pane
            title="Repair & automation handoff"
            ariaLabel="Repair and automation handoff"
            toolbar={
              <Link
                className="ops-btn ops-btn--xs"
                to={canonicalAdminRoute.repair}
              >
                Repair operations
              </Link>
            }
          >
            <div
              data-testid="tenant-workspace-v2-repair-pane"
              style={{ display: "grid", gap: 8 }}
            >
              <div className="ops-bento">
                <KpiCard
                  label="Recent activity"
                  value={recentActivityCount}
                  tone={recentActivityCount > 0 ? "accent" : "neutral"}
                />
                <KpiCard
                  label="Open incidents"
                  value={incidentCount}
                  tone={incidentCount > 0 ? "warn" : "neutral"}
                />
                <KpiCard
                  label="Pending approvals"
                  value={pendingApprovalCount}
                  tone={pendingApprovalCount > 0 ? "warn" : "neutral"}
                />
                <KpiCard
                  label="Partial failures"
                  value={partialFailureCount}
                  tone={partialFailureCount > 0 ? "alert" : "good"}
                />
              </div>
              <p className="ops-text-muted" style={{ margin: 0 }}>
                Repair is still owned by the dedicated repair and workflow
                routes, but this pane keeps the surrounding tenant context
                visible before you hand off into those tools.
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Link className="ops-btn" to={canonicalAdminRoute.repair}>
                  Open repair operations
                </Link>
                <Link
                  className="ops-btn ops-btn--xs"
                  to={canonicalAdminRoute.runs}
                >
                  Open workflow runs
                </Link>
                <Link className="ops-btn ops-btn--xs" to={auditWorkspacePath}>
                  Review audit context
                </Link>
              </div>
            </div>
          </Pane>

          <Pane title="Recent change window" ariaLabel="Recent change window">
            <RecentActivityList
              entries={snapshot.recentActivity.slice(0, 5)}
              emptyTitle="No recent change window"
              emptyDescription="No recent activity entries were available to anchor repair investigations."
            />
          </Pane>

          <Pane title="Operator notes" ariaLabel="Operator notes">
            <div style={{ display: "grid", gap: 6 }}>
              <ChecklistRow
                label="Review current approvals before replaying automation"
                done={pendingApprovalCount === 0}
              />
              <ChecklistRow
                label="Check incident posture before pushing repair traffic"
                done={incidentCount === 0}
              />
              <ChecklistRow
                label="Use audit trail to confirm the last tenant change"
                done={recentActivityCount > 0}
              />
            </div>
          </Pane>
        </div>
      ) : null}

      {tab === "support" ? (
        <div style={paneGridStyle}>
          <Pane
            title="Incident posture"
            ariaLabel="Incident posture"
            toolbar={
              <Link
                className="ops-btn ops-btn--xs"
                to={canonicalAdminRoute.support}
              >
                Open support
              </Link>
            }
          >
            <div
              data-testid="tenant-workspace-v2-support-pane"
              style={{ display: "grid", gap: 8 }}
            >
              <div className="ops-bento">
                <KpiCard
                  label="Critical"
                  value={
                    snapshot.openIncidents.filter(
                      (i) => i.severity === "critical",
                    ).length
                  }
                  tone={
                    snapshot.openIncidents.some(
                      (i) => i.severity === "critical",
                    )
                      ? "alert"
                      : "good"
                  }
                />
                <KpiCard
                  label="Warning"
                  value={
                    snapshot.openIncidents.filter(
                      (i) => i.severity === "warning",
                    ).length
                  }
                  tone={
                    snapshot.openIncidents.some((i) => i.severity === "warning")
                      ? "warn"
                      : "neutral"
                  }
                />
                <KpiCard
                  label="Info"
                  value={
                    snapshot.openIncidents.filter((i) => i.severity === "info")
                      .length
                  }
                  tone="neutral"
                />
                <KpiCard
                  label="Support tier"
                  value={snapshot.tenantOverview?.supportTier ?? "unknown"}
                  tone={
                    snapshot.tenantOverview?.supportTier === "enterprise"
                      ? "good"
                      : snapshot.tenantOverview?.supportTier === "priority"
                        ? "accent"
                        : "neutral"
                  }
                />
              </div>
              <Tabs<IncidentFilter>
                value={incidentFilter}
                onChange={setIncidentFilter}
                items={[
                  { value: "all", label: "All", count: incidentCount },
                  {
                    value: "critical",
                    label: "Critical",
                    count: snapshot.openIncidents.filter(
                      (incident) => incident.severity === "critical",
                    ).length,
                  },
                  {
                    value: "warning",
                    label: "Warning",
                    count: snapshot.openIncidents.filter(
                      (incident) => incident.severity === "warning",
                    ).length,
                  },
                  {
                    value: "info",
                    label: "Info",
                    count: snapshot.openIncidents.filter(
                      (incident) => incident.severity === "info",
                    ).length,
                  },
                ]}
              />
              <FilterBar
                searchValue={incidentSearch}
                onSearchChange={setIncidentSearch}
                searchPlaceholder="Search incidents, vendors, or summaries…"
              />
              {filteredIncidents.length === 0 ? (
                <EmptyState
                  title={
                    incidentCount === 0
                      ? "No open incidents"
                      : "No incidents match"
                  }
                  description={
                    incidentCount === 0
                      ? "No vendor incidents were returned for this tenant in the current window."
                      : "Adjust the current incident search or severity pivot to restore matching incidents."
                  }
                />
              ) : (
                <div className="ops-table-wrapper">
                  <table
                    className="ops-table"
                    data-testid="tenant-workspace-v2-incidents-table"
                  >
                    <thead>
                      <tr>
                        <th>Incident</th>
                        <th>Vendor</th>
                        <th>Severity</th>
                        <th>Opened</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIncidents.map((incident) => (
                        <tr key={incident.id}>
                          <td>
                            <div style={{ display: "grid", gap: 2 }}>
                              <span>{incident.title}</span>
                              <span className="ops-text-muted">
                                {incident.summary}
                              </span>
                            </div>
                          </td>
                          <td className="mono">{incident.vendor}</td>
                          <td>
                            <StatusChip
                              status={incident.severity}
                              variant={resolveStatusVariant(incident.severity)}
                            />
                          </td>
                          <td className="mono">
                            {formatTimestamp(incident.openedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Pane>

          <Pane title="Response launchpad" ariaLabel="Response launchpad">
            <div style={{ display: "grid", gap: 6 }}>
              <Link className="ops-btn" to={canonicalAdminRoute.support}>
                Open support workspace
              </Link>
              <Link className="ops-btn ops-btn--xs" to={webhookWorkspacePath}>
                Check deliveries
              </Link>
              <Link className="ops-btn ops-btn--xs" to={auditWorkspacePath}>
                Review tenant audit
              </Link>
              <p className="ops-text-muted" style={{ margin: 0 }}>
                Keep support, audit, and delivery context together whenever the
                tenant is in an active vendor incident.
              </p>
            </div>
          </Pane>
        </div>
      ) : null}

      {tab === "danger-zone" ? (
        <div style={paneGridStyle}>
          <Pane
            title="High-risk controls"
            ariaLabel="High-risk controls"
            toolbar={
              <Link className="ops-btn ops-btn--xs" to={auditWorkspacePath}>
                Audit trail
              </Link>
            }
          >
            <div
              data-testid="tenant-workspace-v2-danger-pane"
              style={{ display: "grid", gap: 8 }}
            >
              <div className="ops-feedback warn">
                Suspend, freeze, and delete controls remain intentionally locked
                until durable backend ownership and break-glass auditing land
                for the tenant danger zone.
              </div>
              <p className="ops-text-muted" style={{ margin: 0 }}>
                This pane is still useful today: it surfaces the blockers and
                surrounding context you need before escalating into a governed
                high-risk action.
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Link className="ops-btn" to={canonicalAdminRoute.access}>
                  Review access posture
                </Link>
                <Link
                  className="ops-btn ops-btn--xs"
                  to={canonicalAdminRoute.support}
                >
                  Open support
                </Link>
                <Link
                  className="ops-btn ops-btn--xs"
                  to={canonicalAdminRoute.repair}
                >
                  Repair operations
                </Link>
              </div>
            </div>
          </Pane>

          <Pane title="Current blockers" ariaLabel="Current blockers">
            <div style={{ display: "grid", gap: 6 }}>
              <ChecklistRow
                label="No open invoices"
                done={snapshot.tenantOverview?.openInvoiceCount === 0}
              />
              <ChecklistRow
                label="No legal hold"
                done={snapshot.tenantOverview?.legalHoldActive !== true}
              />
              <ChecklistRow
                label="Approval queue clear"
                done={pendingApprovalCount === 0}
              />
              <ChecklistRow
                label="No critical incidents"
                done={criticalIncidents === 0}
              />
              <ChecklistRow
                label="Snapshot fully healthy"
                done={partialFailureCount === 0}
              />
            </div>
          </Pane>

          <Pane title="Escalation routes" ariaLabel="Escalation routes">
            <div style={{ display: "grid", gap: 6 }}>
              <Link className="ops-btn" to={auditWorkspacePath}>
                Open tenant audit
              </Link>
              <Link
                className="ops-btn ops-btn--xs"
                to={canonicalAdminRoute.access}
              >
                Review access tuples
              </Link>
              <Link
                className="ops-btn ops-btn--xs"
                to={canonicalAdminRoute.support}
              >
                Coordinate support
              </Link>
              <Link
                className="ops-btn ops-btn--xs"
                to={canonicalAdminRoute.runs}
              >
                Check workflow runs
              </Link>
            </div>
          </Pane>
        </div>
      ) : null}
    </div>
  );
}

function MetaRow({
  label,
  value,
  mono = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}) {
  return (
    <div>
      <p className="ops-meta-label">{label}</p>
      <p
        className={`ops-meta-value${mono ? " ops-meta-value--mono" : ""}`}
        style={{ margin: 0 }}
      >
        {value}
      </p>
    </div>
  );
}

function SignalBadge({
  children,
  tone,
}: {
  readonly children: ReactNode;
  readonly tone: KpiTone;
}) {
  const palette =
    tone === "good"
      ? {
          border: "1px solid rgba(108, 218, 160, 0.35)",
          background: "rgba(28, 92, 63, 0.2)",
        }
      : tone === "warn"
        ? {
            border: "1px solid rgba(255, 203, 107, 0.35)",
            background: "rgba(98, 70, 18, 0.2)",
          }
        : tone === "alert"
          ? {
              border: "1px solid rgba(255, 122, 122, 0.35)",
              background: "rgba(96, 24, 24, 0.24)",
            }
          : tone === "accent"
            ? {
                border: "1px solid rgba(96, 176, 255, 0.35)",
                background: "rgba(28, 54, 98, 0.22)",
              }
            : {
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)",
              };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 6px",
        borderRadius: 999,
        fontSize: "0.6875rem",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        ...palette,
      }}
    >
      {children}
    </span>
  );
}

function ChecklistRow({
  label,
  done,
}: {
  readonly label: string;
  readonly done: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 6,
        padding: 6,
        borderRadius: 8,
        border: "1px solid var(--bg-2)",
      }}
    >
      <span>{label}</span>
      <SignalBadge tone={done ? "good" : "warn"}>
        {done ? "ready" : "review"}
      </SignalBadge>
    </div>
  );
}

function UsageSpotlightGrid({
  spotlights,
  ...emptyCopy
}: {
  readonly spotlights: readonly AdminTenantWorkspaceV2RouteUsageSpotlight[];
  readonly "data-testid"?: string;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
}) {
  if (spotlights.length === 0) {
    return (
      <EmptyState
        title={emptyCopy.emptyTitle ?? "No usage spotlights"}
        description={
          emptyCopy.emptyDescription ??
          "The current snapshot did not surface usage spotlights for this tenant."
        }
      />
    );
  }

  return (
    <div
      data-testid={emptyCopy["data-testid"]}
      style={{
        display: "grid",
        gap: 8,
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      }}
    >
      {spotlights.map((spotlight) => (
        <KpiCard
          key={spotlight.id}
          label={spotlight.label}
          value={`${spotlight.value} ${spotlight.unit}`}
          hint={formatTrend(spotlight)}
          tone={resolveUsageTone(spotlight.tone)}
        />
      ))}
    </div>
  );
}

function ApprovalTable({
  approvals,
  emptyTitle,
  emptyDescription,
  "data-testid": dataTestId,
}: {
  readonly approvals: AdminTenantWorkspaceV2RouteSnapshot["pendingTenantApprovals"];
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly "data-testid"?: string;
}) {
  if (approvals.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="ops-table-wrapper">
      <table className="ops-table" data-testid={dataTestId}>
        <thead>
          <tr>
            <th>Kind</th>
            <th>Target</th>
            <th>Requested by</th>
            <th>TTL</th>
          </tr>
        </thead>
        <tbody>
          {approvals.map((approval) => (
            <tr key={approval.id}>
              <td>
                <div style={{ display: "grid", gap: 2 }}>
                  <span>{approval.kind}</span>
                  <span className="ops-text-muted">
                    {approval.reasonPreview}
                  </span>
                </div>
              </td>
              <td className="mono">{approval.target}</td>
              <td className="mono">{approval.requestedBy}</td>
              <td>
                <SignalBadge tone={resolveApprovalTone(approval.ttlSeconds)}>
                  {formatTtl(approval.ttlSeconds)}
                </SignalBadge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentActivityList({
  entries,
  emptyTitle,
  emptyDescription,
  "data-testid": dataTestId,
}: {
  readonly entries: AdminTenantWorkspaceV2RouteSnapshot["recentActivity"];
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly "data-testid"?: string;
}) {
  if (entries.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div data-testid={dataTestId} className="ops-activity-list">
      {entries.map((entry) => (
        <div key={entry.id} className="ops-activity-item">
          <div>
            <span className="ops-activity-module">
              <span className="ops-dot ops-dot--active" />
              {entry.actor}
            </span>
            <span className="ops-activity-action">
              {" · "}
              {entry.action}
              {" → "}
              {entry.target}
            </span>
          </div>
          <span className="ops-activity-time mono">
            {formatTimestamp(entry.occurredAt)}
          </span>
        </div>
      ))}
    </div>
  );
}
