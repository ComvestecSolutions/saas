/**
 * Admin workspaces platform service (admin-app implementation
 * plan §9 item 2; `specs/02-apps/admin-app/spec.md` per-user
 * workspaces + saved views).
 *
 * Composes the {@link AdminWorkspacesRepository} (typed Postgres
 * persistence, owner-scoped, atomic reorder) with the
 * {@link AuditLogModule} to expose the canonical CRUD + reorder
 * surface for an operator's workspace tabs.
 *
 * Cross-cutting invariants enforced here (NOT in the repository):
 *   - **Per-user isolation**: every mutation and read is parametrised
 *     on the requesting actor's subject id. A mismatch between the
 *     `requestContext.actorId` and the input `ownerSubjectId` is
 *     rejected with the typed {@link CrossUserAccessDenied} channel
 *     before the repository is touched. This is the core
 *     owner-locked invariant — sharing is explicitly deferred to a
 *     follow-up slice per the spec.
 *   - **Audit emission**: create/update/delete/reorder each append an
 *     `AuditEvent` keyed by `platformModuleId.adminWorkspaces` and a
 *     typed `reasonCatalogId.adminWorkspace*` +
 *     `adminWorkspacesAuditAction.*` pair.
 *
 * Runtime config:
 *   `POSTGRES_URL` is the only required environment value (see
 *   `runAdminWorkspacesFromEnvironment` below).
 */
import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  adminWorkspacesAuditAction,
  platformModuleId,
  reasonCatalogId,
  RequestContextSchema,
  type AdminWorkspace,
  type RequestContext,
} from "@comvestec/contracts";
import {
  type AdminWorkspacesRepositoryError,
  AdminWorkspacesRepository,
  type AdminWorkspacesRepositoryService,
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  AuditLogPostgresRepository,
  makeAdminWorkspacesRepositoryLayer,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
} from "@comvestec/modules";
import {
  makePostgresAdapter,
  type PostgresAdapterConnectionError,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class WorkspaceNotFound {
  readonly _tag = "WorkspaceNotFound" as const;
  constructor(
    readonly args: {
      readonly id: string;
      readonly ownerSubjectId: string;
    },
  ) {}
}

export class WorkspaceAlreadyExists {
  readonly _tag = "WorkspaceAlreadyExists" as const;
  constructor(
    readonly args: {
      readonly ownerSubjectId: string;
      readonly name: string;
    },
  ) {}
}

export class WorkspaceReorderInputMismatch {
  readonly _tag = "WorkspaceReorderInputMismatch" as const;
  constructor(
    readonly args: {
      readonly ownerSubjectId: string;
      readonly suppliedIds: readonly string[];
      readonly currentIds: readonly string[];
    },
  ) {}
}

export class WorkspaceCrossUserAccessDenied {
  readonly _tag = "CrossUserAccessDenied" as const;
  constructor(
    readonly args: {
      readonly requestingActorId: string;
      readonly targetOwnerSubjectId: string;
      readonly operation:
        | "list"
        | "get"
        | "create"
        | "update"
        | "delete"
        | "reorder";
    },
  ) {}
}

export class WorkspaceMissingActorIdentity {
  readonly _tag = "MissingActorIdentity" as const;
  constructor(
    readonly args: {
      readonly operation:
        | "list"
        | "get"
        | "create"
        | "update"
        | "delete"
        | "reorder";
    },
  ) {}
}

export type AdminWorkspacesServiceError =
  | ParseResult.ParseError
  | AdminWorkspacesRepositoryError
  | AuditLogModuleError
  | WorkspaceNotFound
  | WorkspaceAlreadyExists
  | WorkspaceReorderInputMismatch
  | WorkspaceCrossUserAccessDenied
  | WorkspaceMissingActorIdentity;

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const ListWorkspacesInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  ownerSubjectId: Schema.NonEmptyString,
});

export type ListWorkspacesInput = Schema.Schema.Type<
  typeof ListWorkspacesInputSchema
>;

export const GetWorkspaceInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  ownerSubjectId: Schema.NonEmptyString,
  id: Schema.NonEmptyString,
});

export type GetWorkspaceInput = Schema.Schema.Type<
  typeof GetWorkspaceInputSchema
>;

export const CreateWorkspaceInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  ownerSubjectId: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  serializedLayout: Schema.NonEmptyString,
});

export type CreateWorkspaceInput = Schema.Schema.Type<
  typeof CreateWorkspaceInputSchema
>;

export const UpdateWorkspaceInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  ownerSubjectId: Schema.NonEmptyString,
  id: Schema.NonEmptyString,
  patch: Schema.Struct({
    name: Schema.optional(Schema.NonEmptyString),
    serializedLayout: Schema.optional(Schema.NonEmptyString),
  }),
});

export type UpdateWorkspaceInput = Schema.Schema.Type<
  typeof UpdateWorkspaceInputSchema
>;

export const DeleteWorkspaceInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  ownerSubjectId: Schema.NonEmptyString,
  id: Schema.NonEmptyString,
});

export type DeleteWorkspaceInput = Schema.Schema.Type<
  typeof DeleteWorkspaceInputSchema
>;

export const ReorderWorkspacesInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  ownerSubjectId: Schema.NonEmptyString,
  idsInOrder: Schema.NonEmptyArray(Schema.NonEmptyString),
});

export type ReorderWorkspacesInput = Schema.Schema.Type<
  typeof ReorderWorkspacesInputSchema
>;

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export type AdminWorkspacesServiceImpl = {
  readonly list: (
    input: ListWorkspacesInput,
  ) => Effect.Effect<readonly AdminWorkspace[], AdminWorkspacesServiceError>;
  readonly get: (
    input: GetWorkspaceInput,
  ) => Effect.Effect<
    Option.Option<AdminWorkspace>,
    AdminWorkspacesServiceError
  >;
  readonly create: (
    input: CreateWorkspaceInput,
  ) => Effect.Effect<AdminWorkspace, AdminWorkspacesServiceError>;
  readonly update: (
    input: UpdateWorkspaceInput,
  ) => Effect.Effect<AdminWorkspace, AdminWorkspacesServiceError>;
  readonly delete: (
    input: DeleteWorkspaceInput,
  ) => Effect.Effect<void, AdminWorkspacesServiceError>;
  readonly reorder: (
    input: ReorderWorkspacesInput,
  ) => Effect.Effect<readonly AdminWorkspace[], AdminWorkspacesServiceError>;
};

export class AdminWorkspacesService extends Context.Tag(
  "AdminWorkspacesService",
)<AdminWorkspacesService, AdminWorkspacesServiceImpl>() {}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const decodeListInput = Schema.decodeUnknown(ListWorkspacesInputSchema);
const decodeGetInput = Schema.decodeUnknown(GetWorkspaceInputSchema);
const decodeCreateInput = Schema.decodeUnknown(CreateWorkspaceInputSchema);
const decodeUpdateInput = Schema.decodeUnknown(UpdateWorkspaceInputSchema);
const decodeDeleteInput = Schema.decodeUnknown(DeleteWorkspaceInputSchema);
const decodeReorderInput = Schema.decodeUnknown(ReorderWorkspacesInputSchema);

const requireMatchingOwner = (
  requestContext: RequestContext,
  ownerSubjectId: string,
  operation: WorkspaceCrossUserAccessDenied["args"]["operation"],
) => {
  const actorId = requestContext.actorId;
  if (actorId === undefined) {
    return Effect.fail(new WorkspaceMissingActorIdentity({ operation }));
  }
  if (actorId !== ownerSubjectId) {
    return Effect.fail(
      new WorkspaceCrossUserAccessDenied({
        requestingActorId: actorId,
        targetOwnerSubjectId: ownerSubjectId,
        operation,
      }),
    );
  }
  return Effect.succeed(actorId);
};

const appendAuditEvent = (
  auditLog: AuditLogModuleService,
  input: {
    readonly requestContext: RequestContext;
    readonly action: (typeof adminWorkspacesAuditAction)[keyof typeof adminWorkspacesAuditAction];
    readonly target: string;
    readonly reason: (typeof reasonCatalogId)[keyof typeof reasonCatalogId];
  },
) =>
  auditLog.append({
    requestContext: input.requestContext,
    moduleId: platformModuleId.adminWorkspaces,
    action: input.action,
    target: input.target,
    reason: input.reason,
  });

export const makeAdminWorkspacesService = (
  repository: AdminWorkspacesRepositoryService,
  auditLog: AuditLogModuleService,
): AdminWorkspacesServiceImpl => {
  const list: AdminWorkspacesServiceImpl["list"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeListInput(input);
      yield* requireMatchingOwner(
        decoded.requestContext,
        decoded.ownerSubjectId,
        "list",
      );
      return yield* repository.list(decoded.ownerSubjectId);
    });

  const get: AdminWorkspacesServiceImpl["get"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeGetInput(input);
      yield* requireMatchingOwner(
        decoded.requestContext,
        decoded.ownerSubjectId,
        "get",
      );
      return yield* repository.get(decoded.id, decoded.ownerSubjectId);
    });

  const create: AdminWorkspacesServiceImpl["create"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeCreateInput(input);
      yield* requireMatchingOwner(
        decoded.requestContext,
        decoded.ownerSubjectId,
        "create",
      );
      const created = yield* repository
        .create({
          ownerSubjectId: decoded.ownerSubjectId,
          name: decoded.name,
          serializedLayout: decoded.serializedLayout,
        })
        .pipe(
          Effect.catchTag("AdminWorkspacesUniqueViolationError", (error) =>
            Effect.fail(
              new WorkspaceAlreadyExists({
                ownerSubjectId: error.args.ownerSubjectId,
                name: error.args.name,
              }),
            ),
          ),
        );
      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: adminWorkspacesAuditAction.create,
        target: created.id,
        reason: reasonCatalogId.adminWorkspaceCreate,
      });
      return created;
    });

  const update: AdminWorkspacesServiceImpl["update"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeUpdateInput(input);
      yield* requireMatchingOwner(
        decoded.requestContext,
        decoded.ownerSubjectId,
        "update",
      );
      const updated = yield* repository
        .update({
          id: decoded.id,
          ownerSubjectId: decoded.ownerSubjectId,
          patch: decoded.patch,
        })
        .pipe(
          Effect.catchTag("AdminWorkspacesNotFoundError", (error) =>
            Effect.fail(
              new WorkspaceNotFound({
                id: error.args.id,
                ownerSubjectId: error.args.ownerSubjectId,
              }),
            ),
          ),
          Effect.catchTag("AdminWorkspacesUniqueViolationError", (error) =>
            Effect.fail(
              new WorkspaceAlreadyExists({
                ownerSubjectId: error.args.ownerSubjectId,
                name: error.args.name,
              }),
            ),
          ),
        );
      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: adminWorkspacesAuditAction.update,
        target: updated.id,
        reason: reasonCatalogId.adminWorkspaceUpdate,
      });
      return updated;
    });

  const remove: AdminWorkspacesServiceImpl["delete"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeDeleteInput(input);
      yield* requireMatchingOwner(
        decoded.requestContext,
        decoded.ownerSubjectId,
        "delete",
      );
      yield* repository
        .delete({ id: decoded.id, ownerSubjectId: decoded.ownerSubjectId })
        .pipe(
          Effect.catchTag("AdminWorkspacesNotFoundError", (error) =>
            Effect.fail(
              new WorkspaceNotFound({
                id: error.args.id,
                ownerSubjectId: error.args.ownerSubjectId,
              }),
            ),
          ),
        );
      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: adminWorkspacesAuditAction.delete,
        target: decoded.id,
        reason: reasonCatalogId.adminWorkspaceDelete,
      });
      return undefined;
    });

  const reorder: AdminWorkspacesServiceImpl["reorder"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeReorderInput(input);
      yield* requireMatchingOwner(
        decoded.requestContext,
        decoded.ownerSubjectId,
        "reorder",
      );
      const reordered = yield* repository
        .reorder({
          ownerSubjectId: decoded.ownerSubjectId,
          idsInOrder: decoded.idsInOrder,
        })
        .pipe(
          Effect.catchTag("AdminWorkspacesReorderMismatchError", (error) =>
            Effect.fail(
              new WorkspaceReorderInputMismatch({
                ownerSubjectId: error.args.ownerSubjectId,
                suppliedIds: error.args.suppliedIds,
                currentIds: error.args.currentIds,
              }),
            ),
          ),
        );
      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: adminWorkspacesAuditAction.reorder,
        target: decoded.ownerSubjectId,
        reason: reasonCatalogId.adminWorkspaceReorder,
      });
      return reordered;
    });

  return { list, get, create, update, delete: remove, reorder };
};

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const makeAdminWorkspacesServiceLayer = () =>
  Layer.effect(
    AdminWorkspacesService,
    Effect.gen(function* () {
      const repository = yield* AdminWorkspacesRepository;
      const auditLog = yield* AuditLogModule;
      return makeAdminWorkspacesService(repository, auditLog);
    }),
  );

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const AdminWorkspacesProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
});

const decodeAdminWorkspacesProcessEnvironment = Schema.decodeUnknown(
  AdminWorkspacesProcessEnvironmentSchema,
);

export type AdminWorkspacesRuntimeOptions = {
  readonly postgresUrl: string;
};

const resolveAdminWorkspacesRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeAdminWorkspacesProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): AdminWorkspacesRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
      }),
    ),
  );

const makeAdminWorkspacesRuntime = (options: AdminWorkspacesRuntimeOptions) =>
  Effect.gen(function* () {
    const postgres = yield* makePostgresAdapter({
      connectionString: options.postgresUrl,
    });
    const writeDatabase = buildWriteDatabase(postgres.database);
    const auditLogQueryable: AuditLogPostgresQueryable = {
      listEventsByModule: (moduleId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.moduleId, moduleId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTarget: (input) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(
            and(
              eq(auditLogEventsTable.moduleId, input.moduleId),
              eq(auditLogEventsTable.target, input.target),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByActor: (actorId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.actorId, actorId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTenant: (input) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(
            and(
              eq(auditLogEventsTable.tenantScope, input.tenantScope),
              eq(auditLogEventsTable.tenantScopeId, input.tenantScopeId),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt)),
    };
    const auditLogRepository = yield* makeAuditLogPostgresRepository({
      ...writeDatabase,
      ...auditLogQueryable,
    });
    const auditLog = yield* makeAuditLogModule(auditLogRepository);
    const baseLayer = Layer.mergeAll(
      makeAdminWorkspacesRepositoryLayer(writeDatabase),
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
    );
    const serviceLayer = makeAdminWorkspacesServiceLayer().pipe(
      Layer.provide(baseLayer),
    );
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type AdminWorkspacesRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError;

export const runAdminWorkspacesFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: AdminWorkspacesServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | AdminWorkspacesRuntimeError> =>
  resolveAdminWorkspacesRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeAdminWorkspacesRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(AdminWorkspacesService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  );
