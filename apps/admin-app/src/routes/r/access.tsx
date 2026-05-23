import { useEffect, useState, useTransition } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Badge, EmptyState, StateScreen } from "@comvestec/ui";
import {
  actorType,
  adminGovernanceActionPolicyId,
  authorizationNamespace,
  authorizationNamespaces,
  authorizationRelation,
  authorizationRelations,
  type AuthorizationNamespace,
  type AuthorizationRelation,
} from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../file-route";
import {
  KpiCard,
  RefreshIcon,
  ScreenHeader,
  ShieldIcon,
  XIcon,
} from "../../components/ui";
import type {
  AdminGovernanceAccessV2Input,
  AdminGovernanceAccessV2RouteData,
} from "../../lib/governance-access-route-data";
import { revokeAdminAuthorizationTuple } from "../../lib/governance-access-mutations-server";
import { provisionAdminAccessControlOperator } from "../../lib/access-control-route-server";

/**
 * `/r/access` — canonical Access Control surface.
 *
 * This route now uses the same high-utility interaction model that
 * previously only lived on the legacy governance screen:
 * exact-scope tuple query, governed action-policy review, tuple
 * detail and revocation, operator posture, and platform-operator
 * staffing controls. The resource route keeps the canonical
 * `governance-access-{loader,route-data,route-server}` contract
 * instead of routing through the legacy governance loader stack.
 */

const accessControlTab = {
  operators: "operators",
  tuples: "tuples",
  profiles: "profiles",
  scopes: "scopes",
} as const;

const accessControlTabs = [
  accessControlTab.operators,
  accessControlTab.tuples,
  accessControlTab.profiles,
  accessControlTab.scopes,
] as const;

type AccessControlTab = (typeof accessControlTabs)[number];

type AccessControlSearch = {
  readonly tab?: AccessControlTab;
  readonly namespace?: AuthorizationNamespace;
  readonly object?: string;
  readonly relation?: AuthorizationRelation;
  readonly subject?: string;
  readonly detailSubject?: string;
  readonly page?: number;
};

type ReadyData = Extract<
  AdminGovernanceAccessV2RouteData,
  { readonly kind: "ready" }
>;
type Operator = ReadyData["memberships"]["operators"][number];
type ProjectionProfile = ReadyData["projectionProfiles"][number];
type PermissionScopeRow = ReadyData["permissionScopes"][number];
type TupleItem = NonNullable<ReadyData["tupleQuery"]>["items"][number];
type TupleDetail = NonNullable<ReadyData["tupleQuery"]>["detail"];
type ActionPolicy = ReadyData["actionPolicies"][number];

const isAccessControlTab = (value: unknown): value is AccessControlTab =>
  typeof value === "string" &&
  (accessControlTabs as readonly string[]).includes(value);

const parseOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const parseOptionalPage = (value: unknown): number | undefined => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : undefined;

  return parsed !== undefined && Number.isInteger(parsed) && parsed >= 1
    ? parsed
    : undefined;
};

const parseAccessControlSearch = (
  raw: Record<string, unknown>,
): AccessControlSearch => {
  const tab = isAccessControlTab(raw.tab) ? raw.tab : undefined;
  const namespace =
    typeof raw.namespace === "string" &&
    authorizationNamespaces.includes(raw.namespace as AuthorizationNamespace)
      ? (raw.namespace as AuthorizationNamespace)
      : undefined;
  const relation =
    typeof raw.relation === "string" &&
    authorizationRelations.includes(raw.relation as AuthorizationRelation)
      ? (raw.relation as AuthorizationRelation)
      : undefined;
  const object = parseOptionalString(raw.object);
  const subject = parseOptionalString(raw.subject);
  const detailSubject = parseOptionalString(raw.detailSubject);
  const page = parseOptionalPage(raw.page);

  return {
    ...(tab === undefined ? {} : { tab }),
    ...(namespace === undefined ? {} : { namespace }),
    ...(object === undefined ? {} : { object }),
    ...(relation === undefined ? {} : { relation }),
    ...(subject === undefined ? {} : { subject }),
    ...(detailSubject === undefined ? {} : { detailSubject }),
    ...(page === undefined ? {} : { page }),
  };
};

const decodeLoaderInput = (
  search: AccessControlSearch,
): AdminGovernanceAccessV2Input => ({
  ...(search.namespace === undefined ? {} : { namespace: search.namespace }),
  ...(search.object === undefined ? {} : { object: search.object }),
  ...(search.relation === undefined ? {} : { relation: search.relation }),
  ...(search.subject === undefined ? {} : { subject: search.subject }),
  ...(search.detailSubject === undefined
    ? {}
    : { detailSubject: search.detailSubject }),
  ...(search.page === undefined ? {} : { page: search.page }),
});

const formatActionError = (error: unknown): string => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  if (typeof error === "object" && error !== null) {
    if ("reason" in error && typeof error.reason === "string") {
      return error.reason;
    }
    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
  }
  return "The access-control mutation failed before the shared governance workflow completed.";
};

export const Route = createAdminAppFileRoute("/r/access")({
  validateSearch: parseAccessControlSearch,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) =>
    import("../../lib/governance-access-loader").then(
      ({ loadAdminGovernanceAccessV2LoaderData }) =>
        loadAdminGovernanceAccessV2LoaderData(decodeLoaderInput(deps.search)),
    ),
  component: AccessControlRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading access control…" />
  ),
});

function AccessControlRoute() {
  const data: AdminGovernanceAccessV2RouteData = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const revokeTuple = useServerFn(revokeAdminAuthorizationTuple);
  const provisionOperator = useServerFn(provisionAdminAccessControlOperator);

  const [namespaceInput, setNamespaceInput] = useState<AuthorizationNamespace>(
    search.namespace ?? authorizationNamespace.tenant,
  );
  const [objectInput, setObjectInput] = useState(search.object ?? "");
  const [relationInput, setRelationInput] = useState<AuthorizationRelation>(
    search.relation ?? authorizationRelation.viewer,
  );
  const [subjectInput, setSubjectInput] = useState(search.subject ?? "");
  const [selectedReason, setSelectedReason] = useState("");
  const [reasonComment, setReasonComment] = useState("");
  const [mutationStatus, setMutationStatus] = useState<{
    readonly kind: "success" | "error";
    readonly message: string;
  } | null>(null);
  const [staffingStatus, setStaffingStatus] = useState<{
    readonly kind: "success" | "error";
    readonly message: string;
  } | null>(null);
  const [operatorCredentialHandoff, setOperatorCredentialHandoff] = useState<{
    readonly operatorLabel: string;
    readonly signInUrl: string;
    readonly temporaryPassword: string;
  } | null>(null);
  const [provisionDisplayName, setProvisionDisplayName] = useState("");
  const [provisionEmail, setProvisionEmail] = useState("");
  const [provisionUsername, setProvisionUsername] = useState("");
  const [provisionRole, setProvisionRole] = useState<
    typeof actorType.platformOperator | typeof actorType.supportOperator
  >(actorType.supportOperator);
  const [provisionReason, setProvisionReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const activeTab = search.tab ?? accessControlTab.operators;

  useEffect(() => {
    setNamespaceInput(search.namespace ?? authorizationNamespace.tenant);
    setObjectInput(search.object ?? "");
    setRelationInput(search.relation ?? authorizationRelation.viewer);
    setSubjectInput(search.subject ?? "");
  }, [search.namespace, search.object, search.relation, search.subject]);

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

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to access authorization data."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access authorization data."
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

  const currentOperator = data.memberships.currentOperator;
  const operators = data.memberships.operators;
  const profiles = data.projectionProfiles;
  const scopes = data.permissionScopes;
  const actionPolicies = data.actionPolicies;
  const tupleQuery = data.tupleQuery;
  const deletePolicy = actionPolicies.find(
    (policy) =>
      policy.actionId ===
      adminGovernanceActionPolicyId.authorizationTupleDelete,
  );
  const selectedReasonOption =
    deletePolicy?.reasonOptions.find(
      (option) => option.value === selectedReason,
    ) ?? deletePolicy?.reasonOptions[0];
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

  const setActiveTab = (next: AccessControlTab) => {
    void navigate({
      search: (current) => ({
        ...current,
        ...(next === accessControlTab.operators ? {} : { tab: next }),
      }),
    });
  };

  const applyTupleQuery = () => {
    const object = objectInput.trim();
    const subject = subjectInput.trim();
    setMutationStatus(null);
    startTransition(() => {
      void navigate({
        search: (current) =>
          object.length === 0
            ? {
                ...(current.tab === undefined ? {} : { tab: current.tab }),
              }
            : {
                ...(current.tab === undefined ? {} : { tab: current.tab }),
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
      void navigate({
        search: (current) => ({
          ...(current.tab === undefined ? {} : { tab: current.tab }),
        }),
      });
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
      void navigate({
        search: (current) => ({ ...current, page }),
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
          await revokeTuple({
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
    <section
      className="ops-screen"
      data-testid="access-control-list-ready"
      data-pattern="access-control-v2"
    >
      <ScreenHeader
        icon={<ShieldIcon />}
        title="Access Control"
        breadcrumbs={[{ label: "Resources" }, { label: "Access control" }]}
        subtitle="Projection profiles, exact-scope authorization tuples, operator posture, and governed revocation workflow."
      />

      <div className="ops-bento">
        <KpiCard label="Operators" value={operators.length} tone="accent" />
        <KpiCard
          label="Action policies"
          value={actionPolicies.length}
          tone={actionPolicies.length > 0 ? "warn" : "neutral"}
        />
        <KpiCard
          label="Projection profiles"
          value={profiles.length}
          tone="accent"
        />
        <KpiCard
          label="Matched tuples"
          value={totalItems}
          tone={totalItems > 0 ? "good" : "neutral"}
          hint={tupleQueryActive ? "Filter active" : "No filter"}
        />
      </div>

      <AccessControlTabBar activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === accessControlTab.operators ? (
        <>
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
              {staffingStatus !== null ? (
                <div className={`ops-feedback ${staffingStatus.kind}`}>
                  {staffingStatus.message}
                </div>
              ) : null}
              {operatorCredentialHandoff !== null ? (
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
              ) : null}
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
                  <label
                    className="ops-field"
                    style={{ minWidth: 180, flex: 1 }}
                  >
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
                  <label
                    className="ops-field"
                    style={{ minWidth: 220, flex: 1 }}
                  >
                    <span className="ops-field-label">Email</span>
                    <input
                      className="ops-search__input"
                      type="email"
                      value={provisionEmail}
                      onChange={(event) =>
                        setProvisionEmail(event.target.value)
                      }
                      placeholder="operator@comvestec.com"
                      autoComplete="off"
                    />
                  </label>
                  <label
                    className="ops-field"
                    style={{ minWidth: 220, flex: 1 }}
                  >
                    <span className="ops-field-label">Username (optional)</span>
                    <input
                      className="ops-search__input"
                      type="text"
                      value={provisionUsername}
                      onChange={(event) =>
                        setProvisionUsername(event.target.value)
                      }
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
                  <label
                    className="ops-field"
                    style={{ minWidth: 260, flex: 1.2 }}
                  >
                    <span className="ops-field-label">Staffing reason</span>
                    <input
                      className="ops-search__input"
                      type="text"
                      value={provisionReason}
                      onChange={(event) =>
                        setProvisionReason(event.target.value)
                      }
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
                <span className="ops-card-head__count">{operators.length}</span>
              </p>
            </div>
            {!canManageOperators ? (
              <EmptyState
                title="Operator directory hidden"
                description="Platform operators can review and provision the full admin operator directory from this screen."
              />
            ) : operators.length === 0 ? (
              <EmptyState
                title="No admin operators"
                description="Provision the next operator from the staffing panel above."
              />
            ) : (
              <div className="ops-table-wrapper">
                <table
                  className="ops-table"
                  data-testid="access-control-operators-table"
                  data-pattern="dense-data-table"
                >
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
                    {operators.map((operator) => (
                      <tr
                        key={operator.actorId}
                        data-testid="access-control-operators-row"
                        data-row-key={operator.actorId}
                      >
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
        </>
      ) : null}

      {activeTab === accessControlTab.tuples ? (
        <>
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
                      event.target.value as AuthorizationNamespace,
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
                      event.target.value as AuthorizationRelation,
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

          {actionPolicies.length > 0 ? (
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
                          policy.severity === "high-risk"
                            ? "pending"
                            : "neutral"
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
          ) : null}

          {!tupleQueryActive ? (
            <div className="ops-card">
              <div data-testid="access-control-tuples-empty">
                <EmptyState
                  title="Enter namespace, object, and relation"
                  description="The access-control screen reviews exact-scope tuples through the shared backend query contract."
                />
              </div>
            </div>
          ) : (
            <div className="ops-card">
              <div className="ops-card-head">
                <p className="ops-card-head__title">
                  Authorization tuples
                  <span className="ops-card-head__count">{totalItems}</span>
                </p>
              </div>
              {mutationStatus?.kind === "success" ? (
                <div className={`ops-feedback ${mutationStatus.kind}`}>
                  {mutationStatus.message}
                </div>
              ) : null}
              {tupleQuery === undefined || tupleQuery.items.length === 0 ? (
                <EmptyState
                  title="No tuples found"
                  description="No exact-scope tuples matched the current namespace, object, relation, and optional subject filter."
                />
              ) : (
                <>
                  <div className="ops-table-wrapper">
                    <table
                      className="ops-table"
                      data-testid="access-control-tuples-table"
                      data-pattern="dense-data-table"
                    >
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
                            data-testid="access-control-tuples-row"
                            data-row-subject={tuple.subject}
                          >
                            <td className="mono">{tuple.namespace}</td>
                            <td className="mono">{tuple.object}</td>
                            <td className="mono">{tuple.relation}</td>
                            <td className="mono ops-redacted">
                              {tuple.subject}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="ops-btn ops-btn--xs"
                                data-testid="access-control-tuples-inspect"
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
                  {totalPages > 1 ? (
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
                  ) : null}
                </>
              )}
            </div>
          )}

          {search.detailSubject !== undefined ? (
            <div className="ops-card" data-testid="access-control-tuple-detail">
              <div className="ops-card-head">
                <p className="ops-card-head__title">
                  Tuple detail & revocation
                </p>
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
                      {deletePolicy.reasonOptions.length > 0 ? (
                        <label
                          className="ops-field"
                          style={{ marginBottom: 10, display: "block" }}
                        >
                          <span className="ops-field-label">
                            Governed reason
                          </span>
                          <select
                            className="ops-select"
                            data-testid="access-control-tuple-reason"
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
                      ) : null}
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
                          data-testid="access-control-tuple-comment"
                          rows={3}
                          value={reasonComment}
                          onChange={(event) =>
                            setReasonComment(event.target.value)
                          }
                          placeholder="Record any operator context that should remain with the audit reason."
                        />
                      </label>
                      <button
                        type="button"
                        className="ops-btn ops-btn--xs ops-btn--danger"
                        data-testid="access-control-tuple-revoke"
                        disabled={isPending}
                        onClick={revokeSelectedTuple}
                      >
                        Revoke tuple
                      </button>
                    </div>
                  )}
                  {mutationStatus?.kind === "error" ? (
                    <div
                      className={`ops-feedback ${mutationStatus.kind}`}
                      data-testid="access-control-mutation-error"
                      role="alert"
                      style={{ marginTop: 10 }}
                    >
                      {mutationStatus.message}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      {activeTab === accessControlTab.profiles ? (
        <div className="ops-card">
          <div className="ops-card-head">
            <p className="ops-card-head__title">
              Projection profiles
              <span className="ops-card-head__count">{profiles.length}</span>
            </p>
          </div>
          {profiles.length === 0 ? (
            <div data-testid="access-control-profiles-empty">
              <EmptyState
                title="No projection profiles"
                description="No backend projection profiles are currently registered."
              />
            </div>
          ) : (
            <div className="ops-table-wrapper">
              <table
                className="ops-table"
                data-testid="access-control-profiles-table"
                data-pattern="dense-data-table"
              >
                <thead>
                  <tr>
                    <th>Profile</th>
                    <th>Module</th>
                    <th>Visible fields</th>
                    <th>Audited fields</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((profile) => (
                    <tr
                      key={`${profile.moduleId}-${profile.profile}`}
                      data-testid="access-control-profiles-row"
                    >
                      <td className="mono">{profile.profile}</td>
                      <td className="mono">{profile.moduleId}</td>
                      <td>{profile.visibleFields.length}</td>
                      <td>{profile.auditedFields.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {activeTab === accessControlTab.scopes ? (
        <div className="ops-card">
          <div className="ops-card-head">
            <p className="ops-card-head__title">
              Scopes & permissions
              <span className="ops-card-head__count">{scopes.length}</span>
            </p>
          </div>
          {scopes.length === 0 ? (
            <div data-testid="access-control-scopes-empty">
              <EmptyState
                title="No permission scopes"
                description="No permission scopes are currently registered."
              />
            </div>
          ) : (
            <div className="ops-table-wrapper">
              <table
                className="ops-table"
                data-testid="access-control-scopes-table"
                data-pattern="dense-data-table"
              >
                <thead>
                  <tr>
                    <th>Permission scope</th>
                  </tr>
                </thead>
                <tbody>
                  {scopes.map((scope) => (
                    <tr
                      key={scope}
                      data-testid="access-control-scopes-row"
                      data-row-scope={scope}
                    >
                      <td className="mono">{scope}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

type AccessControlTabBarProps = {
  readonly activeTab: AccessControlTab;
  readonly onChange: (next: AccessControlTab) => void;
};

const tabLabels: Record<AccessControlTab, string> = {
  operators: "Operators",
  tuples: "Tuples",
  profiles: "Projection profiles",
  scopes: "Scopes & permissions",
};

function AccessControlTabBar({
  activeTab,
  onChange,
}: AccessControlTabBarProps) {
  return (
    <div
      data-testid="access-control-tab-bar"
      role="tablist"
      style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--bg-2)" }}
    >
      {accessControlTabs.map((tab) => {
        const selected = tab === activeTab;

        return (
          <button
            key={tab}
            data-testid={`access-control-tab-${tab}`}
            data-selected={selected ? "true" : "false"}
            role="tab"
            aria-selected={selected}
            type="button"
            onClick={() => onChange(tab)}
            style={{
              padding: "6px 10px",
              border: "none",
              background: "transparent",
              borderBottom: selected
                ? "2px solid var(--accent-fg, currentColor)"
                : "2px solid transparent",
              fontSize: "0.8125rem",
              cursor: "pointer",
            }}
          >
            {tabLabels[tab]}
          </button>
        );
      })}
    </div>
  );
}
