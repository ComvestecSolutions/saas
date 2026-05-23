/**
 * Admin-saved-views platform-service tests (admin-app implementation
 * plan §9 item 2). Mirrors the admin-organization service test
 * harness: a fake repository (in-memory map) + fake audit log to
 * assert the cross-cutting invariants the service is supposed to
 * enforce above and beyond the repository:
 *
 *   - per-user isolation via `requireMatchingOwner` →
 *     `CrossUserAccessDenied._tag` on mismatched ownerSubjectId
 *   - `MissingActorIdentity._tag` on requests without an actorId
 *   - audit emission on every mutation, keyed by
 *     `platformModuleId.adminSavedViews` with the canonical
 *     `reasonCatalogId.adminSavedView*` constants
 *   - repository unique/not-found errors are remapped to the public
 *     `SavedViewAlreadyExists` / `SavedViewNotFound` channels
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  adminSavedViewResourceKind,
  adminSavedViewsAuditAction,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  type AdminSavedView,
  type RequestContext,
} from "@comvestec/contracts";
import {
  AdminSavedViewsNotFoundError,
  AdminSavedViewsUniqueViolationError,
  type AdminSavedViewsRepositoryService,
  type AuditLogModuleService,
  type BuildAuditEventInput,
} from "@comvestec/modules";
import {
  CrossUserAccessDenied,
  MissingActorIdentity,
  SavedViewAlreadyExists,
  SavedViewNotFound,
  makeAdminSavedViewsService,
  type AdminSavedViewsServiceImpl,
} from "@comvestec/platform";

const operatorRequestContext = (overrides?: {
  readonly actorId?: string;
}): RequestContext => ({
  actorType: actorType.platformOperator,
  actorId: overrides?.actorId ?? "subject-alpha",
  sessionId: "sess-saved-views",
  correlationId: "corr-saved-views",
  reason: "admin-saved-views service unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
});

const anonymousRequestContext = (): RequestContext => ({
  actorType: actorType.platformOperator,
  sessionId: "sess-saved-views-anon",
  correlationId: "corr-saved-views-anon",
  reason: "admin-saved-views anonymous unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
});

const buildSavedView = (
  overrides: Partial<AdminSavedView>,
): AdminSavedView => ({
  id: overrides.id ?? "view-1",
  ownerSubjectId: overrides.ownerSubjectId ?? "subject-alpha",
  name: overrides.name ?? "My view",
  resourceKind: overrides.resourceKind ?? adminSavedViewResourceKind.tenants,
  serializedView: overrides.serializedView ?? "{}",
  pinned: overrides.pinned ?? false,
  createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
  ...(overrides.lastUsedAt === undefined
    ? {}
    : { lastUsedAt: overrides.lastUsedAt }),
});

const createAuditFake = () => {
  const calls: BuildAuditEventInput[] = [];
  const service: AuditLogModuleService = {
    append: (input) =>
      Effect.sync(() => {
        calls.push(input);
        return {
          eventId: `evt_${calls.length}`,
          timestamp: new Date().toISOString(),
          actorId:
            input.requestContext.actorId ??
            `${input.requestContext.actorType}:anonymous`,
          tenantScope: input.requestContext.tenant.scope,
          tenantScopeId: input.requestContext.tenant.scopeId,
          moduleId: input.moduleId,
          action: input.action,
          target: input.target,
          reason: input.reason ?? input.requestContext.reason,
          correlationId: input.requestContext.correlationId,
        };
      }),
    queryByModule: () => Effect.succeed([]),
    queryByTarget: () => Effect.succeed([]),
    queryByActor: () => Effect.succeed([]),
    queryByTenant: () => Effect.succeed([]),
    requirements: Effect.succeed([]),
  };
  return { service, calls };
};

const createRepositoryFake = (
  options: {
    readonly createFails?: AdminSavedViewsUniqueViolationError;
    readonly updateFails?: AdminSavedViewsNotFoundError;
  } = {},
) => {
  const rows = new Map<string, AdminSavedView>();
  let sequence = 0;
  const service: AdminSavedViewsRepositoryService = {
    list: (ownerSubjectId) =>
      Effect.sync(() =>
        [...rows.values()].filter(
          (view) => view.ownerSubjectId === ownerSubjectId,
        ),
      ),
    get: (id, ownerSubjectId) =>
      Effect.sync(() => {
        const row = rows.get(id);
        return row !== undefined && row.ownerSubjectId === ownerSubjectId
          ? Option.some(row)
          : Option.none();
      }),
    create: (input) =>
      Effect.gen(function* () {
        if (options.createFails !== undefined) {
          return yield* Effect.fail(options.createFails);
        }
        sequence += 1;
        const created = buildSavedView({
          id: `view-${sequence}`,
          ownerSubjectId: input.ownerSubjectId,
          name: input.name,
          resourceKind: input.resourceKind,
          serializedView: input.serializedView,
          pinned: input.pinned ?? false,
        });
        rows.set(created.id, created);
        return created;
      }),
    update: ({ id, ownerSubjectId, patch }) =>
      Effect.gen(function* () {
        if (options.updateFails !== undefined) {
          return yield* Effect.fail(options.updateFails);
        }
        const existing = rows.get(id);
        if (
          existing === undefined ||
          existing.ownerSubjectId !== ownerSubjectId
        ) {
          return yield* Effect.fail(
            new AdminSavedViewsNotFoundError({ id, ownerSubjectId }),
          );
        }
        const next: AdminSavedView = {
          ...existing,
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.serializedView === undefined
            ? {}
            : { serializedView: patch.serializedView }),
          ...(patch.pinned === undefined ? {} : { pinned: patch.pinned }),
          updatedAt: "2026-01-02T00:00:00.000Z",
        };
        rows.set(id, next);
        return next;
      }),
    delete: ({ id, ownerSubjectId }) =>
      Effect.gen(function* () {
        const existing = rows.get(id);
        if (
          existing === undefined ||
          existing.ownerSubjectId !== ownerSubjectId
        ) {
          return yield* Effect.fail(
            new AdminSavedViewsNotFoundError({ id, ownerSubjectId }),
          );
        }
        rows.delete(id);
      }),
    setPinned: ({ id, ownerSubjectId, pinned }) =>
      Effect.gen(function* () {
        const existing = rows.get(id);
        if (
          existing === undefined ||
          existing.ownerSubjectId !== ownerSubjectId
        ) {
          return yield* Effect.fail(
            new AdminSavedViewsNotFoundError({ id, ownerSubjectId }),
          );
        }
        const next: AdminSavedView = { ...existing, pinned };
        rows.set(id, next);
        return next;
      }),
  };
  return { service, rows };
};

const buildService = (
  options: Parameters<typeof createRepositoryFake>[0] = {},
): {
  readonly service: AdminSavedViewsServiceImpl;
  readonly audit: ReturnType<typeof createAuditFake>;
  readonly repo: ReturnType<typeof createRepositoryFake>;
} => {
  const repo = createRepositoryFake(options);
  const audit = createAuditFake();
  const service = makeAdminSavedViewsService(repo.service, audit.service);
  return { service, audit, repo };
};

// ---------------------------------------------------------------------------
// Cross-user isolation
// ---------------------------------------------------------------------------

describe("AdminSavedViewsService — cross-user isolation", () => {
  it.each([
    "list",
    "get",
    "create",
    "update",
    "delete",
    "pin",
    "unpin",
  ] as const)(
    "fails with CrossUserAccessDenied._tag when actorId does not match ownerSubjectId (%s)",
    async (operation) => {
      const { service } = buildService();
      const requestContext = operatorRequestContext({
        actorId: "subject-alpha",
      });
      const targetOwner = "subject-beta";

      const programs: Record<
        typeof operation,
        () => Effect.Effect<unknown, unknown>
      > = {
        list: () =>
          service.list({ requestContext, ownerSubjectId: targetOwner }),
        get: () =>
          service.get({
            requestContext,
            ownerSubjectId: targetOwner,
            id: "any",
          }),
        create: () =>
          service.create({
            requestContext,
            ownerSubjectId: targetOwner,
            name: "Cross-user",
            resourceKind: adminSavedViewResourceKind.tenants,
            serializedView: "{}",
          }),
        update: () =>
          service.update({
            requestContext,
            ownerSubjectId: targetOwner,
            id: "any",
            patch: { name: "renamed" },
          }),
        delete: () =>
          service.delete({
            requestContext,
            ownerSubjectId: targetOwner,
            id: "any",
          }),
        pin: () =>
          service.setPinned({
            requestContext,
            ownerSubjectId: targetOwner,
            id: "any",
            pinned: true,
          }),
        unpin: () =>
          service.setPinned({
            requestContext,
            ownerSubjectId: targetOwner,
            id: "any",
            pinned: false,
          }),
      };

      const exit = await Effect.runPromiseExit(programs[operation]());
      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        const failure = collectFailure(exit.cause, CrossUserAccessDenied);
        expect(failure).toBeDefined();
        expect(failure?._tag).toBe("CrossUserAccessDenied");
        expect(failure?.args.requestingActorId).toBe("subject-alpha");
        expect(failure?.args.targetOwnerSubjectId).toBe("subject-beta");
      }
    },
  );

  it("fails with MissingActorIdentity._tag when the request has no actorId", async () => {
    const { service } = buildService();
    const exit = await Effect.runPromiseExit(
      service.list({
        requestContext: anonymousRequestContext(),
        ownerSubjectId: "subject-alpha",
      }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = collectFailure(exit.cause, MissingActorIdentity);
      expect(failure).toBeDefined();
      expect(failure?._tag).toBe("MissingActorIdentity");
    }
  });
});

// ---------------------------------------------------------------------------
// Audit emission
// ---------------------------------------------------------------------------

describe("AdminSavedViewsService — audit emission", () => {
  it("emits a created audit event with reasonCatalogId.adminSavedViewCreate", async () => {
    const { service, audit } = buildService();
    const requestContext = operatorRequestContext();
    const created = await Effect.runPromise(
      service.create({
        requestContext,
        ownerSubjectId: "subject-alpha",
        name: "View 1",
        resourceKind: adminSavedViewResourceKind.tenants,
        serializedView: "{}",
      }),
    );
    expect(audit.calls.at(-1)).toMatchObject({
      moduleId: platformModuleId.adminSavedViews,
      action: adminSavedViewsAuditAction.created,
      reason: reasonCatalogId.adminSavedViewCreate,
      target: created.id,
    });
  });

  it("emits updated → deleted audit events with the canonical typed reasons", async () => {
    const { service, audit } = buildService();
    const requestContext = operatorRequestContext();
    const created = await Effect.runPromise(
      service.create({
        requestContext,
        ownerSubjectId: "subject-alpha",
        name: "View A",
        resourceKind: adminSavedViewResourceKind.users,
        serializedView: "{}",
      }),
    );
    await Effect.runPromise(
      service.update({
        requestContext,
        ownerSubjectId: "subject-alpha",
        id: created.id,
        patch: { name: "View A (renamed)" },
      }),
    );
    expect(audit.calls.at(-1)).toMatchObject({
      action: adminSavedViewsAuditAction.updated,
      reason: reasonCatalogId.adminSavedViewUpdate,
      target: created.id,
    });

    await Effect.runPromise(
      service.delete({
        requestContext,
        ownerSubjectId: "subject-alpha",
        id: created.id,
      }),
    );
    expect(audit.calls.at(-1)).toMatchObject({
      action: adminSavedViewsAuditAction.deleted,
      reason: reasonCatalogId.adminSavedViewDelete,
      target: created.id,
    });
  });

  it("emits pinned vs unpinned audit actions based on the boolean flag", async () => {
    const { service, audit } = buildService();
    const requestContext = operatorRequestContext();
    const created = await Effect.runPromise(
      service.create({
        requestContext,
        ownerSubjectId: "subject-alpha",
        name: "Pin candidate",
        resourceKind: adminSavedViewResourceKind.tenants,
        serializedView: "{}",
      }),
    );
    await Effect.runPromise(
      service.setPinned({
        requestContext,
        ownerSubjectId: "subject-alpha",
        id: created.id,
        pinned: true,
      }),
    );
    expect(audit.calls.at(-1)).toMatchObject({
      action: adminSavedViewsAuditAction.pinned,
      reason: reasonCatalogId.adminSavedViewPin,
      target: created.id,
    });
    await Effect.runPromise(
      service.setPinned({
        requestContext,
        ownerSubjectId: "subject-alpha",
        id: created.id,
        pinned: false,
      }),
    );
    expect(audit.calls.at(-1)).toMatchObject({
      action: adminSavedViewsAuditAction.unpinned,
      reason: reasonCatalogId.adminSavedViewPin,
      target: created.id,
    });
  });
});

// ---------------------------------------------------------------------------
// Repository error remapping
// ---------------------------------------------------------------------------

describe("AdminSavedViewsService — repository error remapping", () => {
  it("maps AdminSavedViewsUniqueViolationError → SavedViewAlreadyExists", async () => {
    const { service } = buildService({
      createFails: new AdminSavedViewsUniqueViolationError({
        ownerSubjectId: "subject-alpha",
        name: "Already exists",
      }),
    });
    const exit = await Effect.runPromiseExit(
      service.create({
        requestContext: operatorRequestContext(),
        ownerSubjectId: "subject-alpha",
        name: "Already exists",
        resourceKind: adminSavedViewResourceKind.tenants,
        serializedView: "{}",
      }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = collectFailure(exit.cause, SavedViewAlreadyExists);
      expect(failure).toBeDefined();
      expect(failure?._tag).toBe("SavedViewAlreadyExists");
      expect(failure?.args.name).toBe("Already exists");
    }
  });

  it("maps AdminSavedViewsNotFoundError → SavedViewNotFound on update", async () => {
    const { service } = buildService({
      updateFails: new AdminSavedViewsNotFoundError({
        id: "missing",
        ownerSubjectId: "subject-alpha",
      }),
    });
    const exit = await Effect.runPromiseExit(
      service.update({
        requestContext: operatorRequestContext(),
        ownerSubjectId: "subject-alpha",
        id: "missing",
        patch: { name: "renamed" },
      }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = collectFailure(exit.cause, SavedViewNotFound);
      expect(failure).toBeDefined();
      expect(failure?._tag).toBe("SavedViewNotFound");
      expect(failure?.args.id).toBe("missing");
    }
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectFailure<T>(
  cause: unknown,
  ctor: new (...args: never[]) => T,
): T | undefined {
  if (cause === null || typeof cause !== "object") {
    return undefined;
  }
  if (cause instanceof ctor) {
    return cause;
  }
  if ("error" in cause) {
    const error = (cause as { error: unknown }).error;
    if (error instanceof ctor) {
      return error;
    }
  }
  for (const key of ["left", "right", "cause"] as const) {
    if (key in cause) {
      const next = collectFailure(
        (cause as Record<string, unknown>)[key],
        ctor,
      );
      if (next !== undefined) {
        return next;
      }
    }
  }
  if (
    "errors" in cause &&
    Array.isArray((cause as { errors: unknown }).errors)
  ) {
    for (const entry of (cause as { errors: unknown[] }).errors) {
      const next = collectFailure(entry, ctor);
      if (next !== undefined) {
        return next;
      }
    }
  }
  return undefined;
}
