import { useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  DiffApprovalDrawer,
  HighRiskActionGuard,
  RevealField,
  StateScreen,
  type DiffApprovalStream,
  type HighRiskReason,
} from "@comvestec/ui";
import {
  platformModuleId,
  platformModuleIds,
  type PlatformModuleId,
} from "@comvestec/contracts";
import { findModuleManifest } from "@comvestec/config";
import { createAdminAppFileRoute } from "../../../../file-route";
import { RuntimeConfigListTable } from "../../../../components/runtime-config-list-table";
import { ScreenHeader, ShieldIcon } from "../../../../components/ui";
import type {
  AdminGovernanceConfigV2Input,
  AdminGovernanceConfigV2RouteData,
} from "../../../../lib/governance-config-route-data";
import { submitAdminRuntimeConfigOverrideProposal } from "../../../../lib/governance-config-mutations-server";
import { buildAdminRuntimeConfigPath } from "../../../../lib/admin-runtime-config-path";

/**
 * `/desk/config/$moduleId/$configKey` — detail variant of the
 * Runtime Config v2 route (admin-app implementation plan §8.5 +
 * §11 — Phase 3 Governance & access commit 2). Reuses the same
 * `governance-config-{loader,route-data,route-server}.ts` trio
 * as the list pane, renders the shared `RuntimeConfigListTable`,
 * and opens the 4-way `DiffApprovalDrawer` (declared default ↔
 * runtime override ↔ pending proposal ↔ effective) for the
 * selected key. Operator approval flows through
 * `HighRiskActionGuard` → `submitAdminRuntimeConfigOverrideProposal`
 * (the new mutations-server sibling) so the typed reason + double
 * confirm both stay backend-anchored.
 *
 * Sensitive value previews honor `RevealField`; the actual
 * platform-side reveal contract + audit echo are exercised at
 * the platform layer.
 *
 * Escape hatch: commit 2 ships submit-only. The approve / reject
 * affordance for existing proposals + the lifecycle/history pane
 * are deferred to commit 2b per the prompt's authorized escape
 * hatch.
 */
const platformModuleIdValues = platformModuleIds as readonly PlatformModuleId[];

const isKnownPlatformModuleId = (value: string): value is PlatformModuleId =>
  (platformModuleIdValues as readonly string[]).includes(value);

const decodeParams = (params: {
  readonly moduleId: string;
  readonly configKey: string;
}): AdminGovernanceConfigV2Input => {
  const moduleId = isKnownPlatformModuleId(params.moduleId)
    ? params.moduleId
    : platformModuleId.runtimeConfig;
  return {
    moduleId,
    key: params.configKey,
  };
};

const submitReasonCatalog: readonly HighRiskReason[] = [
  {
    id: "operator-routine-tune",
    label: "Operator routine tune",
    description:
      "Routine governance tune of a runtime-config override on behalf of the tenant.",
  },
  {
    id: "incident-mitigation",
    label: "Incident mitigation",
    description:
      "Apply an incident-mitigation override per the current support runbook.",
  },
  {
    id: "compliance-remediation",
    label: "Compliance remediation",
    description:
      "Apply a compliance-driven override per the current retention runbook.",
  },
];

const declaredDefaultFor = (
  moduleId: PlatformModuleId,
  key: string,
): string => {
  const manifest = findModuleManifest(moduleId);
  if (manifest === undefined) {
    return "—";
  }
  const declaration = manifest.configKeys.find((entry) => entry.key === key);
  if (declaration === undefined) {
    return "—";
  }
  const value = declaration.defaultValue;
  return value == null ? "—" : String(value);
};

export const Route = createAdminAppFileRoute(
  "/desk/config/$moduleId/$configKey",
)({
  loader: ({ params }) =>
    import("../../../../lib/governance-config-loader").then(
      ({ loadAdminGovernanceConfigV2LoaderData }) =>
        loadAdminGovernanceConfigV2LoaderData(decodeParams(params)),
    ),
  component: RuntimeConfigDetailRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading runtime config…" />
  ),
});

function RuntimeConfigDetailRoute() {
  const data: AdminGovernanceConfigV2RouteData = Route.useLoaderData();
  const params = Route.useParams();
  const router = useRouter();
  const submitProposal = useServerFn(submitAdminRuntimeConfigOverrideProposal);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [guardArmed, setGuardArmed] = useState<{
    readonly approvalReason: string;
  } | null>(null);
  const [valueDraft, setValueDraft] = useState<string>("");
  const [revealed, setRevealed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const configKey = params.configKey;
  const moduleId =
    data.kind === "ready" ? data.moduleId : platformModuleId.runtimeConfig;

  const declaredDefault = useMemo(
    () => declaredDefaultFor(moduleId, configKey),
    [moduleId, configKey],
  );

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to access runtime configuration."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access runtime configuration."
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

  const selectedOverride = data.selectedOverride;
  const selectedProposals = data.selectedProposals;
  const pendingProposal = selectedProposals.find(
    (proposal) => proposal.status === "pending",
  );

  const streams: readonly DiffApprovalStream[] = [
    {
      key: "declaredDefault",
      label: "Declared default",
      value: declaredDefault,
    },
    {
      key: "runtimeOverride",
      label: "Runtime override",
      value: (
        <RevealField
          label="Runtime override"
          value={selectedOverride?.value ?? "—"}
          revealed={revealed}
          onReveal={() => setRevealed(true)}
          onHide={() => setRevealed(false)}
        />
      ),
    },
    {
      key: "pendingProposal",
      label: "Pending proposal",
      value: pendingProposal?.value ?? "—",
    },
    {
      key: "effective",
      label: "Effective",
      value: selectedOverride?.value ?? declaredDefault,
    },
  ];

  const closeDrawer = () => {
    setDrawerOpen(false);
    setGuardArmed(null);
    setSubmitError(null);
    void router.navigate({
      to: buildAdminRuntimeConfigPath() as "/desk/config",
    });
  };

  const handleConfirm = async (input: {
    readonly reasonId: string;
    readonly note: string;
  }) => {
    if (selectedOverride === undefined || guardArmed === null) {
      setSubmitError(
        "Cannot submit a proposal without a runtime override scope and an approval reason.",
      );
      return;
    }
    try {
      await submitProposal({
        data: {
          moduleId,
          key: selectedOverride.key,
          scope: selectedOverride.scope,
          scopeId: selectedOverride.scopeId,
          value:
            valueDraft.length > 0 ? valueDraft : (selectedOverride.value ?? ""),
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
          : "Failed to submit the runtime-config proposal. Retry shortly.",
      );
      setGuardArmed(null);
    }
  };

  return (
    <section
      data-testid="runtime-config-detail-ready"
      data-pattern="runtime-config-v2-detail"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        icon={<ShieldIcon />}
        title="Runtime Configuration"
        breadcrumbs={[
          { label: "Resources" },
          { label: "Runtime config" },
          { label: configKey },
        ]}
        subtitle={
          <>
            Module <span className="mono">{moduleId}</span> — key{" "}
            <span className="mono">{configKey}</span>.
          </>
        }
      />
      <RuntimeConfigListTable data={data} selectedKey={configKey} />
      {submitError !== null ? (
        <div
          data-testid="runtime-config-submit-error"
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
          htmlFor="runtime-config-value-draft"
          style={{ fontSize: "0.75rem", color: "var(--fg-muted)" }}
        >
          Proposed new value
        </label>
        <input
          id="runtime-config-value-draft"
          data-testid="runtime-config-value-draft"
          value={valueDraft}
          onChange={(event) => setValueDraft(event.target.value)}
          placeholder={selectedOverride?.value ?? "Enter a new value"}
          style={{
            padding: "4px 8px",
            borderRadius: 4,
            border: "1px solid var(--border-muted, rgba(255,255,255,0.12))",
            background: "transparent",
            color: "inherit",
          }}
        />
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
        title={`Approve runtime config change · ${configKey}`}
        description={`Module ${moduleId}. Submitting routes through the typed reason picker.`}
        streams={streams}
        onApprove={({ reason }) => setGuardArmed({ approvalReason: reason })}
      />
      {guardArmed !== null ? (
        <HighRiskActionGuard
          action={{
            id: "runtime-config-proposal-submit",
            label: "Submit runtime-config proposal",
          }}
          selection={selectedOverride !== undefined ? [selectedOverride] : []}
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
