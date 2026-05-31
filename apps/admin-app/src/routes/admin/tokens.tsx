import { useEffect, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
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
import { formatAdminNumber } from "../../lib/number-format";
import type { AdminTokensRouteData } from "../../lib/admin-tokens-route-data";
import { isTimestampExpiredAt } from "../../lib/reference-time";

const statusTabs = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "revoked", label: "Revoked" },
  { value: "expired", label: "Expired" },
] as const;

type StatusFilter = (typeof statusTabs)[number]["value"];
type AdminTokenRecord = Extract<
  AdminTokensRouteData,
  { kind: "ready" }
>["result"]["tokens"][number];

const tokenExpiringSoonThresholdMs = 24 * 60 * 60 * 1000;

const formatTokenDay = (value: string | undefined): string =>
  value === undefined ? "—" : value.slice(0, 10);

const formatTokenStamp = (value: string | undefined): string =>
  value === undefined ? "—" : value.slice(0, 16).replace("T", " ");

const resolveTokenStatus = (
  token: AdminTokenRecord,
  referenceTime: string,
): Exclude<StatusFilter, "all"> => {
  if (token.revokedAt !== undefined) {
    return "revoked";
  }
  if (isTimestampExpiredAt(token.expiresAt, referenceTime)) {
    return "expired";
  }
  return "active";
};

const isTokenExpiringSoon = (
  token: AdminTokenRecord,
  referenceTime: string,
): boolean => {
  if (resolveTokenStatus(token, referenceTime) !== "active") {
    return false;
  }
  const expiresAt = Date.parse(token.expiresAt);
  const generatedAt = Date.parse(referenceTime);
  return (
    !Number.isNaN(expiresAt) &&
    !Number.isNaN(generatedAt) &&
    expiresAt - generatedAt <= tokenExpiringSoonThresholdMs
  );
};

const formatTokenStatusLabel = (status: Exclude<StatusFilter, "all">): string =>
  status.charAt(0).toUpperCase() + status.slice(1);

const resolveFocusedTokenNarrative = (
  token: AdminTokenRecord | undefined,
  referenceTime: string,
  pinned: boolean,
): string => {
  if (token === undefined) {
    return "No token is currently in focus. Reset the roster or issue a guarded token to continue the operator rehearsal.";
  }

  const status = resolveTokenStatus(token, referenceTime);
  if (status === "revoked") {
    return pinned
      ? `Pinned to a revoked token. Keep ${token.tokenPrefix} for audit correlation and issue a replacement before the next operator exercise.`
      : `This token has been revoked. Keep ${token.tokenPrefix} only as an audit correlator and replace it before the next operator exercise.`;
  }

  if (status === "expired") {
    return pinned
      ? `Pinned to an expired token. Rotate ${token.label} before the next rehearsal window opens.`
      : `This token is expired. Rotate ${token.label} before the next rehearsal window opens.`;
  }

  if (isTokenExpiringSoon(token, referenceTime)) {
    return pinned
      ? `Pinned to the most urgent active token. ${token.label} expires within 24 hours, so schedule the rotation now.`
      : `${token.label} expires within 24 hours. Rotate it now so the admin owner rehearsal stays uninterrupted.`;
  }

  return pinned
    ? `Pinned to an active token. Plaintext can never be retrieved again after the reveal dialog closes, so store it before leaving this screen.`
    : `This token is active. Plaintext can never be retrieved again after the reveal dialog closes, so store it before leaving this screen.`;
};

export const Route = createAdminAppFileRoute("/admin/tokens")({
  loader: async () => {
    const { loadAdminTokensLoaderData } =
      await import("../../lib/admin-tokens-loader");
    return loadAdminTokensLoaderData({});
  },
  component: AdminTokensRoute,
  pendingComponent: () => (
    <StateScreen title="Loading admin operator tokens…" variant="loading" />
  ),
});

function AdminTokensRoute() {
  const data: AdminTokensRouteData = Route.useLoaderData();
  const router = useRouter();
  const issueToken = useServerFn(issueAdminOperatorTestToken);
  const revokeToken = useServerFn(revokeAdminOperatorTestToken);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [issueLabel, setIssueLabel] = useState("Smoke harness token");
  const [issueTtlHours, setIssueTtlHours] = useState("24");
  const [issueArmed, setIssueArmed] = useState(false);
  const [revokeArmed, setRevokeArmed] = useState<string | null>(null);
  const [issuePending, setIssuePending] = useState(false);
  const [revokePending, setRevokePending] = useState(false);
  const [issuedToken, setIssuedToken] = useState<{
    id: string;
    label: string;
    tokenPrefix: string;
    plaintextToken: string;
  } | null>(null);
  const [issuedTokenRevealed, setIssuedTokenRevealed] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.dataset.adminTokensHydrated = "true";
    return () => {
      delete document.documentElement.dataset.adminTokensHydrated;
    };
  }, []);

  if (data.kind === "shell") {
    return (
      <StateScreen
        title="Operator session required"
        description="Sign in with an admin-owner session to inspect the token registry."
        variant="denied"
      />
    );
  }

  if (data.kind === "stale-session") {
    return (
      <StateScreen
        title="Admin session required"
        description="Re-authenticate to access the admin operator token registry."
        variant="stale"
      />
    );
  }

  if (data.kind === "denied") {
    return (
      <StateScreen
        title="Admin owner access required"
        description={data.reason}
        variant="denied"
      />
    );
  }

  if (data.kind === "error") {
    return (
      <StateScreen
        title={data.title}
        description={data.description}
        variant="5xx"
      />
    );
  }

  const { result } = data;
  const filteredTokens = result.tokens.filter((token) => {
    const tokenStatus = resolveTokenStatus(token, data.generatedAt);
    return statusFilter === "all" ? true : tokenStatus === statusFilter;
  });

  const tableState = useTableState<keyof AdminTokenRecord>({
    initialPageSize: 10,
    initialSortKey: "issuedAt",
    initialSortDir: "desc",
  });

  const tableView = applyTableState(filteredTokens, tableState, {
    searchOn: (token) =>
      [
        token.label,
        token.tokenPrefix,
        token.issuedBy,
        resolveTokenStatus(token, data.generatedAt),
      ].join(" "),
    sortOn: {
      label: (token) => token.label,
      issuedBy: (token) => token.issuedBy,
      issuedAt: (token) => token.issuedAt,
      expiresAt: (token) => token.revokedAt ?? token.expiresAt,
    },
  });

  const visibleTokens = tableView.visible;
  const focusedToken =
    visibleTokens.find((token) => token.id === selectedTokenId) ??
    visibleTokens.find((token) =>
      isTokenExpiringSoon(token, data.generatedAt),
    ) ??
    visibleTokens.find(
      (token) => resolveTokenStatus(token, data.generatedAt) === "active",
    ) ??
    visibleTokens.find(
      (token) => resolveTokenStatus(token, data.generatedAt) === "expired",
    ) ??
    visibleTokens[0];
  const focusedTokenPinned =
    selectedTokenId !== null && focusedToken?.id === selectedTokenId;
  const focusedTokenStatus =
    focusedToken === undefined
      ? undefined
      : resolveTokenStatus(focusedToken, data.generatedAt);
  const hasClientFilters =
    statusFilter !== "all" || tableState.search.trim().length > 0;
  const uniqueIssuers = new Set(result.tokens.map((token) => token.issuedBy))
    .size;
  const rosterCountLabel =
    tableView.total === result.tokens.length
      ? `${formatAdminNumber(tableView.total)} loaded`
      : `${formatAdminNumber(tableView.total)} matching`;

  const issueReasons: readonly HighRiskReason[] = [
    {
      id: reasonCatalogId.adminOperatorTestTokensIssue,
      label: "Controlled rehearsal issuance",
      description:
        "Issue a bounded owner-only token for smoke checks, incident rehearsal, or break-glass validation.",
    },
  ];
  const revokeReasons: readonly HighRiskReason[] = result.tokens
    .filter((token) => token.id === revokeArmed)
    .map((token) => ({
      id: reasonCatalogId.adminOperatorTestTokensRevoke,
      label: "Unsafe or replaced token",
      description:
        token.revokedAt === undefined &&
        !isTimestampExpiredAt(token.expiresAt, data.generatedAt)
          ? "Active automation depends on this token. Confirm the replacement path before revoking it."
          : "Keep the token prefix for audit correlation before revoking it.",
    }));

  const resetRoster = () => {
    setSelectedTokenId(null);
    setStatusFilter("all");
    tableState.setSearch("");
    tableState.setPage(1);
  };

  const handleIssueConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    const label = issueLabel.trim();
    const ttlHours = Number.parseInt(issueTtlHours, 10);
    const baseTime = Date.parse(data.generatedAt);
    const expiresAt = new Date(
      (Number.isNaN(baseTime) ? Date.now() : baseTime) +
        ttlHours * 60 * 60 * 1000,
    ).toISOString();

    if (label.length === 0 || Number.isNaN(ttlHours) || ttlHours <= 0) {
      setActionError(
        "Enter a label and positive TTL hours before issuing a token.",
      );
      setActionSuccess(null);
      return;
    }

    setIssuePending(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const mutationResult = await issueToken({
        data: {
          label,
          expiresAt,
          reasonCatalogId: input.reasonId,
          reasonAttachmentText: input.note.trim(),
        },
      });
      setIssueArmed(false);
      setIssuedToken({
        id: mutationResult.tokenId,
        label: mutationResult.label,
        tokenPrefix: mutationResult.tokenPrefix,
        plaintextToken: mutationResult.plaintextToken,
      });
      setIssuedTokenRevealed(true);
      setSelectedTokenId(mutationResult.tokenId);
      setStatusFilter("all");
      tableState.setSearch(mutationResult.label);
      tableState.setPage(1);
      await router.invalidate();
      setActionSuccess(`Issued test token ${mutationResult.label}.`);
    } catch (error) {
      setIssueArmed(false);
      const message =
        error instanceof Error ? error.message : "Unable to issue test token.";
      setActionSuccess(null);
      setActionError(message);
    } finally {
      setIssuePending(false);
    }
  };

  const handleRevokeConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    if (revokeArmed === null) {
      return;
    }
    const revokeTargetPrefix =
      result.tokens.find((candidate) => candidate.id === revokeArmed)
        ?.tokenPrefix ?? revokeArmed;

    setRevokePending(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const mutationResult = await revokeToken({
        data: {
          tokenId: revokeArmed,
          reasonCatalogId: input.reasonId,
          reasonAttachmentText: input.note.trim(),
        },
      });
      setSelectedTokenId(mutationResult.tokenId);
      setRevokeArmed(null);
      await router.invalidate();
      setActionSuccess(`Revoked test token ${revokeTargetPrefix}.`);
    } catch (error) {
      setRevokeArmed(null);
      const message =
        error instanceof Error ? error.message : "Unable to revoke test token.";
      setActionSuccess(null);
      setActionError(message);
    } finally {
      setRevokePending(false);
    }
  };

  const handleCopyPlaintextToken = async () => {
    if (issuedToken === null) {
      return;
    }

    if (typeof navigator === "undefined" || navigator.clipboard === undefined) {
      setActionError(
        "Clipboard copy is unavailable. Copy the plaintext token manually before closing the dialog.",
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(issuedToken.plaintextToken);
      setActionError(null);
    } catch {
      setActionError(
        "Clipboard copy failed. Copy the plaintext token manually before closing the dialog.",
      );
    }
  };

  return (
    <div
      className="ops-screen"
      data-pattern="admin-tokens-v4"
      data-testid="admin-tokens-ready"
    >
      <ScreenHeader
        title="Admin operator tokens"
        subtitle={`${formatAdminNumber(result.tokens.length)} seeded and issued tokens loaded · owner-only issuance · plaintext revealed once`}
        actions={
          <>
            <Link className="ops-btn ops-btn--ghost" to="/admin/audit">
              Audit trail
            </Link>
            <Link className="ops-btn ops-btn--ghost" to="/admin/members">
              Members
            </Link>
          </>
        }
      />

      <div className="ops-inline-cluster">
        <span className="ops-signal-badge ops-signal-badge--accent">
          {focusedToken === undefined
            ? "Registry overview"
            : focusedTokenPinned
              ? "Pinned token"
              : "Focused token"}
        </span>
        <span
          className={
            result.totals.expiringSoon > 0
              ? "ops-signal-badge ops-signal-badge--warn"
              : "ops-signal-badge ops-signal-badge--good"
          }
        >
          {result.totals.expiringSoon > 0
            ? `${formatAdminNumber(result.totals.expiringSoon)} token${
                result.totals.expiringSoon === 1 ? "" : "s"
              } expiring within 24h`
            : "No urgent expiries"}
        </span>
        {hasClientFilters ? (
          <span className="ops-signal-badge ops-signal-badge--accent">
            Filters active
          </span>
        ) : null}
        <span className="ops-signal-badge ops-signal-badge--neutral">
          Visible roster · {rosterCountLabel}
        </span>
      </div>

      {actionSuccess === null ? null : (
        <div
          className="ops-card-shell ops-card-shell--dense ops-card-shell--good"
          data-testid="admin-tokens-action-success"
        >
          <p className="ops-route-banner__eyebrow">Action recorded</p>
          <p className="ops-route-banner__title">{actionSuccess}</p>
          <p className="ops-route-banner__detail">
            Operator token state has been refreshed from the live registry.
          </p>
        </div>
      )}

      {actionError === null ? null : (
        <div
          className="ops-card-shell ops-card-shell--dense ops-card-shell--alert"
          data-testid="admin-tokens-action-error"
        >
          <p className="ops-route-banner__eyebrow">Action failed</p>
          <p className="ops-route-banner__title">{actionError}</p>
          <p className="ops-route-banner__detail">
            Resolve the issue before closing the issuance or revoke workflow.
          </p>
        </div>
      )}

      <div className="ops-pane-grid" data-testid="admin-tokens-kpis">
        <div data-testid="admin-tokens-total">
          <KpiCard
            label="Loaded"
            value={formatAdminNumber(result.tokens.length)}
            tone="neutral"
          />
        </div>
        <div data-testid="admin-tokens-active">
          <KpiCard
            label="Active"
            value={formatAdminNumber(result.totals.active)}
            tone={result.totals.active > 0 ? "good" : "neutral"}
          />
        </div>
        <div data-testid="admin-tokens-expiring">
          <KpiCard
            label="Expiring soon"
            value={formatAdminNumber(result.totals.expiringSoon)}
            tone={result.totals.expiringSoon > 0 ? "warn" : "neutral"}
          />
        </div>
        <div data-testid="admin-tokens-revoked">
          <KpiCard
            label="Revoked"
            value={formatAdminNumber(result.totals.revoked)}
            tone={result.totals.revoked > 0 ? "warn" : "neutral"}
          />
        </div>
        <div data-testid="admin-tokens-issuers">
          <KpiCard
            label="Issuers"
            value={formatAdminNumber(uniqueIssuers)}
            tone="accent"
          />
        </div>
        <div data-testid="admin-tokens-visible">
          <KpiCard
            label="Visible"
            value={formatAdminNumber(tableView.total)}
            tone={hasClientFilters ? "accent" : "neutral"}
          />
        </div>
      </div>

      <div className="ops-pane-grid" data-testid="admin-tokens-focus-grid">
        <section
          className="ops-card"
          data-testid="admin-tokens-focus"
          data-token-id={focusedToken?.id}
        >
          <div className="ops-card-head">
            <p className="ops-card-head__title">Focused token</p>
            <span className="ops-card-head__count">
              {focusedTokenStatus === undefined
                ? "Awaiting roster"
                : formatTokenStatusLabel(focusedTokenStatus)}
            </span>
          </div>

          {focusedToken === undefined ? (
            <div
              className="ops-stack-sm"
              data-testid="admin-tokens-focus-empty"
            >
              <p className="ops-note">
                No token matches the current roster. Reset the filters or issue
                a guarded token to continue the operator rehearsal.
              </p>
              {hasClientFilters ? (
                <button
                  className="ops-btn ops-btn--ghost"
                  onClick={resetRoster}
                  type="button"
                >
                  Reset roster
                </button>
              ) : null}
            </div>
          ) : (
            <div
              className="ops-stack-md"
              data-testid="admin-tokens-focus-summary"
              data-token-id={focusedToken.id}
            >
              <div className="ops-inline-cluster">
                <StatusChip
                  status={focusedTokenStatus ?? "active"}
                  variant={resolveStatusVariant(focusedTokenStatus ?? "active")}
                />
                {isTokenExpiringSoon(focusedToken, data.generatedAt) ? (
                  <span className="ops-signal-badge ops-signal-badge--warn">
                    Expiring soon
                  </span>
                ) : null}
                {focusedTokenPinned ? (
                  <span className="ops-signal-badge ops-signal-badge--good">
                    Pinned
                  </span>
                ) : null}
              </div>

              <div className="ops-cell-stack">
                <span className="ops-cell-stack__title">
                  {focusedToken.label}
                </span>
                <span className="ops-text-muted">
                  {focusedToken.tokenPrefix}
                </span>
              </div>

              <p className="ops-note">
                {resolveFocusedTokenNarrative(
                  focusedToken,
                  data.generatedAt,
                  focusedTokenPinned,
                )}
              </p>

              <div className="ops-detail-grid">
                <article className="ops-detail-card">
                  <p className="ops-detail-card__label">Prefix</p>
                  <p className="ops-detail-card__value">
                    {focusedToken.tokenPrefix}
                  </p>
                </article>
                <article className="ops-detail-card">
                  <p className="ops-detail-card__label">Issued by</p>
                  <p className="ops-detail-card__value">
                    {focusedToken.issuedBy}
                  </p>
                </article>
                <article className="ops-detail-card">
                  <p className="ops-detail-card__label">Issued</p>
                  <p className="ops-detail-card__value">
                    {formatTokenStamp(focusedToken.issuedAt)}
                  </p>
                </article>
                <article className="ops-detail-card">
                  <p className="ops-detail-card__label">
                    {focusedTokenStatus === "revoked" ? "Revoked" : "Expires"}
                  </p>
                  <p className="ops-detail-card__value">
                    {focusedTokenStatus === "revoked"
                      ? formatTokenStamp(focusedToken.revokedAt)
                      : formatTokenStamp(focusedToken.expiresAt)}
                  </p>
                </article>
              </div>

              <div className="ops-inline-cluster">
                <Link className="ops-btn ops-btn--ghost" to="/admin/audit">
                  Review audit trail
                </Link>
                {focusedTokenPinned ? (
                  <button
                    className="ops-btn ops-btn--ghost"
                    onClick={() => setSelectedTokenId(null)}
                    type="button"
                  >
                    Clear pin
                  </button>
                ) : null}
                {focusedTokenStatus === "active" ? (
                  <button
                    className="ops-btn ops-btn--primary"
                    data-testid="admin-tokens-focus-revoke-cta"
                    onClick={() => setRevokeArmed(focusedToken.id)}
                    type="button"
                  >
                    Revoke token
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </section>

        <section className="ops-card" data-testid="admin-tokens-review">
          <div className="ops-card-head">
            <p className="ops-card-head__title">Issuance control</p>
            <span className="ops-card-head__count">{rosterCountLabel}</span>
          </div>

          <div className="ops-stack-md">
            <div className="ops-detail-grid">
              <article className="ops-detail-card">
                <p className="ops-detail-card__label">Active</p>
                <p className="ops-detail-card__value">
                  {formatAdminNumber(result.totals.active)}
                </p>
              </article>
              <article className="ops-detail-card">
                <p className="ops-detail-card__label">Expiring soon</p>
                <p className="ops-detail-card__value">
                  {formatAdminNumber(result.totals.expiringSoon)}
                </p>
              </article>
              <article className="ops-detail-card">
                <p className="ops-detail-card__label">Revoked</p>
                <p className="ops-detail-card__value">
                  {formatAdminNumber(result.totals.revoked)}
                </p>
              </article>
              <article className="ops-detail-card">
                <p className="ops-detail-card__label">Visible roster</p>
                <p className="ops-detail-card__value">
                  {formatAdminNumber(tableView.total)}
                </p>
              </article>
            </div>

            <div
              className="ops-card-shell ops-card-shell--dense"
              data-testid="admin-tokens-owner-note"
            >
              <p className="ops-route-banner__eyebrow">Guardrail</p>
              <p className="ops-route-banner__title">
                Owner-only tokens stay ephemeral
              </p>
              <p className="ops-route-banner__detail">
                Owner-only tokens reveal plaintext once, remain
                prefix-addressable for audit correlation, and should be stored
                before the dialog is dismissed.
              </p>
            </div>

            <div
              className="ops-toolbar"
              data-testid="admin-tokens-issue-composer"
            >
              <label className="ops-field ops-field--wide">
                <span className="ops-field__label">Token label</span>
                <input
                  className="ops-input-sm"
                  data-testid="admin-tokens-issue-label"
                  onChange={(event) => setIssueLabel(event.target.value)}
                  type="text"
                  value={issueLabel}
                />
              </label>

              <label className="ops-field ops-field--compact">
                <span className="ops-field__label">TTL hours</span>
                <input
                  className="ops-input-sm"
                  data-testid="admin-tokens-issue-ttl"
                  min="1"
                  onChange={(event) => setIssueTtlHours(event.target.value)}
                  step="1"
                  type="number"
                  value={issueTtlHours}
                />
              </label>

              <button
                className="ops-btn ops-btn--primary"
                data-testid="admin-tokens-issue-cta"
                disabled={issueLabel.trim().length === 0}
                onClick={() => setIssueArmed(true)}
                type="button"
              >
                Issue token
              </button>
            </div>

            {hasClientFilters ? (
              <div className="ops-inline-cluster">
                <span className="ops-note">
                  Filters are narrowing the visible roster while issuance
                  remains global.
                </span>
                <button
                  className="ops-btn ops-btn--ghost"
                  onClick={resetRoster}
                  type="button"
                >
                  Reset roster
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="ops-card" data-testid="admin-tokens-roster">
        <div className="ops-card-head">
          <p className="ops-card-head__title">Token registry</p>
          <div className="ops-card-head__actions">
            <span className="ops-card-head__count">{rosterCountLabel}</span>
            {hasClientFilters ? (
              <button
                className="ops-btn ops-btn--ghost ops-btn--xs"
                onClick={resetRoster}
                type="button"
              >
                Reset roster
              </button>
            ) : null}
          </div>
        </div>

        <FilterBar
          onSearchChange={(value) => {
            tableState.setSearch(value);
            tableState.setPage(1);
          }}
          searchPlaceholder="Search by label, prefix, or issuer"
          searchValue={tableState.search}
          trailing={
            <SegmentedTabs
              ariaLabel="Filter tokens by status"
              items={statusTabs}
              onChange={(value) => {
                setStatusFilter(value);
                tableState.setPage(1);
              }}
              value={statusFilter}
            />
          }
        />

        <div className="ops-table-wrapper">
          <table
            aria-label="Admin operator test tokens"
            className="ops-table"
            data-testid="admin-tokens-table"
          >
            <thead>
              <tr>
                <SortableTableHeader
                  ariaSort={resolveTableAriaSort(tableState, "label")}
                  onToggle={() => tableState.toggleSort("label")}
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
                  ariaSort={resolveTableAriaSort(tableState, "issuedAt")}
                  onToggle={() => tableState.toggleSort("issuedAt")}
                >
                  Issued
                </SortableTableHeader>
                <SortableTableHeader
                  ariaSort={resolveTableAriaSort(tableState, "expiresAt")}
                  onToggle={() => tableState.toggleSort("expiresAt")}
                >
                  Lifecycle
                </SortableTableHeader>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleTokens.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div
                      className="ops-stack-sm"
                      data-testid="admin-tokens-empty"
                    >
                      <p className="ops-note">
                        No tokens match the current roster.
                      </p>
                      {hasClientFilters ? (
                        <button
                          className="ops-btn ops-btn--ghost"
                          onClick={resetRoster}
                          type="button"
                        >
                          Reset roster
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : (
                visibleTokens.map((token) => {
                  const tokenStatus = resolveTokenStatus(
                    token,
                    data.generatedAt,
                  );
                  const tokenExpiringSoon = isTokenExpiringSoon(
                    token,
                    data.generatedAt,
                  );
                  return (
                    <tr
                      className={
                        focusedToken?.id === token.id
                          ? "is-selected"
                          : undefined
                      }
                      data-status={tokenStatus}
                      data-testid="admin-tokens-row"
                      data-token-id={token.id}
                      key={token.id}
                    >
                      <td>
                        <div className="ops-cell-stack">
                          <span className="ops-cell-stack__title">
                            {token.label}
                          </span>
                          <span className="ops-text-muted">
                            {token.tokenPrefix}
                          </span>
                        </div>
                      </td>
                      <td>{token.issuedBy}</td>
                      <td>{formatTokenStamp(token.issuedAt)}</td>
                      <td>
                        <div className="ops-cell-stack">
                          <span className="ops-cell-stack__title">
                            {tokenStatus === "revoked"
                              ? formatTokenDay(token.revokedAt)
                              : formatTokenDay(token.expiresAt)}
                          </span>
                          <span className="ops-text-muted">
                            {tokenStatus === "revoked"
                              ? "Revoked checkpoint"
                              : tokenExpiringSoon
                                ? "Expires within 24h"
                                : tokenStatus === "expired"
                                  ? "Expired checkpoint"
                                  : "Expiry checkpoint"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="ops-inline-cluster">
                          <StatusChip
                            status={tokenStatus}
                            variant={resolveStatusVariant(tokenStatus)}
                          />
                          {tokenExpiringSoon ? (
                            <span className="ops-signal-badge ops-signal-badge--warn">
                              Expiring soon
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className="ops-inline-cluster">
                          <button
                            aria-pressed={focusedToken?.id === token.id}
                            className="ops-btn ops-btn--ghost ops-btn--xs"
                            data-testid="admin-tokens-focus-cta"
                            data-token-id={token.id}
                            onClick={() => setSelectedTokenId(token.id)}
                            type="button"
                          >
                            {focusedToken?.id === token.id
                              ? "Focused"
                              : "Focus"}
                          </button>
                          {tokenStatus === "active" ? (
                            <button
                              className="ops-btn ops-btn--primary ops-btn--xs"
                              data-testid="admin-tokens-revoke-cta"
                              data-token-id={token.id}
                              onClick={() => setRevokeArmed(token.id)}
                              type="button"
                            >
                              Revoke
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          pageSize={tableState.pageSize}
          page={tableState.page}
          onPageChange={tableState.setPage}
          total={tableView.total}
        />
      </section>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setIssuedToken(null);
            setIssuedTokenRevealed(false);
          }
        }}
        open={issuedToken !== null}
      >
        {issuedToken === null ? null : (
          <DialogContent
            description="Plaintext can only be viewed once. Store it before closing."
            title="Test token issued"
          >
            <div
              className="ops-stack-sm"
              data-testid="admin-tokens-plaintext-dialog"
            >
              <div>
                <strong>Token label:</strong>{" "}
                <span className="mono">{issuedToken.label}</span>
              </div>
              <RevealField
                label={`Plaintext token for ${issuedToken.label}`}
                onHide={() => setIssuedTokenRevealed(false)}
                onReveal={() => setIssuedTokenRevealed(true)}
                revealed={issuedTokenRevealed}
                value={
                  <span className="mono">{issuedToken.plaintextToken}</span>
                }
              />
              <div className="ops-inline-cluster">
                <button
                  className="ops-btn ops-btn--ghost ops-btn--xs"
                  data-testid="admin-tokens-plaintext-copy"
                  onClick={() => {
                    void handleCopyPlaintextToken();
                  }}
                  type="button"
                >
                  Copy token
                </button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {issueArmed ? (
        <HighRiskActionGuard
          action={{
            id: "admin-tokens-issue",
            label: "Issue admin operator test token",
          }}
          confirmLabel={issuePending ? "Issuing…" : "Issue"}
          onCancel={() => setIssueArmed(false)}
          onConfirm={handleIssueConfirm}
          reasons={issueReasons}
          requireNote
          selection={[`${issueLabel.trim()} · ${issueTtlHours}h`]}
        />
      ) : null}

      {revokeArmed !== null ? (
        <HighRiskActionGuard
          action={{
            id: "admin-tokens-revoke",
            label: "Revoke admin operator test token",
          }}
          confirmLabel={revokePending ? "Revoking…" : "Revoke"}
          onCancel={() => setRevokeArmed(null)}
          onConfirm={handleRevokeConfirm}
          reasons={revokeReasons}
          requireNote
          selection={[revokeArmed]}
        />
      ) : null}
    </div>
  );
}
