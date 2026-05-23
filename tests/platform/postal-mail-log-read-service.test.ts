/**
 * Postal mail log read platform service tests (admin-app
 * implementation plan §9 item 10 — per-vendor read helpers, batch
 * B vendor #2, READ-ONLY operator console).
 *
 * Exercises the owner-locked invariants enforced ABOVE the
 * default Postal-adapter-backed port in
 * `packages/platform/src/services/domains/postal-mail-log-read-service.ts`:
 *
 *   - operator-only authz (platformOperator + supportOperator
 *     allowed; non-operator → `PostalMailLogReadUnauthorized`,
 *     missing `actorId` → `PostalMailLogReadMissingActorIdentity`)
 *   - reason-catalog decode (only
 *     `reasonCatalogId.postalMailLogRead` allowed; everything else
 *     → `PostalMailLogReadReasonNotInCatalog`)
 *   - adapter error surfaces as
 *     `PostalMailLogReadAdapterClientError` with audit suppressed
 *   - audit emission on every successful read (cache hit AND
 *     cache miss) keyed by `platformModuleId.postalMailLogRead` +
 *     `postalMailLogReadAuditAction.readPerformed` +
 *     `reasonCatalogId.postalMailLogRead`
 *   - bounded per-tenant snapshot cache with insertion-order
 *     eviction; freshness reconciliation via
 *     `isPostalMailLogEntryFresh` drops stale entries
 */
import { Effect, Exit, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformModuleId,
  platformScope,
  postalMailLogReadAuditAction,
  reasonCatalogId,
  type AuditEvent,
  type PostalMailLogEntry,
  type PostalMailLogReadTargetTenant,
  type RequestContext,
} from "@comvestec/contracts";
import type { AuditLogModuleService } from "@comvestec/modules";
import {
  makePostalMailLogReadService,
  PostalMailLogReadAdapterClientError,
  PostalMailLogReadMissingActorIdentity,
  PostalMailLogReadReasonActionMismatch,
  PostalMailLogReadReasonNotInCatalog,
  PostalMailLogReadUnauthorized,
  type PostalMailLogApiClientService,
  type PostalMailLogReadRuntimeBounds,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const tenant: PostalMailLogReadTargetTenant = {
  scope: platformScope.platform,
  scopeId: platformScope.platform,
};

const operatorContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_postal_operator",
  sessionId: "sess_postal",
  correlationId: "corr_postal_operator",
  reason: "postal mail log read service unit test",
  tenant,
};

const supportOperatorContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.supportOperator,
  actorId: "usr_postal_support",
  correlationId: "corr_postal_support",
};

const nonOperatorContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.individualUser,
  actorId: "usr_postal_user",
};

const anonymousContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.anonymous,
  actorId: undefined,
};

const defaultBounds: PostalMailLogReadRuntimeBounds = {
  cacheMaxSize: 2,
  snapshotCacheTtlSeconds: 30,
  defaultListLimit: 25,
};

const entryFixture: PostalMailLogEntry = {
  messageId: "msg_test_001",
  fromAddress: "from@example.test",
  toAddress: "to@example.test",
  subject: "Welcome to the platform",
  status: "sent",
  sentAt: "2026-01-01T00:00:00.000Z",
  lastEventAt: "2026-01-01T00:00:05.000Z",
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

type PortDouble = PostalMailLogApiClientService & {
  readonly getByIdCount: () => number;
};

const createPortDouble = (overrides?: {
  readonly getByIdResult?: Option.Option<PostalMailLogEntry>;
  readonly listResult?: ReadonlyArray<PostalMailLogEntry>;
  readonly getByIdError?: unknown;
  readonly listError?: unknown;
}): PortDouble => {
  let getByIdInvocations = 0;
  return {
    getById: (input) => {
      getByIdInvocations += 1;
      if (overrides?.getByIdError !== undefined) {
        return Effect.fail(
          new PostalMailLogReadAdapterClientError({
            operation: "getById",
            tenant: input.tenant,
            cause: overrides.getByIdError,
          }),
        );
      }
      return Effect.succeed(
        overrides?.getByIdResult ?? Option.some(entryFixture),
      );
    },
    listByRecipient: (input) => {
      if (overrides?.listError !== undefined) {
        return Effect.fail(
          new PostalMailLogReadAdapterClientError({
            operation: "listByRecipient",
            tenant: input.tenant,
            cause: overrides.listError,
          }),
        );
      }
      return Effect.succeed(overrides?.listResult ?? [entryFixture]);
    },
    listByStatus: (input) => {
      if (overrides?.listError !== undefined) {
        return Effect.fail(
          new PostalMailLogReadAdapterClientError({
            operation: "listByStatus",
            tenant: input.tenant,
            cause: overrides.listError,
          }),
        );
      }
      return Effect.succeed(overrides?.listResult ?? [entryFixture]);
    },
    getByIdCount: () => getByIdInvocations,
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("postal-mail-log-read service — happy paths + audit", () => {
  it("getById returns the entry, audits once, and serves cache hit while still auditing", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    const service = makePostalMailLogReadService({
      auditLog: audit.service,
      postalMailLogApiClient: port,
      bounds: defaultBounds,
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const first = await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          messageId: entryFixture.messageId,
          reasonCatalogId: reasonCatalogId.postalMailLogRead,
        },
      }),
    );

    expect(Option.isSome(first)).toBe(true);
    if (Option.isSome(first)) {
      expect(first.value.entry).toEqual(entryFixture);
      expect(first.value.isFresh).toBe(true);
    }
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]).toMatchObject({
      moduleId: platformModuleId.postalMailLogRead,
      action: postalMailLogReadAuditAction.readPerformed,
      target: entryFixture.messageId,
      reason: reasonCatalogId.postalMailLogRead,
    });

    const second = await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          messageId: entryFixture.messageId,
          reasonCatalogId: reasonCatalogId.postalMailLogRead,
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
    const service = makePostalMailLogReadService({
      auditLog: audit.service,
      postalMailLogApiClient: port,
      bounds: defaultBounds,
    });

    const view = await Effect.runPromise(
      service.listByRecipient({
        requestContext: supportOperatorContext,
        query: {
          tenant,
          emailAddress: entryFixture.toAddress,
          reasonCatalogId: reasonCatalogId.postalMailLogRead,
        },
      }),
    );

    expect(view.entries).toEqual([entryFixture]);
    expect(view.isFresh).toBe(true);
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]?.target).toBe(`recipient:${entryFixture.toAddress}`);
  });

  it("listByStatus returns the list and audits with status-prefixed target", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    const service = makePostalMailLogReadService({
      auditLog: audit.service,
      postalMailLogApiClient: port,
      bounds: defaultBounds,
    });

    const view = await Effect.runPromise(
      service.listByStatus({
        requestContext: operatorContext,
        query: {
          tenant,
          status: "sent",
          reasonCatalogId: reasonCatalogId.postalMailLogRead,
        },
      }),
    );

    expect(view.entries).toEqual([entryFixture]);
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]?.target).toBe("status:sent");
  });
});

describe("postal-mail-log-read service — authz + reason-catalog enforcement", () => {
  it("anonymous actor surfaces PostalMailLogReadMissingActorIdentity and never audits", async () => {
    const audit = createAuditDouble();
    const service = makePostalMailLogReadService({
      auditLog: audit.service,
      postalMailLogApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: anonymousContext,
        query: {
          tenant,
          messageId: entryFixture.messageId,
          reasonCatalogId: reasonCatalogId.postalMailLogRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "PostalMailLogReadMissingActorIdentity",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
    void PostalMailLogReadMissingActorIdentity;
  });

  it("non-operator actor surfaces PostalMailLogReadUnauthorized and never audits", async () => {
    const audit = createAuditDouble();
    const service = makePostalMailLogReadService({
      auditLog: audit.service,
      postalMailLogApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.listByStatus({
        requestContext: nonOperatorContext,
        query: {
          tenant,
          status: "sent",
          reasonCatalogId: reasonCatalogId.postalMailLogRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "PostalMailLogReadUnauthorized",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
    void PostalMailLogReadUnauthorized;
  });

  it("rejects unknown reasonCatalogId with PostalMailLogReadReasonNotInCatalog", async () => {
    const audit = createAuditDouble();
    const service = makePostalMailLogReadService({
      auditLog: audit.service,
      postalMailLogApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          messageId: entryFixture.messageId,
          reasonCatalogId: "not-a-real-reason",
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "PostalMailLogReadReasonNotInCatalog",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
    void PostalMailLogReadReasonNotInCatalog;
  });

  it("rejects mismatched reasonCatalogId with PostalMailLogReadReasonActionMismatch", async () => {
    const audit = createAuditDouble();
    const service = makePostalMailLogReadService({
      auditLog: audit.service,
      postalMailLogApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          messageId: entryFixture.messageId,
          reasonCatalogId: reasonCatalogId.tenantWorkspaceRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "PostalMailLogReadReasonActionMismatch",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
    void PostalMailLogReadReasonActionMismatch;
  });
});

describe("postal-mail-log-read service — adapter errors + cache eviction", () => {
  it("propagates PostalMailLogReadAdapterClientError and suppresses audit", async () => {
    const audit = createAuditDouble();
    const service = makePostalMailLogReadService({
      auditLog: audit.service,
      postalMailLogApiClient: createPortDouble({
        getByIdError: { _tag: "PostalAdapterRequestError" },
      }),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          messageId: entryFixture.messageId,
          reasonCatalogId: reasonCatalogId.postalMailLogRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "PostalMailLogReadAdapterClientError",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("evicts the oldest entry once cacheMaxSize is exceeded (insertion-order eviction)", async () => {
    const audit = createAuditDouble();
    const entryB: PostalMailLogEntry = {
      ...entryFixture,
      messageId: "msg_test_002",
    };
    const entryC: PostalMailLogEntry = {
      ...entryFixture,
      messageId: "msg_test_003",
    };
    let invocation = 0;
    const port: PostalMailLogApiClientService = {
      getById: (input) => {
        invocation += 1;
        const match = [entryFixture, entryB, entryC].find(
          (candidate) => candidate.messageId === input.messageId,
        );
        return Effect.succeed(
          match ? Option.some(match) : Option.none<PostalMailLogEntry>(),
        );
      },
      listByRecipient: () => Effect.succeed([]),
      listByStatus: () => Effect.succeed([]),
    };
    const service = makePostalMailLogReadService({
      auditLog: audit.service,
      postalMailLogApiClient: port,
      bounds: { ...defaultBounds, cacheMaxSize: 2 },
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const run = (messageId: string) =>
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          messageId,
          reasonCatalogId: reasonCatalogId.postalMailLogRead,
        },
      });

    await Effect.runPromise(run(entryFixture.messageId));
    await Effect.runPromise(run(entryB.messageId));
    await Effect.runPromise(run(entryC.messageId));
    expect(invocation).toBe(3);

    await Effect.runPromise(run(entryFixture.messageId));
    expect(invocation).toBe(4);

    await Effect.runPromise(run(entryC.messageId));
    expect(invocation).toBe(4);
  });

  it("drops stale cache entries when snapshotCacheTtlSeconds elapses", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    let currentMs = new Date("2026-02-01T00:00:00.000Z").getTime();
    const service = makePostalMailLogReadService({
      auditLog: audit.service,
      postalMailLogApiClient: port,
      bounds: { ...defaultBounds, snapshotCacheTtlSeconds: 1 },
      now: () => new Date(currentMs),
    });

    await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          messageId: entryFixture.messageId,
          reasonCatalogId: reasonCatalogId.postalMailLogRead,
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
          messageId: entryFixture.messageId,
          reasonCatalogId: reasonCatalogId.postalMailLogRead,
        },
      }),
    );
    expect(port.getByIdCount()).toBe(2);
  });
});
