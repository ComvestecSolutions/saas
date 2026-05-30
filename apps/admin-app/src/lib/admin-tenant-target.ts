import { platformScope, type TenantContext } from "@comvestec/contracts";

export const adminTenantTargetScopes = [
  platformScope.organization,
  platformScope.enterprise,
  platformScope.individual,
] as const;

export type AdminTenantTargetScope = (typeof adminTenantTargetScopes)[number];

export type AdminTenantTargetReference = {
  readonly scope: string;
  readonly scopeId: string;
};

export type AdminTenantTarget = AdminTenantTargetReference & {
  readonly scope: AdminTenantTargetScope;
};

const adminTenantTargetScopeSet = new Set<string>(adminTenantTargetScopes);

export const sanitizeAdminTenantTargetScope = (
  value: unknown,
): AdminTenantTargetScope | undefined =>
  typeof value === "string" && adminTenantTargetScopeSet.has(value)
    ? (value as AdminTenantTargetScope)
    : undefined;

export const resolveAdminTenantTargetScope = (
  value: unknown,
): AdminTenantTargetScope | undefined => sanitizeAdminTenantTargetScope(value);

export const buildAdminTenantTarget = (input: {
  readonly scope: unknown;
  readonly scopeId: string;
}): AdminTenantTarget | undefined => {
  const scope = sanitizeAdminTenantTargetScope(input.scope);
  const scopeId = input.scopeId.trim();

  if (scope === undefined || scopeId.length === 0) {
    return undefined;
  }

  return {
    scope,
    scopeId,
  };
};

export const buildAdminTenantContext = (
  target: Readonly<AdminTenantTarget>,
): TenantContext => ({
  scope: target.scope,
  scopeId: target.scopeId,
  ...(target.scope === platformScope.enterprise
    ? { enterpriseId: target.scopeId }
    : {}),
  ...(target.scope === platformScope.organization
    ? { organizationId: target.scopeId }
    : {}),
  ...(target.scope === platformScope.individual
    ? { individualId: target.scopeId }
    : {}),
});

export const buildAdminTenantWorkspacePath = (
  target: Readonly<AdminTenantTarget>,
): string => {
  const search = new URLSearchParams();
  search.set("scope", target.scope);

  return `/desk/tenant/${encodeURIComponent(target.scopeId)}?${search.toString()}`;
};

export const buildAdminTenantScopedRoutePath = (
  basePath: string,
  target: Readonly<AdminTenantTarget>,
): string => {
  const search = new URLSearchParams();
  search.set("scope", target.scope);
  search.set("scopeId", target.scopeId);

  return `${basePath}?${search.toString()}`;
};

export const buildAdminTenantTargetSearch = (
  target: Readonly<AdminTenantTarget>,
): {
  readonly scope: AdminTenantTargetScope;
  readonly scopeId: string;
} => ({
  scope: target.scope,
  scopeId: target.scopeId,
});

export const serializeAdminTenantTarget = (
  target: Readonly<AdminTenantTargetReference>,
): string => `${target.scope}:${target.scopeId}`;
