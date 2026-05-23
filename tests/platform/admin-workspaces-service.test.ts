/**
 * Admin-workspaces platform-service tests (admin-app implementation
 * plan §9 item 2). Mirrors the admin-saved-views service test
 * harness: a fake repository (in-memory map) + fake audit log to
 * assert the cross-cutting invariants the service is supposed to
 * enforce above and beyond the repository:
 *
 *   - per-user isolation via `requireMatchingOwner` →
 *     `CrossUserAccessDenied._tag` on mismatched ownerSubjectId
 *   - `MissingActorIdentity._tag` on requests without an actorId
 *   - audit emission on every mutation, keyed by
 *     `platformModuleId.adminWorkspaces` with canonical
 *     `reasonCatalogId.adminWorkspace*` constants
 *   - repository unique/not-found/reorder-mismatch errors are
 *     remapped to the public `WorkspaceAlreadyExists` /
 *     `WorkspaceNotFound` / `WorkspaceReorderInputMismatch` channels
 *
 * The renamed `WorkspaceCrossUserAccessDenied` /
 * `WorkspaceMissingActorIdentity` class identifiers dodge the
 * services barrel-export collision with admin-saved-views, but
 * their `_tag` strings remain `"CrossUserAccessDenied"` /
 * `"MissingActorIdentity"` so the HTTP error mapping and the
 * stewardship-checklist invariants stay identical across slices.
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  adminWorkspacesAuditAction,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  type AdminWorkspace,
  type RequestContext,
} from "@comvestec/contracts";
import {
  AdminWorkspacesNotFoundError,
  AdminWorkspacesReorderMismatchError,
  AdminWorkspacesUniqueViolationError,
  type AdminWorkspacesRepositoryService,
  type AuditLogModuleService,
  type BuildAuditEventInput,
} from "@comvestec/modules";
import {
  WorkspaceAlreadyExists,
  WorkspaceCrossUserAccessDenied,
  WorkspaceMissingActorIdentity,
  WorkspaceNotFound,
  WorkspaceReorderInputMismatch,
  makeAdminWorkspacesService,
  type AdminWorkspacesServiceImpl,
} from "@comvestec/platform";

const operatorRequestContext = (overrides?: {
  readonly actorId?: string;
}): RequestContext => ({
  actorType: actorType.platformOperator,
  actorId: overrides?.actorId ?? "subject-alpha",
  sessionId: "sess-workspaces",
  correlationId: "corr-workspaces",
  reason: "admin-workspaces service unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
});

const anonymousRequestContext = (): RequestContext => ({
  actorType: actorType.platformOperator,
  sessionId: "sess-workspaces-anon",
  correlationId: "corr-workspaces-anon",
  reason: "admin-workspaces anonymous unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
});

const buildWorkspace = (
  overrides: Partial<AdminWorkspace>,
): AdminWorkspace => ({
  id: overrides.id ?? "workspace-1",
  ownerSubjectId: overrides.ownerSubjectId ?? "subject-alpha",
  name: overrides.name ?? "Workspace",
  serializedLayout: overrides.serializedLayout ?? "{}",
  position: overrides.position ?? 1,
  createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
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
    readonly createFails?: AdminWorkspacesUniqueViolationError;
    readonly updateFails?:
      | AdminWorkspacesNotFoundError
      | AdminWorkspacesUniqueViolationError;
    readonly reorderFails?: AdminWorkspacesReorderMismatchError;
  } = {},
) => {
  const rows = new Map<string, AdminWorkspace>();
  let sequence = 0;
  const service: AdminWorkspacesRepositoryService = {
    list: (ownerSubjectId) =>
      Effect.sync(() =>
        [...rows.values()]
          .filter((w) => w.ownerSubjectId === ownerSubjectId)
          .sort((a, b) => a.position - b.position),
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
        const created = buildWorkspace({
          id: `workspace-${sequence}`,
          ownerSubjectId: input.ownerSubjectId,
          name: input.name,
          serializedLayout: input.serializedLayout,
          position: sequence,
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
            new AdminWorkspacesNotFoundError({ id, ownerSubjectId }),
          );
        }
        const next: AdminWorkspace = {
          ...existing,
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.serializedLayout === undefined
            ? {}
            : { serializedLayout: patch.serializedLayout }),
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
            new AdminWorkspacesNotFoundError({ id, ownerSubjectId }),
          );
        }
        rows.delete(id);
      }),
    reorder: ({ ownerSubjectId, idsInOrder }) =>
      Effect.gen(function* () {
        if (options.reorderFails !== undefined) {
          return yield* Effect.fail(options.reorderFails);
        }
        const reordered: AdminWorkspace[] = [];
        for (let i = 0; i < idsInOrder.length; i += 1) {
          const id = idsInOrder[i]!;
          const existing = rows.get(id);
          if (
            existing === undefined ||
            existing.ownerSubjectId !== ownerSubjectId
          ) {
            return yield* Effect.fail(
              new AdminWorkspacesReorderMismatchError({
                ownerSubjectId,
                suppliedIds: idsInOrder,
                currentIds: [...rows.values()]
                  .filter((w) => w.ownerSubjectId === ownerSubjectId)
                  .map((w) => w.id),
              }),
            );
          }
          const next = { ...existing, position: i + 1 };
          rows.set(id, next);
          reordered.push(next);
        }
        return reordered;
      }),
  };
  return { service, rows };
};

const buildService = (
  options: Parameters<typeof createRepositoryFake>[0] = {},
): {
  readonly service: AdminWorkspacesServiceImpl;
  readonly audit: ReturnType<typeof createAuditFake>;
  readonly repo: ReturnType<typeof createRepositoryFake>;
} => {
  const repo = createRepositoryFake(options);
  const audit = createAuditFake();
  const service = makeAdminWorkspacesService(repo.service, audit.service);
  return { service, audit, repo };
};

// ---------------------------------------------------------------------------
// Cross-user isolation
// ---------------------------------------------------------------------------

describe("AdminWorkspacesService — cross-user isolation", () => {
  it.each(["list", "get", "create", "update", "delete", "reorder"] as const)(
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
            serializedLayout: "{}",
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
        reorder: () =>
          service.reorder({
            requestContext,
            ownerSubjectId: targetOwner,
            idsInOrder: ["a", "b"],
          }),
      };

      const exit = await Effect.runPromiseExit(programs[operation]());
      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        const failure = collectFailure(
          exit.cause,
          WorkspaceCrossUserAccessDenied,
        );
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
      const failure = collectFailure(exit.cause, WorkspaceMissingActorIdentity);
      expect(failure).toBeDefined();
      expect(failure?._tag).toBe("MissingActorIdentity");
    }
  });
});

// ---------------------------------------------------------------------------
// Audit emission
// ---------------------------------------------------------------------------

describe("AdminWorkspacesService — audit emission", () => {
  it("emits a created audit event with reasonCatalogId.adminWorkspaceCreate", async () => {
    const { service, audit } = buildService();
    const requestContext = operatorRequestContext();
    const created = await Effect.runPromise(
      service.create({
        requestContext,
        ownerSubjectId: "subject-alpha",
        name: "W1",
        serializedLayout: "{}",
      }),
    );
    expect(audit.calls.at(-1)).toMatchObject({
      moduleId: platformModuleId.adminWorkspaces,
      action: adminWorkspacesAuditAction.create,
      reason: reasonCatalogId.adminWorkspaceCreate,
      target: created.id,
    });
  });

  it("emits updated → deleted audit events with canonical typed reasons", async () => {
    const { service, audit } = buildService();
    const requestContext = operatorRequestContext();
    const created = await Effect.runPromise(
      service.create({
        requestContext,
        ownerSubjectId: "subject-alpha",
        name: "Wa",
        serializedLayout: "{}",
      }),
    );
    await Effect.runPromise(
      service.update({
        requestContext,
        ownerSubjectId: "subject-alpha",
        id: created.id,
        patch: { name: "Wa (renamed)" },
      }),
    );
    expect(audit.calls.at(-1)).toMatchObject({
      action: adminWorkspacesAuditAction.update,
      reason: reasonCatalogId.adminWorkspaceUpdate,
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
      action: adminWorkspacesAuditAction.delete,
      reason: reasonCatalogId.adminWorkspaceDelete,
      target: created.id,
    });
  });

  it("emits a reorder audit event targeting the ownerSubjectId", async () => {
    const { service, audit } = buildService();
    const requestContext = operatorRequestContext();
    const w1 = await Effect.runPromise(
      service.create({
        requestContext,
        ownerSubjectId: "subject-alpha",
        name: "W1",
        serializedLayout: "{}",
      }),
    );
    const w2 = await Effect.runPromise(
      service.create({
        requestContext,
        ownerSubjectId: "subject-alpha",
        name: "W2",
        serializedLayout: "{}",
      }),
    );
    await Effect.runPromise(
      service.reorder({
        requestContext,
        ownerSubjectId: "subject-alpha",
        idsInOrder: [w2.id, w1.id],
      }),
    );
    expect(audit.calls.at(-1)).toMatchObject({
      moduleId: platformModuleId.adminWorkspaces,
      action: adminWorkspacesAuditAction.reorder,
      reason: reasonCatalogId.adminWorkspaceReorder,
      target: "subject-alpha",
    });
  });
});

// ---------------------------------------------------------------------------
// Repository error remapping
// ---------------------------------------------------------------------------

describe("AdminWorkspacesService — repository error remapping", () => {
  it("maps AdminWorkspacesUniqueViolationError → WorkspaceAlreadyExists on create", async () => {
    const { service } = buildService({
      createFails: new AdminWorkspacesUniqueViolationError({
        ownerSubjectId: "subject-alpha",
        name: "dup",
      }),
    });
    const exit = await Effect.runPromiseExit(
      service.create({
        requestContext: operatorRequestContext(),
        ownerSubjectId: "subject-alpha",
        name: "dup",
        serializedLayout: "{}",
      }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = collectFailure(exit.cause, WorkspaceAlreadyExists);
      expect(failure).toBeDefined();
      expect(failure?._tag).toBe("WorkspaceAlreadyExists");
      expect(failure?.args.name).toBe("dup");
    }
  });

  it("maps AdminWorkspacesNotFoundError → WorkspaceNotFound on update", async () => {
    const { service } = buildService({
      updateFails: new AdminWorkspacesNotFoundError({
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
      const failure = collectFailure(exit.cause, WorkspaceNotFound);
      expect(failure).toBeDefined();
      expect(failure?._tag).toBe("WorkspaceNotFound");
      expect(failure?.args.id).toBe("missing");
    }
  });

  it("maps AdminWorkspacesNotFoundError → WorkspaceNotFound on delete", async () => {
    const { service } = buildService();
    const exit = await Effect.runPromiseExit(
      service.delete({
        requestContext: operatorRequestContext(),
        ownerSubjectId: "subject-alpha",
        id: "does-not-exist",
      }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = collectFailure(exit.cause, WorkspaceNotFound);
      expect(failure).toBeDefined();
    }
  });

  it("maps AdminWorkspacesReorderMismatchError → WorkspaceReorderInputMismatch", async () => {
    const { service } = buildService({
      reorderFails: new AdminWorkspacesReorderMismatchError({
        ownerSubjectId: "subject-alpha",
        suppliedIds: ["a"],
        currentIds: ["a", "b"],
      }),
    });
    const exit = await Effect.runPromiseExit(
      service.reorder({
        requestContext: operatorRequestContext(),
        ownerSubjectId: "subject-alpha",
        idsInOrder: ["a"],
      }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = collectFailure(exit.cause, WorkspaceReorderInputMismatch);
      expect(failure).toBeDefined();
      expect(failure?._tag).toBe("WorkspaceReorderInputMismatch");
      expect(failure?.args.suppliedIds).toEqual(["a"]);
      expect(failure?.args.currentIds).toEqual(["a", "b"]);
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
