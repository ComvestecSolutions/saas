import { tenantDirectoryFixture } from "../desk/fixtures/tenants";
import {
  serializeAdminTenantTarget,
  type AdminTenantTargetReference,
} from "./admin-tenant-target";

const knownTargetDisplayNames = new Map(
  tenantDirectoryFixture.map((row) => [
    serializeAdminTenantTarget(row.target),
    row.displayName,
  ]),
);

const formatFallbackDisplayName = (scopeId: string): string =>
  scopeId
    .split(/[_-]/g)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

export const resolveAdminTenantTargetDisplayName = (
  target: Readonly<AdminTenantTargetReference>,
): string =>
  knownTargetDisplayNames.get(serializeAdminTenantTarget(target)) ??
  formatFallbackDisplayName(target.scopeId);
