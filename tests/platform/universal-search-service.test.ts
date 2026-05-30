/**
 * Universal omnibar search platform service tests (admin-app
 * implementation plan §9 item 11). Exercises owner-locked invariants
 * enforced ABOVE the default Meilisearch-adapter-backed port in
 * `packages/platform/src/services/domains/universal-search-service.ts`:
 *
 *   - operator-only authz (anonymous → MissingActorIdentity;
 *     supportOperator allowed for search; reindex platformOperator
 *     only and rejects supportOperator)
 *   - reason-catalog decode (only `reasonCatalogId.universalSearchRead`
 *     accepted; everything else → ReasonNotInCatalog)
 *   - aggregate v2 partial-failure semantics via `Effect.either` +
 *     `Effect.all { concurrency: 'unbounded' }`; AllFacetsFailed only
 *     when EVERY facet errors
 *   - prefix-driven facet resolution + perFacetLimit clamping to
 *     `perFacetLimitMax`
 *   - bounded result cache + insertion-order eviction + freshness
 *     reconciliation
 *   - field-security row-redaction applied BEFORE results leave the
 *     service; filtered counts surface on `partialFailures`
 *   - audit emission ordering (single `queryExecuted` per successful
 *     search even partial; single `reindexRequested` per successful
 *     reindex; suppressed on all-fail and on authz / reason rejections)
 */
import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  universalSearchAuditAction,
  universalSearchFacet,
  universalSearchPrefix,
  type AuditEvent,
  type RequestContext,
  type UniversalSearchEntry,
  type UniversalSearchFacet,
} from "@comvestec/contracts";
import type { AuditLogModuleService } from "@comvestec/modules";
import {
  makeUniversalSearchService,
  UniversalSearchAllFacetsFailedError,
  UniversalSearchFacetAdapterError,
  UniversalSearchFacetIndexMissing,
  UniversalSearchMissingActorIdentity,
  UniversalSearchReasonAttachmentRequired,
  UniversalSearchReasonNotInCatalog,
  UniversalSearchUnauthorized,
  type MeilisearchAdminClientService,
  type UniversalSearchFieldSecurityPortService,
  type UniversalSearchRuntimeBounds,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const tenant = {
  scope: platformScope.platform,
  scopeId: platformScope.platform,
} as const;

const operatorContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_universal_search_operator",
  sessionId: "sess_universal_search",
  correlationId: "corr_universal_search_operator",
  reason: "universal search platform service unit test",
  tenant,
};

const supportOperatorContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.supportOperator,
  actorId: "usr_universal_search_support",
  correlationId: "corr_universal_search_support",
};

const nonOperatorContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.individualUser,
  actorId: "usr_universal_search_user",
};

const anonymousContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.anonymous,
  actorId: undefined,
};

const defaultBounds: UniversalSearchRuntimeBounds = {
  perFacetLimitDefault: 5,
  perFacetLimitMax: 10,
  cacheMaxSize: 2,
  cacheTtlSeconds: 30,
  indexFreshnessThresholdSeconds: 600,
};

const buildEntry = (
  facet: UniversalSearchFacet,
  id: string,
): UniversalSearchEntry => ({
  facet,
  id,
  label: `${facet}-${id}`,
  scopeTag: "global",
  permalink: `/desk/${facet}/${id}`,
  fieldClassification: "internal",
});

type AuditCall = {
  readonly moduleId: string;
  readonly action: string;
  readonly target: string;
  readonly reason: string | undefined;
};

const createAuditDouble = () => {
  const calls: AuditCall[] = [];
  const service: AuditLogModuleService = {
    append: (input) => {
      calls.push({
        moduleId: input.moduleId,
        action: input.action,
        target: input.target,
        reason: input.reason,
      });
      return Effect.succeed({
        id: `evt_${calls.length}`,
        moduleId: input.moduleId,
        action: input.action,
        target: input.target,
        reason: input.reason,
        actorType: input.requestContext.actorType,
        actorId: input.requestContext.actorId ?? null,
        sessionId: input.requestContext.sessionId,
        correlationId: input.requestContext.correlationId,
        tenantScope: input.requestContext.tenant.scope,
        tenantScopeId: input.requestContext.tenant.scopeId,
        recordedAt: "2026-02-01T00:00:00.000Z",
      } as unknown as AuditEvent);
    },
    queryByModule: () => Effect.succeed([]),
    queryByTarget: () => Effect.succeed([]),
    queryByActor: () => Effect.succeed([]),
    queryByTenant: () => Effect.succeed([]),
    requirements: Effect.succeed([]),
  };
  return {
    service,
    get calls(): ReadonlyArray<AuditCall> {
      return calls;
    },
  };
};

type MeilisearchAdminDoubleOverrides = {
  readonly entriesByFacet?: ReadonlyMap<
    UniversalSearchFacet,
    ReadonlyArray<UniversalSearchEntry>
  >;
  readonly errorsByFacet?: ReadonlyMap<UniversalSearchFacet, unknown>;
  readonly reindexError?: unknown;
  readonly lastReindexedAt?: string;
  readonly captureLimit?: (facet: UniversalSearchFacet, limit: number) => void;
};

const createMeilisearchAdminDouble = (
  overrides: MeilisearchAdminDoubleOverrides = {},
): MeilisearchAdminClientService & {
  readonly reindexCalls: () => ReadonlyArray<{
    readonly facet: UniversalSearchFacet | undefined;
  }>;
} => {
  const reindexCalls: Array<{
    readonly facet: UniversalSearchFacet | undefined;
  }> = [];
  return {
    searchFacet: (input) => {
      overrides.captureLimit?.(input.facet, input.limit);
      const error = overrides.errorsByFacet?.get(input.facet);
      if (error !== undefined) {
        if (
          typeof error === "object" &&
          error !== null &&
          "_tag" in error &&
          (error as { readonly _tag: string })._tag ===
            "UniversalSearchFacetIndexMissing"
        ) {
          return Effect.fail(error as UniversalSearchFacetIndexMissing);
        }
        return Effect.fail(
          new UniversalSearchFacetAdapterError({
            facet: input.facet,
            cause: error,
          }),
        );
      }
      return Effect.succeed(
        overrides.entriesByFacet?.get(input.facet) ?? [
          buildEntry(input.facet, "default"),
        ],
      );
    },
    requestReindex: (input) => {
      reindexCalls.push({ facet: input.facet });
      if (overrides.reindexError !== undefined) {
        return Effect.fail(
          new UniversalSearchFacetAdapterError({
            facet: input.facet ?? universalSearchFacet.tenants,
            cause: overrides.reindexError,
          }),
        );
      }
      return Effect.void;
    },
    lastReindexedAt: () =>
      Effect.succeed(overrides.lastReindexedAt ?? "2026-02-01T00:00:00.000Z"),
    reindexCalls: () => reindexCalls,
  };
};

const passThroughFieldSecurity: UniversalSearchFieldSecurityPortService = {
  applyRowSecurity: (input) =>
    Effect.succeed({
      visibleEntries: input.entries,
      filteredCountByFacet: new Map(),
    }),
};

const redactingFieldSecurity = (
  redacted: ReadonlyMap<UniversalSearchFacet, number>,
): UniversalSearchFieldSecurityPortService => ({
  applyRowSecurity: (input) => {
    let dropped: Map<UniversalSearchFacet, number> | undefined;
    const visible: UniversalSearchEntry[] = [];
    const remaining = new Map(redacted);
    for (const entry of input.entries) {
      const left = remaining.get(entry.facet);
      if (left !== undefined && left > 0) {
        remaining.set(entry.facet, left - 1);
        dropped = dropped ?? new Map();
        dropped.set(entry.facet, (dropped.get(entry.facet) ?? 0) + 1);
        continue;
      }
      visible.push(entry);
    }
    return Effect.succeed({
      visibleEntries: visible,
      filteredCountByFacet: dropped ?? new Map(),
    });
  },
});

const reasonOk = reasonCatalogId.universalSearchRead;
const reasonReindex = reasonCatalogId.universalSearchReindex;

// ---------------------------------------------------------------------------
// Tests — happy paths + audit
// ---------------------------------------------------------------------------

describe("universal-search service — happy paths + audit", () => {
  it("federates over all facets when none specified, audits queryExecuted once, caches the result", async () => {
    const audit = createAuditDouble();
    const port = createMeilisearchAdminDouble();
    const service = makeUniversalSearchService({
      auditLog: audit.service,
      meilisearchAdminClient: port,
      fieldSecurityPort: passThroughFieldSecurity,
      bounds: defaultBounds,
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const first = await Effect.runPromise(
      service.search({
        requestContext: operatorContext,
        query: { query: "acme", reasonCatalogId: reasonOk },
      }),
    );

    expect(first.fromCache).toBe(false);
    expect(first.result.query).toBe("acme");
    expect(first.result.entries.length).toBeGreaterThan(0);
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]).toMatchObject({
      moduleId: platformModuleId.universalSearch,
      action: universalSearchAuditAction.queryExecuted,
      reason: reasonCatalogId.universalSearchRead,
    });

    const second = await Effect.runPromise(
      service.search({
        requestContext: operatorContext,
        query: { query: "acme", reasonCatalogId: reasonOk },
      }),
    );
    expect(second.fromCache).toBe(true);
    expect(audit.calls).toHaveLength(2);
  });

  it("supportOperator is allowed to search", async () => {
    const audit = createAuditDouble();
    const service = makeUniversalSearchService({
      auditLog: audit.service,
      meilisearchAdminClient: createMeilisearchAdminDouble(),
      fieldSecurityPort: passThroughFieldSecurity,
      bounds: defaultBounds,
    });
    const view = await Effect.runPromise(
      service.search({
        requestContext: supportOperatorContext,
        query: { query: "platform", reasonCatalogId: reasonOk },
      }),
    );
    expect(view.fromCache).toBe(false);
    expect(audit.calls).toHaveLength(1);
  });

  it("resolves a prefix to its single facet (t/ → tenants only)", async () => {
    const audit = createAuditDouble();
    const captured: Array<{
      readonly facet: UniversalSearchFacet;
      readonly limit: number;
    }> = [];
    const port = createMeilisearchAdminDouble({
      captureLimit: (facet, limit) => captured.push({ facet, limit }),
    });
    const service = makeUniversalSearchService({
      auditLog: audit.service,
      meilisearchAdminClient: port,
      fieldSecurityPort: passThroughFieldSecurity,
      bounds: defaultBounds,
    });

    await Effect.runPromise(
      service.search({
        requestContext: operatorContext,
        query: {
          query: "acme",
          prefixFilter: universalSearchPrefix.tenant,
          reasonCatalogId: reasonOk,
        },
      }),
    );

    expect(captured).toHaveLength(1);
    expect(captured[0]?.facet).toBe(universalSearchFacet.tenants);
  });

  it("clamps perFacetLimit to perFacetLimitMax at the service layer", async () => {
    const captured: Array<{
      readonly facet: UniversalSearchFacet;
      readonly limit: number;
    }> = [];
    const port = createMeilisearchAdminDouble({
      captureLimit: (facet, limit) => captured.push({ facet, limit }),
    });
    const service = makeUniversalSearchService({
      auditLog: createAuditDouble().service,
      meilisearchAdminClient: port,
      fieldSecurityPort: passThroughFieldSecurity,
      bounds: { ...defaultBounds, perFacetLimitMax: 3 },
    });

    await Effect.runPromise(
      service.search({
        requestContext: operatorContext,
        query: {
          query: "acme",
          facets: [universalSearchFacet.tenants],
          perFacetLimit: 50,
          reasonCatalogId: reasonOk,
        },
      }),
    );
    expect(captured[0]?.limit).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Tests — authz + reason catalog enforcement
// ---------------------------------------------------------------------------

describe("universal-search service — authz + reason-catalog enforcement", () => {
  it("anonymous actor surfaces UniversalSearchMissingActorIdentity and never audits", async () => {
    const audit = createAuditDouble();
    const service = makeUniversalSearchService({
      auditLog: audit.service,
      meilisearchAdminClient: createMeilisearchAdminDouble(),
      fieldSecurityPort: passThroughFieldSecurity,
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.search({
        requestContext: anonymousContext,
        query: { query: "x", reasonCatalogId: reasonOk },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(JSON.stringify(exit.cause)).toContain(
        "UniversalSearchMissingActorIdentity",
      );
    }
    expect(audit.calls).toHaveLength(0);
    void UniversalSearchMissingActorIdentity;
  });

  it("non-operator actor surfaces UniversalSearchUnauthorized and never audits", async () => {
    const audit = createAuditDouble();
    const service = makeUniversalSearchService({
      auditLog: audit.service,
      meilisearchAdminClient: createMeilisearchAdminDouble(),
      fieldSecurityPort: passThroughFieldSecurity,
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.search({
        requestContext: nonOperatorContext,
        query: { query: "x", reasonCatalogId: reasonOk },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(JSON.stringify(exit.cause)).toContain(
        "UniversalSearchUnauthorized",
      );
    }
    expect(audit.calls).toHaveLength(0);
    void UniversalSearchUnauthorized;
  });

  it("rejects unknown reasonCatalogId with UniversalSearchReasonNotInCatalog", async () => {
    const audit = createAuditDouble();
    const service = makeUniversalSearchService({
      auditLog: audit.service,
      meilisearchAdminClient: createMeilisearchAdminDouble(),
      fieldSecurityPort: passThroughFieldSecurity,
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.search({
        requestContext: operatorContext,
        query: { query: "x", reasonCatalogId: "not-a-real-reason" },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(JSON.stringify(exit.cause)).toContain(
        "UniversalSearchReasonNotInCatalog",
      );
    }
    expect(audit.calls).toHaveLength(0);
    void UniversalSearchReasonNotInCatalog;
  });

  it("rejects a wrong-catalog reason (e.g., openPanelEventsRead) even though it parses (reason/action mismatch)", async () => {
    const audit = createAuditDouble();
    const service = makeUniversalSearchService({
      auditLog: audit.service,
      meilisearchAdminClient: createMeilisearchAdminDouble(),
      fieldSecurityPort: passThroughFieldSecurity,
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.search({
        requestContext: operatorContext,
        query: {
          query: "x",
          reasonCatalogId: reasonCatalogId.openPanelEventsRead,
        },
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(JSON.stringify(exit.cause)).toContain(
        "UniversalSearchReasonActionMismatch",
      );
    }
  });

  it("rejects the reindex reason on the search path (reason/action mismatch)", async () => {
    const audit = createAuditDouble();
    const service = makeUniversalSearchService({
      auditLog: audit.service,
      meilisearchAdminClient: createMeilisearchAdminDouble(),
      fieldSecurityPort: passThroughFieldSecurity,
      bounds: defaultBounds,
    });
    const exit = await Effect.runPromiseExit(
      service.search({
        requestContext: operatorContext,
        query: {
          query: "x",
          reasonCatalogId: reasonReindex,
        },
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(JSON.stringify(exit.cause)).toContain(
        "UniversalSearchReasonActionMismatch",
      );
    }
    expect(audit.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests — aggregate v2 partial failure
// ---------------------------------------------------------------------------

describe("universal-search service — aggregate v2 partial failure", () => {
  it("partial facet failure degrades to a partialFailures entry, still audits and returns visible entries", async () => {
    const audit = createAuditDouble();
    const errors = new Map<UniversalSearchFacet, unknown>([
      [universalSearchFacet.users, new Error("upstream-users-down")],
    ]);
    const entries = new Map<
      UniversalSearchFacet,
      ReadonlyArray<UniversalSearchEntry>
    >([
      [
        universalSearchFacet.tenants,
        [buildEntry(universalSearchFacet.tenants, "t-1")],
      ],
    ]);
    const port = createMeilisearchAdminDouble({
      errorsByFacet: errors,
      entriesByFacet: entries,
    });
    const service = makeUniversalSearchService({
      auditLog: audit.service,
      meilisearchAdminClient: port,
      fieldSecurityPort: passThroughFieldSecurity,
      bounds: defaultBounds,
    });

    const view = await Effect.runPromise(
      service.search({
        requestContext: operatorContext,
        query: {
          query: "acme",
          facets: [universalSearchFacet.tenants, universalSearchFacet.users],
          reasonCatalogId: reasonOk,
        },
      }),
    );
    expect(view.result.partialFailures).toHaveLength(1);
    expect(view.result.partialFailures[0]?.facet).toBe(
      universalSearchFacet.users,
    );
    expect(view.result.entries.length).toBeGreaterThan(0);
    expect(audit.calls).toHaveLength(1);
  });

  it("all-facets failure surfaces UniversalSearchAllFacetsFailedError with NO audit", async () => {
    const audit = createAuditDouble();
    const errors = new Map<UniversalSearchFacet, unknown>([
      [universalSearchFacet.tenants, new Error("down-1")],
      [universalSearchFacet.users, new Error("down-2")],
    ]);
    const port = createMeilisearchAdminDouble({ errorsByFacet: errors });
    const service = makeUniversalSearchService({
      auditLog: audit.service,
      meilisearchAdminClient: port,
      fieldSecurityPort: passThroughFieldSecurity,
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.search({
        requestContext: operatorContext,
        query: {
          query: "acme",
          facets: [universalSearchFacet.tenants, universalSearchFacet.users],
          reasonCatalogId: reasonOk,
        },
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(JSON.stringify(exit.cause)).toContain(
        "UniversalSearchAllFacetsFailedError",
      );
    }
    expect(audit.calls).toHaveLength(0);
    void UniversalSearchAllFacetsFailedError;
  });
});

// ---------------------------------------------------------------------------
// Tests — cache eviction + freshness reconciliation
// ---------------------------------------------------------------------------

describe("universal-search service — cache eviction + freshness", () => {
  it("evicts oldest entry once cacheMaxSize is exceeded (insertion-order eviction)", async () => {
    const audit = createAuditDouble();
    let invocations = 0;
    const port: MeilisearchAdminClientService = {
      searchFacet: (input) => {
        invocations += 1;
        return Effect.succeed([buildEntry(input.facet, input.query)]);
      },
      requestReindex: () => Effect.void,
      lastReindexedAt: () => Effect.succeed("2026-02-01T00:00:00.000Z"),
    };
    const service = makeUniversalSearchService({
      auditLog: audit.service,
      meilisearchAdminClient: port,
      fieldSecurityPort: passThroughFieldSecurity,
      bounds: {
        ...defaultBounds,
        cacheMaxSize: 2,
        cacheTtlSeconds: 9999,
      },
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const run = (query: string) =>
      service.search({
        requestContext: operatorContext,
        query: {
          query,
          facets: [universalSearchFacet.tenants],
          reasonCatalogId: reasonOk,
        },
      });

    await Effect.runPromise(run("alpha"));
    await Effect.runPromise(run("beta"));
    await Effect.runPromise(run("gamma"));
    expect(invocations).toBe(3);

    // alpha was evicted (insertion order), so this should miss again.
    await Effect.runPromise(run("alpha"));
    expect(invocations).toBe(4);

    // gamma is still cached.
    await Effect.runPromise(run("gamma"));
    expect(invocations).toBe(4);
  });

  it("drops stale cache entries when cacheTtlSeconds elapses (freshness reconciliation)", async () => {
    let currentMs = new Date("2026-02-01T00:00:00.000Z").getTime();
    let invocations = 0;
    const port: MeilisearchAdminClientService = {
      searchFacet: (input) => {
        invocations += 1;
        return Effect.succeed([buildEntry(input.facet, input.query)]);
      },
      requestReindex: () => Effect.void,
      lastReindexedAt: () => Effect.succeed(new Date(currentMs).toISOString()),
    };
    const service = makeUniversalSearchService({
      auditLog: createAuditDouble().service,
      meilisearchAdminClient: port,
      fieldSecurityPort: passThroughFieldSecurity,
      bounds: { ...defaultBounds, cacheTtlSeconds: 1 },
      now: () => new Date(currentMs),
    });

    await Effect.runPromise(
      service.search({
        requestContext: operatorContext,
        query: {
          query: "fresh",
          facets: [universalSearchFacet.tenants],
          reasonCatalogId: reasonOk,
        },
      }),
    );
    expect(invocations).toBe(1);

    currentMs += 5_000;
    await Effect.runPromise(
      service.search({
        requestContext: operatorContext,
        query: {
          query: "fresh",
          facets: [universalSearchFacet.tenants],
          reasonCatalogId: reasonOk,
        },
      }),
    );
    expect(invocations).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Tests — field-security row redaction
// ---------------------------------------------------------------------------

describe("universal-search service — field-security row redaction", () => {
  it("applies row redaction BEFORE returning and surfaces filtered counts on partialFailures", async () => {
    const audit = createAuditDouble();
    const entries = new Map<
      UniversalSearchFacet,
      ReadonlyArray<UniversalSearchEntry>
    >([
      [
        universalSearchFacet.tenants,
        [
          buildEntry(universalSearchFacet.tenants, "t-1"),
          buildEntry(universalSearchFacet.tenants, "t-2"),
        ],
      ],
    ]);
    const port = createMeilisearchAdminDouble({ entriesByFacet: entries });
    const service = makeUniversalSearchService({
      auditLog: audit.service,
      meilisearchAdminClient: port,
      fieldSecurityPort: redactingFieldSecurity(
        new Map([[universalSearchFacet.tenants, 1]]),
      ),
      bounds: defaultBounds,
    });

    const view = await Effect.runPromise(
      service.search({
        requestContext: operatorContext,
        query: {
          query: "x",
          facets: [universalSearchFacet.tenants],
          reasonCatalogId: reasonOk,
        },
      }),
    );
    expect(view.result.entries).toHaveLength(1);
    const tenantsFailure = view.result.partialFailures.find(
      (f) => f.facet === universalSearchFacet.tenants,
    );
    expect(tenantsFailure?.fieldSecurityFiltered).toBe(1);
    expect(audit.calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Tests — requestReindex
// ---------------------------------------------------------------------------

describe("universal-search service — requestReindex", () => {
  it("supportOperator is rejected with UniversalSearchUnauthorized", async () => {
    const audit = createAuditDouble();
    const port = createMeilisearchAdminDouble();
    const service = makeUniversalSearchService({
      auditLog: audit.service,
      meilisearchAdminClient: port,
      fieldSecurityPort: passThroughFieldSecurity,
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.requestReindex({
        requestContext: supportOperatorContext,
        query: {
          reasonCatalogId: reasonReindex,
          reasonAttachmentText: "runbook://search/reindex",
        },
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(JSON.stringify(exit.cause)).toContain(
        "UniversalSearchUnauthorized",
      );
    }
    expect(audit.calls).toHaveLength(0);
    expect(port.reindexCalls()).toHaveLength(0);
  });

  it("platformOperator succeeds and emits reindexRequested audit", async () => {
    const audit = createAuditDouble();
    const port = createMeilisearchAdminDouble();
    const service = makeUniversalSearchService({
      auditLog: audit.service,
      meilisearchAdminClient: port,
      fieldSecurityPort: passThroughFieldSecurity,
      bounds: defaultBounds,
    });
    const result = await Effect.runPromise(
      service.requestReindex({
        requestContext: operatorContext,
        query: {
          facet: universalSearchFacet.tenants,
          reasonCatalogId: reasonReindex,
          reasonAttachmentText: "runbook://search/reindex",
        },
      }),
    );
    expect(result.accepted).toBe(true);
    expect(port.reindexCalls()).toEqual([
      { facet: universalSearchFacet.tenants },
    ]);
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]).toMatchObject({
      moduleId: platformModuleId.universalSearch,
      action: universalSearchAuditAction.reindexRequested,
      target: universalSearchFacet.tenants,
    });
  });

  it("rejects reindex with whitespace-only reasonAttachmentText (UniversalSearchReasonAttachmentRequired, no audit emission)", async () => {
    const audit = createAuditDouble();
    const port = createMeilisearchAdminDouble();
    const service = makeUniversalSearchService({
      auditLog: audit.service,
      meilisearchAdminClient: port,
      fieldSecurityPort: passThroughFieldSecurity,
      bounds: defaultBounds,
    });
    const exit = await Effect.runPromiseExit(
      service.requestReindex({
        requestContext: operatorContext,
        query: {
          reasonCatalogId: reasonReindex,
          reasonAttachmentText: "   ",
        },
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(JSON.stringify(exit.cause)).toContain(
        "UniversalSearchReasonAttachmentRequired",
      );
    }
    void UniversalSearchReasonAttachmentRequired;
    expect(audit.calls).toHaveLength(0);
    expect(port.reindexCalls()).toHaveLength(0);
  });
});
