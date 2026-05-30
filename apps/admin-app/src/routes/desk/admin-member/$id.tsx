import { StateScreen, StatusChip, resolveStatusVariant } from "@comvestec/ui";
import { createAdminAppFileRoute } from "../../../file-route";
import { KpiCard, ScreenHeader } from "../../../components/ui";
import {
  adminMemberRoleLabel,
  formatAdminMemberDay,
  resolveAdminMemberActivityAt,
  resolveAdminMemberActivityLabel,
} from "../../../lib/admin-member-display";
import type { AdminMemberDetailRouteData } from "../../../lib/admin-member-detail-route-data";

const detailCardStyle = {
  display: "grid",
  gap: 4,
  padding: 8,
  borderRadius: 12,
  border: "1px solid var(--ops-border, rgba(255,255,255,0.12))",
  background:
    "color-mix(in oklab, var(--ops-surface-2, rgba(255,255,255,0.03)) 88%, transparent)",
} as const;

const secondaryTextStyle = {
  color: "var(--ops-text-secondary, rgba(255,255,255,0.7))",
} as const;

const adminMemberRoleSummary: Record<string, string> = {
  "admin-owner":
    "Owns the admin organization floor and should remain resilient during offboarding or incident rotation.",
  "admin-admin":
    "Carries broad internal administration coverage across admin-organization operations.",
  "admin-operator":
    "Runs day-to-day operator workflows without taking full owner responsibilities.",
  "support-reviewer":
    "Reviews support-sensitive flows and governed break-glass posture for the admin organization.",
  "billing-only":
    "Holds billing-scoped access without the broader operator envelope.",
  compliance:
    "Reviews compliance-sensitive admin changes and audit posture for the organization.",
  viewer:
    "Keeps read-only visibility into admin-organization posture without mutation authority.",
};

export const Route = createAdminAppFileRoute("/desk/admin-member/$id")({
  loader: async ({ params }) => {
    const { loadAdminMemberDetailLoaderData } =
      await import("../../../lib/admin-member-detail-loader");

    return loadAdminMemberDetailLoaderData({
      memberId: params.id,
    });
  },
  component: AdminMemberDetailRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading admin member detail…" />
  ),
});

function AdminMemberDetailRoute() {
  const data: AdminMemberDetailRouteData = Route.useLoaderData();

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view admin member detail."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access admin member detail."
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <StateScreen
        variant="denied"
        title="Access denied"
        description={data.reason}
      />
    );
  }
  if (data.kind === "error") {
    return (
      <StateScreen
        variant="5xx"
        title={data.title}
        description={data.description}
      />
    );
  }

  const { member } = data;
  const activityAt = resolveAdminMemberActivityAt(member);
  const activityLabel = resolveAdminMemberActivityLabel(member);
  const roleSummary = adminMemberRoleSummary[member.role];

  return (
    <section
      data-testid="admin-member-detail-ready"
      data-member-id={member.id}
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title={member.displayName}
        breadcrumbs={[
          { label: "Resources" },
          { label: "Admin members", href: "/admin/members" },
          { label: member.displayName },
        ]}
        subtitle={
          <>
            Role <span className="mono">{member.role}</span> · status{" "}
            <span className="mono">{member.status}</span> · member{" "}
            <span className="mono">{member.id}</span>
          </>
        }
      />

      <div
        data-testid="admin-member-detail-kpis"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        <KpiCard
          label="Role"
          value={adminMemberRoleLabel[member.role]}
          tone="neutral"
        />
        <KpiCard
          label="Lifecycle"
          value={member.status}
          tone={member.status === "active" ? "good" : "warn"}
        />
        <KpiCard
          label="Accepted"
          value={member.acceptedAt === undefined ? "Pending" : "Yes"}
          tone={member.acceptedAt === undefined ? "warn" : "good"}
        />
        <KpiCard
          label={activityLabel}
          value={formatAdminMemberDay(activityAt)}
          tone="neutral"
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 6,
        }}
      >
        <section
          data-testid="admin-member-detail-identity"
          style={detailCardStyle}
        >
          <p className="ops-card-title">Identity</p>
          <span className="text-strong">{member.displayName}</span>
          <span className="mono">{member.email}</span>
          <span style={secondaryTextStyle}>
            Invited by <span className="mono">{member.createdBy}</span>
          </span>
          <span style={secondaryTextStyle}>
            Keycloak subject{" "}
            <span className="mono">
              {member.keycloakSubjectId ?? "Pending"}
            </span>
          </span>
          <span style={secondaryTextStyle}>
            Member id <span className="mono">{member.id}</span>
          </span>
        </section>

        <section
          data-testid="admin-member-detail-lifecycle"
          style={detailCardStyle}
        >
          <p className="ops-card-title">Lifecycle</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <StatusChip
              status={member.status}
              variant={resolveStatusVariant(member.status)}
            />
          </div>
          <span style={secondaryTextStyle}>
            Invited{" "}
            <span className="mono">
              {formatAdminMemberDay(member.invitedAt)}
            </span>
          </span>
          <span style={secondaryTextStyle}>
            Accepted{" "}
            <span className="mono">
              {formatAdminMemberDay(member.acceptedAt)}
            </span>
          </span>
          <span style={secondaryTextStyle}>
            Last active{" "}
            <span className="mono">
              {formatAdminMemberDay(member.lastActiveAt)}
            </span>
          </span>
          <span style={secondaryTextStyle}>
            Archived{" "}
            <span className="mono">
              {formatAdminMemberDay(member.archivedAt)}
            </span>
          </span>
        </section>

        <section data-testid="admin-member-detail-role" style={detailCardStyle}>
          <p className="ops-card-title">Role posture</p>
          <span className="text-strong">
            {adminMemberRoleLabel[member.role]}
          </span>
          <span style={secondaryTextStyle}>{roleSummary}</span>
          <span style={secondaryTextStyle}>
            This detail surface stays pinned to the admin-organization roster
            and should be reviewed alongside the focused admin audit stream when
            a role or lifecycle change is made.
          </span>
        </section>
      </div>
    </section>
  );
}
