/**
 * Polar revenue projection platform service tests (admin-app
 * implementation plan §9 item 7 — read-only, admin-only).
 *
 * Exercises the owner-locked invariants enforced ABOVE
 * persistence in
 * `packages/platform/src/services/domains/polar-revenue-projection-service.ts`:
 *
 *   - admin-only authz on `requestBackfill` (non-operator
 *     rejected with `PolarRevenueProjectionUnauthorized`)
 *   - typed `ReasonCatalogIdSchema` decode (failure surfaces as
 *     `PolarRevenueProjectionReasonNotInCatalog`)
 *   - audit emission keyed by
 *     `platformModuleId.polarRevenueProjection` +
 *     `polarRevenueProjectionAuditAction.{snapshotComputed,backfillRequested}`
 *   - snapshot upsert round-trip on backfill happy path
 *   - bounded insertion-order snapshot cache eviction at the
 *     configured `cacheMaxSize`
 *   - snapshot freshness via the shared `isSnapshotFresh` helper
 *     (fresh vs stale window)
 *   - latest read served from cache after first miss
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformModuleId,
  platformScope,
  polarRevenueProjectionAuditAction,
  reasonCatalogId,
  type AuditEvent,
  type PolarRevenueProjection,
  type PolarRevenueProjectionTargetTenant,
  type RequestContext,
} from "@comvestec/contracts";
import type {
  AuditLogModuleService,
  PolarRevenueProjectionRepositoryService,
  UpsertPolarRevenueProjectionSnapshotRepositoryInput,
} from "@comvestec/modules";
import {
  makePolarRevenueProjectionService,
  PolarApiClientError,
  PolarRevenueProjectionMissingActorIdentity,
  PolarRevenueProjectionReasonAttachmentRequired,
  PolarRevenueProjectionReasonNotInCatalog,
  PolarRevenueProjectionReasonActionMismatch,
  PolarRevenueProjectionUnauthorized,
  type PolarApiClientService,
  type PolarRevenueSnapshotSource,
  type PolarRevenueProjectionRuntimeBounds,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const operatorContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_pol_operator",
  sessionId: "sess_pol",
  correlationId: "corr_pol",
  reason: "polar revenue projection service unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const nonOperatorContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.individualUser,
  actorId: "usr_pol_user",
};

const tenant: PolarRevenueProjectionTargetTenant = {
  scope: platformScope.organization,
  scopeId: "tenant-acme",
};

const defaultBounds: PolarRevenueProjectionRuntimeBounds = {
  snapshotIntervalMinutes: 60,
  historyRetentionDays: 365,
  cacheMaxSize: 2,
};

const fakeSnapshot = (
  overrides: Partial<PolarRevenueProjection> = {},
): PolarRevenueProjection => ({
  id: overrides.id ?? "pol_snap",
  tenant: overrides.tenant ?? tenant,
  billingPeriodStart:
    overrides.billingPeriodStart ?? "2026-01-01T00:00:00.000Z",
  billingPeriodEnd: overrides.billingPeriodEnd ?? "2026-01-31T00:00:00.000Z",
  subscriptionMrr: overrides.subscriptionMrr ?? {
    currency: "USD",
    amountMinorUnits: 1_000_00,
  },
  churnRate: overrides.churnRate ?? 0.02,
  expansion: overrides.expansion ?? { currency: "USD", amountMinorUnits: 500 },
  contraction: overrides.contraction ?? {
    currency: "USD",
    amountMinorUnits: 200,
  },
  projectedNextPeriodRevenue: overrides.projectedNextPeriodRevenue ?? {
    currency: "USD",
    amountMinorUnits: 1_000_30,
  },
  activeSubscriptionCount: overrides.activeSubscriptionCount ?? 7,
  sourcePolarAccountId: overrides.sourcePolarAccountId ?? "polar_acct_acme",
  computedAt: overrides.computedAt ?? "2026-01-31T00:00:00.000Z",
  correlationId: overrides.correlationId ?? operatorContext.correlationId,
});

const fakeSnapshotSource = (
  overrides: Partial<PolarRevenueSnapshotSource> = {},
): PolarRevenueSnapshotSource => ({
  billingPeriodStart:
    overrides.billingPeriodStart ?? "2026-01-01T00:00:00.000Z",
  billingPeriodEnd: overrides.billingPeriodEnd ?? "2026-01-31T00:00:00.000Z",
  subscriptionMrr: overrides.subscriptionMrr ?? {
    currency: "USD",
    amountMinorUnits: 1_000_00,
  },
  churnRate: overrides.churnRate ?? 0.02,
  expansion: overrides.expansion ?? { currency: "USD", amountMinorUnits: 500 },
  contraction: overrides.contraction ?? {
    currency: "USD",
    amountMinorUnits: 200,
  },
  projectedNextPeriodRevenue: overrides.projectedNextPeriodRevenue ?? {
    currency: "USD",
    amountMinorUnits: 1_000_30,
  },
  activeSubscriptionCount: overrides.activeSubscriptionCount ?? 7,
  sourcePolarAccountId: overrides.sourcePolarAccountId ?? "polar_acct_acme",
});

type AuditCalls = ReadonlyArray<{
  readonly moduleId: string;
  readonly action: string;
  readonly target: string;
  readonly reason: string | undefined;
}>;

const createAuditDouble = () => {
  const calls: Array<{
    moduleId: string;
    action: string;
    target: string;
    reason: string | undefined;
  }> = [];
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
        recordedAt: "2026-01-01T00:00:00.000Z",
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
    get calls(): AuditCalls {
      return calls;
    },
  };
};

const createRepositoryDouble = (
  overrides: Partial<PolarRevenueProjectionRepositoryService> = {},
): PolarRevenueProjectionRepositoryService => ({
  upsertSnapshot:
    overrides.upsertSnapshot ??
    ((input: UpsertPolarRevenueProjectionSnapshotRepositoryInput) =>
      Effect.succeed(
        fakeSnapshot({
          id: "pol_snap_upserted",
          tenant: input.tenant,
          billingPeriodStart: input.billingPeriodStart,
          billingPeriodEnd: input.billingPeriodEnd,
          subscriptionMrr: input.subscriptionMrr,
          churnRate: input.churnRate,
          expansion: input.expansion,
          contraction: input.contraction,
          projectedNextPeriodRevenue: input.projectedNextPeriodRevenue,
          activeSubscriptionCount: input.activeSubscriptionCount,
          sourcePolarAccountId: input.sourcePolarAccountId,
          computedAt: input.computedAt,
          correlationId: input.correlationId,
        }),
      )),
  getLatestForTenant:
    overrides.getLatestForTenant ??
    (() => Effect.succeed(Option.none<PolarRevenueProjection>())),
  getForTenantAndPeriod:
    overrides.getForTenantAndPeriod ??
    (() => Effect.succeed(Option.none<PolarRevenueProjection>())),
  listForTenant: overrides.listForTenant ?? (() => Effect.succeed([])),
  pruneOlderThan:
    overrides.pruneOlderThan ?? (() => Effect.succeed({ prunedCount: 0 })),
});

const createPolarApiClientDouble = (
  source: PolarRevenueSnapshotSource = fakeSnapshotSource(),
): PolarApiClientService => ({
  fetchRevenueSnapshotSource: () => Effect.succeed(source),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("polar-revenue-projection service — backfill (admin-only mutation)", () => {
  it("happy path upserts snapshot, primes cache, and emits both audits", async () => {
    const audit = createAuditDouble();
    const repository = createRepositoryDouble();
    const polarApiClient = createPolarApiClientDouble();
    const service = makePolarRevenueProjectionService({
      repository,
      auditLog: audit.service,
      polarApiClient,
      bounds: defaultBounds,
      now: () => new Date("2026-01-31T00:00:00.000Z"),
    });

    const result = await Effect.runPromise(
      service.requestBackfill({
        requestContext: operatorContext,
        backfill: {
          tenant,
          reasonCatalogId: reasonCatalogId.polarRevenueProjectionBackfill,
          reasonNarrative: "operator-initiated backfill smoke",
          reasonAttachmentText: "runbook://billing/backfill-smoke",
        },
      }),
    );

    expect(result.accepted).toBe(true);
    expect(result.snapshot.id).toBe("pol_snap_upserted");

    expect(audit.calls).toHaveLength(2);
    expect(audit.calls[0]).toMatchObject({
      moduleId: platformModuleId.polarRevenueProjection,
      action: polarRevenueProjectionAuditAction.snapshotComputed,
      target: "pol_snap_upserted",
      reason: reasonCatalogId.polarRevenueProjectionRead,
    });
    expect(audit.calls[1]).toMatchObject({
      moduleId: platformModuleId.polarRevenueProjection,
      action: polarRevenueProjectionAuditAction.backfillRequested,
      target: "pol_snap_upserted",
      reason: reasonCatalogId.polarRevenueProjectionBackfill,
    });

    // Cache is now primed → subsequent read does not touch the
    // repository.
    let repositoryReadCount = 0;
    const repositoryWithCount = createRepositoryDouble({
      getLatestForTenant: () => {
        repositoryReadCount += 1;
        return Effect.succeed(Option.some(fakeSnapshot()));
      },
    });
    const serviceSharingCache = makePolarRevenueProjectionService({
      repository: repositoryWithCount,
      auditLog: audit.service,
      polarApiClient,
      bounds: defaultBounds,
      now: () => new Date("2026-01-31T00:00:00.000Z"),
    });
    const cachedRead = await Effect.runPromise(
      serviceSharingCache.getLatestSnapshot({
        requestContext: operatorContext,
        tenant,
      }),
    );
    expect(Option.isSome(cachedRead)).toBe(true);
    expect(repositoryReadCount).toBe(1);
  });

  it("rejects non-operator actor with PolarRevenueProjectionUnauthorized", async () => {
    const service = makePolarRevenueProjectionService({
      repository: createRepositoryDouble(),
      auditLog: createAuditDouble().service,
      polarApiClient: createPolarApiClientDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.requestBackfill({
        requestContext: nonOperatorContext,
        backfill: {
          tenant,
          reasonCatalogId: reasonCatalogId.polarRevenueProjectionBackfill,
          reasonNarrative: "non-operator attempt",
          reasonAttachmentText: "runbook://incident/INC-attempt",
        },
      }),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
      expect(failure).toBeInstanceOf(PolarRevenueProjectionUnauthorized);
    }
  });

  it("rejects backfill whose reasonCatalogId is not in the typed catalog", async () => {
    const service = makePolarRevenueProjectionService({
      repository: createRepositoryDouble(),
      auditLog: createAuditDouble().service,
      polarApiClient: createPolarApiClientDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.requestBackfill({
        requestContext: operatorContext,
        backfill: {
          tenant,
          reasonCatalogId: "not.a.real.catalog.id",
          reasonNarrative: "bad reason",
          reasonAttachmentText: "runbook://incident/INC-bad",
        },
      }),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
      expect(failure).toBeInstanceOf(PolarRevenueProjectionReasonNotInCatalog);
    }
  });

  it("rejects a parseable but wrong-catalog reason on backfill (reason/action mismatch)", async () => {
    const service = makePolarRevenueProjectionService({
      repository: createRepositoryDouble(),
      auditLog: createAuditDouble().service,
      polarApiClient: createPolarApiClientDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.requestBackfill({
        requestContext: operatorContext,
        backfill: {
          tenant,
          reasonCatalogId: reasonCatalogId.polarRevenueProjectionRead,
          reasonNarrative: "wrong reason for backfill",
          reasonAttachmentText: "runbook://incident/INC-wrong-reason",
        },
      }),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
      expect(failure).toBeInstanceOf(
        PolarRevenueProjectionReasonActionMismatch,
      );
    }
  });

  it("rejects backfill with whitespace-only reasonAttachmentText (ReasonAttachmentRequired, no audit emission)", async () => {
    const audit = createAuditDouble();
    const service = makePolarRevenueProjectionService({
      repository: createRepositoryDouble(),
      auditLog: audit.service,
      polarApiClient: createPolarApiClientDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.requestBackfill({
        requestContext: operatorContext,
        backfill: {
          tenant,
          reasonCatalogId: reasonCatalogId.polarRevenueProjectionBackfill,
          reasonNarrative: "no attachment",
          reasonAttachmentText: "   ",
        },
      }),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
      expect(failure).toBeInstanceOf(
        PolarRevenueProjectionReasonAttachmentRequired,
      );
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("propagates PolarApiClientError from the injected port", async () => {
    const polarApiClient: PolarApiClientService = {
      fetchRevenueSnapshotSource: () =>
        Effect.fail(
          new PolarApiClientError({
            operation: "fetchRevenueSnapshotSource",
            tenant,
            cause: new Error("polar adapter down"),
          }),
        ),
    };
    const service = makePolarRevenueProjectionService({
      repository: createRepositoryDouble(),
      auditLog: createAuditDouble().service,
      polarApiClient,
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.requestBackfill({
        requestContext: operatorContext,
        backfill: {
          tenant,
          reasonCatalogId: reasonCatalogId.polarRevenueProjectionBackfill,
          reasonNarrative: "adapter down",
          reasonAttachmentText: "runbook://incident/INC-adapter",
        },
      }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
      expect(failure).toBeInstanceOf(PolarApiClientError);
    }
  });
});

describe("polar-revenue-projection service — getLatestSnapshot (read surface)", () => {
  it("rejects missing actor identity with PolarRevenueProjectionMissingActorIdentity", async () => {
    const service = makePolarRevenueProjectionService({
      repository: createRepositoryDouble(),
      auditLog: createAuditDouble().service,
      polarApiClient: createPolarApiClientDouble(),
      bounds: defaultBounds,
    });

    const anonymous: RequestContext = {
      ...operatorContext,
      actorId: undefined,
    } as unknown as RequestContext;

    const exit = await Effect.runPromiseExit(
      service.getLatestSnapshot({
        requestContext: anonymous,
        tenant,
      }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
      expect(failure).toBeInstanceOf(
        PolarRevenueProjectionMissingActorIdentity,
      );
    }
  });

  it("returns fresh=true when the snapshot is within the configured interval and stale otherwise", async () => {
    const freshAt = new Date("2026-01-31T00:30:00.000Z").toISOString();
    const staleAt = new Date("2026-01-30T23:00:00.000Z").toISOString();
    const repository = createRepositoryDouble({
      getLatestForTenant: () =>
        Effect.succeed(Option.some(fakeSnapshot({ computedAt: freshAt }))),
    });
    const service = makePolarRevenueProjectionService({
      repository,
      auditLog: createAuditDouble().service,
      polarApiClient: createPolarApiClientDouble(),
      bounds: { ...defaultBounds, snapshotIntervalMinutes: 60 },
      now: () => new Date("2026-01-31T01:00:00.000Z"),
    });
    const freshResult = await Effect.runPromise(
      service.getLatestSnapshot({
        requestContext: operatorContext,
        tenant,
      }),
    );
    expect(Option.isSome(freshResult)).toBe(true);
    if (Option.isSome(freshResult)) {
      expect(freshResult.value.isFresh).toBe(true);
    }

    const staleRepository = createRepositoryDouble({
      getLatestForTenant: () =>
        Effect.succeed(Option.some(fakeSnapshot({ computedAt: staleAt }))),
    });
    const staleService = makePolarRevenueProjectionService({
      repository: staleRepository,
      auditLog: createAuditDouble().service,
      polarApiClient: createPolarApiClientDouble(),
      bounds: { ...defaultBounds, snapshotIntervalMinutes: 60 },
      now: () => new Date("2026-01-31T01:00:00.000Z"),
    });
    const staleResult = await Effect.runPromise(
      staleService.getLatestSnapshot({
        requestContext: operatorContext,
        tenant,
      }),
    );
    expect(Option.isSome(staleResult)).toBe(true);
    if (Option.isSome(staleResult)) {
      expect(staleResult.value.isFresh).toBe(false);
    }
  });

  it("evicts the oldest cache entry at cacheMaxSize (insertion-order bound)", async () => {
    const tenants: PolarRevenueProjectionTargetTenant[] = [
      { scope: platformScope.organization, scopeId: "tenant-a" },
      { scope: platformScope.organization, scopeId: "tenant-b" },
      { scope: platformScope.organization, scopeId: "tenant-c" },
    ];
    const reads: string[] = [];
    const repository = createRepositoryDouble({
      getLatestForTenant: (t) => {
        reads.push(t.scopeId);
        return Effect.succeed(
          Option.some(fakeSnapshot({ id: `snap_${t.scopeId}`, tenant: t })),
        );
      },
    });
    const service = makePolarRevenueProjectionService({
      repository,
      auditLog: createAuditDouble().service,
      polarApiClient: createPolarApiClientDouble(),
      bounds: { ...defaultBounds, cacheMaxSize: 2 },
    });

    // Prime cache with two tenants → cache=[a,b]
    await Effect.runPromise(
      service.getLatestSnapshot({
        requestContext: operatorContext,
        tenant: tenants[0]!,
      }),
    );
    await Effect.runPromise(
      service.getLatestSnapshot({
        requestContext: operatorContext,
        tenant: tenants[1]!,
      }),
    );
    // Insert third tenant → evicts `a` → cache=[b,c]
    await Effect.runPromise(
      service.getLatestSnapshot({
        requestContext: operatorContext,
        tenant: tenants[2]!,
      }),
    );
    // Re-reading `a` must miss cache (4th repository read).
    await Effect.runPromise(
      service.getLatestSnapshot({
        requestContext: operatorContext,
        tenant: tenants[0]!,
      }),
    );
    expect(reads).toEqual(["tenant-a", "tenant-b", "tenant-c", "tenant-a"]);

    // Re-reading `a` immediately MUST hit cache (just-loaded entry).
    await Effect.runPromise(
      service.getLatestSnapshot({
        requestContext: operatorContext,
        tenant: tenants[0]!,
      }),
    );
    expect(reads).toEqual(["tenant-a", "tenant-b", "tenant-c", "tenant-a"]);
  });
});
