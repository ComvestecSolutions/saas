import { Effect, Exit, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  keycloakRoleReadAuditAction,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  type AuditEvent,
  type KeycloakRoleDetail,
  type KeycloakRoleReadTargetTenant,
  type RequestContext,
} from "@comvestec/contracts";
import type { AuditLogModuleService } from "@comvestec/modules";
import {
  KeycloakRoleReadAdapterClientError,
  KeycloakRoleReadMissingActorIdentity,
  KeycloakRoleReadReasonActionMismatch,
  KeycloakRoleReadReasonNotInCatalog,
  KeycloakRoleReadUnauthorized,
  makeKeycloakRoleReadService,
  pruneExpiredKeycloakRoleReadCacheEntries,
  type KeycloakRoleAdminApiClientService,
  type KeycloakRoleReadRuntimeBounds,
} from "@comvestec/platform";

const tenant: KeycloakRoleReadTargetTenant = {
  scope: platformScope.platform,
  scopeId: platformScope.platform,
};

const operatorContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_kr_operator",
  sessionId: "sess_kr",
  correlationId: "corr_kr_operator",
  reason: "keycloak role read service unit test",
  tenant,
};

const nonOperatorContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.individualUser,
  actorId: "usr_kr_user",
};

const anonymousContext: RequestContext = {
  ...operatorContext,
  actorType: actorType.anonymous,
  actorId: undefined,
};

const defaultBounds: KeycloakRoleReadRuntimeBounds = {
  cacheMaxSize: 2,
  snapshotCacheTtlSeconds: 30,
};

const detailFixture: KeycloakRoleDetail = {
  roleId: "kc-role-001",
  roleName: "tenant-admin",
  description: "Tenant administrators",
  composite: true,
  clientRole: false,
  realm: "comvestec",
  compositeRoles: [
    {
      roleId: "kc-role-002",
      roleName: "tenant-support",
      composite: false,
      clientRole: false,
    },
  ],
  members: [
    {
      userId: "usr_kc_001",
      username: "ada.lovelace",
      email: "ada@example.test",
      enabled: true,
    },
  ],
};

const createRoleDetailFixture = (roleId: string): KeycloakRoleDetail => ({
  ...detailFixture,
  roleId,
  roleName: `role-${roleId}`,
  description: `Description for ${roleId}`,
});

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

type PortDouble = KeycloakRoleAdminApiClientService & {
  readonly getByIdCount: () => number;
  readonly getByIdRoleIds: () => ReadonlyArray<string>;
};

const createPortDouble = (overrides?: {
  readonly getByIdResult?: Option.Option<KeycloakRoleDetail>;
  readonly getByIdError?: unknown;
  readonly getByIdEffect?: (
    input: Parameters<KeycloakRoleAdminApiClientService["getById"]>[0],
  ) => ReturnType<KeycloakRoleAdminApiClientService["getById"]>;
}): PortDouble => {
  let getByIdInvocations = 0;
  const roleIds: string[] = [];

  return {
    getById: (input) => {
      getByIdInvocations += 1;
      roleIds.push(input.roleId);

      if (overrides?.getByIdError !== undefined) {
        return Effect.fail(
          new KeycloakRoleReadAdapterClientError({
            operation: "getById",
            tenant: input.tenant,
            cause: overrides.getByIdError,
          }),
        );
      }

      if (overrides?.getByIdEffect !== undefined) {
        return overrides.getByIdEffect(input);
      }

      return Effect.succeed(
        overrides?.getByIdResult ?? Option.some(detailFixture),
      );
    },
    getByIdCount: () => getByIdInvocations,
    getByIdRoleIds: () => roleIds,
  };
};

describe("keycloak-role-read service — happy path + audit", () => {
  it("getById returns the detail, audits once, and serves cache hit while still auditing", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble();
    const service = makeKeycloakRoleReadService({
      auditLog: audit.service,
      keycloakRoleAdminApiClient: port,
      bounds: defaultBounds,
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const first = await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          roleId: detailFixture.roleId,
          reasonCatalogId: reasonCatalogId.keycloakRoleRead,
        },
      }),
    );
    const second = await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          roleId: detailFixture.roleId,
          reasonCatalogId: reasonCatalogId.keycloakRoleRead,
        },
      }),
    );

    expect(first).toEqual(
      Option.some({
        detail: detailFixture,
        isFresh: true,
      }),
    );
    expect(second).toEqual(
      Option.some({
        detail: detailFixture,
        isFresh: true,
      }),
    );
    expect(port.getByIdCount()).toBe(1);
    expect(audit.calls).toEqual([
      {
        moduleId: platformModuleId.keycloakRoleRead,
        action: keycloakRoleReadAuditAction.readPerformed,
        target: detailFixture.roleId,
        reason: reasonCatalogId.keycloakRoleRead,
      },
      {
        moduleId: platformModuleId.keycloakRoleRead,
        action: keycloakRoleReadAuditAction.readPerformed,
        target: detailFixture.roleId,
        reason: reasonCatalogId.keycloakRoleRead,
      },
    ]);
  });

  it("prunes stale cache entries before oldest-entry eviction is considered", () => {
    const cacheStore = new Map<
      string,
      {
        readonly value: KeycloakRoleDetail;
        readonly cachedAtIso: string;
      }
    >();

    cacheStore.set("fresh-older", {
      value: createRoleDetailFixture("role-a"),
      cachedAtIso: "2026-02-01T00:00:40.000Z",
    });
    cacheStore.set("stale-newer", {
      value: createRoleDetailFixture("role-b"),
      cachedAtIso: "2026-02-01T00:00:00.000Z",
    });

    pruneExpiredKeycloakRoleReadCacheEntries({
      store: cacheStore,
      nowEpochMs: new Date("2026-02-01T00:00:50.000Z").getTime(),
      snapshotCacheTtlSeconds: 20,
    });

    expect([...cacheStore.keys()]).toEqual(["fresh-older"]);
  });

  it("refetches a role after the cached snapshot expires", async () => {
    const audit = createAuditDouble();
    const firstRead = createRoleDetailFixture("role-ttl");
    const refreshedRead: KeycloakRoleDetail = {
      ...firstRead,
      description: "Fresh snapshot after TTL expiry",
    };
    let responseIndex = 0;
    const port = createPortDouble({
      getByIdEffect: () => {
        const response =
          responseIndex === 0
            ? Option.some(firstRead)
            : Option.some(refreshedRead);
        responseIndex += 1;
        return Effect.succeed(response);
      },
    });
    let nowIndex = 0;
    const service = makeKeycloakRoleReadService({
      auditLog: audit.service,
      keycloakRoleAdminApiClient: port,
      bounds: defaultBounds,
      now: () => {
        const timestamp =
          nowIndex === 0
            ? new Date("2026-02-01T00:00:00.000Z")
            : new Date("2026-02-01T00:00:31.000Z");
        nowIndex += 1;
        return timestamp;
      },
    });

    const first = await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          roleId: firstRead.roleId,
          reasonCatalogId: reasonCatalogId.keycloakRoleRead,
        },
      }),
    );
    const second = await Effect.runPromise(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          roleId: firstRead.roleId,
          reasonCatalogId: reasonCatalogId.keycloakRoleRead,
        },
      }),
    );

    expect(first).toEqual(
      Option.some({
        detail: firstRead,
        isFresh: true,
      }),
    );
    expect(second).toEqual(
      Option.some({
        detail: refreshedRead,
        isFresh: true,
      }),
    );
    expect(port.getByIdCount()).toBe(2);
    expect(port.getByIdRoleIds()).toEqual([firstRead.roleId, firstRead.roleId]);
    expect(audit.calls).toHaveLength(2);
  });

  it("evicts the oldest live entry when the bounded cache exceeds max size", async () => {
    const audit = createAuditDouble();
    const port = createPortDouble({
      getByIdEffect: ({ roleId }) =>
        Effect.succeed(Option.some(createRoleDetailFixture(roleId))),
    });
    const service = makeKeycloakRoleReadService({
      auditLog: audit.service,
      keycloakRoleAdminApiClient: port,
      bounds: defaultBounds,
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const getById = (roleId: string) =>
      Effect.runPromise(
        service.getById({
          requestContext: operatorContext,
          query: {
            tenant,
            roleId,
            reasonCatalogId: reasonCatalogId.keycloakRoleRead,
          },
        }),
      );

    const first = await getById("role-a");
    const second = await getById("role-b");
    const third = await getById("role-c");
    const cachedSecond = await getById("role-b");
    const refetchedFirst = await getById("role-a");

    expect(first).toEqual(
      Option.some({
        detail: createRoleDetailFixture("role-a"),
        isFresh: true,
      }),
    );
    expect(second).toEqual(
      Option.some({
        detail: createRoleDetailFixture("role-b"),
        isFresh: true,
      }),
    );
    expect(third).toEqual(
      Option.some({
        detail: createRoleDetailFixture("role-c"),
        isFresh: true,
      }),
    );
    expect(cachedSecond).toEqual(
      Option.some({
        detail: createRoleDetailFixture("role-b"),
        isFresh: true,
      }),
    );
    expect(refetchedFirst).toEqual(
      Option.some({
        detail: createRoleDetailFixture("role-a"),
        isFresh: true,
      }),
    );
    expect(port.getByIdCount()).toBe(4);
    expect(port.getByIdRoleIds()).toEqual([
      "role-a",
      "role-b",
      "role-c",
      "role-a",
    ]);
    expect(audit.calls).toHaveLength(5);
  });
});

describe("keycloak-role-read service — authz and reason enforcement", () => {
  it("rejects non-operator actors", async () => {
    const service = makeKeycloakRoleReadService({
      auditLog: createAuditDouble().service,
      keycloakRoleAdminApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: nonOperatorContext,
        query: {
          tenant,
          roleId: detailFixture.roleId,
          reasonCatalogId: reasonCatalogId.keycloakRoleRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
      expect(failure).toBeInstanceOf(KeycloakRoleReadUnauthorized);
    }
  });

  it("rejects anonymous contexts with no actorId", async () => {
    const service = makeKeycloakRoleReadService({
      auditLog: createAuditDouble().service,
      keycloakRoleAdminApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: anonymousContext,
        query: {
          tenant,
          roleId: detailFixture.roleId,
          reasonCatalogId: reasonCatalogId.keycloakRoleRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
      expect(failure).toBeInstanceOf(KeycloakRoleReadMissingActorIdentity);
    }
  });

  it("rejects reason ids outside the catalog", async () => {
    const service = makeKeycloakRoleReadService({
      auditLog: createAuditDouble().service,
      keycloakRoleAdminApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          roleId: detailFixture.roleId,
          reasonCatalogId: "not-in-catalog",
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
      expect(failure).toBeInstanceOf(KeycloakRoleReadReasonNotInCatalog);
    }
  });

  it("rejects valid reasons that gate a different audit action", async () => {
    const service = makeKeycloakRoleReadService({
      auditLog: createAuditDouble().service,
      keycloakRoleAdminApiClient: createPortDouble(),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          roleId: detailFixture.roleId,
          reasonCatalogId: reasonCatalogId.keycloakUserRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
      expect(failure).toBeInstanceOf(KeycloakRoleReadReasonActionMismatch);
    }
  });
});

describe("keycloak-role-read service — upstream error mapping", () => {
  it("surfaces adapter failures without writing audit entries", async () => {
    const audit = createAuditDouble();
    const service = makeKeycloakRoleReadService({
      auditLog: audit.service,
      keycloakRoleAdminApiClient: createPortDouble({
        getByIdError: new Error("boom"),
      }),
      bounds: defaultBounds,
    });

    const exit = await Effect.runPromiseExit(
      service.getById({
        requestContext: operatorContext,
        query: {
          tenant,
          roleId: detailFixture.roleId,
          reasonCatalogId: reasonCatalogId.keycloakRoleRead,
        },
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
      expect(failure).toBeInstanceOf(KeycloakRoleReadAdapterClientError);
    }
    expect(audit.calls).toHaveLength(0);
  });
});
