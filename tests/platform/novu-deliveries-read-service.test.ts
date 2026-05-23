/**
 * Novu deliveries read platform service tests (admin-app
 * implementation plan §9 item 10 — per-vendor read helpers, batch
 * B vendor #1, READ-ONLY operator console).
 *
 * Exercises the owner-locked invariants enforced ABOVE the
 * default Novu-adapter-backed port in
 * `packages/platform/src/services/domains/novu-deliveries-read-service.ts`:
 *
 *   - operator-only authz (platformOperator + supportOperator
 *     allowed; non-operator → `NovuDeliveriesReadUnauthorized`,
 *     missing `actorId` → `NovuDeliveriesReadMissingActorIdentity`)
 *   - reason-catalog decode (only
 *     `reasonCatalogId.novuDeliveriesRead` allowed; everything else
 *     → `NovuDeliveriesReadReasonNotInCatalog`)
 *   - adapter error surfaces as
 *     `NovuDeliveriesReadAdapterClientError` with audit suppressed
 *   - audit emission on every successful read (cache hit AND
 *     cache miss) keyed by `platformModuleId.novuDeliveriesRead` +
 *     `novuDeliveriesReadAuditAction.readPerformed` +
 *     `reasonCatalogId.novuDeliveriesRead`
 *   - bounded per-tenant snapshot cache with insertion-order
 *     eviction; freshness reconciliation via
 *     `isNovuDeliverySummaryFresh` drops stale entries
 */
import { Effect, Exit, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  novuDeliveriesReadAuditAction,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  type AuditEvent,
  type NovuDeliveriesReadTargetTenant,
  type NovuDeliverySummary,
  type RequestContext,
} from "@comvestec/contracts";
import type { AuditLogModuleService } from "@comvestec/modules";
import {
  makeNovuDeliveriesReadService,
  NovuDeliveriesReadAdapterClientError,
  NovuDeliveriesReadMissingActorIdentity,
  NovuDeliveriesReadReasonActionMismatch,
  NovuDeliveriesReadReasonNotInCatalog,
  NovuDeliveriesReadUnauthorized,
  type NovuDeliveriesApiClientService,
  type NovuDeliveriesReadRuntimeBounds,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const tenant: NovuDeliveriesReadTargetTenant = {
  scope: platformScope.platform,
  scopeId: platformScope.platform,
};

const operatorContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_novu_operator",
  sessionId: "sess_novu",
  correlationId: "corr_novu_operator",
  reason: "novu deliveries read service unit test",
  tenant,
};

const supportOperatorContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.supportOperator,
  actorId: "usr_novu_support",
  correlationId: "corr_novu_support",
};

const nonOperatorContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.individualUser,
  actorId: "usr_novu_user",
};

const anonymousContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.anonymous,
  actorId: undefined,
};

const defaultBounds: NovuDeliveriesReadRuntimeBounds = {
  cacheMaxSize: 2,
  snapshotCacheTtlSeconds: 30,
  defaultListLimit: 25,
};

const summaryFixture: NovuDeliverySummary = {
  deliveryId: "del_test_001",
  subscriberId: "sub_test_001",
  channel: "email",
  status: "sent",
  sentAt: "2026-01-01T00:00:00.000Z",
  templateId: "tpl_welcome",
  templateName: "Welcome Email",
  payloadDigest: "sha256:abc",
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

type PortDouble = NovuDeliveriesApiClientService & {
  readonly getByIdCount: () => number;
};

const createPortDouble = (overrides?: {
  readonly getByIdResult?: Option.Option<NovuDeliverySummary>;
  readonly listResult?: ReadonlyArray<NovuDeliverySummary>;
  readonly getByIdError?: unknown;
  readonly listError?: unknown;
}): PortDouble => {
  let getByIdInvocations = 0;
  return {
    getById: (input) => {
      getByIdInvocations += 1;
      if (overrides?.getByIdError !== undefined) {
        return Effect.fail(
          new NovuDeliveriesReadAdapterClientError({
            operation: "getById",
            tenant: input.tenant,
            cause: overrides.getByIdError,
          }),
        );
      }
      return Effect.succeed(
        overrides?.getByIdResult ?? Option.some(summaryFixture),
      );
    },
    listByRecipient: (input) => {
      if (overrides?.listError !== undefined) {
        return Effect.fail(
          new NovuDeliveriesReadAdapterClientError({
            operation: "listByRecipient",
            tenant: input.tenant,
            cause: overrides.listError,
          }),
        );
      }
      return Effect.succeed(overrides?.listResult ?? [summaryFixture]);
    },
    listByChannel: (input) => {
      if (overrides?.listError !== undefined) {
        return Effect.fail(
          new NovuDeliveriesReadAdapterClientError({
            operation: "listByChannel",
            tenant: input.tenant,
            cause: overrides.listError,
          }),
        );
      }
      return Effect.succeed(overrides?.listResult ?? [summaryFixture]);
    },
    getByIdCount: () => getByIdInvocations,
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("novu-deliveries-read service — happy paths + audit", () => {
  it("getById returns the summary, audits once, and serves cache hit while still auditing", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    const service = makeNovuDeliveriesReadService({
      auditLog: audit.service,
      novuDeliveriesApiClient: port,
      bounds: defaultBounds,
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const first = await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          deliveryId: summaryFixture.deliveryId,
          reasonCatalogId: reasonCatalogId.novuDeliveriesRead,
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
      moduleId: platformModuleId.novuDeliveriesRead,
      action: novuDeliveriesReadAuditAction.readPerformed,
      target: summaryFixture.deliveryId,
      reason: reasonCatalogId.novuDeliveriesRead,
    });

    const second = await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          deliveryId: summaryFixture.deliveryId,
          reasonCatalogId: reasonCatalogId.novuDeliveriesRead,
        },
      }),
    );
    expect(Option.isSome(second)).toBe(true);
    expect(port.getByIdCount()).toBe(1);
    expect(audit.calls).toHaveLength(2);
  });

  it("listByRecipient returns the list and audits with recipient-prefixed target; supportOperator is allowed", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    const service = makeNovuDeliveriesReadService({
      auditLog: audit.service,
      novuDeliveriesApiClient: port,
      bounds: defaultBounds,
    });

    const view = await Effect.runPromise(
      service.listByRecipient({
        requestContext: supportOperatorContext,
        query: {
          tenant,
          subscriberId: summaryFixture.subscriberId,
          reasonCatalogId: reasonCatalogId.novuDeliveriesRead,
        },
      }),
    );

    expect(view.summaries).toEqual([summaryFixture]);
    expect(view.isFresh).toBe(true);
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]?.target).toBe(
      `recipient:${summaryFixture.subscriberId}`,
    );
  });

  it("listByChannel returns the list and audits with channel-prefixed target", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    const service = makeNovuDeliveriesReadService({
      auditLog: audit.service,
      novuDeliveriesApiClient: port,
      bounds: defaultBounds,
    });

    const view = await Effect.runPromise(
      service.listByChannel({
        requestContext: operatorContext,
        query: {
          tenant,
          channel: "email",
          reasonCatalogId: reasonCatalogId.novuDeliveriesRead,
        },
      }),
    );

    expect(view.summaries).toEqual([summaryFixture]);
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]?.target).toBe("channel:email");
  });
});

describe("novu-deliveries-read service — authz + reason-catalog enforcement", () => {
  it("anonymous actor surfaces NovuDeliveriesReadMissingActorIdentity and never audits", async () => {
    const audit = createAuditDouble();
    const service = makeNovuDeliveriesReadService({
      auditLog: audit.service,
      novuDeliveriesApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: anonymousContext,
        query: {
          tenant,
          deliveryId: summaryFixture.deliveryId,
          reasonCatalogId: reasonCatalogId.novuDeliveriesRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "NovuDeliveriesReadMissingActorIdentity",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
    // satisfy import-graph linter
    void NovuDeliveriesReadMissingActorIdentity;
  });

  it("non-operator actor surfaces NovuDeliveriesReadUnauthorized and never audits", async () => {
    const audit = createAuditDouble();
    const service = makeNovuDeliveriesReadService({
      auditLog: audit.service,
      novuDeliveriesApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.listByChannel({
        requestContext: nonOperatorContext,
        query: {
          tenant,
          channel: "email",
          reasonCatalogId: reasonCatalogId.novuDeliveriesRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "NovuDeliveriesReadUnauthorized",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
    void NovuDeliveriesReadUnauthorized;
  });

  it("rejects unknown reasonCatalogId with NovuDeliveriesReadReasonNotInCatalog", async () => {
    const audit = createAuditDouble();
    const service = makeNovuDeliveriesReadService({
      auditLog: audit.service,
      novuDeliveriesApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          deliveryId: summaryFixture.deliveryId,
          reasonCatalogId: "not-a-real-reason",
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "NovuDeliveriesReadReasonNotInCatalog",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
    void NovuDeliveriesReadReasonNotInCatalog;
  });

  it("rejects mismatched reasonCatalogId with NovuDeliveriesReadReasonActionMismatch", async () => {
    const audit = createAuditDouble();
    const service = makeNovuDeliveriesReadService({
      auditLog: audit.service,
      novuDeliveriesApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          deliveryId: summaryFixture.deliveryId,
          reasonCatalogId: reasonCatalogId.tenantWorkspaceRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "NovuDeliveriesReadReasonActionMismatch",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
    void NovuDeliveriesReadReasonActionMismatch;
  });
});

describe("novu-deliveries-read service — adapter errors + cache eviction", () => {
  it("propagates NovuDeliveriesReadAdapterClientError and suppresses audit", async () => {
    const audit = createAuditDouble();
    const service = makeNovuDeliveriesReadService({
      auditLog: audit.service,
      novuDeliveriesApiClient: createPortDouble({
        getByIdError: { _tag: "NovuAdapterRequestError" },
      }),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          deliveryId: summaryFixture.deliveryId,
          reasonCatalogId: reasonCatalogId.novuDeliveriesRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "NovuDeliveriesReadAdapterClientError",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("evicts the oldest entry once cacheMaxSize is exceeded (insertion-order eviction)", async () => {
    const audit = createAuditDouble();
    const summaryB: NovuDeliverySummary = {
      ...summaryFixture,
      deliveryId: "del_test_002",
    };
    const summaryC: NovuDeliverySummary = {
      ...summaryFixture,
      deliveryId: "del_test_003",
    };
    let invocation = 0;
    const port: NovuDeliveriesApiClientService = {
      getById: (input) => {
        invocation += 1;
        const match = [summaryFixture, summaryB, summaryC].find(
          (candidate) => candidate.deliveryId === input.deliveryId,
        );
        return Effect.succeed(
          match ? Option.some(match) : Option.none<NovuDeliverySummary>(),
        );
      },
      listByRecipient: () => Effect.succeed([]),
      listByChannel: () => Effect.succeed([]),
    };
    const service = makeNovuDeliveriesReadService({
      auditLog: audit.service,
      novuDeliveriesApiClient: port,
      bounds: { ...defaultBounds, cacheMaxSize: 2 },
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const run = (deliveryId: string) =>
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          deliveryId,
          reasonCatalogId: reasonCatalogId.novuDeliveriesRead,
        },
      });

    await Effect.runPromise(run(summaryFixture.deliveryId));
    await Effect.runPromise(run(summaryB.deliveryId));
    await Effect.runPromise(run(summaryC.deliveryId));
    expect(invocation).toBe(3);

    await Effect.runPromise(run(summaryFixture.deliveryId));
    expect(invocation).toBe(4);

    await Effect.runPromise(run(summaryC.deliveryId));
    expect(invocation).toBe(4);
  });

  it("drops stale cache entries when snapshotCacheTtlSeconds elapses", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    let currentMs = new Date("2026-02-01T00:00:00.000Z").getTime();
    const service = makeNovuDeliveriesReadService({
      auditLog: audit.service,
      novuDeliveriesApiClient: port,
      bounds: { ...defaultBounds, snapshotCacheTtlSeconds: 1 },
      now: () => new Date(currentMs),
    });

    await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          deliveryId: summaryFixture.deliveryId,
          reasonCatalogId: reasonCatalogId.novuDeliveriesRead,
        },
      }),
    );
    expect(port.getByIdCount()).toBe(1);

    currentMs += 5_000;
    await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          deliveryId: summaryFixture.deliveryId,
          reasonCatalogId: reasonCatalogId.novuDeliveriesRead,
        },
      }),
    );
    expect(port.getByIdCount()).toBe(2);
  });
});
