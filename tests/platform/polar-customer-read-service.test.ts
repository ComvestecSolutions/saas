/**
 * Polar customer read platform service tests (admin-app
 * implementation plan §9 item 10 — per-vendor read helpers, batch
 * A vendor #2, READ-ONLY operator console).
 *
 * Exercises the owner-locked invariants enforced ABOVE the
 * default Polar-adapter-backed port in
 * `packages/platform/src/services/domains/polar-customer-read-service.ts`:
 *
 *   - operator-only authz (platformOperator + supportOperator
 *     allowed; non-operator → `PolarCustomerReadUnauthorized`,
 *     missing `actorId` → `PolarCustomerReadMissingActorIdentity`)
 *   - reason-catalog decode (only `reasonCatalogId.polarCustomerRead`
 *     allowed; everything else → `PolarCustomerReadReasonNotInCatalog`)
 *   - adapter error surfaces as
 *     `PolarCustomerReadAdapterClientError` with audit suppressed
 *   - audit emission on every successful read (cache hit AND
 *     cache miss) keyed by `platformModuleId.polarCustomerRead` +
 *     `polarCustomerReadAuditAction.readPerformed` +
 *     `reasonCatalogId.polarCustomerRead`
 *   - bounded per-tenant snapshot cache with insertion-order
 *     eviction; freshness reconciliation via
 *     `isPolarCustomerSummaryFresh` drops stale entries
 */
import { Effect, Exit, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformModuleId,
  platformScope,
  polarCustomerReadAuditAction,
  reasonCatalogId,
  type AuditEvent,
  type PolarCustomerReadTargetTenant,
  type PolarCustomerSummary,
  type RequestContext,
} from "@comvestec/contracts";
import type { AuditLogModuleService } from "@comvestec/modules";
import {
  makePolarCustomerReadService,
  PolarCustomerReadAdapterClientError,
  PolarCustomerReadMissingActorIdentity,
  PolarCustomerReadReasonActionMismatch,
  PolarCustomerReadReasonNotInCatalog,
  PolarCustomerReadUnauthorized,
  type PolarCustomerApiClientService,
  type PolarCustomerReadRuntimeBounds,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const tenant: PolarCustomerReadTargetTenant = {
  scope: platformScope.platform,
  scopeId: platformScope.platform,
};

const operatorContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_pc_operator",
  sessionId: "sess_pc",
  correlationId: "corr_pc_operator",
  reason: "polar customer read service unit test",
  tenant,
};

const supportOperatorContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.supportOperator,
  actorId: "usr_pc_support",
  correlationId: "corr_pc_support",
};

const nonOperatorContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.individualUser,
  actorId: "usr_pc_user",
};

const anonymousContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.anonymous,
  actorId: undefined,
};

const defaultBounds: PolarCustomerReadRuntimeBounds = {
  cacheMaxSize: 2,
  snapshotCacheTtlSeconds: 30,
  defaultListLimit: 25,
};

const summaryFixture: PolarCustomerSummary = {
  customerId: "cus_pol_001",
  externalId: "ext_acme_001",
  email: "ada@example.test",
  name: "Ada Lovelace",
  createdAt: "2026-01-01T00:00:00.000Z",
  totalSpendCents: 12_500,
  subscriptionCount: 2,
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

type PortDouble = PolarCustomerApiClientService & {
  readonly getByIdCount: () => number;
};

const createPortDouble = (overrides?: {
  readonly getByIdResult?: Option.Option<PolarCustomerSummary>;
  readonly listResult?: ReadonlyArray<PolarCustomerSummary>;
  readonly getByIdError?: unknown;
  readonly listError?: unknown;
}): PortDouble => {
  let getByIdInvocations = 0;
  return {
    getById: (input) => {
      getByIdInvocations += 1;
      if (overrides?.getByIdError !== undefined) {
        return Effect.fail(
          new PolarCustomerReadAdapterClientError({
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
    listByEmail: (input) => {
      if (overrides?.listError !== undefined) {
        return Effect.fail(
          new PolarCustomerReadAdapterClientError({
            operation: "listByEmail",
            tenant: input.tenant,
            cause: overrides.listError,
          }),
        );
      }
      return Effect.succeed(overrides?.listResult ?? [summaryFixture]);
    },
    listByExternalId: (input) => {
      if (overrides?.listError !== undefined) {
        return Effect.fail(
          new PolarCustomerReadAdapterClientError({
            operation: "listByExternalId",
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

describe("polar-customer-read service — happy paths + audit", () => {
  it("getById returns the summary, audits once, and serves cache hit while still auditing", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    const service = makePolarCustomerReadService({
      auditLog: audit.service,
      polarCustomerApiClient: port,
      bounds: defaultBounds,
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const first = await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          customerId: summaryFixture.customerId,
          reasonCatalogId: reasonCatalogId.polarCustomerRead,
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
      moduleId: platformModuleId.polarCustomerRead,
      action: polarCustomerReadAuditAction.readPerformed,
      target: summaryFixture.customerId,
      reason: reasonCatalogId.polarCustomerRead,
    });

    const second = await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          customerId: summaryFixture.customerId,
          reasonCatalogId: reasonCatalogId.polarCustomerRead,
        },
      }),
    );
    expect(Option.isSome(second)).toBe(true);
    expect(port.getByIdCount()).toBe(1);
    expect(audit.calls).toHaveLength(2);
  });

  it("listByEmail returns the list and audits with email-prefixed target; supportOperator is allowed", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    const service = makePolarCustomerReadService({
      auditLog: audit.service,
      polarCustomerApiClient: port,
      bounds: defaultBounds,
    });

    const view = await Effect.runPromise(
      service.listByEmail({
        requestContext: supportOperatorContext,
        query: {
          tenant,
          email: summaryFixture.email,
          reasonCatalogId: reasonCatalogId.polarCustomerRead,
        },
      }),
    );

    expect(view.summaries).toEqual([summaryFixture]);
    expect(view.isFresh).toBe(true);
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]?.target).toBe(`email:${summaryFixture.email}`);
  });

  it("listByExternalId returns the list and audits with externalId-prefixed target", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    const service = makePolarCustomerReadService({
      auditLog: audit.service,
      polarCustomerApiClient: port,
      bounds: defaultBounds,
    });

    const view = await Effect.runPromise(
      service.listByExternalId({
        requestContext: operatorContext,
        query: {
          tenant,
          externalId: "ext_acme_001",
          reasonCatalogId: reasonCatalogId.polarCustomerRead,
        },
      }),
    );

    expect(view.summaries).toEqual([summaryFixture]);
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]?.target).toBe("externalId:ext_acme_001");
  });
});

describe("polar-customer-read service — authz + reason-catalog enforcement", () => {
  it("anonymous actor surfaces PolarCustomerReadMissingActorIdentity and never audits", async () => {
    const audit = createAuditDouble();
    const service = makePolarCustomerReadService({
      auditLog: audit.service,
      polarCustomerApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: anonymousContext,
        query: {
          tenant,
          customerId: summaryFixture.customerId,
          reasonCatalogId: reasonCatalogId.polarCustomerRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "PolarCustomerReadMissingActorIdentity",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("non-operator actor surfaces PolarCustomerReadUnauthorized and never audits", async () => {
    const audit = createAuditDouble();
    const service = makePolarCustomerReadService({
      auditLog: audit.service,
      polarCustomerApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.listByExternalId({
        requestContext: nonOperatorContext,
        query: {
          tenant,
          externalId: "ext_acme_001",
          reasonCatalogId: reasonCatalogId.polarCustomerRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "PolarCustomerReadUnauthorized",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("rejects unknown reasonCatalogId with PolarCustomerReadReasonNotInCatalog", async () => {
    const audit = createAuditDouble();
    const service = makePolarCustomerReadService({
      auditLog: audit.service,
      polarCustomerApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          customerId: summaryFixture.customerId,
          reasonCatalogId: "not-a-real-reason",
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "PolarCustomerReadReasonNotInCatalog",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("rejects mismatched reasonCatalogId with PolarCustomerReadReasonActionMismatch", async () => {
    const audit = createAuditDouble();
    const service = makePolarCustomerReadService({
      auditLog: audit.service,
      polarCustomerApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          customerId: summaryFixture.customerId,
          reasonCatalogId: reasonCatalogId.tenantWorkspaceRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "PolarCustomerReadReasonActionMismatch",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
  });
});

describe("polar-customer-read service — adapter errors + cache eviction", () => {
  it("propagates PolarCustomerReadAdapterClientError and suppresses audit", async () => {
    const audit = createAuditDouble();
    const service = makePolarCustomerReadService({
      auditLog: audit.service,
      polarCustomerApiClient: createPortDouble({
        getByIdError: { _tag: "PolarAdapterRequestError" },
      }),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          customerId: summaryFixture.customerId,
          reasonCatalogId: reasonCatalogId.polarCustomerRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "PolarCustomerReadAdapterClientError",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("evicts the oldest entry once cacheMaxSize is exceeded (insertion-order eviction)", async () => {
    const audit = createAuditDouble();
    const summaryB: PolarCustomerSummary = {
      ...summaryFixture,
      customerId: "cus_pol_002",
      email: "grace@example.test",
    };
    const summaryC: PolarCustomerSummary = {
      ...summaryFixture,
      customerId: "cus_pol_003",
      email: "alan@example.test",
    };
    let invocation = 0;
    const port: PolarCustomerApiClientService = {
      getById: (input) => {
        invocation += 1;
        const match = [summaryFixture, summaryB, summaryC].find(
          (candidate) => candidate.customerId === input.customerId,
        );
        return Effect.succeed(
          match ? Option.some(match) : Option.none<PolarCustomerSummary>(),
        );
      },
      listByEmail: () => Effect.succeed([]),
      listByExternalId: () => Effect.succeed([]),
    };
    const service = makePolarCustomerReadService({
      auditLog: audit.service,
      polarCustomerApiClient: port,
      bounds: { ...defaultBounds, cacheMaxSize: 2 },
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const run = (customerId: string) =>
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          customerId,
          reasonCatalogId: reasonCatalogId.polarCustomerRead,
        },
      });

    await Effect.runPromise(run(summaryFixture.customerId));
    await Effect.runPromise(run(summaryB.customerId));
    await Effect.runPromise(run(summaryC.customerId));
    expect(invocation).toBe(3);

    await Effect.runPromise(run(summaryFixture.customerId));
    expect(invocation).toBe(4);

    await Effect.runPromise(run(summaryC.customerId));
    expect(invocation).toBe(4);
  });

  it("drops stale cache entries when snapshotCacheTtlSeconds elapses", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    let currentMs = new Date("2026-02-01T00:00:00.000Z").getTime();
    const service = makePolarCustomerReadService({
      auditLog: audit.service,
      polarCustomerApiClient: port,
      bounds: { ...defaultBounds, snapshotCacheTtlSeconds: 1 },
      now: () => new Date(currentMs),
    });

    await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          customerId: summaryFixture.customerId,
          reasonCatalogId: reasonCatalogId.polarCustomerRead,
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
          customerId: summaryFixture.customerId,
          reasonCatalogId: reasonCatalogId.polarCustomerRead,
        },
      }),
    );
    expect(port.getByIdCount()).toBe(2);
  });
});
