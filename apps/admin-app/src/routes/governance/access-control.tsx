import { useEffect, useState, useTransition } from "react";
import {
  actorType,
  adminGovernanceActionPolicyId,
  authorizationNamespace,
  authorizationNamespaces,
  authorizationRelation,
  authorizationRelations,
} from "@comvestec/contracts";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { createAdminAppFileRoute } from "../../file-route";
import {
  deleteAdminAccessControlTuple,
  provisionAdminAccessControlOperator,
} from "../../lib/access-control-route-server";
import {
  EmptyState,
  LoadingState,
  PermissionDeniedState,
  Badge,
} from "@comvestec/ui";
import { AdminSessionRequiredState } from "../../components/admin-session-required-state";
import {
  ScreenHeader,
  KpiCard,
  ShieldIcon,
  RefreshIcon,
  XIcon,
} from "../../components/ui";

type AccessControlSearch = {
  readonly namespace?: (typeof authorizationNamespaces)[number];
  readonly object?: string;
  readonly relation?: (typeof authorizationRelations)[number];
  readonly subject?: string;
  readonly detailSubject?: string;
  readonly page?: number;
};

const parseAccessControlSearch = (
  search: Record<string, unknown>,
): AccessControlSearch => {
  const namespace =
    typeof search.namespace === "string" &&
    authorizationNamespaces.includes(
      search.namespace as (typeof authorizationNamespaces)[number],
    )
      ? (search.namespace as (typeof authorizationNamespaces)[number])
      : undefined;
  const relation =
    typeof search.relation === "string" &&
    authorizationRelations.includes(
      search.relation as (typeof authorizationRelations)[number],
    )
      ? (search.relation as (typeof authorizationRelations)[number])
      : undefined;
  const object =
    typeof search.object === "string" ? search.object.trim() : undefined;
  const subject =
    typeof search.subject === "string" ? search.subject.trim() : undefined;
  const detailSubject =
    typeof search.detailSubject === "string"
      ? search.detailSubject.trim()
      : undefined;
  const parsedPage =
    typeof search.page === "number"
      ? search.page
      : typeof search.page === "string"
        ? Number.parseInt(search.page, 10)
        : undefined;
  const page =
    parsedPage !== undefined && Number.isInteger(parsedPage) && parsedPage >= 1
      ? parsedPage
      : undefined;

  return {
    ...(namespace === undefined ? {} : { namespace }),
    ...(relation === undefined ? {} : { relation }),
    ...(object === undefined || object.length === 0 ? {} : { object }),
    ...(subject === undefined || subject.length === 0 ? {} : { subject }),
    ...(detailSubject === undefined || detailSubject.length === 0
      ? {}
      : { detailSubject }),
    ...(page === undefined ? {} : { page }),
  };
};

const formatActionError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    if ("reason" in error && typeof error.reason === "string")
      return error.reason;
    if ("message" in error && typeof error.message === "string")
      return error.message;
  }
  return "The access-control mutation failed before the shared governance workflow completed.";
};

export const Route = createAdminAppFileRoute("/governance/access-control")({
  validateSearch: parseAccessControlSearch,
  loaderDeps: ({ search }) => ({
    namespace: search.namespace,
    object: search.object,
    relation: search.relation,
    subject: search.subject,
    detailSubject: search.detailSubject,
    page: search.page,
  }),
  loader: ({ deps }) =>
    import("../../lib/governance-loaders").then(
      ({ loadAdminAccessControlLoaderData }) =>
        loadAdminAccessControlLoaderData({
          ...(deps.namespace === undefined
            ? {}
            : { namespace: deps.namespace }),
          ...(deps.object === undefined ? {} : { object: deps.object }),
          ...(deps.relation === undefined ? {} : { relation: deps.relation }),
          ...(deps.subject === undefined ? {} : { subject: deps.subject }),
          ...(deps.detailSubject === undefined
            ? {}
            : { detailSubject: deps.detailSubject }),
          ...(deps.page === undefined ? {} : { page: deps.page }),
        }),
    ),
  component: AccessControl,
  pendingComponent: () => <LoadingState title="Loading access control…" />,
});

function AccessControl() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const deleteTuple = useServerFn(deleteAdminAccessControlTuple);
  const provisionOperator = useServerFn(provisionAdminAccessControlOperator);
  const [namespaceInput, setNamespaceInput] = useState<
    (typeof authorizationNamespaces)[number]
  >(search.namespace ?? authorizationNamespace.tenant);
  const [objectInput, setObjectInput] = useState(search.object ?? "");
  const [relationInput, setRelationInput] = useState<
    (typeof authorizationRelations)[number]
  >(search.relation ?? authorizationRelation.viewer);
  const [subjectInput, setSubjectInput] = useState(search.subject ?? "");
  const [selectedReason, setSelectedReason] = useState("");
  const [reasonComment, setReasonComment] = useState("");
  const [mutationStatus, setMutationStatus] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [staffingStatus, setStaffingStatus] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [operatorCredentialHandoff, setOperatorCredentialHandoff] = useState<{
    operatorLabel: string;
    signInUrl: string;
    temporaryPassword: string;
  } | null>(null);
  const [provisionDisplayName, setProvisionDisplayName] = useState("");
  const [provisionEmail, setProvisionEmail] = useState("");
  const [provisionUsername, setProvisionUsername] = useState("");
  const [provisionRole, setProvisionRole] = useState<
    typeof actorType.platformOperator | typeof actorType.supportOperator
  >(actorType.supportOperator);
  const [provisionReason, setProvisionReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const readyData = data.kind === "ready" ? data : null;
  const deletePolicy = readyData?.actionPolicies.find(
    (policy) =>
      policy.actionId ===
      adminGovernanceActionPolicyId.authorizationTupleDelete,
  );
  const selectedReasonOption =
    deletePolicy?.reasonOptions.find(
      (option) => option.value === selectedReason,
    ) ?? deletePolicy?.reasonOptions[0];

  useEffect(() => {
    setNamespaceInput(search.namespace ?? authorizationNamespace.tenant);
    setObjectInput(search.object ?? "");
    setRelationInput(search.relation ?? authorizationRelation.viewer);
    setSubjectInput(search.subject ?? "");
  }, [search.namespace, search.object, search.relation, search.subject]);

  useEffect(() => {
    const defaultReasonOption = deletePolicy?.reasonOptions[0];
    if (defaultReasonOption === undefined || deletePolicy === undefined) {
      setSelectedReason("");
      return;
    }
    setSelectedReason((currentReason) =>
      deletePolicy.reasonOptions.some(
        (option) => option.value === currentReason,
      )
        ? currentReason
        : defaultReasonOption.value,
    );
  }, [deletePolicy]);

  useEffect(() => {
    setMutationStatus(null);
  }, [
    search.namespace,
    search.object,
    search.relation,
    search.subject,
    search.detailSubject,
    search.page,
  ]);

  const applyTupleQuery = () => {
    const object = objectInput.trim();
    const subject = subjectInput.trim();
    setMutationStatus(null);
    startTransition(() => {
      void navigate({
        search: () =>
          object.length === 0
            ? {}
            : {
                namespace: namespaceInput,
                object,
                relation: relationInput,
                ...(subject.length === 0 ? {} : { subject }),
                page: 1,
              },
      });
    });
  };

  const clearTupleQuery = () => {
    setMutationStatus(null);
    startTransition(() => {
      void navigate({ search: () => ({}) });
    });
  };

  const selectTupleDetail = (subject: string) => {
    setMutationStatus(null);
    startTransition(() => {
      void navigate({
        search: (current) => ({ ...current, detailSubject: subject }),
      });
    });
  };

  const changePage = (page: number) => {
    setMutationStatus(null);
    startTransition(() => {
      void navigate({ search: (current) => ({ ...current, page }) });
    });
  };

  if (data.kind === "shell") {
    return (
      <AdminSessionRequiredState
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to access authorization data."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <AdminSessionRequiredState
        title="Session refresh required"
        description="Re-authenticate to access authorization data."
        stale
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <PermissionDeniedState title="Access denied" description={data.reason} />
    );
  }

  const { profiles, actionPolicies, operatorDirectory, tupleQuery } = data;
  const currentOperator = operatorDirectory.currentOperator;
  const canManageOperators =
    currentOperator.identity.actorType === actorType.platformOperator;
  const tupleQueryActive =
    search.namespace !== undefined &&
    search.object !== undefined &&
    search.relation !== undefined;
  const currentPage = tupleQuery?.pageInfo.page.page ?? search.page ?? 1;
  const totalPages = tupleQuery?.pageInfo.totalPages ?? 0;
  const totalItems = tupleQuery?.pageInfo.totalItems ?? 0;
  const tupleDetail = tupleQuery?.detail;

  const revokeSelectedTuple = () => {
    if (tupleDetail === undefined || deletePolicy === undefined) {
      setMutationStatus({
        kind: "error",
        message: "Select an authorization tuple before attempting revocation.",
      });
      return;
    }
    const comment = reasonComment.trim();
    const baseReason = selectedReasonOption?.label ?? "";
    if (deletePolicy.requiresReason && baseReason.length === 0) {
      setMutationStatus({
        kind: "error",
        message: "Choose a governed revocation reason before continuing.",
      });
      return;
    }
    if (deletePolicy.requiresComment && comment.length === 0) {
      setMutationStatus({
        kind: "error",
        message: "This revocation policy requires an operator comment.",
      });
      return;
    }
    const reason =
      baseReason.length === 0
        ? comment
        : comment.length === 0
          ? baseReason
          : `${baseReason}: ${comment}`;
    startTransition(() => {
      void (async () => {
        try {
          await deleteTuple({
            data: { tuple: tupleDetail, reason },
          });
          setMutationStatus({
            kind: "success",
            message: `Revoked ${tupleDetail.relation} access for ${tupleDetail.subject}.`,
          });
          setReasonComment("");
          await router.invalidate({ sync: true });
        } catch (error) {
          setMutationStatus({
            kind: "error",
            message: formatActionError(error),
          });
        }
      })();
    });
  };

  const submitOperatorProvision = () => {
    const displayName = provisionDisplayName.trim();
    const email = provisionEmail.trim();
    const username = provisionUsername.trim();
    const reason = provisionReason.trim();

    if (displayName.length === 0 || email.length === 0 || reason.length === 0) {
      setStaffingStatus({
        kind: "error",
        message:
          "Display name, email, and staffing reason are required before provisioning an admin operator.",
      });
      return;
    }

    setStaffingStatus(null);
    setOperatorCredentialHandoff(null);
    startTransition(() => {
      void (async () => {
        try {
          const result = await provisionOperator({
            data: {
              displayName,
              email,
              ...(username.length === 0 ? {} : { username }),
              actorType: provisionRole,
              reason,
            },
          });
          setStaffingStatus({
            kind: "success",
            message: result.updatedExisting
              ? `Updated ${result.operator.displayName} and refreshed their admin access handoff.`
              : `Provisioned ${result.operator.displayName} for admin access.`,
          });
          setOperatorCredentialHandoff({
            operatorLabel: result.operator.displayName,
            signInUrl: result.credentialHandoff.signInUrl,
            temporaryPassword: result.credentialHandoff.temporaryPassword,
          });
          setProvisionDisplayName("");
          setProvisionEmail("");
          setProvisionUsername("");
          setProvisionRole(actorType.supportOperator);
          setProvisionReason("");
          await router.invalidate({ sync: true });
        } catch (error) {
          setStaffingStatus({
            kind: "error",
            message: formatActionError(error),
          });
        }
      })();
    });
  };

  return (
    <div className="ops-screen">
      <ScreenHeader
        icon={<ShieldIcon />}
        title="Access Control"
        breadcrumbs={[{ label: "Governance" }, { label: "Access Control" }]}
        subtitle="Projection profiles, exact-scope authorization tuples and governed revocation posture."
      />

      <div className="ops-bento">
        <KpiCard
          label="Projection profiles"
          value={profiles.length}
          tone="accent"
        />
        <KpiCard
          label="Modules covered"
          value={new Set(profiles.map((p) => p.moduleId)).size}
        />
        <KpiCard
          label="Action policies"
          value={actionPolicies.length}
          tone={actionPolicies.length > 0 ? "warn" : "neutral"}
        />
        <KpiCard
          label="Matched tuples"
          value={totalItems}
          tone={totalItems > 0 ? "good" : "neutral"}
          hint={tupleQueryActive ? "Filter active" : "No filter"}
        />
      </div>

      <div className="ops-summary-grid">
        <div className="ops-card">
          <div className="ops-card-head">
            <p className="ops-card-head__title">Current operator</p>
          </div>
          <div className="ops-meta-grid">
            {[
              {
                label: "Display name",
                value: currentOperator.identity.displayName,
                mono: false,
              },
              {
                label: "Email",
                value: currentOperator.identity.email,
                mono: false,
              },
              {
                label: "Role",
                value: currentOperator.identity.actorType,
                mono: false,
              },
              {
                label: "Session",
                value: currentOperator.sessionId,
                mono: true,
              },
            ].map(({ label, value, mono }) => (
              <div key={label}>
                <p className="ops-meta-label">{label}</p>
                <p
                  className={`ops-meta-value${mono ? " ops-meta-value--mono" : ""}`}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="ops-card">
          <div className="ops-card-head">
            <p className="ops-card-head__title">Operator staffing</p>
          </div>
          {staffingStatus !== null && (
            <div className={`ops-feedback ${staffingStatus.kind}`}>
              {staffingStatus.message}
            </div>
          )}
          {operatorCredentialHandoff !== null && (
            <div className="ops-meta-grid" style={{ marginTop: 10 }}>
              <div>
                <p className="ops-meta-label">Operator</p>
                <p className="ops-meta-value">
                  {operatorCredentialHandoff.operatorLabel}
                </p>
              </div>
              <div>
                <p className="ops-meta-label">Temporary password</p>
                <p className="ops-meta-value ops-meta-value--mono">
                  {operatorCredentialHandoff.temporaryPassword}
                </p>
              </div>
              <div>
                <p className="ops-meta-label">Sign-in URL</p>
                <p className="ops-meta-value ops-meta-value--mono">
                  {operatorCredentialHandoff.signInUrl}
                </p>
              </div>
            </div>
          )}
          {!canManageOperators ? (
            <EmptyState
              title="Platform operator required"
              description="Support operators can review their own role and capability posture here, but staffing changes stay limited to platform operators."
            />
          ) : (
            <div
              className="ops-toolbar"
              style={{ flexWrap: "wrap", marginTop: 10 }}
            >
              <label className="ops-field" style={{ minWidth: 180, flex: 1 }}>
                <span className="ops-field-label">Display name</span>
                <input
                  className="ops-search__input"
                  type="text"
                  value={provisionDisplayName}
                  onChange={(event) =>
                    setProvisionDisplayName(event.target.value)
                  }
                  placeholder="Comvestec Operator"
                  autoComplete="off"
                />
              </label>
              <label className="ops-field" style={{ minWidth: 220, flex: 1 }}>
                <span className="ops-field-label">Email</span>
                <input
                  className="ops-search__input"
                  type="email"
                  value={provisionEmail}
                  onChange={(event) => setProvisionEmail(event.target.value)}
                  placeholder="operator@comvestec.com"
                  autoComplete="off"
                />
              </label>
              <label className="ops-field" style={{ minWidth: 220, flex: 1 }}>
                <span className="ops-field-label">Username (optional)</span>
                <input
                  className="ops-search__input"
                  type="text"
                  value={provisionUsername}
                  onChange={(event) => setProvisionUsername(event.target.value)}
                  placeholder="operator@comvestec.com"
                  autoComplete="off"
                />
              </label>
              <label className="ops-field" style={{ minWidth: 180 }}>
                <span className="ops-field-label">Role</span>
                <select
                  className="ops-select"
                  value={provisionRole}
                  onChange={(event) =>
                    setProvisionRole(
                      event.target.value as
                        | typeof actorType.platformOperator
                        | typeof actorType.supportOperator,
                    )
                  }
                >
                  <option value={actorType.platformOperator}>
                    Platform operator
                  </option>
                  <option value={actorType.supportOperator}>
                    Support operator
                  </option>
                </select>
              </label>
              <label className="ops-field" style={{ minWidth: 260, flex: 1.2 }}>
                <span className="ops-field-label">Staffing reason</span>
                <input
                  className="ops-search__input"
                  type="text"
                  value={provisionReason}
                  onChange={(event) => setProvisionReason(event.target.value)}
                  placeholder="Assign support and governance responsibilities."
                  autoComplete="off"
                />
              </label>
              <button
                type="button"
                className="ops-btn ops-btn--primary"
                disabled={isPending}
                onClick={submitOperatorProvision}
              >
                Provision operator
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">
            Admin operators
            <span className="ops-card-head__count">
              {operatorDirectory.operators.length}
            </span>
          </p>
        </div>
        {!canManageOperators ? (
          <EmptyState
            title="Operator directory hidden"
            description="Platform operators can review and provision the full admin operator directory from this screen."
          />
        ) : operatorDirectory.operators.length === 0 ? (
          <EmptyState
            title="No admin operators"
            description="Provision the next operator from the staffing panel above."
          />
        ) : (
          <div className="ops-table-wrapper">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Display name</th>
                  <th>Email</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {operatorDirectory.operators.map((operator) => (
                  <tr key={operator.actorId}>
                    <td>{operator.displayName}</td>
                    <td>{operator.email}</td>
                    <td className="mono">{operator.username}</td>
                    <td>{operator.actorType}</td>
                    <td>{operator.enabled ? "Enabled" : "Disabled"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">Exact-scope tuple review</p>
          <div className="ops-card-head__actions">
            <button
              type="button"
              className="ops-btn ops-btn--xs ops-btn--primary"
              onClick={applyTupleQuery}
              disabled={isPending}
            >
              <RefreshIcon size={11} /> Load tuples
            </button>
            <button
              type="button"
              className="ops-btn ops-btn--xs"
              onClick={clearTupleQuery}
              disabled={isPending}
            >
              <XIcon size={11} /> Clear
            </button>
          </div>
        </div>
        <div className="ops-toolbar" style={{ flexWrap: "wrap" }}>
          <label className="ops-field" style={{ minWidth: 160 }}>
            <span className="ops-field-label">Namespace</span>
            <select
              className="ops-select"
              value={namespaceInput}
              onChange={(event) =>
                setNamespaceInput(
                  event.target
                    .value as (typeof authorizationNamespaces)[number],
                )
              }
            >
              {authorizationNamespaces.map((namespace) => (
                <option key={namespace} value={namespace}>
                  {namespace}
                </option>
              ))}
            </select>
          </label>
          <label className="ops-field" style={{ minWidth: 200, flex: 1 }}>
            <span className="ops-field-label">Object</span>
            <input
              className="ops-search__input"
              type="text"
              value={objectInput}
              onChange={(event) => setObjectInput(event.target.value)}
              placeholder="org_demo"
              autoComplete="off"
            />
          </label>
          <label className="ops-field" style={{ minWidth: 160 }}>
            <span className="ops-field-label">Relation</span>
            <select
              className="ops-select"
              value={relationInput}
              onChange={(event) =>
                setRelationInput(
                  event.target.value as (typeof authorizationRelations)[number],
                )
              }
            >
              {authorizationRelations.map((relation) => (
                <option key={relation} value={relation}>
                  {relation}
                </option>
              ))}
            </select>
          </label>
          <label className="ops-field" style={{ minWidth: 200, flex: 1 }}>
            <span className="ops-field-label">Subject filter</span>
            <input
              className="ops-search__input"
              type="text"
              value={subjectInput}
              onChange={(event) => setSubjectInput(event.target.value)}
              placeholder="usr_member_2"
              autoComplete="off"
            />
          </label>
        </div>
      </div>

      {actionPolicies.length > 0 && (
        <div className="ops-card">
          <div className="ops-card-head">
            <p className="ops-card-head__title">
              Governed action policies
              <span className="ops-card-head__count">
                {actionPolicies.length}
              </span>
            </p>
          </div>
          <div className="ops-target-grid">
            {actionPolicies.map((policy) => (
              <div key={policy.actionId} className="ops-target-card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <strong>{policy.label}</strong>
                  <Badge
                    variant={
                      policy.severity === "high-risk" ? "pending" : "neutral"
                    }
                  >
                    {policy.severity}
                  </Badge>
                </div>
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: "0.78rem",
                    color: "var(--ops-text-secondary)",
                  }}
                >
                  {policy.description}
                </p>
                <p
                  className="mono"
                  style={{
                    margin: "0 0 6px",
                    fontSize: "0.74rem",
                    color: "var(--ops-text-tertiary)",
                  }}
                >
                  Profile · {policy.projectionProfile}
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.74rem",
                    color: "var(--ops-text-tertiary)",
                  }}
                >
                  {policy.requiresReason ? "Reason ✓" : "Reason —"}
                  {" · "}
                  {policy.requiresComment ? "Comment ✓" : "Comment —"}
                  {" · "}
                  {policy.stepUpRequired ? "Step-up ✓" : "Step-up —"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!tupleQueryActive ? (
        <div className="ops-card">
          <EmptyState
            title="Enter namespace, object, and relation"
            description="The access-control screen reviews exact-scope tuples through the shared backend query contract."
          />
        </div>
      ) : (
        <div className="ops-card">
          <div className="ops-card-head">
            <p className="ops-card-head__title">
              Authorization tuples
              <span className="ops-card-head__count">{totalItems}</span>
            </p>
          </div>
          {mutationStatus?.kind === "success" && (
            <div
              className={`ops-feedback ${mutationStatus.kind}`}
              style={{ marginTop: 10 }}
            >
              {mutationStatus.message}
            </div>
          )}
          {tupleQuery === undefined || tupleQuery.items.length === 0 ? (
            <EmptyState
              title="No tuples found"
              description="No exact-scope tuples matched the current namespace, object, relation, and optional subject filter."
            />
          ) : (
            <>
              <div className="ops-table-wrapper">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Namespace</th>
                      <th>Object</th>
                      <th>Relation</th>
                      <th>Subject</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tupleQuery.items.map((tuple) => (
                      <tr
                        key={`${tuple.namespace}:${tuple.object}:${tuple.relation}:${tuple.subject}`}
                      >
                        <td className="mono">{tuple.namespace}</td>
                        <td className="mono">{tuple.object}</td>
                        <td className="mono">{tuple.relation}</td>
                        <td className="mono ops-redacted">{tuple.subject}</td>
                        <td>
                          <button
                            type="button"
                            className="ops-btn ops-btn--xs"
                            disabled={isPending}
                            onClick={() => selectTupleDetail(tuple.subject)}
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="ops-pagination">
                  <span className="ops-pagination__info">
                    Page {currentPage} of {totalPages} ·{" "}
                    {totalItems.toLocaleString()} tuples
                  </span>
                  <div
                    className="ops-pagination__nav"
                    role="navigation"
                    aria-label="Pagination"
                  >
                    <button
                      type="button"
                      className="ops-pagination__btn"
                      disabled={isPending || currentPage <= 1}
                      onClick={() => changePage(currentPage - 1)}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="ops-pagination__btn"
                      disabled={isPending || currentPage >= totalPages}
                      onClick={() => changePage(currentPage + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {search.detailSubject !== undefined && (
        <div className="ops-card">
          <div className="ops-card-head">
            <p className="ops-card-head__title">Tuple detail & revocation</p>
          </div>
          {tupleDetail === undefined ? (
            <EmptyState
              title="Selected tuple no longer matches"
              description="Refresh the exact-scope query or choose another tuple to review."
            />
          ) : (
            <>
              <div className="ops-meta-grid">
                {[
                  ["Namespace", tupleDetail.namespace],
                  ["Object", tupleDetail.object],
                  ["Relation", tupleDetail.relation],
                  ["Subject", tupleDetail.subject],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="ops-meta-label">{label}</p>
                    <p className="ops-meta-value ops-meta-value--mono">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {deletePolicy === undefined ? (
                <EmptyState
                  title="Revocation policy unavailable"
                  description="No backend-owned tuple revocation policy is currently available for this operator."
                />
              ) : (
                <div style={{ marginTop: 10 }}>
                  <p
                    style={{
                      margin: "0 0 10px",
                      fontSize: "0.8rem",
                      color: "var(--ops-text-secondary)",
                    }}
                  >
                    {deletePolicy.description}
                  </p>
                  {deletePolicy.reasonOptions.length > 0 && (
                    <label
                      className="ops-field"
                      style={{ marginBottom: 10, display: "block" }}
                    >
                      <span className="ops-field-label">Governed reason</span>
                      <select
                        className="ops-select"
                        value={selectedReasonOption?.value ?? ""}
                        onChange={(event) =>
                          setSelectedReason(event.target.value)
                        }
                      >
                        {deletePolicy.reasonOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label
                    className="ops-field"
                    style={{ marginBottom: 10, display: "block" }}
                  >
                    <span className="ops-field-label">
                      {deletePolicy.requiresComment
                        ? "Operator comment"
                        : "Operator comment (optional)"}
                    </span>
                    <textarea
                      className="ops-field-input"
                      rows={3}
                      value={reasonComment}
                      onChange={(event) => setReasonComment(event.target.value)}
                      placeholder="Record any operator context that should remain with the audit reason."
                    />
                  </label>
                  <button
                    type="button"
                    className="ops-btn ops-btn--xs ops-btn--danger"
                    disabled={isPending}
                    onClick={revokeSelectedTuple}
                  >
                    Revoke tuple
                  </button>
                </div>
              )}
            </>
          )}

          {mutationStatus?.kind === "error" && (
            <div
              className={`ops-feedback ${mutationStatus.kind}`}
              style={{ marginTop: 10 }}
            >
              {mutationStatus.message}
            </div>
          )}
        </div>
      )}

      <div className="ops-card">
        <div className="ops-card-head">
          <p className="ops-card-head__title">
            Projection profiles
            <span className="ops-card-head__count">{profiles.length}</span>
          </p>
        </div>
        {profiles.length === 0 ? (
          <EmptyState
            title="No projection profiles"
            description="No projection profiles are registered."
          />
        ) : (
          <div className="ops-table-wrapper">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Profile</th>
                  <th>Module</th>
                  <th>Visible fields</th>
                  <th>Audited fields</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={`${p.moduleId}-${p.profile}`}>
                    <td className="mono">{p.profile}</td>
                    <td className="mono">{p.moduleId}</td>
                    <td className="num">{p.visibleFields.length}</td>
                    <td className="num">{p.auditedFields.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
