import { Schema } from "effect";
import { PlatformScopeSchema, type PlatformScope } from "@comvestec/contracts";
import { serializeAdminTenantTarget } from "./admin-tenant-target";
import {
  decodeJsonOrUndefined,
  decodeSchemaOrUndefined,
} from "./effect-boundary";

export type AdminRouteTenantTarget = {
  readonly scope: PlatformScope;
  readonly scopeId: string;
};

const AdminRouteTenantTargetSearchEntrySchema = Schema.Struct({
  scope: Schema.String,
  scopeId: Schema.String,
});

export const AdminRouteTenantTargetSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.String,
});

const decodeJsonTenantTargets = decodeJsonOrUndefined(
  Schema.Array(AdminRouteTenantTargetSearchEntrySchema),
);

const decodeTenantTarget = decodeSchemaOrUndefined(
  AdminRouteTenantTargetSchema,
);

export const AdminRouteTenantTargetsSearchSchema = Schema.optional(
  Schema.Union(
    Schema.String,
    Schema.Array(AdminRouteTenantTargetSearchEntrySchema),
  ),
);
const AdminRouteTenantTargetsSearchValueSchema = Schema.Union(
  Schema.String,
  Schema.Array(AdminRouteTenantTargetSearchEntrySchema),
);

export type AdminRouteTenantTargetsSearchValue = Schema.Schema.Type<
  typeof AdminRouteTenantTargetsSearchSchema
>;

const decodeTenantTargetsSearchValue = decodeSchemaOrUndefined(
  AdminRouteTenantTargetsSearchValueSchema,
);

export const decodeAdminRouteTenantTargetsSearch = (
  input: unknown,
): AdminRouteTenantTargetsSearchValue => decodeTenantTargetsSearchValue(input);

export const decodeAdminRouteTenantTargets = (
  raw: AdminRouteTenantTargetsSearchValue,
): readonly AdminRouteTenantTarget[] => {
  if (raw === undefined) {
    return [];
  }

  const parsed:
    | readonly Schema.Schema.Type<
        typeof AdminRouteTenantTargetSearchEntrySchema
      >[]
    | undefined =
    typeof raw === "string"
      ? raw.length === 0
        ? undefined
        : decodeJsonTenantTargets(raw)
      : raw;

  if (!Array.isArray(parsed)) {
    return [];
  }

  const decoded: AdminRouteTenantTarget[] = [];

  for (const entry of parsed) {
    const target = decodeTenantTarget(entry);

    if (target === undefined) {
      continue;
    }

    const scopeId = target.scopeId.trim();

    if (scopeId.length === 0) {
      continue;
    }

    decoded.push({
      scope: target.scope,
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
