import {
  configSchemaType,
  featureFlagLifecycle,
  operationsHomeConfigKey,
  operationsHomeFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

/**
 * Operations Home aggregate v2 manifest (admin-app implementation
 * plan §9 item 3). Declares the operator-facing aggregate as a
 * read-only `operations-home:read` scope module with two operator-
 * tunable runtime config keys and a single `v2Enabled` rollout
 * feature flag so the desk shell can flip between the new
 * aggregated payload and the legacy fan-out path during rollout.
 *
 * All declared values are platform-scope only — this module
 * serves the operator desk and is never visible to tenant scopes.
 */
export const operationsHomeManifest = defineModuleManifest({
  moduleId: platformModuleId.operationsHome,
  configKeys: [
    {
      key: operationsHomeConfigKey.defaultWindowMinutes,
      description:
        "Default trailing window (minutes) used when the desk does not pass an explicit windowMinutes query parameter. Operators tune this per environment via runtime-config; the platform never falls back to a hard-coded default.",
      schema: configSchemaType.number,
      defaultValue: 1440,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.operationsHome,
    },
    {
      key: operationsHomeConfigKey.kpiSet,
      description:
        "Comma-separated set of KPI identifiers the aggregate should populate (e.g. 'tenants.active,operators.active,invoices.open,usage.events.24h,audit.volume'). The platform service maps identifiers to source ports; unknown identifiers degrade to a typed partial-failure entry rather than poisoning the snapshot.",
      schema: configSchemaType.string,
      defaultValue:
        "tenants.active,operators.active,invoices.open,usage.events.24h,audit.volume",
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.operationsHome,
    },
    {
      key: operationsHomeConfigKey.recentAuditLimit,
      description:
        "Maximum number of recent audit-log entries surfaced in the snapshot. Bounded to keep the response payload small enough for default-layout render.",
      schema: configSchemaType.number,
      defaultValue: 20,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.operationsHome,
    },
  ],
  featureFlags: [
    {
      key: operationsHomeFeatureFlag.v2Enabled,
      description:
        "Gate the aggregated Operations Home v2 payload. When disabled, the desk continues to fan out to individual module services.",
      owner: platformModuleId.operationsHome,
      purpose:
        "Phase-1 rollout switch for the single-payload Operations Home aggregate consumed by the Desk Center Workbench default layout.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Promote to default and retire the per-section fan-out path once Phase 2 desk wiring is validated end-to-end against live module sources.",
    },
  ],
  permissionScopes: [permissionScope.operationsHomeRead],
  fieldClassifications: [],
  projectionProfiles: [],
});
