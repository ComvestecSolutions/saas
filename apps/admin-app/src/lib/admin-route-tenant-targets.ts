import { Schema } from "effect";
import { platformScopes, type PlatformScope } from "@comvestec/contracts";
import { serializeAdminTenantTarget } from "./admin-tenant-target";

export type AdminRouteTenantTarget = {
  readonly scope: PlatformScope;
  readonly scopeId: string;
};

const AdminRouteTenantTargetSearchEntrySchema = Schema.Struct({
  scope: Schema.String,
  scopeId: Schema.String,
});

export const AdminRouteTenantTargetsSearchSchema = Schema.optional(
  Schema.Union(
    Schema.String,
    Schema.Array(AdminRouteTenantTargetSearchEntrySchema),
  ),
);

export type AdminRouteTenantTargetsSearchValue = Schema.Schema.Type<
  typeof AdminRouteTenantTargetsSearchSchema
>;

const knownPlatformScopes = new Set<string>(platformScopes);

export const decodeAdminRouteTenantTargets = (
  raw: AdminRouteTenantTargetsSearchValue,
): readonly AdminRouteTenantTarget[] => {
  if (raw === undefined) {
    return [];
  }

  const parsed: unknown =
    typeof raw === "string"
      ? (() => {
          if (raw.length === 0) {
            return undefined;
          }

          try {
            return JSON.parse(raw);
          } catch {
            return undefined;
          }
        })()
      : raw;

  if (!Array.isArray(parsed)) {
    return [];
  }

  const decoded: AdminRouteTenantTarget[] = [];

  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const candidate = entry as { scope?: unknown; scopeId?: unknown };
    const scope =
      typeof candidate.scope === "string" &&
      knownPlatformScopes.has(candidate.scope)
        ? (candidate.scope as PlatformScope)
        : undefined;
    const scopeId =
      typeof candidate.scopeId === "string" ? candidate.scopeId.trim() : "";

    if (scope === undefined || scopeId.length === 0) {
      continue;
    }

    decoded.push({
      scope,
      scopeId,
    });
  }

  return decoded;
};

export const encodeAdminRouteTenantTargets = (
  tenantTargets: readonly AdminRouteTenantTarget[],
): string | undefined =>
  tenantTargets.length === 0 ? undefined : JSON.stringify(tenantTargets);

export const dedupeAdminRouteTenantTargets = <T extends AdminRouteTenantTarget>(
  tenantTargets: readonly T[],
): readonly T[] => {
  const unique = new Map<string, T>();

  tenantTargets.forEach((tenant) => {
    unique.set(serializeAdminTenantTarget(tenant), tenant);
  });

  return [...unique.values()];
};
