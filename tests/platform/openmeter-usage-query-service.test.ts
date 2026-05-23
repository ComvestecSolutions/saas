/**
 * OpenMeter usage query platform service unit tests (admin-app
 * implementation plan §9 item 8 — admin-only). Exercises the
 * owner-locked invariants enforced ABOVE persistence via a typed
 * in-memory repository + an injected `OpenMeterApiClient` port +
 * an injected `AuditLogModule`.
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  openMeterUsageQueryAuditAction,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  type OpenMeterUsageQuery,
  type OpenMeterUsageQueryBucket,
  type OpenMeterUsageQueryTargetTenant,
  type RequestContext,
} from "@comvestec/contracts";
import type {
  AuditLogModuleService,
  OpenMeterUsageQueryRepositoryService,
  UpsertOpenMeterUsageQuerySnapshotRepositoryInput,
} from "@comvestec/modules";
import {
  makeOpenMeterUsageQueryService,
  OpenMeterApiClientError,
  OpenMeterUsageQueryMissingActorIdentity,
  OpenMeterUsageQueryReasonAttachmentRequired,
  OpenMeterUsageQueryReasonNotInCatalog,
  OpenMeterUsageQueryReasonActionMismatch,
  OpenMeterUsageQueryUnauthorized,
  OpenMeterUsageQueryWindowTooLarge,
  type OpenMeterApiClientService,
  type OpenMeterUsageQueryRuntimeBounds,
} from "@comvestec/platform";

const targetTenant: OpenMeterUsageQueryTargetTenant = {
  scope: platformScope.organization,
  scopeId: "tenant-acme",
};

const operatorContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_omq_operator",
  sessionId: "sess_omq",
  correlationId: "corr_omq_service",
  reason: "operator runs an openmeter usage query backfill",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const individualContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.individualUser,
  actorId: "usr_omq_individual",
};

const baseBackfillInput = {
  requestContext: operatorContext,
  backfill: {
    tenant: targetTenant,
    subject: "subject-acme",
    meterSlug: "api.requests",
    window: {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-02T00:00:00.000Z",
    },
    granularity: "HOUR" as const,
    reasonCatalogId: reasonCatalogId.openMeterUsageQueryBackfill,
    reasonNarrative: "operator runs an openmeter usage query backfill",
    reasonAttachmentText: "runbook://usage/backfill",
  },
};

const baseQueryInput = {
  requestContext: operatorContext,
  query: {
    tenant: targetTenant,
    subject: "subject-acme",
    meterSlug: "api.requests",
    window: {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-02T00:00:00.000Z",
    },
    granularity: "HOUR" as const,
  },
};

const defaultBounds: OpenMeterUsageQueryRuntimeBounds = {
  queryCacheTtlSeconds: 60,
  maxWindowDays: 31,
  cacheMaxSize: 4,
};

const buildSnapshot = (
  overrides: Partial<OpenMeterUsageQuery> = {},
): OpenMeterUsageQuery => ({
  id: overrides.id ?? "omq_snapshot",
  tenant: overrides.tenant ?? targetTenant,
  subject: overrides.subject ?? "subject-acme",
  meterSlug: overrides.meterSlug ?? "api.requests",
  window: overrides.window ?? {
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-01-02T00:00:00.000Z",
  },
  granularity: overrides.granularity ?? "HOUR",
  aggregated: overrides.aggregated ?? [
    { windowStart: "2026-01-01T00:00:00.000Z", value: 0 },
  ],
  computedAt: overrides.computedAt ?? "2026-01-02T00:00:00.000Z",
  correlationId: overrides.correlationId ?? "corr_omq_service",
});

const createRepoStub = (
  overrides: Partial<OpenMeterUsageQueryRepositoryService> = {},
): {
  readonly service: OpenMeterUsageQueryRepositoryService;
  readonly upsertedInputs: ReadonlyArray<UpsertOpenMeterUsageQuerySnapshotRepositoryInput>;
  setLatest(snapshot: OpenMeterUsageQuery | undefined): void;
} => {
  const upsertedInputs: UpsertOpenMeterUsageQuerySnapshotRepositoryInput[] = [];
  let latest: OpenMeterUsageQuery | undefined;
  return {
    upsertedInputs,
    setLatest: (snapshot) => {
      latest = snapshot;
    },
    service: {
      upsertSnapshot:
        overrides.upsertSnapshot ??
        ((input) => {
          upsertedInputs.push(input);
          const snapshot = buildSnapshot({
            id: `omq_${upsertedInputs.length}`,
            tenant: input.tenant,
            subject: input.subject,
            meterSlug: input.meterSlug,
            window: { from: input.window.from, to: input.window.to },
            granularity: input.granularity,
            aggregated: input.aggregated as OpenMeterUsageQueryBucket[],
            computedAt: input.computedAt,
            correlationId: input.correlationId,
          });
          latest = snapshot;
          return Effect.succeed(snapshot);
        }),
      getLatestForTenantMeter:
        overrides.getLatestForTenantMeter ??
        (() =>
          Effect.succeed(
            latest === undefined
              ? Option.none<OpenMeterUsageQuery>()
              : Option.some(latest),
          )),
      getForTenantMeterWindow:
        overrides.getForTenantMeterWindow ??
        (() => Effect.succeed(Option.none<OpenMeterUsageQuery>())),
    },
  };
};

const createAuditStub = () => {
  const events: Array<{
    moduleId: string;
    action: string;
    target: string;
    reason: string;
  }> = [];
  const service: AuditLogModuleService = {
    append: (input) => {
      events.push({
        moduleId: input.moduleId,
        action: input.action,
        target: input.target,
        reason: input.reason ?? "",
      });
      return Effect.succeed({
        eventId: `evt_${events.length}`,
        moduleId: input.moduleId,
        action: input.action,
        target: input.target,
        reason: input.reason ?? input.requestContext.reason,
        actorId: input.requestContext.actorId ?? "anon",
        tenantScope: input.requestContext.tenant.scope,
        tenantScopeId: input.requestContext.tenant.scopeId,
        correlationId: input.requestContext.correlationId,
        timestamp: "2026-01-01T00:00:00.000Z",
      } as never);
    },
    queryByModule: () => Effect.succeed([]),
    queryByTarget: () => Effect.succeed([]),
    queryByActor: () => Effect.succeed([]),
    queryByTenant: () => Effect.succeed([]),
    requirements: Effect.succeed([]),
  };
  return { events, service };
};

const createApiClient = (
  buckets: ReadonlyArray<OpenMeterUsageQueryBucket> = [
    { windowStart: "2026-01-01T00:00:00.000Z", value: 0 },
  ],
): OpenMeterApiClientService => ({
  fetchUsageBuckets: () => Effect.succeed(buckets),
});

describe("OpenMeterUsageQueryService — backfill", () => {
  it("happy path upserts the snapshot, primes the cache, and emits both audits in order", async () => {
    const repo = createRepoStub();
    const audit = createAuditStub();
    const service = makeOpenMeterUsageQueryService({
      repository: repo.service,
      auditLog: audit.service,
      openMeterApiClient: createApiClient([
        { windowStart: "2026-01-01T00:00:00.000Z", value: 42 },
      ]),
      bounds: defaultBounds,
      now: () => new Date("2026-01-02T00:00:00.000Z"),
    });

    const result = await Effect.runPromise(
      service.requestBackfill(baseBackfillInput),
    );
    expect(result.accepted).toBe(true);
    expect(result.result.aggregated).toEqual([
      { windowStart: "2026-01-01T00:00:00.000Z", value: 42 },
    ]);
    expect(repo.upsertedInputs).toHaveLength(1);
    expect(audit.events).toHaveLength(2);
    expect(audit.events[0]?.action).toBe(
      openMeterUsageQueryAuditAction.queryExecuted,
    );
    expect(audit.events[0]?.reason).toBe(
      reasonCatalogId.openMeterUsageQueryRead,
    );
    expect(audit.events[1]?.action).toBe(
      openMeterUsageQueryAuditAction.backfillRequested,
    );
    expect(audit.events[1]?.reason).toBe(
      reasonCatalogId.openMeterUsageQueryBackfill,
    );
    expect(
      audit.events.every(
        (e) => e.moduleId === platformModuleId.openMeterUsageQuery,
      ),
    ).toBe(true);

    // Cache primed: subsequent read serves without hitting the repo.
    const cached = await Effect.runPromise(
      service.getLatestUsageQuery(baseQueryInput),
    );
    expect(Option.isSome(cached)).toBe(true);
    if (Option.isSome(cached)) {
      expect(cached.value.result.aggregated[0]?.value).toBe(42);
    }
  });

  it("rejects non-platform-operator actors with OpenMeterUsageQueryUnauthorized", async () => {
    const repo = createRepoStub();
    const audit = createAuditStub();
    const service = makeOpenMeterUsageQueryService({
      repository: repo.service,
      auditLog: audit.service,
      openMeterApiClient: createApiClient(),
      bounds: defaultBounds,
    });
    const exit = await Effect.runPromiseExit(
      service.requestBackfill({
        ...baseBackfillInput,
        requestContext: individualContext,
      }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(OpenMeterUsageQueryUnauthorized);
    }
    expect(repo.upsertedInputs).toHaveLength(0);
    expect(audit.events).toHaveLength(0);
  });

  it("rejects missing actorId with OpenMeterUsageQueryMissingActorIdentity", async () => {
    const repo = createRepoStub();
    const audit = createAuditStub();
    const service = makeOpenMeterUsageQueryService({
      repository: repo.service,
      auditLog: audit.service,
      openMeterApiClient: createApiClient(),
      bounds: defaultBounds,
    });
    const exit = await Effect.runPromiseExit(
      service.requestBackfill({
        ...baseBackfillInput,
        requestContext: {
          ...operatorContext,
          actorId: undefined as unknown as string,
        },
      }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(
        OpenMeterUsageQueryMissingActorIdentity,
      );
    }
  });

  it("rejects reasonCatalogId outside ReasonCatalogIdSchema with OpenMeterUsageQueryReasonNotInCatalog", async () => {
    const repo = createRepoStub();
    const audit = createAuditStub();
    const service = makeOpenMeterUsageQueryService({
      repository: repo.service,
      auditLog: audit.service,
      openMeterApiClient: createApiClient(),
      bounds: defaultBounds,
    });
    const exit = await Effect.runPromiseExit(
      service.requestBackfill({
        ...baseBackfillInput,
        backfill: {
          ...baseBackfillInput.backfill,
          reasonCatalogId: "not-in-catalog",
        },
      }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(
        OpenMeterUsageQueryReasonNotInCatalog,
      );
    }
  });

  it("rejects a parseable but wrong-catalog reason on backfill (reason/action mismatch)", async () => {
    const repo = createRepoStub();
    const audit = createAuditStub();
    const service = makeOpenMeterUsageQueryService({
      repository: repo.service,
      auditLog: audit.service,
      openMeterApiClient: createApiClient(),
      bounds: defaultBounds,
    });
    const exit = await Effect.runPromiseExit(
      service.requestBackfill({
        ...baseBackfillInput,
        backfill: {
          ...baseBackfillInput.backfill,
          reasonCatalogId: reasonCatalogId.openMeterUsageQueryRead,
        },
      }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(
        OpenMeterUsageQueryReasonActionMismatch,
      );
    }
  });

  it("rejects backfill with whitespace-only reasonAttachmentText (ReasonAttachmentRequired, no audit emission)", async () => {
    const repo = createRepoStub();
    const audit = createAuditStub();
    const service = makeOpenMeterUsageQueryService({
      repository: repo.service,
      auditLog: audit.service,
      openMeterApiClient: createApiClient(),
      bounds: defaultBounds,
    });
    const exit = await Effect.runPromiseExit(
      service.requestBackfill({
        ...baseBackfillInput,
        backfill: {
          ...baseBackfillInput.backfill,
          reasonAttachmentText: "   ",
        },
      }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(
        OpenMeterUsageQueryReasonAttachmentRequired,
      );
    }
    expect(repo.upsertedInputs).toHaveLength(0);
    expect(audit.events).toHaveLength(0);
  });

  it("rejects windows exceeding maxWindowDays with OpenMeterUsageQueryWindowTooLarge", async () => {
    const repo = createRepoStub();
    const audit = createAuditStub();
    const service = makeOpenMeterUsageQueryService({
      repository: repo.service,
      auditLog: audit.service,
      openMeterApiClient: createApiClient(),
      bounds: { ...defaultBounds, maxWindowDays: 1 },
    });
    const exit = await Effect.runPromiseExit(
      service.requestBackfill({
        ...baseBackfillInput,
        backfill: {
          ...baseBackfillInput.backfill,
          window: {
            from: "2026-01-01T00:00:00.000Z",
            to: "2026-02-01T00:00:00.000Z",
          },
        },
      }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(
        OpenMeterUsageQueryWindowTooLarge,
      );
    }
  });

  it("propagates OpenMeterApiClientError from the injected port", async () => {
    const repo = createRepoStub();
    const audit = createAuditStub();
    const service = makeOpenMeterUsageQueryService({
      repository: repo.service,
      auditLog: audit.service,
      openMeterApiClient: {
        fetchUsageBuckets: (input) =>
          Effect.fail(
            new OpenMeterApiClientError({
              operation: "fetchUsageBuckets",
              tenant: input.tenant,
              meterSlug: input.meterSlug,
              cause: new Error("upstream boom"),
            }),
          ),
      },
      bounds: defaultBounds,
    });
    const exit = await Effect.runPromiseExit(
      service.requestBackfill(baseBackfillInput),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(OpenMeterApiClientError);
    }
    expect(repo.upsertedInputs).toHaveLength(0);
    expect(audit.events).toHaveLength(0);
  });
});

describe("OpenMeterUsageQueryService — read path", () => {
  it("flips isFresh once past queryCacheTtlSeconds", async () => {
    const repo = createRepoStub();
    repo.setLatest(buildSnapshot({ computedAt: "2026-01-01T00:00:00.000Z" }));
    const audit = createAuditStub();

    const freshService = makeOpenMeterUsageQueryService({
      repository: repo.service,
      auditLog: audit.service,
      openMeterApiClient: createApiClient(),
      bounds: { ...defaultBounds, queryCacheTtlSeconds: 60 },
      now: () => new Date("2026-01-01T00:00:30.000Z"),
    });
    const fresh = await Effect.runPromise(
      freshService.getLatestUsageQuery(baseQueryInput),
    );
    expect(Option.isSome(fresh)).toBe(true);
    if (Option.isSome(fresh)) {
      expect(fresh.value.isFresh).toBe(true);
    }

    const repo2 = createRepoStub();
    repo2.setLatest(buildSnapshot({ computedAt: "2026-01-01T00:00:00.000Z" }));
    const staleService = makeOpenMeterUsageQueryService({
      repository: repo2.service,
      auditLog: createAuditStub().service,
      openMeterApiClient: createApiClient(),
      bounds: { ...defaultBounds, queryCacheTtlSeconds: 60 },
      now: () => new Date("2026-01-01T00:05:00.000Z"),
    });
    const stale = await Effect.runPromise(
      staleService.getLatestUsageQuery(baseQueryInput),
    );
    expect(Option.isSome(stale)).toBe(true);
    if (Option.isSome(stale)) {
      expect(stale.value.isFresh).toBe(false);
    }
  });

  it("evicts insertion-order entries when cacheMaxSize is reached", async () => {
    const audit = createAuditStub();
    const repoCalls: string[] = [];
    const stubs = new Map<string, OpenMeterUsageQuery>();
    const repo: OpenMeterUsageQueryRepositoryService = {
      upsertSnapshot: () => Effect.die(new Error("not used")),
      getForTenantMeterWindow: () =>
        Effect.succeed(Option.none<OpenMeterUsageQuery>()),
      getLatestForTenantMeter: (input) => {
        repoCalls.push(input.meterSlug);
        const found = stubs.get(input.meterSlug);
        return Effect.succeed(
          found === undefined ? Option.none() : Option.some(found),
        );
      },
    };
    for (const meterSlug of ["m1", "m2", "m3", "m4"]) {
      stubs.set(meterSlug, buildSnapshot({ id: meterSlug, meterSlug }));
    }

    const service = makeOpenMeterUsageQueryService({
      repository: repo,
      auditLog: audit.service,
      openMeterApiClient: createApiClient(),
      bounds: { ...defaultBounds, cacheMaxSize: 2 },
      now: () => new Date("2026-01-02T00:00:00.000Z"),
    });

    for (const meterSlug of ["m1", "m2", "m3", "m4"]) {
      await Effect.runPromise(
        service.getLatestUsageQuery({
          ...baseQueryInput,
          query: { ...baseQueryInput.query, meterSlug },
        }),
      );
    }
    // All four cold reads hit the repo because the cache is bounded at 2.
    expect(repoCalls).toEqual(["m1", "m2", "m3", "m4"]);

    // m1 + m2 were evicted; m3 + m4 remain cached.
    await Effect.runPromise(
      service.getLatestUsageQuery({
        ...baseQueryInput,
        query: { ...baseQueryInput.query, meterSlug: "m3" },
      }),
    );
    await Effect.runPromise(
      service.getLatestUsageQuery({
        ...baseQueryInput,
        query: { ...baseQueryInput.query, meterSlug: "m4" },
      }),
    );
    expect(repoCalls).toEqual(["m1", "m2", "m3", "m4"]);

    // m1 was evicted, so it re-hits the repo.
    await Effect.runPromise(
      service.getLatestUsageQuery({
        ...baseQueryInput,
        query: { ...baseQueryInput.query, meterSlug: "m1" },
      }),
    );
    expect(repoCalls).toEqual(["m1", "m2", "m3", "m4", "m1"]);
  });
});
