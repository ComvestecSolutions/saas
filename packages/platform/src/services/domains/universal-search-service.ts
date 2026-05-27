/**
 * Universal omnibar search platform service (admin-app
 * implementation plan §9 item 11). Composes the
 * {@link AuditLogModule} with an injected {@link MeilisearchAdminClient}
 * port (Context.Tag — tests inject directly; the env-bound default
 * Layer wraps the existing {@link MeilisearchAdapter} via
 * `platformAdapterServiceName.meilisearch`) and an injected
 * {@link UniversalSearchFieldSecurityPort} port (Context.Tag —
 * default is a pass-through boundary that stays safe for the
 * current slice because search authz admits only
 * `platform-operator` and `support-operator` actors, and the live
 * facets in this slice project no `secret` fields. The service
 * still calls the port before results leave the boundary so a
 * future shared row-redaction surface can replace it without
 * changing transport code).
 *
 * Owner-locked invariants enforced here (NOT in the HTTP transport,
 * NOT in the per-facet adapter call):
 *
 *   - **Operator-only authz**: every `search` / `requestReindex`
 *     requires `actorType.platformOperator` OR
 *     `actorType.supportOperator`; anonymous → `UniversalSearchUnauthorized`;
 *     missing `actorId` → `UniversalSearchMissingActorIdentity`.
 *     `requestReindex` is `platformOperator` only — `supportOperator`
 *     is rejected.
 *   - **Reason-catalog decode + action gating**: every search /
 *     reindex decodes its `reasonCatalogId` against
 *     `ReasonCatalogIdSchema` and then enforces
 *     `validateReasonForAction(reasonId, auditAction)` so the
 *     operator-supplied reason actually gates the action being
 *     performed (search → `queryExecuted`, reindex →
 *     `reindexRequested`). Mismatches surface as
 *     {@link UniversalSearchReasonActionMismatch}.
 *   - **Federated, partial-failure tolerant aggregate v2**: every
 *     facet runs in parallel via `Effect.all({ concurrency:
 *     'unbounded' })` wrapped per-branch in `Effect.either`. Per-
 *     facet failures degrade to a `partialFailures` entry; the
 *     aggregate only fails with
 *     `UniversalSearchAllFacetsFailedError` when EVERY facet fails.
 *   - **Audit emission**: every successful `search` (even partial)
 *     appends ONE `universalSearchAuditAction.queryExecuted` event;
 *     every successful `requestReindex` appends ONE
 *     `universalSearchAuditAction.reindexRequested` event. Audit
 *     is suppressed on full all-facets-failed and on authz / reason
 *     rejections.
 *   - **Bounded result cache**: keyed by
 *     `${actorScope}|${query}|${facets.join(',')}|${prefix ?? ''}|${limit}`
 *     and bounded by `cacheMaxSize` with `cacheTtlSeconds`
 *     freshness, insertion-order eviction.
 *   - **Field-security at the SERVICE boundary**: each row is
 *     redacted via the {@link UniversalSearchFieldSecurityPort}
 *     BEFORE the envelope leaves the service. Rows the actor
 *     cannot see are filtered out and the count is surfaced as
 *     `partialFailures[].fieldSecurityFiltered` against the
 *     owning facet.
 *   - **perFacetLimit clamping**: caller-supplied `perFacetLimit`
 *     is clamped to `perFacetLimitMax` at the SERVICE layer
 *     regardless of the contract 1..50 boundary.
 *
 * Runtime config: `runUniversalSearchFromEnvironment` decodes
 * `POSTGRES_URL` + `MEILISEARCH_URL` + `MEILISEARCH_MASTER_KEY` +
 * five `UNIVERSAL_SEARCH_*` numeric keys at the boundary with NO
 * local fallbacks.
 */
import { and, desc, eq, ilike, isNotNull, isNull, or } from "drizzle-orm";
import {
  Context,
  Effect,
  Either,
  Layer,
  Option,
  ParseResult,
  Schema,
} from "effect";
import { platformModuleManifests } from "@comvestec/config";
import {
  actorType,
  adminRoutePath,
  dataClassification,
  getReasonCatalogEntry,
  platformModuleId,
  ReasonCatalogIdSchema,
  validateReasonForAction,
  type AuditAction,
  type ReasonCatalogId,
  RequestContextSchema,
  universalSearchAuditAction,
  universalSearchFacet,
  universalSearchScopeTag,
  UniversalSearchEntrySchema,
  UniversalSearchQueryInputSchema,
  UniversalSearchReindexInputSchema,
  type RequestContext,
  type UniversalSearchEntry,
  type UniversalSearchFacet,
  type UniversalSearchPartialFailure,
  type UniversalSearchPrefix,
  type UniversalSearchQueryInput,
  type UniversalSearchReindexInput,
  type UniversalSearchResult,
} from "@comvestec/contracts";
import {
  adminMembersTable,
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  AuditLogPostgresRepository,
  billingCustomerAccountsTable,
  billingPaymentEventsTable,
  billingSubscriptionsTable,
  isIndexFresh,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
  resolvePrefixToFacets,
  searchTenantIndexesTable,
  tenantBrandingDomainVerificationTable,
  tenantOnboardingRunsTable,
  tenantProvisioningReceiptsTable,
  webhookSubscriptionsTable,
} from "@comvestec/modules";
import {
  makeMeilisearchAdapter,
  MeilisearchAdapter,
  type MeilisearchAdapterError,
  type MeilisearchAdapterService,
} from "../../adapters/search/meilisearch";
import {
  makePostgresAdapter,
  type PostgresAdapterConnectionError,
  type PostgresRuntimeDatabase,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

type Operation = "search" | "searchFacet" | "requestReindex";

export class UniversalSearchUnauthorized {
  readonly _tag = "UniversalSearchUnauthorized" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly requestingActorId?: string;
      readonly requestingActorType: string;
    },
  ) {}
}

export class UniversalSearchMissingActorIdentity {
  readonly _tag = "UniversalSearchMissingActorIdentity" as const;
  constructor(readonly args: { readonly operation: Operation }) {}
}

export class UniversalSearchReasonNotInCatalog {
  readonly _tag = "UniversalSearchReasonNotInCatalog" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: string;
    },
  ) {}
}

export class UniversalSearchReasonActionMismatch {
  readonly _tag = "UniversalSearchReasonActionMismatch" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: ReasonCatalogId;
      readonly auditAction: AuditAction;
    },
  ) {}
}

export class UniversalSearchReasonAttachmentRequired {
  readonly _tag = "UniversalSearchReasonAttachmentRequired" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: ReasonCatalogId;
    },
  ) {}
}

export class UniversalSearchFacetIndexMissing {
  readonly _tag = "UniversalSearchFacetIndexMissing" as const;
  constructor(
    readonly args: {
      readonly facet: UniversalSearchFacet;
      readonly indexName: string;
    },
  ) {}
}

export class UniversalSearchFacetAdapterError {
  readonly _tag = "UniversalSearchFacetAdapterError" as const;
  constructor(
    readonly args: {
      readonly facet: UniversalSearchFacet;
      readonly cause: unknown;
    },
  ) {}
}

export type UniversalSearchFacetError =
  | UniversalSearchFacetIndexMissing
  | UniversalSearchFacetAdapterError;

export class UniversalSearchAllFacetsFailedError {
  readonly _tag = "UniversalSearchAllFacetsFailedError" as const;
  constructor(
    readonly args: {
      readonly failures: ReadonlyArray<UniversalSearchPartialFailure>;
    },
  ) {}
}

export type UniversalSearchServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | UniversalSearchUnauthorized
  | UniversalSearchMissingActorIdentity
  | UniversalSearchReasonNotInCatalog
  | UniversalSearchReasonActionMismatch
  | UniversalSearchAllFacetsFailedError;

export type UniversalSearchReindexServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | UniversalSearchUnauthorized
  | UniversalSearchMissingActorIdentity
  | UniversalSearchReasonNotInCatalog
  | UniversalSearchReasonActionMismatch
  | UniversalSearchReasonAttachmentRequired
  | UniversalSearchFacetAdapterError;

// ---------------------------------------------------------------------------
// MeilisearchAdminClient port (Context.Tag — tests inject directly;
// the env-bound default Layer wraps the existing MeilisearchAdapter)
// ---------------------------------------------------------------------------

export type MeilisearchAdminClientService = {
  readonly searchFacet: (input: {
    readonly facet: UniversalSearchFacet;
    readonly query: string;
    readonly limit: number;
  }) => Effect.Effect<
    ReadonlyArray<UniversalSearchEntry>,
    UniversalSearchFacetError
  >;
  readonly requestReindex: (input: {
    readonly facet?: UniversalSearchFacet;
  }) => Effect.Effect<void, UniversalSearchFacetAdapterError>;
  readonly lastReindexedAt: () => Effect.Effect<string>;
};

export class MeilisearchAdminClient extends Context.Tag(
  "MeilisearchAdminClient",
)<MeilisearchAdminClient, MeilisearchAdminClientService>() {}

const normalizeSearchQuery = (query: string): string =>
  query.trim().toLocaleLowerCase();

const buildSearchPattern = (query: string): string =>
  `%${query.trim().replace(/\s+/g, "%")}%`;

const toTimestampDigest = (
  value: Date | null | undefined,
): string | undefined => value?.toISOString();

const resolveTenantWorkspacePermalink = (tenantId: string): string =>
  adminRoutePath.tenantWorkspace.replace(
    "$tenantId",
    encodeURIComponent(tenantId),
  );

const computeEntryRank = (
  entry: UniversalSearchEntry,
  normalizedQuery: string,
): number => {
  if (normalizedQuery.length === 0) {
    return 0;
  }

  const id = entry.id.toLocaleLowerCase();
  const label = entry.label.toLocaleLowerCase();
  const subtitle = entry.subtitle?.toLocaleLowerCase();
  const metadataDigest = entry.metadataDigest?.toLocaleLowerCase();

  if (label === normalizedQuery || id === normalizedQuery) {
    return 5;
  }
  if (label.startsWith(normalizedQuery) || id.startsWith(normalizedQuery)) {
    return 4;
  }
  if (label.includes(normalizedQuery) || id.includes(normalizedQuery)) {
    return 3;
  }
  if (subtitle?.includes(normalizedQuery) === true) {
    return 2;
  }
  if (metadataDigest?.includes(normalizedQuery) === true) {
    return 1;
  }
  return 0;
};

const rankEntries = (
  entries: ReadonlyArray<UniversalSearchEntry>,
  query: string,
  limit: number,
): ReadonlyArray<UniversalSearchEntry> => {
  const normalizedQuery = normalizeSearchQuery(query);

  return entries
    .map((entry, index) => ({
      entry,
      index,
      rank: computeEntryRank(entry, normalizedQuery),
    }))
    .filter(({ rank }) => rank > 0)
    .sort((left, right) => right.rank - left.rank || left.index - right.index)
    .slice(0, limit)
    .map(({ entry }) => entry);
};

const mergeUniqueEntries = (
  lists: ReadonlyArray<ReadonlyArray<UniversalSearchEntry>>,
  query: string,
  limit: number,
): ReadonlyArray<UniversalSearchEntry> => {
  const merged: UniversalSearchEntry[] = [];
  const seen = new Set<string>();

  for (const list of lists) {
    for (const entry of list) {
      const key = `${entry.facet}:${entry.id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(entry);
    }
  }

  return rankEntries(merged, query, limit);
};

/**
 * Default {@link MeilisearchAdminClient} implementation. Search reads
 * live operator data directly from PostgreSQL-backed platform state
 * plus the shared module manifest registry so the admin omnibar no
 * longer depends on the prior healthcheck-backed empty-result stub.
 *
 * The reindex path intentionally remains a Meilisearch credential
 * probe until the cross-facet reindex orchestration is documented.
 */
export const makeDefaultMeilisearchAdminClient = (deps: {
  readonly adapter: MeilisearchAdapterService;
  readonly database: PostgresRuntimeDatabase;
}): MeilisearchAdminClientService => {
  const { adapter, database } = deps;

  const probe = (facet: UniversalSearchFacet) =>
    adapter.healthcheck.pipe(
      Effect.mapError(
        (cause): UniversalSearchFacetAdapterError =>
          new UniversalSearchFacetAdapterError({ facet, cause }),
      ),
    );

  const searchTenants = (input: {
    readonly query: string;
    readonly limit: number;
  }) =>
    Effect.tryPromise({
      try: async () => {
        const pattern = buildSearchPattern(input.query);
        const candidateLimit = Math.max(input.limit * 3, input.limit + 4);

        const [
          onboardingRows,
          provisioningRows,
          subscriptionRows,
          accountRows,
          domainRows,
          webhookRows,
        ] = await Promise.all([
          database
            .select({
              tenantScope: tenantOnboardingRunsTable.tenantScope,
              tenantScopeId: tenantOnboardingRunsTable.tenantScopeId,
              status: tenantOnboardingRunsTable.status,
              startedAt: tenantOnboardingRunsTable.startedAt,
            })
            .from(tenantOnboardingRunsTable)
            .where(ilike(tenantOnboardingRunsTable.tenantScopeId, pattern))
            .orderBy(desc(tenantOnboardingRunsTable.startedAt))
            .limit(candidateLimit),
          database
            .select({
              tenantScope: tenantProvisioningReceiptsTable.tenantScope,
              tenantScopeId: tenantProvisioningReceiptsTable.tenantScopeId,
              status: tenantProvisioningReceiptsTable.status,
              updatedAt: tenantProvisioningReceiptsTable.updatedAt,
            })
            .from(tenantProvisioningReceiptsTable)
            .where(
              ilike(tenantProvisioningReceiptsTable.tenantScopeId, pattern),
            )
            .orderBy(desc(tenantProvisioningReceiptsTable.updatedAt))
            .limit(candidateLimit),
          database
            .select({
              scope: billingSubscriptionsTable.scope,
              scopeId: billingSubscriptionsTable.scopeId,
              planId: billingSubscriptionsTable.planId,
              status: billingSubscriptionsTable.status,
              provider: billingSubscriptionsTable.provider,
              updatedAt: billingSubscriptionsTable.updatedAt,
            })
            .from(billingSubscriptionsTable)
            .where(ilike(billingSubscriptionsTable.scopeId, pattern))
            .orderBy(desc(billingSubscriptionsTable.updatedAt))
            .limit(candidateLimit),
          database
            .select({
              scope: billingCustomerAccountsTable.scope,
              scopeId: billingCustomerAccountsTable.scopeId,
              email: billingCustomerAccountsTable.email,
              status: billingCustomerAccountsTable.status,
              provider: billingCustomerAccountsTable.provider,
              updatedAt: billingCustomerAccountsTable.updatedAt,
            })
            .from(billingCustomerAccountsTable)
            .where(
              or(
                ilike(billingCustomerAccountsTable.scopeId, pattern),
                ilike(billingCustomerAccountsTable.email, pattern),
              ),
            )
            .orderBy(desc(billingCustomerAccountsTable.updatedAt))
            .limit(candidateLimit),
          database
            .select({
              scope: tenantBrandingDomainVerificationTable.scope,
              scopeId: tenantBrandingDomainVerificationTable.scopeId,
              requestedHost:
                tenantBrandingDomainVerificationTable.requestedHost,
              lifecycleState:
                tenantBrandingDomainVerificationTable.lifecycleState,
              changedAt: tenantBrandingDomainVerificationTable.changedAt,
            })
            .from(tenantBrandingDomainVerificationTable)
            .where(
              or(
                ilike(tenantBrandingDomainVerificationTable.scopeId, pattern),
                ilike(
                  tenantBrandingDomainVerificationTable.requestedHost,
                  pattern,
                ),
              ),
            )
            .orderBy(desc(tenantBrandingDomainVerificationTable.changedAt))
            .limit(candidateLimit),
          database
            .select({
              scope: webhookSubscriptionsTable.scope,
              scopeId: webhookSubscriptionsTable.scopeId,
              url: webhookSubscriptionsTable.url,
              status: webhookSubscriptionsTable.status,
              updatedAt: webhookSubscriptionsTable.updatedAt,
            })
            .from(webhookSubscriptionsTable)
            .where(
              or(
                ilike(webhookSubscriptionsTable.scopeId, pattern),
                ilike(webhookSubscriptionsTable.url, pattern),
              ),
            )
            .orderBy(desc(webhookSubscriptionsTable.updatedAt))
            .limit(candidateLimit),
        ]);

        return mergeUniqueEntries(
          [
            onboardingRows.map((row) => ({
              facet: universalSearchFacet.tenants,
              id: row.tenantScopeId,
              label: row.tenantScopeId,
              subtitle: `${row.tenantScope} onboarding ${row.status}`,
              scopeTag: universalSearchScopeTag.tenant,
              permalink: resolveTenantWorkspacePermalink(row.tenantScopeId),
              fieldClassification: dataClassification.tenantConfidential,
              metadataDigest: toTimestampDigest(row.startedAt),
            })),
            provisioningRows.map((row) => ({
              facet: universalSearchFacet.tenants,
              id: row.tenantScopeId,
              label: row.tenantScopeId,
              subtitle: `${row.tenantScope} provisioning ${row.status}`,
              scopeTag: universalSearchScopeTag.tenant,
              permalink: resolveTenantWorkspacePermalink(row.tenantScopeId),
              fieldClassification: dataClassification.tenantConfidential,
              metadataDigest: toTimestampDigest(row.updatedAt),
            })),
            subscriptionRows.map((row) => ({
              facet: universalSearchFacet.tenants,
              id: row.scopeId,
              label: row.scopeId,
              subtitle: `${row.scope} subscription ${row.status} · ${row.planId}`,
              scopeTag: universalSearchScopeTag.tenant,
              permalink: resolveTenantWorkspacePermalink(row.scopeId),
              fieldClassification: dataClassification.tenantConfidential,
              metadataDigest:
                `${row.provider} ${toTimestampDigest(row.updatedAt) ?? ""}`.trim(),
            })),
            accountRows.map((row) => ({
              facet: universalSearchFacet.tenants,
              id: row.scopeId,
              label: row.scopeId,
              subtitle: `${row.scope} billing account ${row.status}${row.email === null || row.email === undefined ? "" : ` · ${row.email}`}`,
              scopeTag: universalSearchScopeTag.tenant,
              permalink: resolveTenantWorkspacePermalink(row.scopeId),
              fieldClassification: dataClassification.tenantConfidential,
              metadataDigest:
                `${row.provider} ${toTimestampDigest(row.updatedAt) ?? ""}`.trim(),
            })),
            domainRows.map((row) => ({
              facet: universalSearchFacet.tenants,
              id: row.scopeId,
              label: row.scopeId,
              subtitle: `${row.scope} domain ${row.requestedHost} · ${row.lifecycleState}`,
              scopeTag: universalSearchScopeTag.tenant,
              permalink: resolveTenantWorkspacePermalink(row.scopeId),
              fieldClassification: dataClassification.tenantConfidential,
              metadataDigest: toTimestampDigest(row.changedAt),
            })),
            webhookRows.map((row) => ({
              facet: universalSearchFacet.tenants,
              id: row.scopeId,
              label: row.scopeId,
              subtitle: `${row.scope} webhook ${row.status} · ${row.url}`,
              scopeTag: universalSearchScopeTag.tenant,
              permalink: resolveTenantWorkspacePermalink(row.scopeId),
              fieldClassification: dataClassification.tenantConfidential,
              metadataDigest: toTimestampDigest(row.updatedAt),
            })),
          ],
          input.query,
          input.limit,
        );
      },
      catch: (cause): UniversalSearchFacetAdapterError =>
        new UniversalSearchFacetAdapterError({
          facet: universalSearchFacet.tenants,
          cause,
        }),
    });

  const searchUsers = (input: {
    readonly query: string;
    readonly limit: number;
  }) =>
    Effect.tryPromise({
      try: async () => {
        const pattern = buildSearchPattern(input.query);
        const rows = await database
          .select({
            id: adminMembersTable.id,
            keycloakSubjectId: adminMembersTable.keycloakSubjectId,
            email: adminMembersTable.email,
            displayName: adminMembersTable.displayName,
            role: adminMembersTable.role,
            status: adminMembersTable.status,
            updatedAt: adminMembersTable.updatedAt,
          })
          .from(adminMembersTable)
          .where(
            and(
              isNull(adminMembersTable.archivedAt),
              or(
                ilike(adminMembersTable.displayName, pattern),
                ilike(adminMembersTable.email, pattern),
                ilike(adminMembersTable.keycloakSubjectId, pattern),
              ),
            ),
          )
          .orderBy(desc(adminMembersTable.updatedAt))
          .limit(Math.max(input.limit * 2, input.limit + 2));

        return rankEntries(
          rows.map((row) => ({
            facet: universalSearchFacet.users,
            id: row.id,
            label: row.displayName,
            subtitle: `${row.email} · ${row.role} · ${row.status}`,
            scopeTag: universalSearchScopeTag.adminOrg,
            permalink: adminRoutePath.accessControl,
            fieldClassification: dataClassification.regulatedSensitive,
            metadataDigest:
              `${row.keycloakSubjectId ?? ""} ${toTimestampDigest(row.updatedAt) ?? ""}`.trim(),
          })),
          input.query,
          input.limit,
        );
      },
      catch: (cause): UniversalSearchFacetAdapterError =>
        new UniversalSearchFacetAdapterError({
          facet: universalSearchFacet.users,
          cause,
        }),
    });

  const searchFeatureFlags = (input: {
    readonly query: string;
    readonly limit: number;
  }) =>
    Effect.succeed(
      rankEntries(
        platformModuleManifests.flatMap((manifest) =>
          manifest.featureFlags.map((flag) => ({
            facet: universalSearchFacet.featureFlags,
            id: flag.key,
            label: flag.key,
            subtitle: flag.description,
            scopeTag: universalSearchScopeTag.global,
            permalink: adminRoutePath.featureFlags,
            fieldClassification: dataClassification.internal,
            metadataDigest: [
              manifest.moduleId,
              flag.owner,
              flag.purpose,
              flag.lifecycle,
              ...flag.dependencies,
            ].join(" "),
          })),
        ),
        input.query,
        input.limit,
      ),
    );

  const searchConfigKeys = (input: {
    readonly query: string;
    readonly limit: number;
  }) =>
    Effect.succeed(
      rankEntries(
        platformModuleManifests.flatMap((manifest) =>
          manifest.configKeys.map((configKey) => ({
            facet: universalSearchFacet.configKeys,
            id: configKey.key,
            label: configKey.key,
            subtitle: configKey.description,
            scopeTag: universalSearchScopeTag.global,
            permalink: adminRoutePath.runtimeConfig,
            fieldClassification: dataClassification.internal,
            metadataDigest: [
              manifest.moduleId,
              configKey.owner,
              configKey.schema,
              ...configKey.allowedScopes,
            ].join(" "),
          })),
        ),
        input.query,
        input.limit,
      ),
    );

  const searchAuditEvents = (input: {
    readonly query: string;
    readonly limit: number;
  }) =>
    Effect.tryPromise({
      try: async () => {
        const pattern = buildSearchPattern(input.query);
        const rows = await database
          .select({
            eventId: auditLogEventsTable.eventId,
            moduleId: auditLogEventsTable.moduleId,
            action: auditLogEventsTable.action,
            target: auditLogEventsTable.target,
            actorId: auditLogEventsTable.actorId,
            tenantScopeId: auditLogEventsTable.tenantScopeId,
            reason: auditLogEventsTable.reason,
            correlationId: auditLogEventsTable.correlationId,
            recordedAt: auditLogEventsTable.recordedAt,
          })
          .from(auditLogEventsTable)
          .where(
            or(
              ilike(auditLogEventsTable.moduleId, pattern),
              ilike(auditLogEventsTable.action, pattern),
              ilike(auditLogEventsTable.target, pattern),
              ilike(auditLogEventsTable.actorId, pattern),
              ilike(auditLogEventsTable.reason, pattern),
              ilike(auditLogEventsTable.tenantScopeId, pattern),
              ilike(auditLogEventsTable.correlationId, pattern),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt))
          .limit(Math.max(input.limit * 2, input.limit + 2));

        return rankEntries(
          rows.map((row) => ({
            facet: universalSearchFacet.auditEvents,
            id: row.eventId,
            label: `${row.moduleId} · ${row.action}`,
            subtitle: `${row.target} · ${row.actorId}`,
            scopeTag: universalSearchScopeTag.global,
            permalink: adminRoutePath.auditLog,
            fieldClassification: dataClassification.internal,
            metadataDigest: [
              row.reason ?? "",
              row.tenantScopeId,
              row.correlationId ?? "",
              toTimestampDigest(row.recordedAt) ?? "",
            ].join(" "),
          })),
          input.query,
          input.limit,
        );
      },
      catch: (cause): UniversalSearchFacetAdapterError =>
        new UniversalSearchFacetAdapterError({
          facet: universalSearchFacet.auditEvents,
          cause,
        }),
    });

  const searchInvoices = (input: {
    readonly query: string;
    readonly limit: number;
  }) =>
    Effect.tryPromise({
      try: async () => {
        const pattern = buildSearchPattern(input.query);
        const rows = await database
          .select({
            eventId: billingPaymentEventsTable.eventId,
            provider: billingPaymentEventsTable.provider,
            providerEventId: billingPaymentEventsTable.providerEventId,
            scopeId: billingPaymentEventsTable.scopeId,
            eventType: billingPaymentEventsTable.eventType,
            status: billingPaymentEventsTable.status,
            amountMinor: billingPaymentEventsTable.amountMinor,
            currency: billingPaymentEventsTable.currency,
            recordedAt: billingPaymentEventsTable.recordedAt,
          })
          .from(billingPaymentEventsTable)
          .where(
            or(
              ilike(billingPaymentEventsTable.providerEventId, pattern),
              ilike(billingPaymentEventsTable.eventId, pattern),
              ilike(billingPaymentEventsTable.eventType, pattern),
              ilike(billingPaymentEventsTable.status, pattern),
              ilike(billingPaymentEventsTable.scopeId, pattern),
              ilike(billingPaymentEventsTable.provider, pattern),
            ),
          )
          .orderBy(desc(billingPaymentEventsTable.recordedAt))
          .limit(Math.max(input.limit * 2, input.limit + 2));

        return rankEntries(
          rows.map((row) => ({
            facet: universalSearchFacet.invoices,
            id: row.eventId,
            label: row.providerEventId,
            subtitle: [
              row.status,
              row.eventType,
              row.scopeId ?? row.provider,
              row.amountMinor === null || row.amountMinor === undefined
                ? undefined
                : `${row.amountMinor}${row.currency === null || row.currency === undefined ? "" : ` ${row.currency}`}`,
            ]
              .filter((part): part is string => part !== undefined)
              .join(" · "),
            scopeTag:
              row.scopeId === null || row.scopeId === undefined
                ? universalSearchScopeTag.global
                : universalSearchScopeTag.tenant,
            permalink: adminRoutePath.billing,
            fieldClassification:
              row.scopeId === null || row.scopeId === undefined
                ? dataClassification.internal
                : dataClassification.tenantConfidential,
            metadataDigest:
              `${row.provider} ${toTimestampDigest(row.recordedAt) ?? ""}`.trim(),
          })),
          input.query,
          input.limit,
        );
      },
      catch: (cause): UniversalSearchFacetAdapterError =>
        new UniversalSearchFacetAdapterError({
          facet: universalSearchFacet.invoices,
          cause,
        }),
    });

  const searchWebhooks = (input: {
    readonly query: string;
    readonly limit: number;
  }) =>
    Effect.tryPromise({
      try: async () => {
        const pattern = buildSearchPattern(input.query);
        const rows = await database
          .select({
            subscriptionId: webhookSubscriptionsTable.subscriptionId,
            scope: webhookSubscriptionsTable.scope,
            scopeId: webhookSubscriptionsTable.scopeId,
            url: webhookSubscriptionsTable.url,
            events: webhookSubscriptionsTable.events,
            status: webhookSubscriptionsTable.status,
            updatedAt: webhookSubscriptionsTable.updatedAt,
          })
          .from(webhookSubscriptionsTable)
          .where(
            or(
              ilike(webhookSubscriptionsTable.subscriptionId, pattern),
              ilike(webhookSubscriptionsTable.scopeId, pattern),
              ilike(webhookSubscriptionsTable.url, pattern),
              ilike(webhookSubscriptionsTable.status, pattern),
            ),
          )
          .orderBy(desc(webhookSubscriptionsTable.updatedAt))
          .limit(Math.max(input.limit * 2, input.limit + 2));

        return rankEntries(
          rows.map((row) => ({
            facet: universalSearchFacet.webhooks,
            id: row.subscriptionId,
            label: row.subscriptionId,
            subtitle: `${row.status} · ${row.url}`,
            scopeTag: universalSearchScopeTag.tenant,
            permalink: adminRoutePath.webhooksApiAccess,
            fieldClassification: dataClassification.tenantConfidential,
            metadataDigest: [
              row.scope,
              row.scopeId,
              ...row.events,
              toTimestampDigest(row.updatedAt) ?? "",
            ].join(" "),
          })),
          input.query,
          input.limit,
        );
      },
      catch: (cause): UniversalSearchFacetAdapterError =>
        new UniversalSearchFacetAdapterError({
          facet: universalSearchFacet.webhooks,
          cause,
        }),
    });

  const searchCustomDomains = (input: {
    readonly query: string;
    readonly limit: number;
  }) =>
    Effect.tryPromise({
      try: async () => {
        const pattern = buildSearchPattern(input.query);
        const rows = await database
          .select({
            verificationId:
              tenantBrandingDomainVerificationTable.verificationId,
            scope: tenantBrandingDomainVerificationTable.scope,
            scopeId: tenantBrandingDomainVerificationTable.scopeId,
            requestedHost: tenantBrandingDomainVerificationTable.requestedHost,
            lifecycleState:
              tenantBrandingDomainVerificationTable.lifecycleState,
            changedAt: tenantBrandingDomainVerificationTable.changedAt,
          })
          .from(tenantBrandingDomainVerificationTable)
          .where(
            or(
              ilike(
                tenantBrandingDomainVerificationTable.requestedHost,
                pattern,
              ),
              ilike(tenantBrandingDomainVerificationTable.scopeId, pattern),
              ilike(
                tenantBrandingDomainVerificationTable.lifecycleState,
                pattern,
              ),
            ),
          )
          .orderBy(desc(tenantBrandingDomainVerificationTable.changedAt))
          .limit(Math.max(input.limit * 2, input.limit + 2));

        return rankEntries(
          rows.map((row) => ({
            facet: universalSearchFacet.customDomains,
            id: row.verificationId,
            label: row.requestedHost,
            subtitle: `${row.scope} ${row.scopeId} · ${row.lifecycleState}`,
            scopeTag: universalSearchScopeTag.tenant,
            permalink: adminRoutePath.branding,
            fieldClassification: dataClassification.tenantConfidential,
            metadataDigest: toTimestampDigest(row.changedAt),
          })),
          input.query,
          input.limit,
        );
      },
      catch: (cause): UniversalSearchFacetAdapterError =>
        new UniversalSearchFacetAdapterError({
          facet: universalSearchFacet.customDomains,
          cause,
        }),
    });

  const searchByFacet: Record<
    UniversalSearchFacet,
    (input: {
      readonly query: string;
      readonly limit: number;
    }) => Effect.Effect<
      ReadonlyArray<UniversalSearchEntry>,
      UniversalSearchFacetAdapterError
    >
  > = {
    [universalSearchFacet.tenants]: searchTenants,
    [universalSearchFacet.users]: searchUsers,
    [universalSearchFacet.featureFlags]: searchFeatureFlags,
    [universalSearchFacet.configKeys]: searchConfigKeys,
    [universalSearchFacet.auditEvents]: searchAuditEvents,
    [universalSearchFacet.invoices]: searchInvoices,
    [universalSearchFacet.webhooks]: searchWebhooks,
    [universalSearchFacet.customDomains]: searchCustomDomains,
  };

  return {
    searchFacet: (input) => {
      const trimmedQuery = input.query.trim();
      if (trimmedQuery.length === 0) {
        return Effect.succeed([] as ReadonlyArray<UniversalSearchEntry>);
      }
      return searchByFacet[input.facet]({
        query: trimmedQuery,
        limit: input.limit,
      });
    },
    requestReindex: (input) =>
      probe(input.facet ?? universalSearchFacet.tenants).pipe(Effect.asVoid),
    lastReindexedAt: () =>
      Effect.tryPromise({
        try: async () => {
          const latestSyncedRow = await database
            .select({
              lastSyncedAt: searchTenantIndexesTable.lastSyncedAt,
            })
            .from(searchTenantIndexesTable)
            .where(isNotNull(searchTenantIndexesTable.lastSyncedAt))
            .orderBy(desc(searchTenantIndexesTable.lastSyncedAt))
            .limit(1);

          const lastSyncedAt = latestSyncedRow[0]?.lastSyncedAt;
          if (lastSyncedAt !== undefined && lastSyncedAt !== null) {
            return lastSyncedAt.toISOString();
          }

          const latestUpdatedRow = await database
            .select({
              updatedAt: searchTenantIndexesTable.updatedAt,
            })
            .from(searchTenantIndexesTable)
            .orderBy(desc(searchTenantIndexesTable.updatedAt))
            .limit(1);

          return (
            latestUpdatedRow[0]?.updatedAt?.toISOString() ??
            new Date(0).toISOString()
          );
        },
        catch: () => new Date(0).toISOString(),
      }).pipe(Effect.catchAll((fallbackIso) => Effect.succeed(fallbackIso))),
  };
};

export const makeDefaultMeilisearchAdminClientLayer = (
  database: PostgresRuntimeDatabase,
) =>
  Layer.effect(
    MeilisearchAdminClient,
    MeilisearchAdapter.pipe(
      Effect.map((adapter) =>
        makeDefaultMeilisearchAdminClient({ adapter, database }),
      ),
    ),
  );

// ---------------------------------------------------------------------------
// UniversalSearchFieldSecurityPort (Context.Tag — tests inject
// directly; default is a pass-through boundary)
// ---------------------------------------------------------------------------

export type UniversalSearchFieldSecurityResult = {
  readonly visibleEntries: ReadonlyArray<UniversalSearchEntry>;
  readonly filteredCountByFacet: ReadonlyMap<UniversalSearchFacet, number>;
};

export type UniversalSearchFieldSecurityPortService = {
  readonly applyRowSecurity: (input: {
    readonly requestContext: RequestContext;
    readonly entries: ReadonlyArray<UniversalSearchEntry>;
  }) => Effect.Effect<UniversalSearchFieldSecurityResult>;
};

export class UniversalSearchFieldSecurityPort extends Context.Tag(
  "UniversalSearchFieldSecurityPort",
)<
  UniversalSearchFieldSecurityPort,
  UniversalSearchFieldSecurityPortService
>() {}

/**
 * Default pass-through field-security port. This is truthful for the
 * current universal-search slice because:
 *
 *   - authz admits only `platform-operator` and `support-operator`
 *     request contexts, both of which are allowed to see the current
 *     indexed classifications in this slice;
 *   - the live facets project no `secret` fields;
 *   - the platform service ALWAYS calls `applyRowSecurity` BEFORE
 *     results leave the boundary, so broadening the audience or
 *     swapping to a shared row-redaction surface remains a localized
 *     port replacement.
 */
export const makeDefaultUniversalSearchFieldSecurityPort =
  (): UniversalSearchFieldSecurityPortService => ({
    applyRowSecurity: (input) =>
      Effect.succeed({
        visibleEntries: input.entries,
        filteredCountByFacet: new Map(),
      }),
  });

export const makeDefaultUniversalSearchFieldSecurityPortLayer = Layer.succeed(
  UniversalSearchFieldSecurityPort,
  makeDefaultUniversalSearchFieldSecurityPort(),
);

// ---------------------------------------------------------------------------
// Service inputs
// ---------------------------------------------------------------------------

export const UniversalSearchServiceInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: UniversalSearchQueryInputSchema,
});

export type UniversalSearchServiceInput = Schema.Schema.Type<
  typeof UniversalSearchServiceInputSchema
>;

export const UniversalSearchReindexServiceInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  query: UniversalSearchReindexInputSchema,
});

export type UniversalSearchReindexServiceInput = Schema.Schema.Type<
  typeof UniversalSearchReindexServiceInputSchema
>;

const decodeSearchInput = Schema.decodeUnknown(
  UniversalSearchServiceInputSchema,
);
const decodeReindexInput = Schema.decodeUnknown(
  UniversalSearchReindexServiceInputSchema,
);
const decodeReasonCatalogId = Schema.decodeUnknown(ReasonCatalogIdSchema);

// ---------------------------------------------------------------------------
// Authz + reason-catalog helpers
// ---------------------------------------------------------------------------

const allowedSearchActorTypes: ReadonlySet<string> = new Set([
  actorType.platformOperator,
  actorType.supportOperator,
]);

const requireSearchActor = (
  requestContext: RequestContext,
  operation: Operation,
) =>
  Effect.gen(function* () {
    if (requestContext.actorId === undefined) {
      return yield* Effect.fail(
        new UniversalSearchMissingActorIdentity({ operation }),
      );
    }
    if (!allowedSearchActorTypes.has(requestContext.actorType)) {
      return yield* Effect.fail(
        new UniversalSearchUnauthorized({
          operation,
          requestingActorId: requestContext.actorId,
          requestingActorType: requestContext.actorType,
        }),
      );
    }
    return requestContext.actorId;
  });

const requirePlatformOperatorActor = (
  requestContext: RequestContext,
  operation: Operation,
) =>
  Effect.gen(function* () {
    if (requestContext.actorId === undefined) {
      return yield* Effect.fail(
        new UniversalSearchMissingActorIdentity({ operation }),
      );
    }
    if (requestContext.actorType !== actorType.platformOperator) {
      return yield* Effect.fail(
        new UniversalSearchUnauthorized({
          operation,
          requestingActorId: requestContext.actorId,
          requestingActorType: requestContext.actorType,
        }),
      );
    }
    return requestContext.actorId;
  });

const validateReason = (
  operation: Operation,
  value: string,
  action: AuditAction,
): Effect.Effect<
  ReasonCatalogId,
  UniversalSearchReasonNotInCatalog | UniversalSearchReasonActionMismatch
> =>
  decodeReasonCatalogId(value).pipe(
    Effect.catchTag("ParseError", () =>
      Effect.fail(
        new UniversalSearchReasonNotInCatalog({
          operation,
          reasonCatalogId: value,
        }),
      ),
    ),
    Effect.flatMap((decoded) => {
      if (!validateReasonForAction(decoded, action)) {
        return Effect.fail(
          new UniversalSearchReasonActionMismatch({
            operation,
            reasonCatalogId: decoded,
            auditAction: action,
          }),
        );
      }
      return Effect.succeed(decoded);
    }),
  );

/**
 * Registry-driven attachment enforcement. The reindex reason gates
 * against `reasonCatalogId.universalSearchReindex`
 * (`requiresAttachment: true`); the read reason
 * (`universalSearchRead`) is attachment-free so this helper
 * short-circuits for search paths. Whitespace-only attachment text
 * is rejected even though the contract schema enforces
 * `Schema.NonEmptyString`.
 */
const requireAttachmentIfNeeded = (
  operation: Operation,
  reasonId: ReasonCatalogId,
  attachmentText: string,
): Effect.Effect<void, UniversalSearchReasonAttachmentRequired> => {
  const entry = getReasonCatalogEntry(reasonId);
  if (Option.isNone(entry) || !entry.value.requiresAttachment) {
    return Effect.void;
  }
  if (attachmentText.trim().length === 0) {
    return Effect.fail(
      new UniversalSearchReasonAttachmentRequired({
        operation,
        reasonCatalogId: reasonId,
      }),
    );
  }
  return Effect.void;
};

// ---------------------------------------------------------------------------
// Bounded result cache (insertion-order eviction)
// ---------------------------------------------------------------------------

type CacheEntry = {
  readonly value: UniversalSearchResult;
  readonly cachedAtIso: string;
};

type ResultCache = {
  readonly get: (key: string) => CacheEntry | undefined;
  readonly set: (key: string, entry: CacheEntry) => void;
  readonly delete: (key: string) => void;
  readonly size: () => number;
};

const createResultCache = (maxSize: number): ResultCache => {
  const store = new Map<string, CacheEntry>();
  return {
    get: (key) => store.get(key),
    set: (key, entry) => {
      if (store.has(key)) {
        store.delete(key);
      } else if (store.size >= maxSize) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) {
          store.delete(oldest);
        }
      }
      store.set(key, entry);
    },
    delete: (key) => {
      store.delete(key);
    },
    size: () => store.size,
  };
};

const buildCacheKey = (input: {
  readonly requestContext: RequestContext;
  readonly query: string;
  readonly facets: ReadonlyArray<UniversalSearchFacet>;
  readonly prefix: UniversalSearchPrefix | undefined;
  readonly limit: number;
}): string =>
  [
    input.requestContext.tenant.scope,
    input.requestContext.tenant.scopeId,
    input.query,
    [...input.facets].sort().join(","),
    input.prefix ?? "",
    String(input.limit),
  ].join("|");

// ---------------------------------------------------------------------------
// Service tag + impl
// ---------------------------------------------------------------------------

export type UniversalSearchResultView = {
  readonly result: UniversalSearchResult;
  readonly fromCache: boolean;
};

export type UniversalSearchReindexResultView = {
  readonly accepted: true;
  readonly facet: UniversalSearchFacet | undefined;
};

export type UniversalSearchServiceImpl = {
  readonly searchFacet: (input: {
    readonly facet: UniversalSearchFacet;
    readonly query: string;
    readonly actor: RequestContext;
    readonly limit: number;
  }) => Effect.Effect<
    ReadonlyArray<UniversalSearchEntry>,
    UniversalSearchFacetError
  >;
  readonly search: (
    input: UniversalSearchServiceInput,
  ) => Effect.Effect<UniversalSearchResultView, UniversalSearchServiceError>;
  readonly requestReindex: (
    input: UniversalSearchReindexServiceInput,
  ) => Effect.Effect<
    UniversalSearchReindexResultView,
    UniversalSearchReindexServiceError
  >;
};

export class UniversalSearchService extends Context.Tag(
  "UniversalSearchService",
)<UniversalSearchService, UniversalSearchServiceImpl>() {}

export type UniversalSearchRuntimeBounds = {
  readonly perFacetLimitDefault: number;
  readonly perFacetLimitMax: number;
  readonly cacheMaxSize: number;
  readonly cacheTtlSeconds: number;
  readonly indexFreshnessThresholdSeconds: number;
};

export type UniversalSearchServiceDependencies = {
  readonly auditLog: AuditLogModuleService;
  readonly meilisearchAdminClient: MeilisearchAdminClientService;
  readonly fieldSecurityPort: UniversalSearchFieldSecurityPortService;
  readonly bounds: UniversalSearchRuntimeBounds;
  readonly now?: () => Date;
  readonly generateCorrelationId?: () => string;
};

const defaultCorrelationId = () =>
  `usearch_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const buildFailureReason = (cause: unknown): string => {
  if (cause !== null && typeof cause === "object") {
    const tagged = cause as { readonly _tag?: unknown };
    if (typeof tagged._tag === "string") {
      return tagged._tag;
    }
    const messaged = cause as { readonly message?: unknown };
    if (typeof messaged.message === "string") {
      return messaged.message;
    }
  }
  return "universal-search facet failure";
};

export const makeUniversalSearchService = (
  deps: UniversalSearchServiceDependencies,
): UniversalSearchServiceImpl => {
  const { auditLog, meilisearchAdminClient, fieldSecurityPort, bounds } = deps;
  const nowFn = deps.now ?? (() => new Date());
  const correlationIdFn = deps.generateCorrelationId ?? defaultCorrelationId;
  const cache = createResultCache(Math.max(1, bounds.cacheMaxSize));

  const clampLimit = (explicit: number | undefined): number => {
    const ceiling = Math.max(1, Math.trunc(bounds.perFacetLimitMax));
    if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) {
      return Math.min(ceiling, Math.trunc(explicit));
    }
    const fallback = Math.max(1, Math.trunc(bounds.perFacetLimitDefault));
    return Math.min(ceiling, fallback);
  };

  const searchFacet: UniversalSearchServiceImpl["searchFacet"] = (input) => {
    void input.actor;
    return meilisearchAdminClient.searchFacet({
      facet: input.facet,
      query: input.query,
      limit: input.limit,
    });
  };

  const search: UniversalSearchServiceImpl["search"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeSearchInput(input);
      yield* requireSearchActor(decoded.requestContext, "search");
      const searchReason = yield* validateReason(
        "search",
        decoded.query.reasonCatalogId,
        universalSearchAuditAction.queryExecuted,
      );

      const facets =
        decoded.query.facets !== undefined && decoded.query.facets.length > 0
          ? [...decoded.query.facets]
          : [...resolvePrefixToFacets(decoded.query.prefixFilter)];
      const limit = clampLimit(decoded.query.perFacetLimit);
      const cacheKey = buildCacheKey({
        requestContext: decoded.requestContext,
        query: decoded.query.query,
        facets,
        prefix: decoded.query.prefixFilter,
        limit,
      });
      const nowMs = nowFn().getTime();

      const cached = cache.get(cacheKey);
      if (cached !== undefined) {
        if (isIndexFresh(cached.cachedAtIso, nowMs, bounds.cacheTtlSeconds)) {
          yield* auditLog.append({
            requestContext: decoded.requestContext,
            moduleId: platformModuleId.universalSearch,
            action: universalSearchAuditAction.queryExecuted,
            target: cached.value.correlationId,
            reason: searchReason,
          });
          return { result: cached.value, fromCache: true } as const;
        }
        cache.delete(cacheKey);
      }

      const evaluated = yield* Effect.all(
        facets.map((facet) =>
          Effect.either(
            meilisearchAdminClient.searchFacet({
              facet,
              query: decoded.query.query,
              limit,
            }),
          ).pipe(Effect.map((result) => ({ facet, result }))),
        ),
        { concurrency: "unbounded" },
      );

      const rawEntries: UniversalSearchEntry[] = [];
      const partialFailures: UniversalSearchPartialFailure[] = [];

      for (const { facet, result } of evaluated) {
        if (Either.isRight(result)) {
          for (const entry of result.right) {
            rawEntries.push(entry);
          }
        } else {
          partialFailures.push({
            facet,
            reason: buildFailureReason(result.left),
          });
        }
      }

      if (evaluated.length > 0 && partialFailures.length === evaluated.length) {
        return yield* Effect.fail(
          new UniversalSearchAllFacetsFailedError({
            failures: partialFailures,
          }),
        );
      }

      const redaction = yield* fieldSecurityPort.applyRowSecurity({
        requestContext: decoded.requestContext,
        entries: rawEntries,
      });

      const counted: UniversalSearchPartialFailure[] = partialFailures.map(
        (failure) => {
          const filtered = redaction.filteredCountByFacet.get(failure.facet);
          return filtered !== undefined && filtered > 0
            ? { ...failure, fieldSecurityFiltered: filtered }
            : failure;
        },
      );
      const seenFacets = new Set(counted.map((f) => f.facet));
      for (const [facet, filteredCount] of redaction.filteredCountByFacet) {
        if (filteredCount > 0 && !seenFacets.has(facet)) {
          counted.push({
            facet,
            reason: "field-security row redaction",
            fieldSecurityFiltered: filteredCount,
          });
        }
      }

      const generatedAtIso = nowFn().toISOString();
      const lastReindexedAt = yield* meilisearchAdminClient.lastReindexedAt();
      const result: UniversalSearchResult = {
        query: decoded.query.query,
        entries: redaction.visibleEntries,
        partialFailures: counted,
        indexFreshness: {
          lastReindexedAt,
          isFresh: isIndexFresh(
            lastReindexedAt,
            nowFn().getTime(),
            bounds.indexFreshnessThresholdSeconds,
          ),
        },
        correlationId:
          decoded.requestContext.correlationId ?? correlationIdFn(),
        generatedAt: generatedAtIso,
      };

      cache.set(cacheKey, {
        value: result,
        cachedAtIso: nowFn().toISOString(),
      });

      yield* auditLog.append({
        requestContext: decoded.requestContext,
        moduleId: platformModuleId.universalSearch,
        action: universalSearchAuditAction.queryExecuted,
        target: result.correlationId,
        reason: searchReason,
      });

      return { result, fromCache: false } as const;
    });

  const requestReindex: UniversalSearchServiceImpl["requestReindex"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeReindexInput(input);
      yield* requirePlatformOperatorActor(
        decoded.requestContext,
        "requestReindex",
      );
      const reindexReason = yield* validateReason(
        "requestReindex",
        decoded.query.reasonCatalogId,
        universalSearchAuditAction.reindexRequested,
      );
      yield* requireAttachmentIfNeeded(
        "requestReindex",
        reindexReason,
        decoded.query.reasonAttachmentText,
      );
      yield* meilisearchAdminClient.requestReindex(
        decoded.query.facet === undefined ? {} : { facet: decoded.query.facet },
      );
      yield* auditLog.append({
        requestContext: decoded.requestContext,
        moduleId: platformModuleId.universalSearch,
        action: universalSearchAuditAction.reindexRequested,
        target: decoded.query.facet ?? "all",
        reason: reindexReason,
      });
      return {
        accepted: true as const,
        facet: decoded.query.facet,
      };
    });

  return { searchFacet, search, requestReindex };
};

// Re-export the schema-derived types so test files use the same view.
export type { UniversalSearchEntry, UniversalSearchResult };
export { UniversalSearchEntrySchema };

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export type UniversalSearchServiceLayerDependencies = {
  readonly bounds: UniversalSearchRuntimeBounds;
};

export const makeUniversalSearchServiceLayer = (
  deps: UniversalSearchServiceLayerDependencies,
) =>
  Layer.effect(
    UniversalSearchService,
    Effect.gen(function* () {
      const auditLog = yield* AuditLogModule;
      const meilisearchAdminClient = yield* MeilisearchAdminClient;
      const fieldSecurityPort = yield* UniversalSearchFieldSecurityPort;
      return makeUniversalSearchService({
        auditLog,
        meilisearchAdminClient,
        fieldSecurityPort,
        bounds: deps.bounds,
      });
    }),
  );

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const UniversalSearchProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  MEILISEARCH_URL: Schema.NonEmptyString,
  MEILISEARCH_MASTER_KEY: Schema.NonEmptyString,
  UNIVERSAL_SEARCH_PER_FACET_LIMIT_DEFAULT: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  UNIVERSAL_SEARCH_PER_FACET_LIMIT_MAX: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  UNIVERSAL_SEARCH_CACHE_MAX_SIZE: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  UNIVERSAL_SEARCH_CACHE_TTL_SECONDS: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  UNIVERSAL_SEARCH_INDEX_FRESHNESS_THRESHOLD_SECONDS:
    Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
});

const decodeUniversalSearchProcessEnvironment = Schema.decodeUnknown(
  UniversalSearchProcessEnvironmentSchema,
);

export type UniversalSearchRuntimeOptions = {
  readonly postgresUrl: string;
  readonly meilisearch: {
    readonly url: string;
    readonly apiKey: string;
  };
  readonly bounds: UniversalSearchRuntimeBounds;
};

const resolveUniversalSearchRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeUniversalSearchProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): UniversalSearchRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
        meilisearch: {
          url: resolved.MEILISEARCH_URL,
          apiKey: resolved.MEILISEARCH_MASTER_KEY,
        },
        bounds: {
          perFacetLimitDefault:
            resolved.UNIVERSAL_SEARCH_PER_FACET_LIMIT_DEFAULT,
          perFacetLimitMax: resolved.UNIVERSAL_SEARCH_PER_FACET_LIMIT_MAX,
          cacheMaxSize: resolved.UNIVERSAL_SEARCH_CACHE_MAX_SIZE,
          cacheTtlSeconds: resolved.UNIVERSAL_SEARCH_CACHE_TTL_SECONDS,
          indexFreshnessThresholdSeconds:
            resolved.UNIVERSAL_SEARCH_INDEX_FRESHNESS_THRESHOLD_SECONDS,
        },
      }),
    ),
  );

const makeUniversalSearchRuntime = (options: UniversalSearchRuntimeOptions) =>
  Effect.gen(function* () {
    const postgres = yield* makePostgresAdapter({
      connectionString: options.postgresUrl,
    });
    const writeDatabase = buildWriteDatabase(postgres.database);
    const auditLogQueryable: AuditLogPostgresQueryable = {
      listEventsByModule: (moduleId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.moduleId, moduleId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTarget: (input) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(
            and(
              eq(auditLogEventsTable.moduleId, input.moduleId),
              eq(auditLogEventsTable.target, input.target),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByActor: (actorId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.actorId, actorId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTenant: (input) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(
            and(
              eq(auditLogEventsTable.tenantScope, input.tenantScope),
              eq(auditLogEventsTable.tenantScopeId, input.tenantScopeId),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt)),
    };
    const auditLogRepository = yield* makeAuditLogPostgresRepository({
      ...writeDatabase,
      ...auditLogQueryable,
    });
    const auditLog = yield* makeAuditLogModule(auditLogRepository);
    const meilisearchAdapter = yield* makeMeilisearchAdapter({
      url: options.meilisearch.url,
      apiKey: options.meilisearch.apiKey,
    });
    const meilisearchAdminClientLayer = makeDefaultMeilisearchAdminClientLayer(
      postgres.database,
    ).pipe(
      Layer.provide(Layer.succeed(MeilisearchAdapter, meilisearchAdapter)),
    );
    const baseLayer = Layer.mergeAll(
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
      meilisearchAdminClientLayer,
      makeDefaultUniversalSearchFieldSecurityPortLayer,
    );
    const serviceLayer = makeUniversalSearchServiceLayer({
      bounds: options.bounds,
    }).pipe(Layer.provide(baseLayer));
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type UniversalSearchRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError
  | MeilisearchAdapterError;

export const runUniversalSearchPlatformFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: UniversalSearchServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | UniversalSearchRuntimeError> =>
  resolveUniversalSearchRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeUniversalSearchRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(UniversalSearchService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  ) as Effect.Effect<A, E | UniversalSearchRuntimeError>;
