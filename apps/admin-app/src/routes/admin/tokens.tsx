import { useState } from "react";
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
import { reasonCatalogId } from "@comvestec/contracts";
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
  issueAdminOperatorTestToken,
  revokeAdminOperatorTestToken,
} from "../../lib/admin-tokens-mutations-server";
import type { AdminTokensRouteData } from "../../lib/admin-tokens-route-data";

/**
 * `/admin/tokens` — spec-canonical admin-operator-test-tokens
 * roster surface shipped by Phase 7 admin-org screens commit
 * 7b-2-tokens (admin-app implementation plan §11). Consumes the
 * `admin-tokens-{loader,route-data,route-server}` trio gated
 * end-to-end through `resolveTrustedRequestContextFromSessionId`
 * and the Phase 7a-2b-iii helper
 * `listAdminOperatorTestTokensFromEnvironment`, which enforces
 * the admin-owner floor and reason-catalog gates inside the
 * platform service.
 *
 * Issue + revoke now execute through trusted-session mutation
 * server functions. The `tokenPrefix` column remains the durable
 * audit correlator; plaintext is surfaced only once through a
 * revealable dialog after issue and is never refetched.
 */
const issueReasonCatalog: readonly HighRiskReason[] = [
  {
    id: "admin-operator-test-tokens.issue.qa",
    label: "QA harness — issue admin-operator test token",
  },
  {
    id: "admin-operator-test-tokens.issue.smoke",
    label: "Smoke run — issue admin-operator test token",
  },
  {
    id: "admin-operator-test-tokens.issue.incident",
    label: "Incident investigation — issue admin-operator test token",
  },
];

const revokeReasonCatalog: readonly HighRiskReason[] = [
  {
    id: "admin-operator-test-tokens.revoke.rotation",
    label: "Rotation — revoke admin-operator test token",
  },
  {
    id: "admin-operator-test-tokens.revoke.suspect-leak",
    label: "Suspected leak — revoke admin-operator test token",
  },
  {
    id: "admin-operator-test-tokens.revoke.lifecycle",
    label: "Lifecycle cleanup — revoke admin-operator test token",
  },
];

type AdminTokenStatusFilter = "all" | "active" | "revoked" | "expired";
type AdminTokenSortKey = "token" | "status" | "issuedBy" | "issued" | "expires";
type ReadyAdminTokensRouteData = Extract<
  AdminTokensRouteData,
  { readonly kind: "ready" }
>;
type AdminTokenRecord = ReadyAdminTokensRouteData["result"]["tokens"][number];

const resolveTokenStatus = (token: AdminTokenRecord): AdminTokenStatusFilter =>
  token.revokedAt !== undefined
    ? "revoked"
    : new Date(token.expiresAt).getTime() <= Date.now()
      ? "expired"
      : "active";

const formatTokenDay = (value: string): string => value.slice(0, 10);

const tokenExpiryPresets = [
  { id: "8h", label: "8 hours", durationMs: 8 * 60 * 60 * 1000 },
  { id: "24h", label: "24 hours", durationMs: 24 * 60 * 60 * 1000 },
  { id: "7d", label: "7 days", durationMs: 7 * 24 * 60 * 60 * 1000 },
] as const;

const resolveTokenExpiryIso = (
  presetId: (typeof tokenExpiryPresets)[number]["id"],
): string => {
  const preset =
    tokenExpiryPresets.find((candidate) => candidate.id === presetId) ??
    tokenExpiryPresets[0];
  return new Date(Date.now() + preset.durationMs).toISOString();
};

export const Route = createAdminAppFileRoute("/admin/tokens")({
  loader: async () => {
    const { loadAdminTokensLoaderData } =
      await import("../../lib/admin-tokens-loader");
    return loadAdminTokensLoaderData({});
  },
  component: AdminTokensRoute,
  pendingComponent: () => (
    <StateScreen
      variant="loading"
      title="Loading admin-operator test tokens…"
    />
  ),
});

function AdminTokensRoute() {
  const data: AdminTokensRouteData = Route.useLoaderData();
  const router = useRouter();
  const issueToken = useServerFn(issueAdminOperatorTestToken);
  const revokeToken = useServerFn(revokeAdminOperatorTestToken);
  const [issueArmed, setIssueArmed] = useState(false);
  const [revokeArmed, setRevokeArmed] = useState<string | null>(null);
  const [issueLabel, setIssueLabel] = useState("");
  const [expiryPresetId, setExpiryPresetId] = useState<
    (typeof tokenExpiryPresets)[number]["id"]
  >(tokenExpiryPresets[1].id);
  const [statusFilter, setStatusFilter] =
    useState<AdminTokenStatusFilter>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [issuedToken, setIssuedToken] = useState<{
    readonly label: string;
    readonly tokenPrefix: string;
    readonly plaintextToken: string;
  } | null>(null);
  const [tokenRevealed, setTokenRevealed] = useState(false);
  const tableState = useTableState<AdminTokenSortKey>({
    initialPageSize: 10,
    initialSortKey: "expires",
    initialSortDir: "asc",
  });
  // Reference the canonical reason-catalog ids so consumers see
  // the live catalog mapping in the source even though the CTA
  // `id`s above are the human-facing labels for the guard.
  void reasonCatalogId.adminOperatorTestTokensIssue;
  void reasonCatalogId.adminOperatorTestTokensRevoke;

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session, then assume an admin-owner role to view admin-operator test tokens."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access admin-operator test tokens."
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

  const { result } = data;
  const { tokens, totals } = result;
  const filteredTokens = tokens.filter((token) =>
    statusFilter === "all" ? true : resolveTokenStatus(token) === statusFilter,
  );
  const { visible, total } = applyTableState(filteredTokens, tableState, {
    searchOn: (token) =>
      `${token.label} ${token.tokenPrefix} ${token.issuedBy} ${resolveTokenStatus(token)}`,
    sortOn: {
      token: (token) => token.label,
      status: (token) => resolveTokenStatus(token),
      issuedBy: (token) => token.issuedBy,
      issued: (token) => token.issuedAt,
      expires: (token) => token.expiresAt,
    },
  });

  const handleIssueConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    try {
      const result = await issueToken({
        data: {
          label: issueLabel.trim(),
          expiresAt: resolveTokenExpiryIso(expiryPresetId),
          reasonCatalogId: input.reasonId,
          reasonAttachmentText: input.note.trim(),
        },
      });
      setIssueArmed(false);
      setIssueLabel("");
      setExpiryPresetId(tokenExpiryPresets[1].id);
      setActionError(null);
      setActionSuccess(`Token issued: ${result.label}.`);
      setIssuedToken({
        label: result.label,
        tokenPrefix: result.tokenPrefix,
        plaintextToken: result.plaintextToken,
      });
      setTokenRevealed(true);
      await router.invalidate();
    } catch (error) {
      setIssueArmed(false);
      setActionSuccess(null);
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to issue the admin-operator test token. Retry shortly.",
      );
    }
  };

  const handleRevokeConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    if (revokeArmed === null) return;

    try {
      const result = await revokeToken({
        data: {
          tokenId: revokeArmed,
          reasonCatalogId: input.reasonId,
          reasonAttachmentText: input.note.trim(),
        },
      });
      setRevokeArmed(null);
      setActionError(null);
      setActionSuccess(`Token revoked: ${result.tokenId}.`);
      await router.invalidate();
    } catch (error) {
      setRevokeArmed(null);
      setActionSuccess(null);
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to revoke the admin-operator test token. Retry shortly.",
      );
    }
  };

  const handleCopyPlaintextToken = async () => {
    if (
      issuedToken === null ||
      typeof navigator === "undefined" ||
      navigator.clipboard === undefined
    ) {
      return;
    }

    try {
      await navigator.clipboard.writeText(issuedToken.plaintextToken);
    } catch {
      // Best-effort copy; the reveal field remains available while the dialog is open.
    }
  };

  return (
    <section
      data-testid="admin-tokens-ready"
      data-pattern="admin-tokens-v2"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title="Admin-operator test tokens"
        breadcrumbs={[
          { label: "Admin" },
          { label: "Test tokens", href: "/admin/tokens" },
        ]}
        subtitle="Owner-only test tokens with HMAC-derived prefixes. Plaintext is surfaced exactly once at issue time and never re-fetched; the prefix column is the durable correlator."
      />

      {actionSuccess !== null ? (
        <div
          data-testid="admin-tokens-action-success"
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
          data-testid="admin-tokens-action-error"
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
        data-testid="admin-tokens-kpis"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        <KpiCard
          label="Active"
          value={totals.active}
          tone={totals.active > 0 ? "good" : "neutral"}
        />
        <KpiCard
          label="Expiring soon"
          value={totals.expiringSoon}
          tone={totals.expiringSoon > 0 ? "warn" : "neutral"}
        />
        <KpiCard
          label="Revoked"
          value={totals.revoked}
          tone={totals.revoked > 0 ? "alert" : "neutral"}
        />
      </div>

      <div
        data-testid="admin-tokens-issue-composer"
        style={{
          display: "grid",
          gap: 6,
          gridTemplateColumns: "minmax(220px, 1.6fr) minmax(160px, 1fr) auto",
          alignItems: "end",
        }}
      >
        <label
          style={{ display: "grid", gap: 4, fontSize: "0.8125rem" }}
          htmlFor="admin-tokens-issue-label"
        >
          <span>Label</span>
          <input
            id="admin-tokens-issue-label"
            data-testid="admin-tokens-issue-label"
            value={issueLabel}
            onChange={(event) => setIssueLabel(event.currentTarget.value)}
            placeholder="QA harness token"
          />
        </label>
        <label
          style={{ display: "grid", gap: 4, fontSize: "0.8125rem" }}
          htmlFor="admin-tokens-issue-expiry"
        >
          <span>Expiry</span>
          <select
            id="admin-tokens-issue-expiry"
            data-testid="admin-tokens-issue-expiry"
            value={expiryPresetId}
            onChange={(event) =>
              setExpiryPresetId(
                event.currentTarget
                  .value as (typeof tokenExpiryPresets)[number]["id"],
              )
            }
          >
            {tokenExpiryPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          data-testid="admin-tokens-issue-cta"
          disabled={issueLabel.trim().length === 0}
          onClick={() => setIssueArmed(true)}
        >
          Issue token
        </button>
      </div>

      <div
        data-testid="admin-tokens-owner-note"
        style={{
          padding: 8,
          borderRadius: 12,
          border: "1px solid var(--ops-border, rgba(255,255,255,0.14))",
          background:
            "color-mix(in oklab, var(--ops-surface-2, rgba(255,255,255,0.03)) 88%, transparent)",
          color: "var(--ops-text-primary, inherit)",
        }}
      >
        Owner-only tokens never reveal plaintext again after issue time. Treat
        label + prefix as the durable audit correlators.
      </div>

      <div className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">
            Token registry
            <span className="ops-card-head__count">{total}</span>
          </p>
        </div>

        <FilterBar
          searchValue={tableState.search}
          onSearchChange={tableState.setSearch}
          searchPlaceholder="Search labels, prefixes, or issuers…"
          trailing={
            <SegmentedTabs<AdminTokenStatusFilter>
              ariaLabel="Token status filter"
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                tableState.setPage(1);
              }}
              items={[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "revoked", label: "Revoked" },
                { value: "expired", label: "Expired" },
              ]}
            />
          }
        />

        <table
          data-testid="admin-tokens-table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.8125rem",
          }}
        >
          <thead>
            <tr>
              <SortableTableHeader
                ariaSort={resolveTableAriaSort(tableState, "token")}
                onToggle={() => tableState.toggleSort("token")}
              >
                Token
              </SortableTableHeader>
              <SortableTableHeader
                ariaSort={resolveTableAriaSort(tableState, "issuedBy")}
                onToggle={() => tableState.toggleSort("issuedBy")}
              >
                Issued by
              </SortableTableHeader>
              <SortableTableHeader
                ariaSort={resolveTableAriaSort(tableState, "issued")}
                onToggle={() => tableState.toggleSort("issued")}
              >
                Issued
              </SortableTableHeader>
              <SortableTableHeader
                ariaSort={resolveTableAriaSort(tableState, "expires")}
                onToggle={() => tableState.toggleSort("expires")}
              >
                Lifecycle
              </SortableTableHeader>
              <SortableTableHeader
                ariaSort={resolveTableAriaSort(tableState, "status")}
                onToggle={() => tableState.toggleSort("status")}
              >
                Status
              </SortableTableHeader>
              <th style={{ textAlign: "left", padding: 4 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  data-testid="admin-tokens-empty"
                  style={{ padding: 6 }}
                >
                  No admin-operator test tokens match the current view.
                </td>
              </tr>
            ) : (
              visible.map((token) => {
                const status = resolveTokenStatus(token);

                return (
                  <tr
                    key={token.id}
                    data-testid="admin-tokens-row"
                    data-token-id={token.id}
                    data-status={status}
                  >
                    <td style={{ padding: 4 }}>
                      <div style={{ display: "grid", gap: 2 }}>
                        <span className="text-strong">{token.label}</span>
                        <span
                          className="mono"
                          style={{ color: "var(--ops-text-secondary)" }}
                        >
                          {token.tokenPrefix}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: 4 }} className="mono">
                      {token.issuedBy}
                    </td>
                    <td style={{ padding: 4 }}>
                      <div style={{ display: "grid", gap: 2 }}>
                        <span className="mono">
                          {formatTokenDay(token.issuedAt)}
                        </span>
                        <span style={{ color: "var(--ops-text-secondary)" }}>
                          Issue recorded
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: 4 }}>
                      <div style={{ display: "grid", gap: 2 }}>
                        <span className="mono">
                          {formatTokenDay(token.expiresAt)}
                        </span>
                        <span style={{ color: "var(--ops-text-secondary)" }}>
                          {status === "revoked"
                            ? `Revoked ${formatTokenDay(token.revokedAt!)}`
                            : "Expiry checkpoint"}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: 4 }}>
                      <StatusChip
                        status={status}
                        variant={resolveStatusVariant(status)}
                      />
                    </td>
                    <td style={{ padding: 4 }}>
                      {status === "active" ? (
                        <button
                          type="button"
                          data-testid="admin-tokens-revoke-cta"
                          data-token-id={token.id}
                          onClick={() => setRevokeArmed(token.id)}
                        >
                          Revoke
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
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

      {issueArmed ? (
        <HighRiskActionGuard
          action={{
            id: "admin-tokens-issue",
            label: "Issue admin-operator test token",
          }}
          selection={["admin-operator-test-tokens"]}
          reasons={issueReasonCatalog}
          requireNote
          confirmLabel="Issue"
          onConfirm={handleIssueConfirm}
          onCancel={() => setIssueArmed(false)}
        />
      ) : null}

      {revokeArmed !== null ? (
        <HighRiskActionGuard
          action={{
            id: "admin-tokens-revoke",
            label: "Revoke admin-operator test token",
          }}
          selection={[revokeArmed]}
          reasons={revokeReasonCatalog}
          requireNote
          confirmLabel="Revoke"
          onConfirm={handleRevokeConfirm}
          onCancel={() => setRevokeArmed(null)}
        />
      ) : null}
      <Dialog
        open={issuedToken !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIssuedToken(null);
            setTokenRevealed(false);
          }
        }}
      >
        {issuedToken !== null ? (
          <DialogContent
            title="Admin test token issued"
            description="Copy this plaintext token now. Only the prefix is retained after the dialog closes."
          >
            <div style={{ display: "grid", gap: 8 }}>
              <div>
                <strong>Label:</strong> {issuedToken.label}
              </div>
              <div>
                <strong>Prefix:</strong>{" "}
                <span className="mono">{issuedToken.tokenPrefix}</span>
              </div>
              <RevealField
                label="Plaintext token"
                value={
                  <span className="mono">{issuedToken.plaintextToken}</span>
                }
                revealed={tokenRevealed}
                onReveal={() => setTokenRevealed(true)}
                onHide={() => setTokenRevealed(false)}
              />
              <div style={{ display: "flex", gap: 6, justifyContent: "end" }}>
                <button
                  type="button"
                  data-testid="admin-tokens-plaintext-copy"
                  onClick={handleCopyPlaintextToken}
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
