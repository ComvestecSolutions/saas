import {
  platformModuleId,
  platformScope,
  type PlatformModuleId,
  type PlatformScope,
} from "@comvestec/contracts";
import type {
  AdminAuditLogV2Filters,
  AdminAuditLogV2TimeWindowPreset,
} from "./audit-log-v2-route-data";

/**
 * URL filter-state shape for `/desk/audit` (admin-app
 * implementation plan §9 — Phase 2 Desk Core commit 6). The raw
 * envelope passed to the TanStack-Router `validateSearch` /
 * server-fn validator is intentionally permissive; the
 * `decodeAuditLogV2Search` helper below performs the live-loader
 * boundary decode against the known platform vocabularies
 * (`platformModuleId.*`, `platformScope.*`, preset literal set)
 * without reaching for `Schema.decodeUnknownSync` so the loader
 * path stays inside the Effect-first contract.
 */
export type AdminAuditLogV2RawSearch = {
  readonly module?: string;
  readonly actor?: string;
  readonly target?: string;
  readonly tenantScope?: string;
  readonly tenantScopeId?: string;
  readonly action?: string;
  readonly classification?: string;
  readonly correlation?: string;
  readonly ip?: string;
  readonly window?: string;
  readonly customFrom?: string;
  readonly customTo?: string;
  readonly tail?: string;
};

const platformModuleIdValues = new Set<PlatformModuleId>(
  Object.values(platformModuleId) as PlatformModuleId[],
);

const platformScopeValues = new Set<PlatformScope>(
  Object.values(platformScope) as PlatformScope[],
);

const timeWindowPresets = new Set<AdminAuditLogV2TimeWindowPreset>([
  "1h",
  "6h",
  "24h",
  "7d",
  "custom",
]);

const sanitizeString = (value: string | undefined): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const sanitizeModuleId = (
  value: string | undefined,
): PlatformModuleId | undefined => {
  const sanitized = sanitizeString(value);
  if (sanitized === undefined) {
    return undefined;
  }
  return platformModuleIdValues.has(sanitized as PlatformModuleId)
    ? (sanitized as PlatformModuleId)
    : undefined;
};

const sanitizeScope = (
  value: string | undefined,
): PlatformScope | undefined => {
  const sanitized = sanitizeString(value);
  if (sanitized === undefined) {
    return undefined;
  }
  return platformScopeValues.has(sanitized as PlatformScope)
    ? (sanitized as PlatformScope)
    : undefined;
};

const sanitizeWindow = (
  value: string | undefined,
): AdminAuditLogV2TimeWindowPreset => {
  const sanitized = sanitizeString(value);
  if (sanitized === undefined) {
    return "24h";
  }
  return timeWindowPresets.has(sanitized as AdminAuditLogV2TimeWindowPreset)
    ? (sanitized as AdminAuditLogV2TimeWindowPreset)
    : "24h";
};

const sanitizeLiveTail = (value: string | undefined): boolean => {
  const sanitized = sanitizeString(value);
  if (sanitized === undefined) {
    return false;
  }
  return sanitized === "1" || sanitized === "true";
};

export const decodeAuditLogV2Search = (
  raw: AdminAuditLogV2RawSearch,
): AdminAuditLogV2Filters => {
  const module = sanitizeModuleId(raw.module) ?? platformModuleId.auditLog;
  const window = sanitizeWindow(raw.window);
  const tenantScope = sanitizeScope(raw.tenantScope);
  const tenantScopeId = sanitizeString(raw.tenantScopeId);

  return {
    module,
    window,
    liveTail: sanitizeLiveTail(raw.tail),
    ...(sanitizeString(raw.actor) === undefined
      ? {}
      : { actor: sanitizeString(raw.actor) as string }),
    ...(sanitizeString(raw.target) === undefined
      ? {}
      : { target: sanitizeString(raw.target) as string }),
    ...(tenantScope === undefined ? {} : { tenantScope }),
    ...(tenantScopeId === undefined ? {} : { tenantScopeId }),
    ...(sanitizeString(raw.action) === undefined
      ? {}
      : { action: sanitizeString(raw.action) as string }),
    ...(sanitizeString(raw.classification) === undefined
      ? {}
      : { classification: sanitizeString(raw.classification) as string }),
    ...(sanitizeString(raw.correlation) === undefined
      ? {}
      : { correlation: sanitizeString(raw.correlation) as string }),
    ...(sanitizeString(raw.ip) === undefined
      ? {}
      : { ip: sanitizeString(raw.ip) as string }),
    ...(window === "custom" && sanitizeString(raw.customFrom) !== undefined
      ? { customFrom: sanitizeString(raw.customFrom) as string }
      : {}),
    ...(window === "custom" && sanitizeString(raw.customTo) !== undefined
      ? { customTo: sanitizeString(raw.customTo) as string }
      : {}),
  };
};

export const encodeAuditLogV2Search = (
  filters: AdminAuditLogV2Filters,
): AdminAuditLogV2RawSearch => ({
  module: filters.module,
  window: filters.window,
  ...(filters.actor === undefined ? {} : { actor: filters.actor }),
  ...(filters.target === undefined ? {} : { target: filters.target }),
  ...(filters.tenantScope === undefined
    ? {}
    : { tenantScope: filters.tenantScope }),
  ...(filters.tenantScopeId === undefined
    ? {}
    : { tenantScopeId: filters.tenantScopeId }),
  ...(filters.action === undefined ? {} : { action: filters.action }),
  ...(filters.classification === undefined
    ? {}
    : { classification: filters.classification }),
  ...(filters.correlation === undefined
    ? {}
    : { correlation: filters.correlation }),
  ...(filters.ip === undefined ? {} : { ip: filters.ip }),
  ...(filters.customFrom === undefined
    ? {}
    : { customFrom: filters.customFrom }),
  ...(filters.customTo === undefined ? {} : { customTo: filters.customTo }),
  ...(filters.liveTail ? { tail: "1" } : {}),
});

/**
 * Build the `AdminGovernanceAuditExportFilter` envelope from
 * the URL filter state for `exportAdminAuditEventsFromEnvironment`.
 * Drops fields the schema does not accept (`action`, `correlation`,
 * `classification`, `ip`, `window`/`tail`) — those remain
 * local-only refinements on the rendered events.
 */
export const toAuditExportFilter = (filters: AdminAuditLogV2Filters) => ({
  moduleId: filters.module,
  ...(filters.actor === undefined ? {} : { actorId: filters.actor }),
  ...(filters.tenantScope === undefined
    ? {}
    : { tenantScope: filters.tenantScope }),
  ...(filters.tenantScopeId === undefined
    ? {}
    : { tenantScopeId: filters.tenantScopeId }),
  ...(filters.target === undefined ? {} : { target: filters.target }),
});
