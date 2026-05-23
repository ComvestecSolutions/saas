/**
 * OpenPanel events read platform service tests (admin-app
 * implementation plan §9 item 10 — per-vendor read helpers, batch
 * B vendor #4, READ-ONLY operator console).
 *
 * Exercises the owner-locked invariants enforced ABOVE the default
 * OpenPanel-adapter-backed port in
 * `packages/platform/src/services/domains/openpanel-events-read-service.ts`:
 *
 *   - operator-only authz (platformOperator + supportOperator
 *     allowed; non-operator → `OpenPanelEventsReadUnauthorized`,
 *     missing `actorId` →
 *     `OpenPanelEventsReadMissingActorIdentity`)
 *   - reason-catalog decode (only
 *     `reasonCatalogId.openPanelEventsRead` allowed; everything
 *     else → `OpenPanelEventsReadReasonNotInCatalog`)
 *   - adapter error surfaces as
 *     `OpenPanelEventsReadAdapterClientError` with audit suppressed
 *   - audit emission on every successful read (cache hit AND cache
 *     miss) keyed by `platformModuleId.openPanelEventsRead` +
 *     `openPanelEventsReadAuditAction.readPerformed` +
 *     `reasonCatalogId.openPanelEventsRead`
 *   - bounded per-tenant snapshot cache with insertion-order
 *     eviction; freshness reconciliation via
 *     `isOpenPanelEventFresh` drops stale entries
 */
import { Effect, Exit, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  openPanelEventsReadAuditAction,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  type AuditEvent,
  type OpenPanelEvent,
  type OpenPanelEventsReadTargetTenant,
  type RequestContext,
} from "@comvestec/contracts";
import type { AuditLogModuleService } from "@comvestec/modules";
import {
  makeOpenPanelEventsReadService,
  OpenPanelEventsReadAdapterClientError,
  OpenPanelEventsReadMissingActorIdentity,
  OpenPanelEventsReadReasonActionMismatch,
  OpenPanelEventsReadReasonNotInCatalog,
  OpenPanelEventsReadUnauthorized,
  type OpenPanelEventsApiClientService,
  type OpenPanelEventsReadRuntimeBounds,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const tenant: OpenPanelEventsReadTargetTenant = {
  scope: platformScope.platform,
  scopeId: platformScope.platform,
};

const operatorContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_openpanel_operator",
  sessionId: "sess_openpanel",
  correlationId: "corr_openpanel_operator",
  reason: "openpanel events read service unit test",
  tenant,
};

const supportOperatorContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.supportOperator,
  actorId: "usr_openpanel_support",
  correlationId: "corr_openpanel_support",
};

const nonOperatorContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.individualUser,
  actorId: "usr_openpanel_user",
};

const anonymousContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.anonymous,
  actorId: undefined,
};

const defaultBounds: OpenPanelEventsReadRuntimeBounds = {
  cacheMaxSize: 2,
  snapshotCacheTtlSeconds: 30,
  defaultListLimit: 25,
};

const eventFixture: OpenPanelEvent = {
  eventId: "evt_test_001",
  projectId: "proj_admin",
  eventName: "pageview",
  occurredAt: "2026-01-01T00:00:00.000Z",
  properties: "sha256:abc123",
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

type PortDouble = OpenPanelEventsApiClientService & {
  readonly getByIdCount: () => number;
};

const createPortDouble = (overrides?: {
  readonly getByIdResult?: Option.Option<OpenPanelEvent>;
  readonly listResult?: ReadonlyArray<OpenPanelEvent>;
  readonly getByIdError?: unknown;
  readonly listError?: unknown;
}): PortDouble => {
  let getByIdInvocations = 0;
  return {
    getById: (input) => {
      getByIdInvocations += 1;
      if (overrides?.getByIdError !== undefined) {
        return Effect.fail(
          new OpenPanelEventsReadAdapterClientError({
            operation: "getById",
            tenant: input.tenant,
            cause: overrides.getByIdError,
          }),
        );
      }
      return Effect.succeed(
        overrides?.getByIdResult ?? Option.some(eventFixture),
      );
    },
    listByProject: (input) => {
      if (overrides?.listError !== undefined) {
        return Effect.fail(
          new OpenPanelEventsReadAdapterClientError({
            operation: "listByProject",
            tenant: input.tenant,
            cause: overrides.listError,
          }),
        );
      }
      return Effect.succeed(overrides?.listResult ?? [eventFixture]);
    },
    listByEventName: (input) => {
      if (overrides?.listError !== undefined) {
        return Effect.fail(
          new OpenPanelEventsReadAdapterClientError({
            operation: "listByEventName",
            tenant: input.tenant,
            cause: overrides.listError,
          }),
        );
      }
      return Effect.succeed(overrides?.listResult ?? [eventFixture]);
    },
    getByIdCount: () => getByIdInvocations,
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("openpanel-events-read service — happy paths + audit", () => {
  it("getById returns the event, audits once, and serves cache hit while still auditing", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    const service = makeOpenPanelEventsReadService({
      auditLog: audit.service,
      openPanelEventsApiClient: port,
      bounds: defaultBounds,
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const first = await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          eventId: eventFixture.eventId,
          reasonCatalogId: reasonCatalogId.openPanelEventsRead,
        },
      }),
    );

    expect(Option.isSome(first)).toBe(true);
    if (Option.isSome(first)) {
      expect(first.value.event).toEqual(eventFixture);
      expect(first.value.isFresh).toBe(true);
    }
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]).toMatchObject({
      moduleId: platformModuleId.openPanelEventsRead,
      action: openPanelEventsReadAuditAction.readPerformed,
      target: eventFixture.eventId,
      reason: reasonCatalogId.openPanelEventsRead,
    });

    const second = await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          eventId: eventFixture.eventId,
          reasonCatalogId: reasonCatalogId.openPanelEventsRead,
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
    const service = makeOpenPanelEventsReadService({
      auditLog: audit.service,
      openPanelEventsApiClient: port,
      bounds: defaultBounds,
    });

    const view = await Effect.runPromise(
      service.listByProject({
        requestContext: supportOperatorContext,
        query: {
          tenant,
          projectId: eventFixture.projectId,
          reasonCatalogId: reasonCatalogId.openPanelEventsRead,
        },
      }),
    );

    expect(view.events).toEqual([eventFixture]);
    expect(view.isFresh).toBe(true);
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]?.target).toBe(`project:${eventFixture.projectId}`);
  });

  it("listByEventName returns the list and audits with eventName-prefixed target", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    const service = makeOpenPanelEventsReadService({
      auditLog: audit.service,
      openPanelEventsApiClient: port,
      bounds: defaultBounds,
    });

    const view = await Effect.runPromise(
      service.listByEventName({
        requestContext: operatorContext,
        query: {
          tenant,
          eventName: "pageview",
          reasonCatalogId: reasonCatalogId.openPanelEventsRead,
        },
      }),
    );

    expect(view.events).toEqual([eventFixture]);
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]?.target).toBe("eventName:pageview");
  });
});

describe("openpanel-events-read service — authz + reason-catalog enforcement", () => {
  it("anonymous actor surfaces OpenPanelEventsReadMissingActorIdentity and never audits", async () => {
    const audit = createAuditDouble();
    const service = makeOpenPanelEventsReadService({
      auditLog: audit.service,
      openPanelEventsApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: anonymousContext,
        query: {
          tenant,
          eventId: eventFixture.eventId,
          reasonCatalogId: reasonCatalogId.openPanelEventsRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "OpenPanelEventsReadMissingActorIdentity",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
    void OpenPanelEventsReadMissingActorIdentity;
  });

  it("non-operator actor surfaces OpenPanelEventsReadUnauthorized and never audits", async () => {
    const audit = createAuditDouble();
    const service = makeOpenPanelEventsReadService({
      auditLog: audit.service,
      openPanelEventsApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.listByEventName({
        requestContext: nonOperatorContext,
        query: {
          tenant,
          eventName: "pageview",
          reasonCatalogId: reasonCatalogId.openPanelEventsRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "OpenPanelEventsReadUnauthorized",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
    void OpenPanelEventsReadUnauthorized;
  });

  it("rejects unknown reasonCatalogId with OpenPanelEventsReadReasonNotInCatalog", async () => {
    const audit = createAuditDouble();
    const service = makeOpenPanelEventsReadService({
      auditLog: audit.service,
      openPanelEventsApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          eventId: eventFixture.eventId,
          reasonCatalogId: "not-a-real-reason",
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "OpenPanelEventsReadReasonNotInCatalog",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
    void OpenPanelEventsReadReasonNotInCatalog;
  });

  it("rejects mismatched reasonCatalogId with OpenPanelEventsReadReasonActionMismatch", async () => {
    const audit = createAuditDouble();
    const service = makeOpenPanelEventsReadService({
      auditLog: audit.service,
      openPanelEventsApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          eventId: eventFixture.eventId,
          reasonCatalogId: reasonCatalogId.tenantWorkspaceRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "OpenPanelEventsReadReasonActionMismatch",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
    void OpenPanelEventsReadReasonActionMismatch;
  });
});

describe("openpanel-events-read service — adapter errors + cache eviction", () => {
  it("propagates OpenPanelEventsReadAdapterClientError and suppresses audit", async () => {
    const audit = createAuditDouble();
    const service = makeOpenPanelEventsReadService({
      auditLog: audit.service,
      openPanelEventsApiClient: createPortDouble({
        getByIdError: { _tag: "OpenPanelAdapterRequestError" },
      }),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          eventId: eventFixture.eventId,
          reasonCatalogId: reasonCatalogId.openPanelEventsRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const found = JSON.stringify(exit.cause).includes(
        "OpenPanelEventsReadAdapterClientError",
      );
      expect(found).toBe(true);
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("evicts the oldest event once cacheMaxSize is exceeded (insertion-order eviction)", async () => {
    const audit = createAuditDouble();
    const eventB: OpenPanelEvent = {
      ...eventFixture,
      eventId: "evt_test_002",
    };
    const eventC: OpenPanelEvent = {
      ...eventFixture,
      eventId: "evt_test_003",
    };
    let invocation = 0;
    const port: OpenPanelEventsApiClientService = {
      getById: (input) => {
        invocation += 1;
        const match = [eventFixture, eventB, eventC].find(
          (candidate) => candidate.eventId === input.eventId,
        );
        return Effect.succeed(
          match ? Option.some(match) : Option.none<OpenPanelEvent>(),
        );
      },
      listByProject: () => Effect.succeed([]),
      listByEventName: () => Effect.succeed([]),
    };
    const service = makeOpenPanelEventsReadService({
      auditLog: audit.service,
      openPanelEventsApiClient: port,
      bounds: { ...defaultBounds, cacheMaxSize: 2 },
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const run = (eventId: string) =>
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          eventId,
          reasonCatalogId: reasonCatalogId.openPanelEventsRead,
        },
      });

    await Effect.runPromise(run(eventFixture.eventId));
    await Effect.runPromise(run(eventB.eventId));
    await Effect.runPromise(run(eventC.eventId));
    expect(invocation).toBe(3);

    await Effect.runPromise(run(eventFixture.eventId));
    expect(invocation).toBe(4);

    await Effect.runPromise(run(eventC.eventId));
    expect(invocation).toBe(4);
  });

  it("drops stale cache entries when snapshotCacheTtlSeconds elapses", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    let currentMs = new Date("2026-02-01T00:00:00.000Z").getTime();
    const service = makeOpenPanelEventsReadService({
      auditLog: audit.service,
      openPanelEventsApiClient: port,
      bounds: { ...defaultBounds, snapshotCacheTtlSeconds: 1 },
      now: () => new Date(currentMs),
    });

    await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          eventId: eventFixture.eventId,
          reasonCatalogId: reasonCatalogId.openPanelEventsRead,
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
          eventId: eventFixture.eventId,
          reasonCatalogId: reasonCatalogId.openPanelEventsRead,
        },
      }),
    );
    expect(port.getByIdCount()).toBe(2);
  });
});
