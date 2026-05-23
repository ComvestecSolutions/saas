/**
 * Vendor-health aggregator platform service tests (admin-app
 * implementation plan §9 item 9 — read-only, operator-only).
 *
 * Exercises the owner-locked invariants enforced ABOVE the
 * default healthcheck-port implementation in
 * `packages/platform/src/services/domains/vendor-health-aggregator-service.ts`:
 *
 *   - operator-only authz (platformOperator + supportOperator
 *     allowed; non-operator + anonymous rejected)
 *   - aggregate v2 partial-failure semantics (success +
 *     `partialFailures` populated mid-aggregate; all-fail →
 *     `VendorHealthAggregatorAllSourcesFailedError`)
 *   - audit emission on every successful aggregate (even partial)
 *   - bounded in-memory snapshot cache (single key) with
 *     `cacheMaxSize` insertion-order eviction
 *   - freshness reconciliation via `isAggregateFresh` (fresh →
 *     served from cache; stale → recomputes against the port)
 *   - every aggregate row carries a `serviceName` decoded against
 *     `PlatformAdapterServiceNameSchema` (no raw literal leaks)
 */
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformAdapterServiceName,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  vendorHealthAggregatorAuditAction,
  type AuditEvent,
  type PlatformAdapterServiceName,
  type RequestContext,
  type VendorHealthAggregateEntry,
} from "@comvestec/contracts";
import type { AuditLogModuleService } from "@comvestec/modules";
import {
  makeVendorHealthAggregatorService,
  VendorHealthAggregatorAllSourcesFailedError,
  VendorHealthAggregatorMissingActorIdentity,
  VendorHealthAggregatorUnauthorized,
  type VendorHealthcheckPortService,
  type VendorHealthAggregatorRuntimeBounds,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const operatorContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_vh_operator",
  sessionId: "sess_vh",
  correlationId: "corr_vh_operator",
  reason: "vendor-health aggregator service unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const supportOperatorContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.supportOperator,
  actorId: "usr_vh_support",
  correlationId: "corr_vh_support",
};

const nonOperatorContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.individualUser,
  actorId: "usr_vh_user",
};

const defaultBounds: VendorHealthAggregatorRuntimeBounds = {
  snapshotCacheTtlSeconds: 30,
  cacheMaxSize: 1,
};

const buildHealthyEntry = (
  serviceName: PlatformAdapterServiceName,
  overrides: Partial<VendorHealthAggregateEntry> = {},
): VendorHealthAggregateEntry => ({
  serviceName,
  status: "healthy",
  latencyMs: overrides.latencyMs ?? 12,
  lastCheckedAt: overrides.lastCheckedAt ?? "2026-02-01T00:00:00.000Z",
  ...(overrides.version !== undefined ? { version: overrides.version } : {}),
  ...(overrides.message !== undefined ? { message: overrides.message } : {}),
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
    get calls(): AuditCalls {
      return calls;
    },
  };
};

type StubAdapterSpec = {
  readonly serviceName: PlatformAdapterServiceName;
  readonly result:
    | { readonly kind: "healthy"; readonly entry?: VendorHealthAggregateEntry }
    | { readonly kind: "fail"; readonly cause: unknown };
};

const createPortDouble = (
  specs: ReadonlyArray<StubAdapterSpec>,
): VendorHealthcheckPortService => ({
  checkAll: () =>
    specs.map((spec) => ({
      serviceName: spec.serviceName,
      result:
        spec.result.kind === "healthy"
          ? Effect.succeed(
              spec.result.entry ?? buildHealthyEntry(spec.serviceName),
            )
          : Effect.fail(spec.result.cause),
    })),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("vendor-health-aggregator service — happy + partial failure", () => {
  it("happy path returns every source as healthy, populates no partialFailures, and audits once", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble([
      {
        serviceName: platformAdapterServiceName.postgres,
        result: { kind: "healthy" },
      },
      {
        serviceName: platformAdapterServiceName.convex,
        result: { kind: "healthy" },
      },
      {
        serviceName: platformAdapterServiceName.keycloak,
        result: { kind: "healthy" },
      },
    ]);
    const service = makeVendorHealthAggregatorService({
      auditLog: audit.service,
      vendorHealthcheckPort: port,
      bounds: defaultBounds,
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const view = await Effect.runPromise(
      service.getAggregate({ requestContext: operatorContext }),
    );

    expect(view.isFresh).toBe(true);
    expect(view.aggregate.entries.map((e) => e.serviceName)).toEqual([
      platformAdapterServiceName.postgres,
      platformAdapterServiceName.convex,
      platformAdapterServiceName.keycloak,
    ]);
    expect(view.aggregate.entries.every((e) => e.status === "healthy")).toBe(
      true,
    );
    expect(view.aggregate.partialFailures).toEqual([]);
    expect(view.aggregate.correlationId).toBe(operatorContext.correlationId);

    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]).toMatchObject({
      moduleId: platformModuleId.vendorHealthAggregator,
      action: vendorHealthAggregatorAuditAction.snapshotComputed,
      target: operatorContext.correlationId,
      reason: reasonCatalogId.vendorHealthAggregatorRead,
    });
  });

  it("mid-aggregate failures degrade the row to unavailable + populate partialFailures and still audit", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble([
      {
        serviceName: platformAdapterServiceName.postgres,
        result: { kind: "healthy" },
      },
      {
        serviceName: platformAdapterServiceName.polar,
        result: { kind: "fail", cause: new Error("polar down") },
      },
      {
        serviceName: platformAdapterServiceName.novu,
        result: { kind: "fail", cause: { _tag: "NovuAdapterTransportError" } },
      },
    ]);
    const service = makeVendorHealthAggregatorService({
      auditLog: audit.service,
      vendorHealthcheckPort: port,
      bounds: defaultBounds,
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const view = await Effect.runPromise(
      service.getAggregate({ requestContext: operatorContext }),
    );

    expect(view.aggregate.entries).toHaveLength(3);
    expect(view.aggregate.entries[0]?.status).toBe("healthy");
    expect(view.aggregate.entries[1]?.status).toBe("unavailable");
    expect(view.aggregate.entries[1]?.message).toBe("polar down");
    expect(view.aggregate.entries[2]?.status).toBe("unavailable");
    expect(view.aggregate.entries[2]?.message).toBe(
      "NovuAdapterTransportError",
    );

    expect(view.aggregate.partialFailures).toEqual([
      { serviceName: platformAdapterServiceName.polar, reason: "polar down" },
      {
        serviceName: platformAdapterServiceName.novu,
        reason: "NovuAdapterTransportError",
      },
    ]);
    expect(audit.calls).toHaveLength(1);
  });

  it("all-fail path raises VendorHealthAggregatorAllSourcesFailedError and suppresses audit", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble([
      {
        serviceName: platformAdapterServiceName.postgres,
        result: { kind: "fail", cause: "db down" },
      },
      {
        serviceName: platformAdapterServiceName.polar,
        result: { kind: "fail", cause: "polar down" },
      },
    ]);
    const service = makeVendorHealthAggregatorService({
      auditLog: audit.service,
      vendorHealthcheckPort: port,
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getAggregate({ requestContext: operatorContext }),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
      expect(failure).toBeInstanceOf(
        VendorHealthAggregatorAllSourcesFailedError,
      );
      if (failure instanceof VendorHealthAggregatorAllSourcesFailedError) {
        expect(failure.args.failures).toHaveLength(2);
      }
    }
    expect(audit.calls).toHaveLength(0);
  });
});

describe("vendor-health-aggregator service — authz", () => {
  it("rejects anonymous actor (missing actorId) with MissingActorIdentity", async () => {
    const service = makeVendorHealthAggregatorService({
      auditLog: createAuditDouble().service,
      vendorHealthcheckPort: createPortDouble([
        {
          serviceName: platformAdapterServiceName.postgres,
          result: { kind: "healthy" },
        },
      ]),
      bounds: defaultBounds,
    });

    const anonymous: RequestContext = {
      ...operatorContext,
      actorId: undefined,
    } as unknown as RequestContext;

    const exit = await Effect.runPromiseExit(
      service.getAggregate({ requestContext: anonymous }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
      expect(failure).toBeInstanceOf(
        VendorHealthAggregatorMissingActorIdentity,
      );
    }
  });

  it("rejects non-operator actor with Unauthorized", async () => {
    const service = makeVendorHealthAggregatorService({
      auditLog: createAuditDouble().service,
      vendorHealthcheckPort: createPortDouble([
        {
          serviceName: platformAdapterServiceName.postgres,
          result: { kind: "healthy" },
        },
      ]),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getAggregate({ requestContext: nonOperatorContext }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
      expect(failure).toBeInstanceOf(VendorHealthAggregatorUnauthorized);
    }
  });

  it("allows supportOperator actor", async () => {
    const audit = createAuditDouble();
    const service = makeVendorHealthAggregatorService({
      auditLog: audit.service,
      vendorHealthcheckPort: createPortDouble([
        {
          serviceName: platformAdapterServiceName.postgres,
          result: { kind: "healthy" },
        },
      ]),
      bounds: defaultBounds,
    });

    const view = await Effect.runPromise(
      service.getAggregate({ requestContext: supportOperatorContext }),
    );

    expect(view.aggregate.entries).toHaveLength(1);
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]).toMatchObject({
      target: supportOperatorContext.correlationId,
    });
  });
});

describe("vendor-health-aggregator service — cache + freshness", () => {
  it("serves the second read from cache when within snapshotCacheTtlSeconds and recomputes when stale", async () => {
    const audit = createAuditDouble();
    let computeCount = 0;
    const port: VendorHealthcheckPortService = {
      checkAll: () => [
        {
          serviceName: platformAdapterServiceName.postgres,
          result: Effect.sync(() => {
            computeCount += 1;
            return buildHealthyEntry(platformAdapterServiceName.postgres);
          }),
        },
      ],
    };

    let nowMs = Date.parse("2026-02-01T00:00:00.000Z");
    const service = makeVendorHealthAggregatorService({
      auditLog: audit.service,
      vendorHealthcheckPort: port,
      bounds: { snapshotCacheTtlSeconds: 30, cacheMaxSize: 1 },
      now: () => new Date(nowMs),
    });

    await Effect.runPromise(
      service.getAggregate({ requestContext: operatorContext }),
    );
    expect(computeCount).toBe(1);

    // Within TTL → cache hit, no recompute, no second audit.
    nowMs += 10_000;
    const cachedView = await Effect.runPromise(
      service.getAggregate({ requestContext: operatorContext }),
    );
    expect(cachedView.isFresh).toBe(true);
    expect(computeCount).toBe(1);
    expect(audit.calls).toHaveLength(1);

    // Past TTL → recompute and re-audit.
    nowMs += 60_000;
    const recomputedView = await Effect.runPromise(
      service.getAggregate({ requestContext: operatorContext }),
    );
    expect(computeCount).toBe(2);
    expect(audit.calls).toHaveLength(2);
    expect(recomputedView.aggregate.entries).toHaveLength(1);
  });

  it("respects cacheMaxSize=1 insertion-order eviction (clamped lower bound still functions)", async () => {
    // The aggregate is keyed by a single canonical key (`global`),
    // so cacheMaxSize=1 is the natural floor; this pin ensures the
    // bounded-cache wrapper never throws on the smallest valid
    // configuration and that the stale-drop path still re-enters
    // the cache after recompute.
    const audit = createAuditDouble();
    let nowMs = Date.parse("2026-02-01T00:00:00.000Z");
    const port = createPortDouble([
      {
        serviceName: platformAdapterServiceName.postgres,
        result: { kind: "healthy" },
      },
    ]);
    const service = makeVendorHealthAggregatorService({
      auditLog: audit.service,
      vendorHealthcheckPort: port,
      bounds: { snapshotCacheTtlSeconds: 1, cacheMaxSize: 1 },
      now: () => new Date(nowMs),
    });

    await Effect.runPromise(
      service.getAggregate({ requestContext: operatorContext }),
    );
    nowMs += 5_000;
    await Effect.runPromise(
      service.getAggregate({ requestContext: operatorContext }),
    );
    nowMs += 5_000;
    await Effect.runPromise(
      service.getAggregate({ requestContext: operatorContext }),
    );

    expect(audit.calls).toHaveLength(3);
  });
});
