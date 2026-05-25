import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  HighRiskActionGuard,
  RevealField,
  StateScreen,
  StatusChip,
  resolveStatusVariant,
  type HighRiskReason,
} from "@comvestec/ui";
import {
  adminMemberRole,
  adminMemberStatus,
  type AdminMember,
  type AdminMemberRole,
  type AdminMemberStatus,
} from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../file-route";
import {
  FilterBar,
  KpiCard,
  Pagination,
  ScreenHeader,
  SegmentedTabs,
  SortableTableHeader,
  applyTableState,
  resolveTableAriaSort,
  useTableState,
} from "../../components/ui";
import {
  inviteAdminMember,
  removeAdminMember,
} from "../../lib/admin-members-mutations-server";
import type { AdminMembersRouteData } from "../../lib/admin-members-route-data";

/**
 * `/admin/members` — spec-canonical admin-organization member
 * roster surface shipped by Phase 7 admin-org screens commit
 * 7b-1 (admin-app implementation plan §11). Consumes the
 * `admin-members-{loader,route-data,route-server}` trio gated
 * end-to-end through `resolveTrustedRequestContextFromSessionId`
 * and `listAdminOrganizationMembersFromEnvironment` (Phase 7a-1
 * canonical alias).
 *
 * The invite + remove CTAs now execute through trusted-session
 * mutations-server entrypoints. Invitation issue returns a
 * one-shot plaintext invitation token, which the route surfaces
 * through a revealable dialog exactly once so operators can copy
 * or hand off the redeem link intentionally.
 */
const inviteReasonCatalog: readonly HighRiskReason[] = [
  {
    id: "admin-organization.member-invite.onboarding",
    label: "Operator onboarding — invite admin member",
  },
  {
    id: "admin-organization.member-invite.role-coverage",
    label: "Role coverage — invite admin member",
  },
  {
    id: "admin-organization.member-invite.audit-rotation",
    label: "Audit rotation — invite admin member",
  },
];

const removeReasonCatalog: readonly HighRiskReason[] = [
  {
    id: "admin-organization.member-remove.offboarding",
    label: "Operator offboarding — remove admin member",
  },
  {
    id: "admin-organization.member-remove.role-rebalance",
    label: "Role rebalance — remove admin member",
  },
  {
    id: "admin-organization.member-remove.compromise-response",
    label: "Compromise response — remove admin member",
  },
];

type AdminMembersStatusFilter = "all" | AdminMemberStatus;
type AdminMembersSortKey = "member" | "role" | "status" | "activity";

const memberRoleLabel: Record<AdminMemberRole, string> = {
  [adminMemberRole.adminOwner]: "Owner",
  [adminMemberRole.adminAdmin]: "Admin",
  [adminMemberRole.adminOperator]: "Operator",
  [adminMemberRole.supportReviewer]: "Support reviewer",
  [adminMemberRole.billingOnly]: "Billing only",
  [adminMemberRole.compliance]: "Compliance",
  [adminMemberRole.viewer]: "Viewer",
};

const memberRoleFilterLabel: Record<AdminMemberRole, string> = {
  [adminMemberRole.adminOwner]: "Owners",
  [adminMemberRole.adminAdmin]: "Admins",
  [adminMemberRole.adminOperator]: "Operators",
  [adminMemberRole.supportReviewer]: "Support",
  [adminMemberRole.billingOnly]: "Billing",
  [adminMemberRole.compliance]: "Compliance",
  [adminMemberRole.viewer]: "Viewers",
};

const adminMemberRoleFilters = [
  adminMemberRole.adminOwner,
  adminMemberRole.adminAdmin,
  adminMemberRole.adminOperator,
  adminMemberRole.supportReviewer,
  adminMemberRole.billingOnly,
  adminMemberRole.compliance,
  adminMemberRole.viewer,
] as const;

const resolveMemberActivityAt = (member: AdminMember): string =>
  member.lastActiveAt ?? member.acceptedAt ?? member.updatedAt;

const formatMemberDay = (value: string | undefined): string =>
  value === undefined ? "—" : value.slice(0, 10);

const buildRoleFilterButtonStyle = (active: boolean) =>
  ({
    padding: "4px 8px",
    borderRadius: 999,
    border: active
      ? "1px solid color-mix(in oklab, var(--ops-accent, #7dd3fc) 42%, transparent)"
      : "1px solid var(--ops-border, rgba(255,255,255,0.12))",
    background: active
      ? "color-mix(in oklab, var(--ops-accent, #7dd3fc) 16%, transparent)"
      : "color-mix(in oklab, var(--ops-surface-2, rgba(255,255,255,0.03)) 88%, transparent)",
    color: "var(--ops-text-primary, inherit)",
    cursor: "pointer",
    fontSize: "0.74rem",
    fontWeight: 700,
  }) satisfies CSSProperties;

export const Route = createAdminAppFileRoute("/admin/members")({
  loader: async () => {
    const { loadAdminMembersLoaderData } =
      await import("../../lib/admin-members-loader");
    return loadAdminMembersLoaderData({});
  },
  component: AdminMembersRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading admin members…" />
  ),
});

function AdminMembersRoute() {
  const data: AdminMembersRouteData = Route.useLoaderData();
  const router = useRouter();
  const inviteMember = useServerFn(inviteAdminMember);
  const removeMember = useServerFn(removeAdminMember);
  const [inviteArmed, setInviteArmed] = useState(false);
  const [removeArmed, setRemoveArmed] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AdminMemberRole>(
    adminMemberRole.adminOperator,
  );
  const [roleFilter, setRoleFilter] = useState<AdminMemberRole | "all">("all");
  const [statusFilter, setStatusFilter] =
    useState<AdminMembersStatusFilter>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [issuedInvitation, setIssuedInvitation] = useState<{
    readonly email: string;
    readonly invitationToken: string;
  } | null>(null);
  const [invitationRevealed, setInvitationRevealed] = useState(false);
  const tableState = useTableState<AdminMembersSortKey>({
    initialPageSize: 10,
    initialSortKey: "activity",
    initialSortDir: "desc",
  });

  useEffect(() => {
    if (data.kind !== "ready") {
      delete document.documentElement.dataset.adminMembersHydrated;
      return;
    }

    document.documentElement.dataset.adminMembersHydrated = "true";
    return () => {
      delete document.documentElement.dataset.adminMembersHydrated;
    };
  }, [data.kind]);

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view admin organization members."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access admin organization members."
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

  const { members } = data;
  const ownerCount = members.filter(
    (member) => member.role === adminMemberRole.adminOwner,
  ).length;
  const activeCount = members.filter(
    (member) => member.status === adminMemberStatus.active,
  ).length;
  const archivedCount = members.filter(
    (member) => member.status === adminMemberStatus.archived,
  ).length;
  const distinctRoleCount = new Set(members.map((member) => member.role)).size;

  const filteredMembers = members.filter((member) => {
    if (roleFilter !== "all" && member.role !== roleFilter) {
      return false;
    }

    if (statusFilter !== "all" && member.status !== statusFilter) {
      return false;
    }

    return true;
  });

  const { visible, total } = applyTableState(filteredMembers, tableState, {
    searchOn: (member) =>
      `${member.displayName} ${member.email} ${memberRoleLabel[member.role]} ${member.status} ${member.createdBy}`,
    sortOn: {
      member: (member) => `${member.displayName} ${member.email}`,
      role: (member) => memberRoleLabel[member.role],
      status: (member) => member.status,
      activity: (member) => resolveMemberActivityAt(member),
    },
  });

  const handleInviteConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    try {
      const result = await inviteMember({
        data: {
          email: inviteEmail.trim(),
          invitedRole: inviteRole,
          reasonId: input.reasonId,
          reasonAttachmentText: input.note.trim(),
        },
      });
      setInviteArmed(false);
      setInviteEmail("");
      setInviteRole(adminMemberRole.adminOperator);
      setActionError(null);
      setActionSuccess(`Invitation issued for ${result.email}.`);
      setIssuedInvitation({
        email: result.email,
        invitationToken: result.invitationToken,
      });
      setInvitationRevealed(true);
      await router.invalidate();
    } catch (error) {
      setInviteArmed(false);
      setActionSuccess(null);
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to invite the admin member. Retry shortly.",
      );
    }
  };

  const handleRemoveConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    if (removeArmed === null) return;

    try {
      const result = await removeMember({
        data: {
          memberId: removeArmed,
          reasonId: input.reasonId,
          reasonAttachmentText: input.note.trim(),
        },
      });
      setRemoveArmed(null);
      setActionError(null);
      setActionSuccess(`Member removed: ${result.memberId}.`);
      await router.invalidate();
    } catch (error) {
      setRemoveArmed(null);
      setActionSuccess(null);
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to remove the admin member. Retry shortly.",
      );
    }
  };

  const handleCopyInvitationToken = async () => {
    if (
      issuedInvitation === null ||
      typeof navigator === "undefined" ||
      navigator.clipboard === undefined
    ) {
      return;
    }

    try {
      await navigator.clipboard.writeText(issuedInvitation.invitationToken);
    } catch {
      // Best-effort copy; the revealable token remains visible in the dialog.
    }
  };

  return (
    <section
      data-testid="admin-members-ready"
      data-pattern="admin-members-v2"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title="Admin members"
        breadcrumbs={[
          { label: "Admin" },
          { label: "Members", href: "/admin/members" },
        ]}
        subtitle="Admin organization roster, role coverage, and owner-floor resilience for the app itself."
      />

      {actionSuccess !== null ? (
        <div
          data-testid="admin-members-action-success"
          role="status"
          style={{
            padding: 6,
            color: "var(--status-success-fg)",
            background: "var(--status-success-bg)",
            border: "1px solid var(--status-success-border)",
            borderRadius: 4,
          }}
        >
          {actionSuccess}
        </div>
      ) : null}
      {actionError !== null ? (
        <div
          data-testid="admin-members-action-error"
          role="alert"
          style={{
            padding: 6,
            color: "var(--status-error-fg)",
            background: "var(--status-error-bg)",
            border: "1px solid var(--status-error-border)",
            borderRadius: 4,
          }}
        >
          {actionError}
        </div>
      ) : null}

      <div
        data-testid="admin-members-kpis"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        <KpiCard label="Total members" value={members.length} tone="neutral" />
        <KpiCard
          label="Admin owners"
          value={ownerCount}
          tone={ownerCount > 0 ? "good" : "alert"}
        />
        <KpiCard
          label="Active"
          value={activeCount}
          tone={activeCount > 0 ? "good" : "neutral"}
        />
        <KpiCard
          label="Archived"
          value={archivedCount}
          tone={archivedCount > 0 ? "warn" : "neutral"}
        />
        <KpiCard
          label="Role coverage"
          value={distinctRoleCount}
          tone={distinctRoleCount >= 3 ? "good" : "warn"}
        />
      </div>

      <div
        data-testid="admin-members-invite-composer"
        style={{
          display: "grid",
          gap: 6,
          gridTemplateColumns: "minmax(220px, 1.6fr) minmax(160px, 1fr) auto",
          alignItems: "end",
        }}
      >
        <label
          style={{ display: "grid", gap: 4, fontSize: "0.8125rem" }}
          htmlFor="admin-members-invite-email"
        >
          <span>Email</span>
          <input
            id="admin-members-invite-email"
            data-testid="admin-members-invite-email"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.currentTarget.value)}
            placeholder="operator@comvestec.com"
          />
        </label>
        <label
          style={{ display: "grid", gap: 4, fontSize: "0.8125rem" }}
          htmlFor="admin-members-invite-role"
        >
          <span>Role</span>
          <select
            id="admin-members-invite-role"
            data-testid="admin-members-invite-role"
            value={inviteRole}
            onChange={(event) =>
              setInviteRole(event.currentTarget.value as AdminMemberRole)
            }
          >
            {adminMemberRoleFilters.map((role) => (
              <option key={role} value={role}>
                {memberRoleLabel[role]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          data-testid="admin-members-invite-cta"
          disabled={inviteEmail.trim().length === 0}
          onClick={() => setInviteArmed(true)}
        >
          Invite member
        </button>
      </div>

      {ownerCount <= 1 ? (
        <div
          data-testid="admin-members-owner-floor"
          style={{
            padding: 8,
            borderRadius: 12,
            border:
              "1px solid var(--status-pending-border, rgba(245,158,11,0.35))",
            background:
              "color-mix(in oklab, var(--status-pending-bg, rgba(245,158,11,0.16)) 80%, transparent)",
            color: "var(--ops-text-primary, inherit)",
          }}
        >
          Only one admin owner is active. Add a second owner to reduce operator
          lockout risk during offboarding or incident response.
        </div>
      ) : null}

      <div className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">
            Membership workspace
            <span className="ops-card-head__count">{total}</span>
          </p>
        </div>

        <FilterBar
          searchValue={tableState.search}
          onSearchChange={tableState.setSearch}
          searchPlaceholder="Search members, email, or role…"
          trailing={
            <SegmentedTabs<AdminMembersStatusFilter>
              ariaLabel="Member status filter"
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                tableState.setPage(1);
              }}
              items={[
                { value: "all", label: "All" },
                { value: adminMemberStatus.active, label: "Active" },
                { value: adminMemberStatus.archived, label: "Archived" },
              ]}
            />
          }
        />

        <div
          data-testid="admin-members-role-filter"
          style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}
        >
          <button
            type="button"
            onClick={() => {
              setRoleFilter("all");
              tableState.setPage(1);
            }}
            style={buildRoleFilterButtonStyle(roleFilter === "all")}
          >
            All roles
          </button>
          {adminMemberRoleFilters.map((role) => {
            const count = members.filter(
              (member) => member.role === role,
            ).length;

            return (
              <button
                key={role}
                type="button"
                onClick={() => {
                  setRoleFilter(role);
                  tableState.setPage(1);
                }}
                style={buildRoleFilterButtonStyle(roleFilter === role)}
              >
                {memberRoleFilterLabel[role]}
                <span className="mono" style={{ marginLeft: 6 }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <table
          data-testid="admin-members-table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.8125rem",
          }}
        >
          <thead>
            <tr>
              <SortableTableHeader
                ariaSort={resolveTableAriaSort(tableState, "member")}
                onToggle={() => tableState.toggleSort("member")}
              >
                Member
              </SortableTableHeader>
              <SortableTableHeader
                ariaSort={resolveTableAriaSort(tableState, "role")}
                onToggle={() => tableState.toggleSort("role")}
              >
                Role
              </SortableTableHeader>
              <SortableTableHeader
                ariaSort={resolveTableAriaSort(tableState, "status")}
                onToggle={() => tableState.toggleSort("status")}
              >
                Lifecycle
              </SortableTableHeader>
              <SortableTableHeader
                ariaSort={resolveTableAriaSort(tableState, "activity")}
                onToggle={() => tableState.toggleSort("activity")}
              >
                Activity
              </SortableTableHeader>
              <th style={{ textAlign: "left", padding: 4 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  data-testid="admin-members-empty"
                  style={{ padding: 6 }}
                >
                  No admin members match the current filters.
                </td>
              </tr>
            ) : (
              visible.map((member) => (
                <tr
                  key={member.id}
                  data-testid="admin-members-row"
                  data-member-id={member.id}
                >
                  <td style={{ padding: 4 }}>
                    <div style={{ display: "grid", gap: 2 }}>
                      <span className="text-strong">{member.displayName}</span>
                      <span
                        className="mono"
                        style={{ color: "var(--ops-text-secondary)" }}
                      >
                        {member.email}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: 4 }}>
                    <div style={{ display: "grid", gap: 2 }}>
                      <span className="text-strong">
                        {memberRoleLabel[member.role]}
                      </span>
                      <span
                        className="mono"
                        style={{ color: "var(--ops-text-secondary)" }}
                      >
                        {member.createdBy}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: 4 }}>
                    <div style={{ display: "grid", gap: 4 }}>
                      <StatusChip
                        status={member.status}
                        variant={resolveStatusVariant(member.status)}
                      />
                      <span
                        className="mono"
                        style={{ color: "var(--ops-text-secondary)" }}
                      >
                        Invited {formatMemberDay(member.invitedAt)}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: 4 }}>
                    <div style={{ display: "grid", gap: 2 }}>
                      <span className="mono">
                        {formatMemberDay(resolveMemberActivityAt(member))}
                      </span>
                      <span style={{ color: "var(--ops-text-secondary)" }}>
                        {member.lastActiveAt !== undefined
                          ? "Last active"
                          : member.acceptedAt !== undefined
                            ? "Accepted"
                            : "Updated"}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: 4 }}>
                    <button
                      type="button"
                      data-testid="admin-members-remove-cta"
                      data-member-id={member.id}
                      onClick={() => setRemoveArmed(member.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <Pagination
          page={tableState.page}
          pageSize={tableState.pageSize}
          total={total}
          onPageChange={tableState.setPage}
          onPageSizeChange={tableState.setPageSize}
        />
      </div>

      {inviteArmed ? (
        <HighRiskActionGuard
          action={{ id: "admin-members-invite", label: "Invite admin member" }}
          selection={["admin-organization"]}
          reasons={inviteReasonCatalog}
          requireNote
          confirmLabel="Invite"
          onConfirm={handleInviteConfirm}
          onCancel={() => setInviteArmed(false)}
        />
      ) : null}

      {removeArmed !== null ? (
        <HighRiskActionGuard
          action={{ id: "admin-members-remove", label: "Remove admin member" }}
          selection={[removeArmed]}
          reasons={removeReasonCatalog}
          requireNote
          confirmLabel="Remove"
          onConfirm={handleRemoveConfirm}
          onCancel={() => setRemoveArmed(null)}
        />
      ) : null}
      <Dialog
        open={issuedInvitation !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIssuedInvitation(null);
            setInvitationRevealed(false);
          }
        }}
      >
        {issuedInvitation !== null ? (
          <DialogContent
            title="Admin invitation issued"
            description="Copy the one-shot invitation token now. It is not persisted server-side and will not be shown again once this dialog closes."
          >
            <div style={{ display: "grid", gap: 8 }}>
              <div>
                <strong>Recipient:</strong>{" "}
                <span className="mono">{issuedInvitation.email}</span>
              </div>
              <RevealField
                label="Invitation token"
                value={
                  <span className="mono">
                    {issuedInvitation.invitationToken}
                  </span>
                }
                revealed={invitationRevealed}
                onReveal={() => setInvitationRevealed(true)}
                onHide={() => setInvitationRevealed(false)}
              />
              <div style={{ display: "flex", gap: 6, justifyContent: "end" }}>
                <button
                  type="button"
                  data-testid="admin-members-invitation-copy"
                  onClick={handleCopyInvitationToken}
                >
                  Copy token
                </button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  );
}
