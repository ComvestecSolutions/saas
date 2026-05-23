import {
  configSchemaType,
  featureFlagLifecycle,
  permissionScope,
  platformModuleId,
  platformScope,
  tenantWorkspaceConfigKey,
  tenantWorkspaceFeatureFlag,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

/**
 * Tenant workspace aggregate v2 manifest (admin-app
 * implementation plan §9 item 4). Declares the operator-facing
 * aggregate as a read-only `tenant-workspace:read` scope module
 * with three operator-tunable runtime config keys and a single
 * `v2Enabled` rollout feature flag so the desk shell can flip
 * between the new aggregated payload and the legacy per-tenant
 * fan-out path during rollout.
 *
 * All declared values are platform-scope only — this module
 * serves the operator desk and is never visible to tenant
 * scopes. The aggregate itself is tenant-scoped at runtime via
 * the service-level tenant-isolation guard
 * (`TenantWorkspaceCrossTenantAccessDenied`), not via this
 * manifest's `allowedScopes`.
 */
export const tenantWorkspaceManifest = defineModuleManifest({
  moduleId: platformModuleId.tenantWorkspace,
  configKeys: [
    {
      key: tenantWorkspaceConfigKey.defaultWindowMinutes,
      description:
        "Default trailing window (minutes) used when the desk does not pass an explicit windowMinutes query parameter. Operators tune this per environment via runtime-config; the platform never falls back to a hard-coded default.",
      schema: configSchemaType.number,
      defaultValue: 1440,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.tenantWorkspace,
    },
    {
      key: tenantWorkspaceConfigKey.membersLimit,
      description:
        "Maximum number of tenant members surfaced in the snapshot. Bounded to keep the response payload small enough for default-layout render.",
      schema: configSchemaType.number,
      defaultValue: 20,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.tenantWorkspace,
    },
    {
      key: tenantWorkspaceConfigKey.recentActivityLimit,
      description:
        "Maximum number of tenant-scoped audit-log entries surfaced in the snapshot. Bounded to keep the response payload small enough for default-layout render.",
      schema: configSchemaType.number,
      defaultValue: 20,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.tenantWorkspace,
    },
  ],
  featureFlags: [
    {
      key: tenantWorkspaceFeatureFlag.v2Enabled,
      description:
        "Gate the aggregated Tenant workspace v2 payload. When disabled, the desk continues to fan out to individual module services for the per-tenant view.",
      owner: platformModuleId.tenantWorkspace,
      purpose:
        "Phase-1 rollout switch for the single-payload Tenant workspace aggregate consumed by the Desk Center Workbench `/r/tenant/<id>` route.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Promote to default and retire the per-section fan-out path once Phase 2 desk wiring is validated end-to-end against live module sources.",
    },
  ],
  permissionScopes: [permissionScope.tenantWorkspaceRead],
  fieldClassifications: [],
  projectionProfiles: [],
});
