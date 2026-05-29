import { platformScope } from "@comvestec/contracts";
import type { AdminTenantTarget } from "../../lib/admin-tenant-target";

/**
 * Browser-fixture tenant directory rows for admin route tests.
 */

export type TenantDirectoryRow = {
  readonly key: string;
  readonly displayName: string;
  readonly target: AdminTenantTarget;
  readonly status: "active" | "pending" | "blocked";
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
    status: "blocked",
    approvalsOpen: 2,
  },
];
