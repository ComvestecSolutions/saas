/**
 * Universal omnibar search contracts (admin-app implementation
 * plan §9 item 11). Locks the federated read-only contract the
 * Operator Desk omnibar pivots on: ONE search query, ONE result
 * envelope, multiple facet "buckets" computed in parallel (one
 * per supported facet, configurable, top-K per bucket).
 *
 * Owner-locked design (enforced in the platform service in
 * commit 4):
 *
 *   - **Read-only**: only `search` is publicly exposed alongside
 *     an operator-only `requestReindex(facet?)` action. There is
 *     NO index-write surface from the omnibar caller.
 *   - **Operator-only authz**: every search requires
 *     `actorType.platformOperator` OR `actorType.supportOperator`;
 *     anonymous → `UniversalSearchUnauthorized`. Reindex is
 *     `platformOperator` only.
 *   - **Federated, partial-failure tolerant**: every facet runs
 *     in parallel via `Effect.all { concurrency: 'unbounded' }`
 *     wrapped in `Effect.either`; per-facet failures degrade to a
 *     `partialFailures` entry; the aggregate only fails with
 *     `UniversalSearchAllFacetsFailedError` when EVERY requested
 *     facet fails.
 *   - **Field-security at the SERVICE boundary**: each row is
 *     redacted via the shared field-security service BEFORE the
 *     envelope leaves the service. Entries the actor cannot see
 *     are filtered out (counted in
 *     `partialFailures.fieldSecurityFiltered`).
 *   - **Reason-catalog decode**: every search/reindex decodes its
 *     `reasonCatalogId` against `ReasonCatalogIdSchema`; only
 *     `reasonCatalogId.universalSearchRead` is allowed.
 *   - **Bounded result cache**: keyed by `(actorScope|query|
 *     facets|prefix|limit)` and bounded by `cacheMaxSize` with
 *     `cacheTtlSeconds` freshness, insertion-order eviction.
 *
 * Naming: this slice reuses `platformAdapterServiceName.meilisearch`
 * end-to-end via `packages/platform/src/adapters/search/meilisearch.ts`
 * — NO new adapter literal is introduced. Per-facet Meilisearch
 * indexes are conventionally `universal-search-{facet}`; the
 * per-facet IndexedDocumentSchema lives at the adapter boundary,
 * not in this shared contract.
 */
import { Schema } from "effect";
import { IsoTimestampSchema } from "../runtime/timestamps";
import { PlatformScopeSchema } from "../access/platform-scopes";

// ---------------------------------------------------------------------------
// Facets
// ---------------------------------------------------------------------------

const UniversalSearchFacetConstantSchema = Schema.Struct({
  tenants: Schema.Literal("tenants"),
  users: Schema.Literal("users"),
  featureFlags: Schema.Literal("featureFlags"),
  configKeys: Schema.Literal("configKeys"),
  auditEvents: Schema.Literal("auditEvents"),
  invoices: Schema.Literal("invoices"),
  webhooks: Schema.Literal("webhooks"),
  customDomains: Schema.Literal("customDomains"),
});

export const universalSearchFacet = Schema.validateSync(
  UniversalSearchFacetConstantSchema,
)({
  tenants: "tenants",
  users: "users",
  featureFlags: "featureFlags",
  configKeys: "configKeys",
  auditEvents: "auditEvents",
  invoices: "invoices",
  webhooks: "webhooks",
  customDomains: "customDomains",
} satisfies Schema.Schema.Type<typeof UniversalSearchFacetConstantSchema>);

export const universalSearchFacets = [
  universalSearchFacet.tenants,
  universalSearchFacet.users,
  universalSearchFacet.featureFlags,
  universalSearchFacet.configKeys,
  universalSearchFacet.auditEvents,
  universalSearchFacet.invoices,
  universalSearchFacet.webhooks,
  universalSearchFacet.customDomains,
] as const;

export const UniversalSearchFacetSchema = Schema.Literal(
  ...universalSearchFacets,
);

export type UniversalSearchFacet = Schema.Schema.Type<
  typeof UniversalSearchFacetSchema
>;

// ---------------------------------------------------------------------------
// Omnibar prefix filter (mirrors admin-app spec.md prefixes:
// `t/ f/ c/ u/ inv/ d/ kc/ ev/`)
// ---------------------------------------------------------------------------

const UniversalSearchPrefixConstantSchema = Schema.Struct({
  tenant: Schema.Literal("t"),
  flag: Schema.Literal("f"),
  config: Schema.Literal("c"),
  user: Schema.Literal("u"),
  invoice: Schema.Literal("inv"),
  domain: Schema.Literal("d"),
  keycloakUser: Schema.Literal("kc"),
  event: Schema.Literal("ev"),
});

export const universalSearchPrefix = Schema.validateSync(
  UniversalSearchPrefixConstantSchema,
)({
  tenant: "t",
  flag: "f",
  config: "c",
  user: "u",
  invoice: "inv",
  domain: "d",
  keycloakUser: "kc",
  event: "ev",
} satisfies Schema.Schema.Type<typeof UniversalSearchPrefixConstantSchema>);

export const universalSearchPrefixes = [
  universalSearchPrefix.tenant,
  universalSearchPrefix.flag,
  universalSearchPrefix.config,
  universalSearchPrefix.user,
  universalSearchPrefix.invoice,
  universalSearchPrefix.domain,
  universalSearchPrefix.keycloakUser,
  universalSearchPrefix.event,
] as const;

export const UniversalSearchPrefixSchema = Schema.Literal(
  ...universalSearchPrefixes,
);

export type UniversalSearchPrefix = Schema.Schema.Type<
  typeof UniversalSearchPrefixSchema
>;

// ---------------------------------------------------------------------------
// Scope-tag (governs which permalink shell the omnibar should
// navigate into).
// ---------------------------------------------------------------------------

const UniversalSearchScopeTagConstantSchema = Schema.Struct({
  global: Schema.Literal("global"),
  adminOrg: Schema.Literal("admin-org"),
  tenant: Schema.Literal("tenant"),
});

export const universalSearchScopeTag = Schema.validateSync(
  UniversalSearchScopeTagConstantSchema,
)({
  global: "global",
  adminOrg: "admin-org",
  tenant: "tenant",
} satisfies Schema.Schema.Type<typeof UniversalSearchScopeTagConstantSchema>);

export const universalSearchScopeTags = [
  universalSearchScopeTag.global,
  universalSearchScopeTag.adminOrg,
  universalSearchScopeTag.tenant,
] as const;

export const UniversalSearchScopeTagSchema = Schema.Literal(
  ...universalSearchScopeTags,
);

export type UniversalSearchScopeTag = Schema.Schema.Type<
  typeof UniversalSearchScopeTagSchema
>;

// ---------------------------------------------------------------------------
// Result envelope
// ---------------------------------------------------------------------------

/**
 * Field classification carried alongside each entry so the
 * caller (admin omnibar) can render the right pill, and so the
 * service-side field-security pass can be unit-tested against
 * the canonical vocabulary. The platform service decodes against
 * `DataClassificationSchema` upstream and writes the resolved
 * label here.
 */
export const UniversalSearchEntrySchema = Schema.Struct({
  facet: UniversalSearchFacetSchema,
  id: Schema.NonEmptyString,
  label: Schema.NonEmptyString,
  subtitle: Schema.optional(Schema.String),
  scopeTag: UniversalSearchScopeTagSchema,
  permalink: Schema.NonEmptyString,
  fieldClassification: Schema.NonEmptyString,
  redactedBy: Schema.optional(Schema.NonEmptyString),
  metadataDigest: Schema.optional(Schema.NonEmptyString),
});

export type UniversalSearchEntry = Schema.Schema.Type<
  typeof UniversalSearchEntrySchema
>;

export const UniversalSearchEntryListSchema = Schema.Array(
  UniversalSearchEntrySchema,
);

export type UniversalSearchEntryList = Schema.Schema.Type<
  typeof UniversalSearchEntryListSchema
>;

// ---------------------------------------------------------------------------
// Partial failures
// ---------------------------------------------------------------------------

export const UniversalSearchPartialFailureSchema = Schema.Struct({
  facet: UniversalSearchFacetSchema,
  reason: Schema.NonEmptyString,
  fieldSecurityFiltered: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  ),
});

export type UniversalSearchPartialFailure = Schema.Schema.Type<
  typeof UniversalSearchPartialFailureSchema
>;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const PerFacetLimitSchema = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(1),
  Schema.lessThanOrEqualTo(50),
);

export const UniversalSearchQueryInputSchema = Schema.Struct({
  query: Schema.NonEmptyString,
  facets: Schema.optional(Schema.Array(UniversalSearchFacetSchema)),
  perFacetLimit: Schema.optional(PerFacetLimitSchema),
  prefixFilter: Schema.optional(UniversalSearchPrefixSchema),
  reasonCatalogId: Schema.NonEmptyString,
});

export type UniversalSearchQueryInput = Schema.Schema.Type<
  typeof UniversalSearchQueryInputSchema
>;

export const UniversalSearchReindexInputSchema = Schema.Struct({
  facet: Schema.optional(UniversalSearchFacetSchema),
  reasonCatalogId: Schema.NonEmptyString,
  /**
   * High-risk attachment text required by the reason-catalog registry
   * entry for `reasonCatalogId.universalSearchReindex`
   * (`requiresAttachment: true`). Operators MUST link a runbook URL,
   * ticket id, or incident reference so the audit row records the
   * originating compliance evidence. Whitespace-only values are
   * rejected at the service boundary with
   * `UniversalSearchReasonAttachmentRequired`.
   */
  reasonAttachmentText: Schema.NonEmptyString,
});

export type UniversalSearchReindexInput = Schema.Schema.Type<
  typeof UniversalSearchReindexInputSchema
>;

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export const UniversalSearchIndexFreshnessSchema = Schema.Struct({
  lastReindexedAt: IsoTimestampSchema,
  isFresh: Schema.Boolean,
});

export type UniversalSearchIndexFreshness = Schema.Schema.Type<
  typeof UniversalSearchIndexFreshnessSchema
>;

export const UniversalSearchResultSchema = Schema.Struct({
  query: Schema.NonEmptyString,
  entries: UniversalSearchEntryListSchema,
  partialFailures: Schema.Array(UniversalSearchPartialFailureSchema),
  indexFreshness: UniversalSearchIndexFreshnessSchema,
  correlationId: Schema.NonEmptyString,
  generatedAt: IsoTimestampSchema,
});

export type UniversalSearchResult = Schema.Schema.Type<
  typeof UniversalSearchResultSchema
>;

// ---------------------------------------------------------------------------
// Target scope context (unused at top level today but ships for
// admin-org vs platform tenant pivots in the result envelope).
// ---------------------------------------------------------------------------

export const UniversalSearchActorScopeSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type UniversalSearchActorScope = Schema.Schema.Type<
  typeof UniversalSearchActorScopeSchema
>;
