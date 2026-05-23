import { platformScope } from "@comvestec/contracts";
import type { HighRiskReason } from "@comvestec/ui";
import type { AdminTenantTarget } from "../../lib/admin-tenant-target";

/**
 * Tenant directory fixture for the slice 1b-tail `/r/tenants` route.
 *
 * This proves the shell + `DenseDataTable` + `HighRiskActionGuard`
 * render-prop seam without depending on the Phase 1 backend
 * (admin-organization tenant directory). Rows expose display-only
 * fields — no raw tenant ids, no raw bearer tokens, no operator-
 * facing copy that leaks an internal identifier. The `key` is a
 * stable, opaque slug used only for React row reconciliation.
 */
// TODO(slice-future): replace with the admin-organization tenant
// directory helper sourced from the Phase 1 backend module.

export type TenantDirectoryRow = {
  readonly key: string;
  readonly displayName: string;
  readonly target: AdminTenantTarget;
  readonly environment: "platform" | "production" | "staging" | "sandbox";
  readonly status: "active" | "pending" | "suspended";
  readonly approvalsOpen: number;
};

export const tenantDirectoryFixture: readonly TenantDirectoryRow[] = [
  {
    key: "tenant-alpha",
    displayName: "Acme Co.",
    target: {
      scope: platformScope.organization,
      scopeId: "org_demo",
    },
    environment: "production",
    status: "active",
    approvalsOpen: 0,
  },
  {
    key: "tenant-beta",
    displayName: "Globex",
    target: {
      scope: platformScope.enterprise,
      scopeId: "ent_atlas",
    },
    environment: "production",
    status: "active",
    approvalsOpen: 1,
  },
  {
    key: "tenant-gamma",
    displayName: "Initech",
    target: {
      scope: platformScope.organization,
      scopeId: "org_initech",
    },
    environment: "staging",
    status: "pending",
    approvalsOpen: 0,
  },
  {
    key: "tenant-delta",
    displayName: "Umbrella",
    target: {
      scope: platformScope.individual,
      scopeId: "ind_solo",
    },
    environment: "sandbox",
    status: "suspended",
    approvalsOpen: 2,
  },
];

// TODO(slice-future): replace with the canonical admin-governance
// reason catalog for high-risk tenant directory actions.
export const tenantBulkActionReasonsFixture: readonly HighRiskReason[] = [
  {
    id: "support-escalation",
    label: "Support escalation",
    description: "Acting on an authenticated tenant support escalation.",
  },
  {
    id: "compliance-hold",
    label: "Compliance hold",
    description: "Applying a compliance- or legal-mandated hold.",
  },
];
