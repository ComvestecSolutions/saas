/**
 * OpenMeter meter read platform service tests (admin-app
 * implementation plan §9 item 10 — per-vendor read helpers, batch
 * A vendor #3, READ-ONLY operator console).
 *
 * Exercises the owner-locked invariants enforced ABOVE the
 * default Openmeter-adapter-backed port in
 * `packages/platform/src/services/domains/open-meter-meter-read-service.ts`:
 *
 *   - operator-only authz (platformOperator + supportOperator
 *     allowed; non-operator → `OpenMeterMeterReadUnauthorized`,
 *     missing `actorId` → `OpenMeterMeterReadMissingActorIdentity`)
 *   - reason-catalog decode (only `reasonCatalogId.openMeterMeterRead`
 *     allowed; everything else → `OpenMeterMeterReadReasonNotInCatalog`)
 *   - adapter error surfaces as
 *     `OpenMeterMeterReadAdapterClientError` with audit suppressed
 *   - audit emission on every successful read (cache hit AND
 *     cache miss) keyed by `platformModuleId.openMeterMeterRead` +
 *     `openMeterMeterReadAuditAction.readPerformed` +
 *     `reasonCatalogId.openMeterMeterRead`
 *   - bounded per-tenant snapshot cache with insertion-order
 *     eviction; freshness reconciliation via
 *     `isOpenMeterMeterSummaryFresh` drops stale entries
 */
import { Effect, Exit, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  openMeterMeterReadAuditAction,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  type AuditEvent,
  type OpenMeterMeterReadTargetTenant,
  type OpenMeterMeterSummary,
  type RequestContext,
} from "@comvestec/contracts";
import type { AuditLogModuleService } from "@comvestec/modules";
import {
  makeOpenMeterMeterReadService,
  OpenMeterMeterReadAdapterClientError,
  OpenMeterMeterReadMissingActorIdentity,
  OpenMeterMeterReadReasonActionMismatch,
  OpenMeterMeterReadReasonNotInCatalog,
  OpenMeterMeterReadUnauthorized,
  type OpenMeterMeterApiClientService,
  type OpenMeterMeterReadRuntimeBounds,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const tenant: OpenMeterMeterReadTargetTenant = {
  scope: platformScope.platform,
  scopeId: platformScope.platform,
};

const operatorContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_om_operator",
  sessionId: "sess_om",
  correlationId: "corr_om_operator",
  reason: "openmeter meter read service unit test",
  tenant,
};

const supportOperatorContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.supportOperator,
  actorId: "usr_om_support",
  correlationId: "corr_om_support",
};

const nonOperatorContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.individualUser,
  actorId: "usr_om_user",
};

const anonymousContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.anonymous,
  actorId: undefined,
};

const defaultBounds: OpenMeterMeterReadRuntimeBounds = {
  cacheMaxSize: 2,
  snapshotCacheTtlSeconds: 30,
  defaultListLimit: 25,
};

const summaryFixture: OpenMeterMeterSummary = {
  meterSlug: "meter.api.requests",
  displayName: "API Requests",
  aggregation: "COUNT",
  eventType: "api.request",
  valueProperty: "$.bytes",
  createdAt: "2026-01-01T00:00:00.000Z",
};

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

type PortDouble = OpenMeterMeterApiClientService & {
  readonly getBySlugCount: () => number;
};

const createPortDouble = (overrides?: {
  readonly getBySlugResult?: Option.Option<OpenMeterMeterSummary>;
  readonly listResult?: ReadonlyArray<OpenMeterMeterSummary>;
  readonly getBySlugError?: unknown;
  readonly listError?: unknown;
}): PortDouble => {
  let getBySlugInvocations = 0;
  return {
    getBySlug: (input) => {
      getBySlugInvocations += 1;
      if (overrides?.getBySlugError !== undefined) {
        return Effect.fail(
          new OpenMeterMeterReadAdapterClientError({
            operation: "getBySlug",
            tenant: input.tenant,
            cause: overrides.getBySlugError,
          }),
        );
      }
      return Effect.succeed(
        overrides?.getBySlugResult ?? Option.some(summaryFixture),
      );
    },
    listAll: (input) => {
      if (overrides?.listError !== undefined) {
        return Effect.fail(
          new OpenMeterMeterReadAdapterClientError({
            operation: "listAll",
            tenant: input.tenant,
            cause: overrides.listError,
          }),
        );
      }
      return Effect.succeed(overrides?.listResult ?? [summaryFixture]);
    },
    listByEventType: (input) => {
      if (overrides?.listError !== undefined) {
        return Effect.fail(
          new OpenMeterMeterReadAdapterClientError({
            operation: "listByEventType",
            tenant: input.tenant,
            cause: overrides.listError,
          }),
        );
      }
      return Effect.succeed(overrides?.listResult ?? [summaryFixture]);
    },
    getBySlugCount: () => getBySlugInvocations,
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("open-meter-meter-read service — happy paths + audit", () => {
  it("getBySlug returns the summary, audits once, and serves cache hit while still auditing", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    const service = makeOpenMeterMeterReadService({
      auditLog: audit.service,
      openMeterMeterApiClient: port,
      bounds: defaultBounds,
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const first = await Effect.runPromise(
      service.getBySlug({
        requestContext: operatorContext,
        query: {
          tenant,
          meterSlug: summaryFixture.meterSlug,
          reasonCatalogId: reasonCatalogId.openMeterMeterRead,
        },
      }),
    );

    expect(Option.isSome(first)).toBe(true);
    if (Option.isSome(first)) {
      expect(first.value.summary).toEqual(summaryFixture);
      expect(first.value.isFresh).toBe(true);
    }
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]).toMatchObject({
      moduleId: platformModuleId.openMeterMeterRead,
      action: openMeterMeterReadAuditAction.readPerformed,
      target: summaryFixture.meterSlug,
      reason: reasonCatalogId.openMeterMeterRead,
    });

    const second = await Effect.runPromise(
      service.getBySlug({
        requestContext: operatorContext,
        query: {
          tenant,
          meterSlug: summaryFixture.meterSlug,
          reasonCatalogId: reasonCatalogId.openMeterMeterRead,
        },
      }),
    );
    expect(Option.isSome(second)).toBe(true);
    expect(port.getBySlugCount()).toBe(1);
    expect(audit.calls).toHaveLength(2);
  });

  it("listAll returns the list and audits with `all` target; supportOperator is allowed", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    const service = makeOpenMeterMeterReadService({
      auditLog: audit.service,
      openMeterMeterApiClient: port,
      bounds: defaultBounds,
    });

    const view = await Effect.runPromise(
      service.listAll({
        requestContext: supportOperatorContext,
        query: {
          tenant,
          reasonCatalogId: reasonCatalogId.openMeterMeterRead,
        },
      }),
    );

    expect(view.summaries).toEqual([summaryFixture]);
    expect(view.isFresh).toBe(true);
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]?.target).toBe("all");
  });

  it("listByEventType returns the list and audits with eventType-prefixed target", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    const service = makeOpenMeterMeterReadService({
      auditLog: audit.service,
      openMeterMeterApiClient: port,
      bounds: defaultBounds,
    });

    const view = await Effect.runPromise(
      service.listByEventType({
        requestContext: operatorContext,
        query: {
          tenant,
          eventType: "api.request",
          reasonCatalogId: reasonCatalogId.openMeterMeterRead,
        },
      }),
    );

    expect(view.summaries).toEqual([summaryFixture]);
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]?.target).toBe("eventType:api.request");
  });
});

describe("open-meter-meter-read service — authz + reason-catalog enforcement", () => {
  it("anonymous actor surfaces OpenMeterMeterReadMissingActorIdentity and never audits", async () => {
    const audit = createAuditDouble();
    const service = makeOpenMeterMeterReadService({
      auditLog: audit.service,
      openMeterMeterApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getBySlug({
        requestContext: anonymousContext,
        query: {
          tenant,
          meterSlug: summaryFixture.meterSlug,
          reasonCatalogId: reasonCatalogId.openMeterMeterRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "OpenMeterMeterReadMissingActorIdentity",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("non-operator actor surfaces OpenMeterMeterReadUnauthorized and never audits", async () => {
    const audit = createAuditDouble();
    const service = makeOpenMeterMeterReadService({
      auditLog: audit.service,
      openMeterMeterApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.listByEventType({
        requestContext: nonOperatorContext,
        query: {
          tenant,
          eventType: "api.request",
          reasonCatalogId: reasonCatalogId.openMeterMeterRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "OpenMeterMeterReadUnauthorized",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("rejects unknown reasonCatalogId with OpenMeterMeterReadReasonNotInCatalog", async () => {
    const audit = createAuditDouble();
    const service = makeOpenMeterMeterReadService({
      auditLog: audit.service,
      openMeterMeterApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getBySlug({
        requestContext: operatorContext,
        query: {
          tenant,
          meterSlug: summaryFixture.meterSlug,
          reasonCatalogId: "not-a-real-reason",
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "OpenMeterMeterReadReasonNotInCatalog",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("rejects mismatched reasonCatalogId with OpenMeterMeterReadReasonActionMismatch", async () => {
    const audit = createAuditDouble();
    const service = makeOpenMeterMeterReadService({
      auditLog: audit.service,
      openMeterMeterApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getBySlug({
        requestContext: operatorContext,
        query: {
          tenant,
          meterSlug: summaryFixture.meterSlug,
          reasonCatalogId: reasonCatalogId.tenantWorkspaceRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "OpenMeterMeterReadReasonActionMismatch",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
  });
});

describe("open-meter-meter-read service — adapter errors + cache eviction", () => {
  it("propagates OpenMeterMeterReadAdapterClientError and suppresses audit", async () => {
    const audit = createAuditDouble();
    const service = makeOpenMeterMeterReadService({
      auditLog: audit.service,
      openMeterMeterApiClient: createPortDouble({
        getBySlugError: { _tag: "OpenmeterAdapterRequestError" },
      }),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getBySlug({
        requestContext: operatorContext,
        query: {
          tenant,
          meterSlug: summaryFixture.meterSlug,
          reasonCatalogId: reasonCatalogId.openMeterMeterRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "OpenMeterMeterReadAdapterClientError",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("evicts the oldest entry once cacheMaxSize is exceeded (insertion-order eviction)", async () => {
    const audit = createAuditDouble();
    const summaryB: OpenMeterMeterSummary = {
      ...summaryFixture,
      meterSlug: "meter.api.bytes",
      displayName: "API Bytes",
      eventType: "api.bytes",
    };
    const summaryC: OpenMeterMeterSummary = {
      ...summaryFixture,
      meterSlug: "meter.api.errors",
      displayName: "API Errors",
      eventType: "api.error",
    };
    let invocation = 0;
    const port: OpenMeterMeterApiClientService = {
      getBySlug: (input) => {
        invocation += 1;
        const match = [summaryFixture, summaryB, summaryC].find(
          (candidate) => candidate.meterSlug === input.meterSlug,
        );
        return Effect.succeed(
          match ? Option.some(match) : Option.none<OpenMeterMeterSummary>(),
        );
      },
      listAll: () => Effect.succeed([]),
      listByEventType: () => Effect.succeed([]),
    };
    const service = makeOpenMeterMeterReadService({
      auditLog: audit.service,
      openMeterMeterApiClient: port,
      bounds: { ...defaultBounds, cacheMaxSize: 2 },
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const run = (meterSlug: string) =>
      service.getBySlug({
        requestContext: operatorContext,
        query: {
          tenant,
          meterSlug,
          reasonCatalogId: reasonCatalogId.openMeterMeterRead,
        },
      });

    await Effect.runPromise(run(summaryFixture.meterSlug));
    await Effect.runPromise(run(summaryB.meterSlug));
    await Effect.runPromise(run(summaryC.meterSlug));
    expect(invocation).toBe(3);

    await Effect.runPromise(run(summaryFixture.meterSlug));
    expect(invocation).toBe(4);

    await Effect.runPromise(run(summaryC.meterSlug));
    expect(invocation).toBe(4);
  });

  it("drops stale cache entries when snapshotCacheTtlSeconds elapses", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    let currentMs = new Date("2026-02-01T00:00:00.000Z").getTime();
    const service = makeOpenMeterMeterReadService({
      auditLog: audit.service,
      openMeterMeterApiClient: port,
      bounds: { ...defaultBounds, snapshotCacheTtlSeconds: 1 },
      now: () => new Date(currentMs),
    });

    await Effect.runPromise(
      service.getBySlug({
        requestContext: operatorContext,
        query: {
          tenant,
          meterSlug: summaryFixture.meterSlug,
          reasonCatalogId: reasonCatalogId.openMeterMeterRead,
        },
      }),
    );
    expect(port.getBySlugCount()).toBe(1);

    currentMs += 5_000;
    await Effect.runPromise(
      service.getBySlug({
        requestContext: operatorContext,
        query: {
          tenant,
          meterSlug: summaryFixture.meterSlug,
          reasonCatalogId: reasonCatalogId.openMeterMeterRead,
        },
      }),
    );
    expect(port.getBySlugCount()).toBe(2);
  });
});
