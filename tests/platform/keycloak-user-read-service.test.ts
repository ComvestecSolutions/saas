/**
 * Keycloak user read platform service tests (admin-app
 * implementation plan §9 item 10 — per-vendor read helpers, batch
 * A vendor #1, READ-ONLY operator console).
 *
 * Exercises the owner-locked invariants enforced ABOVE the
 * default Keycloak-adapter-backed port in
 * `packages/platform/src/services/domains/keycloak-user-read-service.ts`:
 *
 *   - operator-only authz (platformOperator + supportOperator
 *     allowed; non-operator → `KeycloakUserReadUnauthorized`,
 *     missing `actorId` → `KeycloakUserReadMissingActorIdentity`)
 *   - reason-catalog decode (only `reasonCatalogId.keycloakUserRead`
 *     allowed; everything else → `KeycloakUserReadReasonNotInCatalog`)
 *   - adapter error surfaces as
 *     `KeycloakUserReadAdapterClientError` with audit suppressed
 *   - audit emission on every successful read (cache hit AND
 *     cache miss) keyed by `platformModuleId.keycloakUserRead` +
 *     `keycloakUserReadAuditAction.readPerformed` +
 *     `reasonCatalogId.keycloakUserRead`
 *   - bounded per-tenant snapshot cache with insertion-order
 *     eviction; freshness reconciliation via
 *     `isKeycloakUserSummaryFresh` drops stale entries
 */
import { Effect, Exit, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  keycloakUserReadAuditAction,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  type AuditEvent,
  type KeycloakUserReadTargetTenant,
  type KeycloakUserSummary,
  type RequestContext,
} from "@comvestec/contracts";
import type { AuditLogModuleService } from "@comvestec/modules";
import {
  KeycloakUserReadAdapterClientError,
  KeycloakUserReadMissingActorIdentity,
  KeycloakUserReadReasonActionMismatch,
  KeycloakUserReadReasonNotInCatalog,
  KeycloakUserReadUnauthorized,
  makeKeycloakUserReadService,
  type KeycloakAdminApiClientService,
  type KeycloakUserReadRuntimeBounds,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const tenant: KeycloakUserReadTargetTenant = {
  scope: platformScope.platform,
  scopeId: platformScope.platform,
};

const operatorContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_ku_operator",
  sessionId: "sess_ku",
  correlationId: "corr_ku_operator",
  reason: "keycloak user read service unit test",
  tenant,
};

const supportOperatorContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.supportOperator,
  actorId: "usr_ku_support",
  correlationId: "corr_ku_support",
};

const nonOperatorContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.individualUser,
  actorId: "usr_ku_user",
};

const anonymousContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.anonymous,
  actorId: undefined,
};

const defaultBounds: KeycloakUserReadRuntimeBounds = {
  cacheMaxSize: 2,
  snapshotCacheTtlSeconds: 30,
  defaultListLimit: 25,
};

const summaryFixture: KeycloakUserSummary = {
  userId: "usr_kc_001",
  username: "ada.lovelace",
  email: "ada@example.test",
  firstName: "Ada",
  lastName: "Lovelace",
  enabled: true,
  emailVerified: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  requiredActions: [],
  realm: "comvestec",
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

type PortDouble = KeycloakAdminApiClientService & {
  readonly getByIdCount: () => number;
};

const createPortDouble = (overrides?: {
  readonly getByIdResult?: Option.Option<KeycloakUserSummary>;
  readonly listResult?: ReadonlyArray<KeycloakUserSummary>;
  readonly getByIdError?: unknown;
  readonly listError?: unknown;
}): PortDouble => {
  let getByIdInvocations = 0;
  return {
    getById: (input) => {
      getByIdInvocations += 1;
      if (overrides?.getByIdError !== undefined) {
        return Effect.fail(
          new KeycloakUserReadAdapterClientError({
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
          new KeycloakUserReadAdapterClientError({
            operation: "listByEmail",
            tenant: input.tenant,
            cause: overrides.listError,
          }),
        );
      }
      return Effect.succeed(overrides?.listResult ?? [summaryFixture]);
    },
    listByUsername: (input) => {
      if (overrides?.listError !== undefined) {
        return Effect.fail(
          new KeycloakUserReadAdapterClientError({
            operation: "listByUsername",
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

describe("keycloak-user-read service — happy paths + audit", () => {
  it("getById returns the summary, audits once, and serves cache hit while still auditing", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    const service = makeKeycloakUserReadService({
      auditLog: audit.service,
      keycloakAdminApiClient: port,
      bounds: defaultBounds,
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const first = await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          userId: summaryFixture.userId,
          reasonCatalogId: reasonCatalogId.keycloakUserRead,
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
      moduleId: platformModuleId.keycloakUserRead,
      action: keycloakUserReadAuditAction.readPerformed,
      target: summaryFixture.userId,
      reason: reasonCatalogId.keycloakUserRead,
    });

    // Cache hit — port not invoked twice, audit still appends.
    const second = await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          userId: summaryFixture.userId,
          reasonCatalogId: reasonCatalogId.keycloakUserRead,
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
    const service = makeKeycloakUserReadService({
      auditLog: audit.service,
      keycloakAdminApiClient: port,
      bounds: defaultBounds,
    });

    const view = await Effect.runPromise(
      service.listByEmail({
        requestContext: supportOperatorContext,
        query: {
          tenant,
          email: summaryFixture.email,
          reasonCatalogId: reasonCatalogId.keycloakUserRead,
        },
      }),
    );

    expect(view.summaries).toEqual([summaryFixture]);
    expect(view.isFresh).toBe(true);
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]?.target).toBe(`email:${summaryFixture.email}`);
  });
});

describe("keycloak-user-read service — authz + reason-catalog enforcement", () => {
  it("anonymous actor surfaces KeycloakUserReadMissingActorIdentity and never audits", async () => {
    const audit = createAuditDouble();
    const service = makeKeycloakUserReadService({
      auditLog: audit.service,
      keycloakAdminApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: anonymousContext,
        query: {
          tenant,
          userId: summaryFixture.userId,
          reasonCatalogId: reasonCatalogId.keycloakUserRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = exit.cause;
      const found = JSON.stringify(failure).includes(
        "KeycloakUserReadMissingActorIdentity",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("non-operator actor surfaces KeycloakUserReadUnauthorized and never audits", async () => {
    const audit = createAuditDouble();
    const service = makeKeycloakUserReadService({
      auditLog: audit.service,
      keycloakAdminApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.listByUsername({
        requestContext: nonOperatorContext,
        query: {
          tenant,
          username: summaryFixture.username,
          reasonCatalogId: reasonCatalogId.keycloakUserRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "KeycloakUserReadUnauthorized",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("rejects unknown reasonCatalogId with KeycloakUserReadReasonNotInCatalog", async () => {
    const audit = createAuditDouble();
    const service = makeKeycloakUserReadService({
      auditLog: audit.service,
      keycloakAdminApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          userId: summaryFixture.userId,
          reasonCatalogId: "not-a-real-reason",
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "KeycloakUserReadReasonNotInCatalog",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("rejects mismatched reasonCatalogId with KeycloakUserReadReasonActionMismatch", async () => {
    const audit = createAuditDouble();
    const service = makeKeycloakUserReadService({
      auditLog: audit.service,
      keycloakAdminApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          userId: summaryFixture.userId,
          reasonCatalogId: reasonCatalogId.tenantWorkspaceRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "KeycloakUserReadReasonActionMismatch",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
  });
});

describe("keycloak-user-read service — adapter errors + cache eviction", () => {
  it("propagates KeycloakUserReadAdapterClientError and suppresses audit", async () => {
    const audit = createAuditDouble();
    const service = makeKeycloakUserReadService({
      auditLog: audit.service,
      keycloakAdminApiClient: createPortDouble({
        getByIdError: { _tag: "KeycloakAdapterRequestError" },
      }),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          userId: summaryFixture.userId,
          reasonCatalogId: reasonCatalogId.keycloakUserRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "KeycloakUserReadAdapterClientError",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("evicts the oldest entry once cacheMaxSize is exceeded (insertion-order eviction)", async () => {
    const audit = createAuditDouble();
    const summaryB: KeycloakUserSummary = {
      ...summaryFixture,
      userId: "usr_kc_002",
      username: "grace.hopper",
      email: "grace@example.test",
    };
    const summaryC: KeycloakUserSummary = {
      ...summaryFixture,
      userId: "usr_kc_003",
      username: "alan.turing",
      email: "alan@example.test",
    };
    let invocation = 0;
    const port: KeycloakAdminApiClientService = {
      getById: (input) => {
        invocation += 1;
        const match = [summaryFixture, summaryB, summaryC].find(
          (candidate) => candidate.userId === input.userId,
        );
        return Effect.succeed(
          match ? Option.some(match) : Option.none<KeycloakUserSummary>(),
        );
      },
      listByEmail: () => Effect.succeed([]),
      listByUsername: () => Effect.succeed([]),
    };
    const service = makeKeycloakUserReadService({
      auditLog: audit.service,
      keycloakAdminApiClient: port,
      bounds: { ...defaultBounds, cacheMaxSize: 2 },
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const run = (userId: string) =>
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          userId,
          reasonCatalogId: reasonCatalogId.keycloakUserRead,
        },
      });

    await Effect.runPromise(run(summaryFixture.userId));
    await Effect.runPromise(run(summaryB.userId));
    await Effect.runPromise(run(summaryC.userId)); // evicts summaryFixture
    expect(invocation).toBe(3);

    // summaryFixture was evicted → port re-invoked.
    await Effect.runPromise(run(summaryFixture.userId));
    expect(invocation).toBe(4);

    // summaryC is still cached → port NOT re-invoked.
    await Effect.runPromise(run(summaryC.userId));
    expect(invocation).toBe(4);
  });

  it("drops stale cache entries when snapshotCacheTtlSeconds elapses", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    let currentMs = new Date("2026-02-01T00:00:00.000Z").getTime();
    const service = makeKeycloakUserReadService({
      auditLog: audit.service,
      keycloakAdminApiClient: port,
      bounds: { ...defaultBounds, snapshotCacheTtlSeconds: 1 },
      now: () => new Date(currentMs),
    });

    await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          userId: summaryFixture.userId,
          reasonCatalogId: reasonCatalogId.keycloakUserRead,
        },
      }),
    );
    expect(port.getByIdCount()).toBe(1);

    // Advance beyond TTL → cache entry treated as stale, re-fetch.
    currentMs += 5_000;
    await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          userId: summaryFixture.userId,
          reasonCatalogId: reasonCatalogId.keycloakUserRead,
        },
      }),
    );
    expect(port.getByIdCount()).toBe(2);
  });
});
