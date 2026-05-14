import { useEffect, useState, useTransition } from "react";
import {
  adminGovernanceActionPolicyId,
  authorizationNamespace,
  authorizationNamespaces,
  authorizationRelation,
  authorizationRelations,
} from "@comvestec/contracts";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { createAdminAppFileRoute } from "../../file-route";
import { loadAdminAccessControlLoaderData } from "../../lib/governance-loaders";
import { deleteAdminAccessControlTuple } from "../../lib/access-control-route-server";
import {
  EmptyState,
  LoadingState,
  PermissionDeniedState,
  Button,
  Badge,
} from "@comvestec/ui";

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
    loadAdminAccessControlLoaderData({
      ...(deps.namespace === undefined ? {} : { namespace: deps.namespace }),
      ...(deps.object === undefined ? {} : { object: deps.object }),
      ...(deps.relation === undefined ? {} : { relation: deps.relation }),
      ...(deps.subject === undefined ? {} : { subject: deps.subject }),
      ...(deps.detailSubject === undefined
        ? {}
        : { detailSubject: deps.detailSubject }),
      ...(deps.page === undefined ? {} : { page: deps.page }),
    }),
  component: AccessControl,
  pendingComponent: () => <LoadingState title="Loading access control…" />,
});

function AccessControl() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const deleteTuple = useServerFn(deleteAdminAccessControlTuple);
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

  const applyTupleQuery = () => {
    const object = objectInput.trim();
    const subject = subjectInput.trim();

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
    startTransition(() => {
      void navigate({
        search: () => ({}),
      });
    });
  };

  const selectTupleDetail = (subject: string) => {
    startTransition(() => {
      void navigate({
        search: (current) => ({
          ...current,
          detailSubject: subject,
        }),
      });
    });
  };

  const changePage = (page: number) => {
    startTransition(() => {
      void navigate({
        search: (current) => ({
          ...current,
          page,
        }),
      });
    });
  };

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
            data: {
              tuple: tupleDetail,
              reason,
            },
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

  if (data.kind === "shell") {
    return (
      <PermissionDeniedState
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to access authorization data."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <PermissionDeniedState
        title="Session refresh required"
        description="Re-authenticate to access authorization data."
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <PermissionDeniedState title="Access denied" description={data.reason} />
    );
  }

  const { profiles, actionPolicies, tupleQuery } = data;
  const tupleQueryActive =
    search.namespace !== undefined &&
    search.object !== undefined &&
    search.relation !== undefined;
  const currentPage = tupleQuery?.pageInfo.page.page ?? search.page ?? 1;
  const totalPages = tupleQuery?.pageInfo.totalPages ?? 0;
  const tupleDetail = tupleQuery?.detail;

  return (
    <div className="ops-screen">
      <div className="ops-screen-header">
        <h1 className="ops-screen-title">Access Control</h1>
        <p className="ops-screen-subtitle">
          Projection profiles, exact-scope authorization tuples, and governed
          revocation posture
        </p>
      </div>

      <div className="ops-posture-grid">
        <div className="ops-posture-card">
          <span className="ops-posture-metric">{profiles.length}</span>
          <span className="ops-posture-label">Projection profiles</span>
        </div>
        <div className="ops-posture-card">
          <span className="ops-posture-metric">
            {new Set(profiles.map((p) => p.moduleId)).size}
          </span>
          <span className="ops-posture-label">Modules covered</span>
        </div>
        <div className="ops-posture-card">
          <span className="ops-posture-metric">
            {tupleQuery?.pageInfo.totalItems ?? 0}
          </span>
          <span className="ops-posture-label">Matched tuples</span>
        </div>
      </div>

      <div className="ops-card">
        <p className="ops-card-title">Exact-scope tuple review</p>
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--ops-text-secondary)",
            margin: "0 0 12px",
          }}
        >
          Review exact-scope tuples through the shared governance query
          envelope, then revoke them with backend-owned policy metadata and
          audit-safe reasons.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
            alignItems: "end",
          }}
        >
          <label className="ops-field">
            <span className="ops-field-label">Namespace</span>
            <select
              className="ops-field-input"
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
          <label className="ops-field">
            <span className="ops-field-label">Object</span>
            <input
              className="ops-field-input"
              type="text"
              value={objectInput}
              onChange={(event) => setObjectInput(event.target.value)}
              placeholder="org_demo"
              autoComplete="off"
            />
          </label>
          <label className="ops-field">
            <span className="ops-field-label">Relation</span>
            <select
              className="ops-field-input"
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
          <label className="ops-field">
            <span className="ops-field-label">Subject filter</span>
            <input
              className="ops-field-input"
              type="text"
              value={subjectInput}
              onChange={(event) => setSubjectInput(event.target.value)}
              placeholder="usr_member_2"
              autoComplete="off"
            />
          </label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Button size="sm" onClick={applyTupleQuery} disabled={isPending}>
              Load tuples
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={clearTupleQuery}
              disabled={isPending}
            >
              Clear
            </Button>
          </div>
        </div>
      </div>

      {actionPolicies.length > 0 && (
        <div className="ops-card">
          <p className="ops-card-title">Governed action policies</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "12px",
            }}
          >
            {actionPolicies.map((policy) => (
              <div
                key={policy.actionId}
                style={{
                  border: "1px solid var(--ops-border)",
                  borderRadius: "var(--ops-radius)",
                  padding: "12px",
                  background: "var(--ops-surface-3)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "8px",
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
                    fontSize: "0.82rem",
                    color: "var(--ops-text-secondary)",
                  }}
                >
                  {policy.description}
                </p>
                <p
                  className="mono"
                  style={{ margin: "0 0 8px", fontSize: "0.78rem" }}
                >
                  Projection: {policy.projectionProfile}
                </p>
                <p style={{ margin: "0 0 6px", fontSize: "0.78rem" }}>
                  {policy.requiresReason
                    ? "Reason required"
                    : "Reason optional"}
                  {" · "}
                  {policy.requiresComment
                    ? "Comment required"
                    : "Comment optional"}
                  {" · "}
                  {policy.stepUpRequired ? "Step-up required" : "No step-up"}
                </p>
                {policy.reasonOptions.length > 0 && (
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: "18px",
                      fontSize: "0.78rem",
                      color: "var(--ops-text-secondary)",
                    }}
                  >
                    {policy.reasonOptions.map((option) => (
                      <li key={option.value}>
                        <span>{option.label}</span>
                        <span className="mono"> · {option.value}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!tupleQueryActive ? (
        <EmptyState
          title="Enter namespace, object, and relation"
          description="The access-control screen now reviews exact-scope tuples through the shared backend query contract."
        />
      ) : (
        <div className="ops-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: "12px",
            }}
          >
            <p className="ops-card-title" style={{ margin: 0 }}>
              Authorization tuples ({tupleQuery?.pageInfo.totalItems ?? 0})
            </p>
            {tupleQuery !== undefined && totalPages > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "0.8rem",
                }}
              >
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isPending || currentPage <= 1}
                  onClick={() => changePage(currentPage - 1)}
                >
                  Previous
                </Button>
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isPending || currentPage >= totalPages}
                  onClick={() => changePage(currentPage + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
          {tupleQuery === undefined || tupleQuery.items.length === 0 ? (
            <EmptyState
              title="No tuples found"
              description="No exact-scope tuples matched the current namespace, object, relation, and optional subject filter."
            />
          ) : (
            <div className="ops-table-wrapper">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Namespace</th>
                    <th>Object</th>
                    <th>Relation</th>
                    <th>Subject</th>
                    <th>Actions</th>
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
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={isPending}
                          onClick={() => selectTupleDetail(tuple.subject)}
                        >
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {search.detailSubject !== undefined && (
        <div className="ops-card">
          <p className="ops-card-title">Tuple detail & revocation</p>
          {tupleDetail === undefined ? (
            <EmptyState
              title="Selected tuple no longer matches"
              description="Refresh the exact-scope query or choose another tuple to review."
            />
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "12px",
                  marginBottom: "12px",
                }}
              >
                {[
                  ["Namespace", tupleDetail.namespace],
                  ["Object", tupleDetail.object],
                  ["Relation", tupleDetail.relation],
                  ["Subject", tupleDetail.subject],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="ops-field-label">{label}</p>
                    <p className="mono" style={{ margin: 0 }}>
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
                <>
                  <p
                    style={{
                      margin: "0 0 12px",
                      fontSize: "0.82rem",
                      color: "var(--ops-text-secondary)",
                    }}
                  >
                    {deletePolicy.description}
                  </p>
                  {deletePolicy.reasonOptions.length > 0 && (
                    <label
                      className="ops-field"
                      style={{ marginBottom: "12px" }}
                    >
                      <span className="ops-field-label">Governed reason</span>
                      <select
                        className="ops-field-input"
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
                  <label className="ops-field" style={{ marginBottom: "12px" }}>
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
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={isPending}
                    onClick={revokeSelectedTuple}
                  >
                    Revoke tuple
                  </Button>
                </>
              )}

              {mutationStatus !== null && (
                <div
                  className={`ops-feedback ${mutationStatus.kind}`}
                  style={{ marginTop: "12px" }}
                >
                  {mutationStatus.message}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="ops-card">
        <p className="ops-card-title">
          Projection profiles ({profiles.length})
        </p>
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
                    <td>{p.visibleFields.length}</td>
                    <td>{p.auditedFields.length}</td>
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
