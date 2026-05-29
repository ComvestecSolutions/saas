import { platformScope } from "@comvestec/contracts";
import { type AdminTenantTargetReference } from "./admin-tenant-target";

const formatFallbackDisplayName = (scopeId: string): string =>
  scopeId
    .split(/[_-]/g)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

export const resolveAdminTenantTargetDisplayName = (
  target: Readonly<AdminTenantTargetReference>,
): string =>
  target.scope === platformScope.platform
    ? "Platform"
    : formatFallbackDisplayName(target.scopeId);
