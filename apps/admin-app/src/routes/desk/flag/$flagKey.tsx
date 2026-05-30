import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Schema } from "effect";
import {
  DiffApprovalDrawer,
  HighRiskActionGuard,
  RevealField,
  StateScreen,
  type DiffApprovalStream,
  type HighRiskReason,
} from "@comvestec/ui";
import { findModuleManifest } from "@comvestec/config";
import { createAdminAppFileRoute } from "../../../file-route";
import { FeatureFlagListTable } from "../../../components/feature-flag-list-table";
import { ScreenHeader, ShieldIcon } from "../../../components/ui";
import type {
  AdminGovernanceFlag,
  AdminGovernanceFlagV2Input,
  AdminGovernanceFlagV2RouteData,
} from "../../../lib/governance-flag-route-data";
import { decodeSyncBoundary } from "../../../lib/effect-boundary";
import { submitAdminFeatureFlagProposal } from "../../../lib/governance-flag-mutations-server";
import { buildAdminFeatureFlagPath } from "../../../lib/admin-feature-flag-path";

/**
 * `/desk/flag/$flagKey` — detail variant of the Feature Flags v2
 * route (admin-app implementation plan §8.6 + §11 — Phase 3
 * Governance & access commit 3). Reuses the same
 * `governance-flag-{loader,route-data,route-server}.ts` trio as
 * the list pane, renders the shared `FeatureFlagListTable`, and
 * opens the 4-way `DiffApprovalDrawer`
 * (declared default ↔ runtime rollout ↔ pending proposal ↔
 * effective) for the selected flag. A small inline dependency
 * tree renders next to the drawer so operators can see the
 * declared `dependencies[]` chain without pulling in a graph
 * library. Operator approval flows through `HighRiskActionGuard`
 * → `submitAdminFeatureFlagProposal` (the new mutations-server
 * sibling) so the typed reason + double confirm both stay
 * backend-anchored.
 *
 * Sensitive rollout previews honor `RevealField`; the
 * platform-side reveal contract + audit echo are exercised at
 * the platform layer.
 *
 * Escape hatch: commit 3 ships submit-only. The approve / reject
 * affordance for existing proposals + the lifecycle/history pane
 * are deferred to commit 3b per the prompt's authorized escape
 * hatch, and the underlying
 * `submitAdminFeatureFlagProposalFromSessionId` platform helper
 * lands in 3b — the mutations-server file currently surfaces a
 * typed inline error so the spine wiring is honest end to end.
 */
const decodeFlagDetailParams = decodeSyncBoundary(
  Schema.Struct({ flagKey: Schema.NonEmptyString }),
);

const decodeParams = (params: {
  readonly flagKey: string;
}): AdminGovernanceFlagV2Input => {
  const { flagKey } = decodeFlagDetailParams(params);
  return { flagKey };
};

const submitReasonCatalog: readonly HighRiskReason[] = [
  {
    id: "operator-rollout-tune",
    label: "Operator rollout tune",
    description:
      "Routine governance tune of a feature-flag rollout on behalf of the tenant.",
  },
  {
    id: "incident-mitigation",
    label: "Incident mitigation",
    description:
      "Toggle a feature flag per the current incident-mitigation runbook.",
  },
  {
    id: "compliance-remediation",
    label: "Compliance remediation",
    description:
      "Toggle a feature flag per the current compliance / retention runbook.",
  },
];

const renderDependencyTree = (dependencies: readonly string[]): ReactNode => {
  if (dependencies.length === 0) {
    return (
      <div
        data-testid="feature-flag-dependency-tree-empty"
        style={{ fontSize: "0.75rem", color: "var(--fg-muted)" }}
      >
        This flag declares no dependencies.
      </div>
    );
  }
  return (
    <ul
      data-testid="feature-flag-dependency-tree"
      style={{ margin: 0, paddingLeft: 16, fontSize: "0.75rem" }}
    >
      {dependencies.map((dependency) => (
        <li key={dependency} data-testid="feature-flag-dependency-tree-node">
          <span className="mono">{dependency}</span>
        </li>
      ))}
    </ul>
  );
};

const declaredDefaultFor = (selectedFlag: AdminGovernanceFlag): string => {
  const manifest = findModuleManifest(selectedFlag.owner);
  if (manifest === undefined) {
    return selectedFlag.defaultEnabled ? "on" : "off";
  }
  const declaration = manifest.featureFlags.find(
    (entry) => entry.key === selectedFlag.key,
  );
  if (declaration === undefined) {
    return selectedFlag.defaultEnabled ? "on" : "off";
  }
  return declaration.defaultEnabled ? "on" : "off";
};

export const Route = createAdminAppFileRoute("/desk/flag/$flagKey")({
  loader: ({ params }) =>
    import("../../../lib/governance-flag-loader").then(
      ({ loadAdminGovernanceFlagV2LoaderData }) =>
        loadAdminGovernanceFlagV2LoaderData(decodeParams(params)),
    ),
  component: FeatureFlagDetailRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading feature flag…" />
  ),
});

function FeatureFlagDetailRoute() {
  const data: AdminGovernanceFlagV2RouteData = Route.useLoaderData();
  const params = Route.useParams();
  const router = useRouter();
  const submitProposal = useServerFn(submitAdminFeatureFlagProposal);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [guardArmed, setGuardArmed] = useState<{
    readonly approvalReason: string;
  } | null>(null);
  const [enabledDraft, setEnabledDraft] = useState<"on" | "off">("on");
  const [revealed, setRevealed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const flagKey = params.flagKey;
  const selectedFlag = data.kind === "ready" ? data.selectedFlag : undefined;
  const declaredDefault = useMemo(
    () => (selectedFlag === undefined ? "—" : declaredDefaultFor(selectedFlag)),
    [selectedFlag],
  );

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to access feature flags."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access feature flags."
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

  const moduleId = data.moduleId;
  const runtimeRollout = selectedFlag?.effectiveState ? "on" : "off";
  const pendingProposal = "—"; // proposal projection lands in commit 3b
  const effective = runtimeRollout;
  const dependencies = selectedFlag?.dependencies ?? [];

  const streams: readonly DiffApprovalStream[] = [
    {
      key: "declaredDefault",
      label: "Declared default",
      value: declaredDefault,
    },
    {
      key: "runtimeOverride",
      label: "Runtime rollout",
      value: (
        <RevealField
          label="Runtime rollout"
          value={runtimeRollout}
          revealed={revealed}
          onReveal={() => setRevealed(true)}
          onHide={() => setRevealed(false)}
        />
      ),
    },
    {
      key: "pendingProposal",
      label: "Pending proposal",
      value: pendingProposal,
    },
    {
      key: "effective",
      label: "Effective",
      value: effective,
    },
  ];

  const closeDrawer = () => {
    setDrawerOpen(false);
    setGuardArmed(null);
    setSubmitError(null);
    void router.navigate({
      to: buildAdminFeatureFlagPath() as "/desk/flag",
    });
  };

  const handleConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    if (selectedFlag === undefined || guardArmed === null) {
      setSubmitError(
        "Cannot submit a proposal without a selected flag and an approval reason.",
      );
      return;
    }
    try {
      await submitProposal({
        data: {
          moduleId,
          key: selectedFlag.key,
          enabled: enabledDraft === "on",
          approvalReason: `${input.reasonId}: ${input.note.length > 0 ? input.note : guardArmed.approvalReason}`,
        },
      });
      setGuardArmed(null);
      setSubmitError(null);
      setDrawerOpen(false);
      await router.invalidate();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to submit the feature-flag proposal. Retry shortly.",
      );
      setGuardArmed(null);
    }
  };

  return (
    <section
      data-testid="feature-flag-detail-ready"
      data-pattern="feature-flag-v2-detail"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        icon={<ShieldIcon />}
        title="Feature Flags"
        breadcrumbs={[
          { label: "Resources" },
          { label: "Feature flags" },
          { label: flagKey },
        ]}
        subtitle={
          <>
            Module <span className="mono">{moduleId}</span> — flag{" "}
            <span className="mono">{flagKey}</span>.
          </>
        }
      />
      <FeatureFlagListTable data={data} selectedKey={flagKey} />
      <div
        data-testid="feature-flag-dependency-pane"
        style={{ display: "flex", flexDirection: "column", gap: 4 }}
      >
        <div style={{ fontSize: "0.75rem", color: "var(--fg-muted)" }}>
          Declared dependencies
        </div>
        {renderDependencyTree(dependencies)}
      </div>
      {submitError !== null ? (
        <div
          data-testid="feature-flag-submit-error"
          role="alert"
          style={{
            padding: 6,
            color: "var(--status-error-fg)",
            background: "var(--status-error-bg)",
            border: "1px solid var(--status-error-border)",
            borderRadius: 4,
          }}
        >
          {submitError}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label
          htmlFor="feature-flag-enabled-draft"
          style={{ fontSize: "0.75rem", color: "var(--fg-muted)" }}
        >
          Proposed rollout state
        </label>
        <select
          id="feature-flag-enabled-draft"
          data-testid="feature-flag-enabled-draft"
          value={enabledDraft}
          onChange={(event) =>
            setEnabledDraft(event.target.value === "on" ? "on" : "off")
          }
          style={{
            padding: "4px 8px",
            borderRadius: 4,
            border: "1px solid var(--border-muted, rgba(255,255,255,0.12))",
            background: "transparent",
            color: "inherit",
          }}
        >
          <option value="on">on</option>
          <option value="off">off</option>
        </select>
      </div>
      <DiffApprovalDrawer
        open={drawerOpen}
        onOpenChange={(next) => {
          if (next === false) {
            closeDrawer();
          } else {
            setDrawerOpen(true);
          }
        }}
        title={`Approve feature flag change · ${flagKey}`}
        description={`Module ${moduleId}. Submitting routes through the typed reason picker.`}
        streams={streams}
        onApprove={({ reason }) => setGuardArmed({ approvalReason: reason })}
      />
      {guardArmed !== null ? (
        <HighRiskActionGuard
          action={{
            id: "feature-flag-proposal-submit",
            label: "Submit feature-flag proposal",
          }}
          selection={selectedFlag !== undefined ? [selectedFlag] : []}
          reasons={submitReasonCatalog}
          requireNote
          confirmLabel="Submit proposal"
          onConfirm={(input) => {
            void handleConfirm(input);
          }}
          onCancel={() => setGuardArmed(null)}
        />
      ) : null}
    </section>
  );
}
