/**
 * Universal omnibar search module wrapper (admin-app
 * implementation plan §9 item 11). Re-exports the canonical
 * contract surface and exposes the pure helpers the platform
 * service (commit 4) and the admin omnibar (Phase 2) share.
 *
 * Owner-locked invariants (operator-only authz, audit emission
 * on every successful search, bounded result cache, reason-
 * catalog decode, field-security row-redaction, admin-only
 * reindex) live in the platform service — this module owns only
 * the pure helpers both layers must agree on.
 *
 * The platform service reuses `platformAdapterServiceName.meilisearch`
 * end-to-end — NO new adapter literal is introduced.
 */
import {
  platformModuleId,
  universalSearchFacet,
  universalSearchPrefix,
  type UniversalSearchFacet,
  type UniversalSearchPrefix,
} from "@comvestec/contracts";

export const universalSearchModuleId = platformModuleId.universalSearch;

export {
  UniversalSearchActorScopeSchema,
  UniversalSearchEntryListSchema,
  UniversalSearchEntrySchema,
  UniversalSearchFacetSchema,
  UniversalSearchIndexFreshnessSchema,
  UniversalSearchPartialFailureSchema,
  UniversalSearchPrefixSchema,
  UniversalSearchQueryInputSchema,
  UniversalSearchReindexInputSchema,
  UniversalSearchResultSchema,
  UniversalSearchScopeTagSchema,
  universalSearchFacet,
  universalSearchFacets,
  universalSearchPrefix,
  universalSearchPrefixes,
  universalSearchScopeTag,
  universalSearchScopeTags,
} from "@comvestec/contracts";

export type {
  UniversalSearchActorScope,
  UniversalSearchEntry,
  UniversalSearchEntryList,
  UniversalSearchFacet,
  UniversalSearchIndexFreshness,
  UniversalSearchPartialFailure,
  UniversalSearchPrefix,
  UniversalSearchQueryInput,
  UniversalSearchReindexInput,
  UniversalSearchResult,
  UniversalSearchScopeTag,
} from "@comvestec/contracts";

/**
 * Freshness check used to flip the result envelope's
 * `indexFreshness.isFresh` flag so the omnibar can warn
 * operators when results are computed against a stale index.
 *
 * Negative or non-finite thresholds collapse to `false` so
 * misconfiguration fails closed rather than silently
 * advertising a stale index as fresh. Cached entries whose
 * `lastReindexedAt` is in the future (clock skew) also collapse
 * to `false`.
 */
export const isIndexFresh = (
  lastReindexedAt: string,
  nowEpochMs: number,
  thresholdSeconds: number,
): boolean => {
  const reindexedMs = new Date(lastReindexedAt).getTime();
  if (!Number.isFinite(reindexedMs)) {
    return false;
  }
  if (!Number.isFinite(thresholdSeconds) || thresholdSeconds <= 0) {
    return false;
  }
  const ageMs = nowEpochMs - reindexedMs;
  if (ageMs < 0) {
    return false;
  }
  return ageMs <= thresholdSeconds * 1000;
};

/**
 * Resolves an omnibar prefix (`t/f/c/u/inv/d/kc/ev`) to the
 * subset of facets the universal search should query. Mirrors
 * the admin-app spec.md omnibar table EXACTLY:
 *
 *   - `t`   → tenants (organisation / enterprise records)
 *   - `f`   → featureFlags
 *   - `c`   → configKeys
 *   - `u`   → users (admin-org members + tenant memberships;
 *             distinct from Keycloak users which use `kc`)
 *   - `inv` → invoices
 *   - `d`   → customDomains
 *   - `kc`  → users (Keycloak admin users via the keycloak-user-read
 *             helper)
 *   - `ev`  → auditEvents
 *
 * Returns ALL facets when `prefix` is `undefined` so the omnibar
 * default (no prefix) federates across every facet.
 */
export const resolvePrefixToFacets = (
  prefix: UniversalSearchPrefix | undefined,
): ReadonlyArray<UniversalSearchFacet> => {
  if (prefix === undefined) {
    return [
      universalSearchFacet.tenants,
      universalSearchFacet.users,
      universalSearchFacet.featureFlags,
      universalSearchFacet.configKeys,
      universalSearchFacet.auditEvents,
      universalSearchFacet.invoices,
      universalSearchFacet.webhooks,
      universalSearchFacet.customDomains,
    ];
  }
  switch (prefix) {
    case universalSearchPrefix.tenant:
      return [universalSearchFacet.tenants];
    case universalSearchPrefix.flag:
      return [universalSearchFacet.featureFlags];
    case universalSearchPrefix.config:
      return [universalSearchFacet.configKeys];
    case universalSearchPrefix.user:
      return [universalSearchFacet.users];
    case universalSearchPrefix.invoice:
      return [universalSearchFacet.invoices];
    case universalSearchPrefix.domain:
      return [universalSearchFacet.customDomains];
    case universalSearchPrefix.keycloakUser:
      return [universalSearchFacet.users];
    case universalSearchPrefix.event:
      return [universalSearchFacet.auditEvents];
  }
};
