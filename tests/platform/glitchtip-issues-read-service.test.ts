/**
 * GlitchTip issues read platform service tests (admin-app
 * implementation plan §9 item 10 — per-vendor read helpers, batch
 * B vendor #3, READ-ONLY operator console).
 *
 * Exercises the owner-locked invariants enforced ABOVE the default
 * GlitchTip-adapter-backed port in
 * `packages/platform/src/services/domains/glitchtip-issues-read-service.ts`:
 *
 *   - operator-only authz (platformOperator + supportOperator
 *     allowed; non-operator → `GlitchTipIssuesReadUnauthorized`,
 *     missing `actorId` →
 *     `GlitchTipIssuesReadMissingActorIdentity`)
 *   - reason-catalog decode (only
 *     `reasonCatalogId.glitchTipIssuesRead` allowed; everything
 *     else → `GlitchTipIssuesReadReasonNotInCatalog`)
 *   - adapter error surfaces as
 *     `GlitchTipIssuesReadAdapterClientError` with audit suppressed
 *   - audit emission on every successful read (cache hit AND cache
 *     miss) keyed by `platformModuleId.glitchTipIssuesRead` +
 *     `glitchTipIssuesReadAuditAction.readPerformed` +
 *     `reasonCatalogId.glitchTipIssuesRead`
 *   - bounded per-tenant snapshot cache with insertion-order
 *     eviction; freshness reconciliation via
 *     `isGlitchTipIssueFresh` drops stale entries
 */
import { Effect, Exit, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  glitchTipIssuesReadAuditAction,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  type AuditEvent,
  type GlitchTipIssue,
  type GlitchTipIssuesReadTargetTenant,
  type RequestContext,
} from "@comvestec/contracts";
import type { AuditLogModuleService } from "@comvestec/modules";
import {
  GlitchTipIssuesReadAdapterClientError,
  GlitchTipIssuesReadMissingActorIdentity,
  GlitchTipIssuesReadReasonActionMismatch,
  GlitchTipIssuesReadReasonNotInCatalog,
  GlitchTipIssuesReadUnauthorized,
  makeGlitchTipIssuesReadService,
  type GlitchTipIssuesApiClientService,
  type GlitchTipIssuesReadRuntimeBounds,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const tenant: GlitchTipIssuesReadTargetTenant = {
  scope: platformScope.platform,
  scopeId: platformScope.platform,
};

const operatorContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_glitchtip_operator",
  sessionId: "sess_glitchtip",
  correlationId: "corr_glitchtip_operator",
  reason: "glitchtip issues read service unit test",
  tenant,
};

const supportOperatorContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.supportOperator,
  actorId: "usr_glitchtip_support",
  correlationId: "corr_glitchtip_support",
};

const nonOperatorContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.individualUser,
  actorId: "usr_glitchtip_user",
};

const anonymousContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.anonymous,
  actorId: undefined,
};

const defaultBounds: GlitchTipIssuesReadRuntimeBounds = {
  cacheMaxSize: 2,
  snapshotCacheTtlSeconds: 30,
  defaultListLimit: 25,
};

const issueFixture: GlitchTipIssue = {
  issueId: "iss_test_001",
  projectSlug: "platform-backend",
  title: "TypeError: cannot read properties of undefined",
  level: "error",
  culprit: "POST /api/foo",
  firstSeenAt: "2026-01-01T00:00:00.000Z",
  lastSeenAt: "2026-01-01T00:05:00.000Z",
  eventCount: 12,
  userCount: 3,
  status: "unresolved",
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

type PortDouble = GlitchTipIssuesApiClientService & {
  readonly getByIdCount: () => number;
};

const createPortDouble = (overrides?: {
  readonly getByIdResult?: Option.Option<GlitchTipIssue>;
  readonly listResult?: ReadonlyArray<GlitchTipIssue>;
  readonly getByIdError?: unknown;
  readonly listError?: unknown;
}): PortDouble => {
  let getByIdInvocations = 0;
  return {
    getById: (input) => {
      getByIdInvocations += 1;
      if (overrides?.getByIdError !== undefined) {
        return Effect.fail(
          new GlitchTipIssuesReadAdapterClientError({
            operation: "getById",
            tenant: input.tenant,
            cause: overrides.getByIdError,
          }),
        );
      }
      return Effect.succeed(
        overrides?.getByIdResult ?? Option.some(issueFixture),
      );
    },
    listByProject: (input) => {
      if (overrides?.listError !== undefined) {
        return Effect.fail(
          new GlitchTipIssuesReadAdapterClientError({
            operation: "listByProject",
            tenant: input.tenant,
            cause: overrides.listError,
          }),
        );
      }
      return Effect.succeed(overrides?.listResult ?? [issueFixture]);
    },
    listByLevel: (input) => {
      if (overrides?.listError !== undefined) {
        return Effect.fail(
          new GlitchTipIssuesReadAdapterClientError({
            operation: "listByLevel",
            tenant: input.tenant,
            cause: overrides.listError,
          }),
        );
      }
      return Effect.succeed(overrides?.listResult ?? [issueFixture]);
    },
    getByIdCount: () => getByIdInvocations,
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("glitchtip-issues-read service — happy paths + audit", () => {
  it("getById returns the issue, audits once, and serves cache hit while still auditing", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    const service = makeGlitchTipIssuesReadService({
      auditLog: audit.service,
      glitchTipIssuesApiClient: port,
      bounds: defaultBounds,
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const first = await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          issueId: issueFixture.issueId,
          reasonCatalogId: reasonCatalogId.glitchTipIssuesRead,
        },
      }),
    );

    expect(Option.isSome(first)).toBe(true);
    if (Option.isSome(first)) {
      expect(first.value.issue).toEqual(issueFixture);
      expect(first.value.isFresh).toBe(true);
    }
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]).toMatchObject({
      moduleId: platformModuleId.glitchTipIssuesRead,
      action: glitchTipIssuesReadAuditAction.readPerformed,
      target: issueFixture.issueId,
      reason: reasonCatalogId.glitchTipIssuesRead,
    });

    const second = await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          issueId: issueFixture.issueId,
          reasonCatalogId: reasonCatalogId.glitchTipIssuesRead,
        },
      }),
    );
    expect(Option.isSome(second)).toBe(true);
    expect(port.getByIdCount()).toBe(1);
    expect(audit.calls).toHaveLength(2);
  });

  it("listByProject returns the list and audits with project-prefixed target; supportOperator is allowed", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    const service = makeGlitchTipIssuesReadService({
      auditLog: audit.service,
      glitchTipIssuesApiClient: port,
      bounds: defaultBounds,
    });

    const view = await Effect.runPromise(
      service.listByProject({
        requestContext: supportOperatorContext,
        query: {
          tenant,
          projectSlug: issueFixture.projectSlug,
          reasonCatalogId: reasonCatalogId.glitchTipIssuesRead,
        },
      }),
    );

    expect(view.issues).toEqual([issueFixture]);
    expect(view.isFresh).toBe(true);
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]?.target).toBe(`project:${issueFixture.projectSlug}`);
  });

  it("listByLevel returns the list and audits with level-prefixed target", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    const service = makeGlitchTipIssuesReadService({
      auditLog: audit.service,
      glitchTipIssuesApiClient: port,
      bounds: defaultBounds,
    });

    const view = await Effect.runPromise(
      service.listByLevel({
        requestContext: operatorContext,
        query: {
          tenant,
          level: "error",
          reasonCatalogId: reasonCatalogId.glitchTipIssuesRead,
        },
      }),
    );

    expect(view.issues).toEqual([issueFixture]);
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]?.target).toBe("level:error");
  });
});

describe("glitchtip-issues-read service — authz + reason-catalog enforcement", () => {
  it("anonymous actor surfaces GlitchTipIssuesReadMissingActorIdentity and never audits", async () => {
    const audit = createAuditDouble();
    const service = makeGlitchTipIssuesReadService({
      auditLog: audit.service,
      glitchTipIssuesApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: anonymousContext,
        query: {
          tenant,
          issueId: issueFixture.issueId,
          reasonCatalogId: reasonCatalogId.glitchTipIssuesRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "GlitchTipIssuesReadMissingActorIdentity",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
    void GlitchTipIssuesReadMissingActorIdentity;
  });

  it("non-operator actor surfaces GlitchTipIssuesReadUnauthorized and never audits", async () => {
    const audit = createAuditDouble();
    const service = makeGlitchTipIssuesReadService({
      auditLog: audit.service,
      glitchTipIssuesApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.listByLevel({
        requestContext: nonOperatorContext,
        query: {
          tenant,
          level: "error",
          reasonCatalogId: reasonCatalogId.glitchTipIssuesRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "GlitchTipIssuesReadUnauthorized",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
    void GlitchTipIssuesReadUnauthorized;
  });

  it("rejects unknown reasonCatalogId with GlitchTipIssuesReadReasonNotInCatalog", async () => {
    const audit = createAuditDouble();
    const service = makeGlitchTipIssuesReadService({
      auditLog: audit.service,
      glitchTipIssuesApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          issueId: issueFixture.issueId,
          reasonCatalogId: "not-a-real-reason",
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "GlitchTipIssuesReadReasonNotInCatalog",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
    void GlitchTipIssuesReadReasonNotInCatalog;
  });

  it("rejects mismatched reasonCatalogId with GlitchTipIssuesReadReasonActionMismatch", async () => {
    const audit = createAuditDouble();
    const service = makeGlitchTipIssuesReadService({
      auditLog: audit.service,
      glitchTipIssuesApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          issueId: issueFixture.issueId,
          reasonCatalogId: reasonCatalogId.tenantWorkspaceRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "GlitchTipIssuesReadReasonActionMismatch",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
    void GlitchTipIssuesReadReasonActionMismatch;
  });
});

describe("glitchtip-issues-read service — adapter errors + cache eviction", () => {
  it("propagates GlitchTipIssuesReadAdapterClientError and suppresses audit", async () => {
    const audit = createAuditDouble();
    const service = makeGlitchTipIssuesReadService({
      auditLog: audit.service,
      glitchTipIssuesApiClient: createPortDouble({
        getByIdError: { _tag: "GlitchtipAdapterRequestError" },
      }),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          issueId: issueFixture.issueId,
          reasonCatalogId: reasonCatalogId.glitchTipIssuesRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "GlitchTipIssuesReadAdapterClientError",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("evicts the oldest issue once cacheMaxSize is exceeded (insertion-order eviction)", async () => {
    const audit = createAuditDouble();
    const issueB: GlitchTipIssue = {
      ...issueFixture,
      issueId: "iss_test_002",
    };
    const issueC: GlitchTipIssue = {
      ...issueFixture,
      issueId: "iss_test_003",
    };
    let invocation = 0;
    const port: GlitchTipIssuesApiClientService = {
      getById: (input) => {
        invocation += 1;
        const match = [issueFixture, issueB, issueC].find(
          (candidate) => candidate.issueId === input.issueId,
        );
        return Effect.succeed(
          match ? Option.some(match) : Option.none<GlitchTipIssue>(),
        );
      },
      listByProject: () => Effect.succeed([]),
      listByLevel: () => Effect.succeed([]),
    };
    const service = makeGlitchTipIssuesReadService({
      auditLog: audit.service,
      glitchTipIssuesApiClient: port,
      bounds: { ...defaultBounds, cacheMaxSize: 2 },
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const run = (issueId: string) =>
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          issueId,
          reasonCatalogId: reasonCatalogId.glitchTipIssuesRead,
        },
      });

    await Effect.runPromise(run(issueFixture.issueId));
    await Effect.runPromise(run(issueB.issueId));
    await Effect.runPromise(run(issueC.issueId));
    expect(invocation).toBe(3);

    await Effect.runPromise(run(issueFixture.issueId));
    expect(invocation).toBe(4);

    await Effect.runPromise(run(issueC.issueId));
    expect(invocation).toBe(4);
  });

  it("drops stale cache entries when snapshotCacheTtlSeconds elapses", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    let currentMs = new Date("2026-02-01T00:00:00.000Z").getTime();
    const service = makeGlitchTipIssuesReadService({
      auditLog: audit.service,
      glitchTipIssuesApiClient: port,
      bounds: { ...defaultBounds, snapshotCacheTtlSeconds: 1 },
      now: () => new Date(currentMs),
    });

    await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          issueId: issueFixture.issueId,
          reasonCatalogId: reasonCatalogId.glitchTipIssuesRead,
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
          issueId: issueFixture.issueId,
          reasonCatalogId: reasonCatalogId.glitchTipIssuesRead,
        },
      }),
    );
    expect(port.getByIdCount()).toBe(2);
  });
});
