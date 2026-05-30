import { Schema } from "effect";
import {
  platformModuleId,
  PlatformModuleIdSchema,
  PlatformScopeSchema,
} from "@comvestec/contracts";
import { decodeSchemaOrUndefined, decodeSyncBoundary } from "./effect-boundary";
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

const AdminAuditLogV2RawSearchBoundarySchema = Schema.Struct({
  module: Schema.optional(Schema.Unknown),
  actor: Schema.optional(Schema.Unknown),
  target: Schema.optional(Schema.Unknown),
  tenantScope: Schema.optional(Schema.Unknown),
  tenantScopeId: Schema.optional(Schema.Unknown),
  action: Schema.optional(Schema.Unknown),
  classification: Schema.optional(Schema.Unknown),
  correlation: Schema.optional(Schema.Unknown),
  ip: Schema.optional(Schema.Unknown),
  window: Schema.optional(Schema.Unknown),
  customFrom: Schema.optional(Schema.Unknown),
  customTo: Schema.optional(Schema.Unknown),
  tail: Schema.optional(Schema.Unknown),
});
const AuditLogTimeWindowPresetSchema = Schema.Literal(
  "1h",
  "6h",
  "24h",
  "7d",
  "custom",
);
const decodeRawAuditLogSearch = decodeSyncBoundary(
  AdminAuditLogV2RawSearchBoundarySchema,
);
const decodeModuleId = decodeSchemaOrUndefined(PlatformModuleIdSchema);
const decodeScope = decodeSchemaOrUndefined(PlatformScopeSchema);
const decodeWindowPreset = decodeSchemaOrUndefined(
  AuditLogTimeWindowPresetSchema,
);
const decodeSearchString = decodeSchemaOrUndefined(Schema.String);

const decodeTrimmedSearchString = (value: unknown): string | undefined => {
  const decoded = decodeSearchString(value)?.trim();
  return decoded === undefined || decoded.length === 0 ? undefined : decoded;
};

const sanitizeLiveTail = (value: string | undefined): boolean =>
  value === "1" || value === "true";

export const normalizeAdminAuditLogV2RawSearch = (
  input: unknown,
): AdminAuditLogV2RawSearch => {
  const raw = decodeRawAuditLogSearch(input);
  const module = decodeModuleId(decodeTrimmedSearchString(raw.module));
  const actor = decodeTrimmedSearchString(raw.actor);
  const target = decodeTrimmedSearchString(raw.target);
  const tenantScope = decodeScope(decodeTrimmedSearchString(raw.tenantScope));
  const tenantScopeId = decodeTrimmedSearchString(raw.tenantScopeId);
  const action = decodeTrimmedSearchString(raw.action);
  const classification = decodeTrimmedSearchString(raw.classification);
  const correlation = decodeTrimmedSearchString(raw.correlation);
  const ip = decodeTrimmedSearchString(raw.ip);
  const window = decodeWindowPreset(decodeTrimmedSearchString(raw.window));
  const customFrom = decodeTrimmedSearchString(raw.customFrom);
  const customTo = decodeTrimmedSearchString(raw.customTo);
  const tail = decodeTrimmedSearchString(raw.tail);

  return {
    ...(module === undefined ? {} : { module }),
    ...(actor === undefined ? {} : { actor }),
    ...(target === undefined ? {} : { target }),
    ...(tenantScope === undefined ? {} : { tenantScope }),
    ...(tenantScopeId === undefined ? {} : { tenantScopeId }),
    ...(action === undefined ? {} : { action }),
    ...(classification === undefined ? {} : { classification }),
    ...(correlation === undefined ? {} : { correlation }),
    ...(ip === undefined ? {} : { ip }),
    ...(window === undefined ? {} : { window }),
    ...(customFrom === undefined ? {} : { customFrom }),
    ...(customTo === undefined ? {} : { customTo }),
    ...(tail === undefined ? {} : { tail }),
  };
};

export const decodeAuditLogV2Search = (
  raw: AdminAuditLogV2RawSearch,
): AdminAuditLogV2Filters => {
  const search = normalizeAdminAuditLogV2RawSearch(raw);
  const module = decodeModuleId(search.module) ?? platformModuleId.auditLog;
  const window = decodeWindowPreset(search.window) ?? "24h";
  const tenantScope = decodeScope(search.tenantScope);
  const tenantScopeId = search.tenantScopeId;

  return {
    module,
    window,
    liveTail: sanitizeLiveTail(search.tail),
    ...(search.actor === undefined ? {} : { actor: search.actor }),
    ...(search.target === undefined ? {} : { target: search.target }),
    ...(tenantScope === undefined ? {} : { tenantScope }),
    ...(tenantScopeId === undefined ? {} : { tenantScopeId }),
    ...(search.action === undefined ? {} : { action: search.action }),
    ...(search.classification === undefined
      ? {}
      : { classification: search.classification }),
    ...(search.correlation === undefined
      ? {}
      : { correlation: search.correlation }),
    ...(search.ip === undefined ? {} : { ip: search.ip }),
    ...(window === "custom" && search.customFrom !== undefined
      ? { customFrom: search.customFrom }
      : {}),
    ...(window === "custom" && search.customTo !== undefined
      ? { customTo: search.customTo }
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
