/**
 * Admin saved-views platform service (admin-app implementation
 * plan §9 item 2; `specs/02-apps/admin-app/spec.md` per-user
 * workspaces + saved views).
 *
 * Composes the {@link AdminSavedViewsRepository} (typed Postgres
 * persistence, owner-scoped) with the {@link AuditLogModule} to
 * expose the canonical CRUD + pin/unpin surface for an operator's
 * saved list views.
 *
 * Cross-cutting invariants enforced here (NOT in the repository):
 *   - **Per-user isolation**: every mutation and read is parametrised
 *     on the requesting actor's subject id. A mismatch between the
 *     `requestContext.actorId` and the input `ownerSubjectId` is
 *     rejected with the typed {@link CrossUserAccessDenied} channel
 *     before the repository is touched. This is the core
 *     owner-locked invariant — sharing is explicitly deferred to a
 *     follow-up slice per the spec.
 *   - **Audit emission**: create/update/delete/pin/unpin each
 *     append an `AuditEvent` keyed by `platformModuleId.adminSavedViews`
 *     and a typed `reasonCatalogId.*` + `adminSavedViewsAuditAction.*`
 *     pair.
 *
 * Runtime config:
 *   No invitation-style TTL or notification gateway is needed for
 *   this module; `POSTGRES_URL` is the only required environment
 *   value (see `runAdminSavedViewsFromEnvironment` below).
 */
import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  AdminSavedViewResourceKindSchema,
  adminSavedViewsAuditAction,
  platformModuleId,
  reasonCatalogId,
  RequestContextSchema,
  type AdminSavedView,
  type RequestContext,
} from "@comvestec/contracts";
import {
  type AdminSavedViewsRepositoryError,
  AdminSavedViewsRepository,
  type AdminSavedViewsRepositoryService,
  auditLogEventsTable,
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  AuditLogPostgresRepository,
  makeAdminSavedViewsRepositoryLayer,
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

export class SavedViewNotFound {
  readonly _tag = "SavedViewNotFound" as const;
  constructor(
    readonly args: {
      readonly id: string;
      readonly ownerSubjectId: string;
    },
  ) {}
}

export class SavedViewAlreadyExists {
  readonly _tag = "SavedViewAlreadyExists" as const;
  constructor(
    readonly args: {
      readonly ownerSubjectId: string;
      readonly name: string;
    },
  ) {}
}

export class CrossUserAccessDenied {
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
        | "pin"
        | "unpin";
    },
  ) {}
}

export class MissingActorIdentity {
  readonly _tag = "MissingActorIdentity" as const;
  constructor(
    readonly args: {
      readonly operation:
        | "list"
        | "get"
        | "create"
        | "update"
        | "delete"
        | "pin"
        | "unpin";
    },
  ) {}
}

export type AdminSavedViewsServiceError =
  | ParseResult.ParseError
  | AdminSavedViewsRepositoryError
  | AuditLogModuleError
  | SavedViewNotFound
  | SavedViewAlreadyExists
  | CrossUserAccessDenied
  | MissingActorIdentity;

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const ListSavedViewsInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  ownerSubjectId: Schema.NonEmptyString,
  filter: Schema.optional(
    Schema.Struct({
      resourceKind: Schema.optional(AdminSavedViewResourceKindSchema),
      pinnedOnly: Schema.optional(Schema.Boolean),
    }),
  ),
});

export type ListSavedViewsInput = Schema.Schema.Type<
  typeof ListSavedViewsInputSchema
>;

export const GetSavedViewInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  ownerSubjectId: Schema.NonEmptyString,
  id: Schema.NonEmptyString,
});

export type GetSavedViewInput = Schema.Schema.Type<
  typeof GetSavedViewInputSchema
>;

export const CreateSavedViewInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  ownerSubjectId: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  resourceKind: AdminSavedViewResourceKindSchema,
  serializedView: Schema.NonEmptyString,
  pinned: Schema.optional(Schema.Boolean),
});

export type CreateSavedViewInput = Schema.Schema.Type<
  typeof CreateSavedViewInputSchema
>;

export const UpdateSavedViewInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  ownerSubjectId: Schema.NonEmptyString,
  id: Schema.NonEmptyString,
  patch: Schema.Struct({
    name: Schema.optional(Schema.NonEmptyString),
    serializedView: Schema.optional(Schema.NonEmptyString),
    pinned: Schema.optional(Schema.Boolean),
  }),
});

export type UpdateSavedViewInput = Schema.Schema.Type<
  typeof UpdateSavedViewInputSchema
>;

export const DeleteSavedViewInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  ownerSubjectId: Schema.NonEmptyString,
  id: Schema.NonEmptyString,
});

export type DeleteSavedViewInput = Schema.Schema.Type<
  typeof DeleteSavedViewInputSchema
>;

export const SetPinnedSavedViewInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  ownerSubjectId: Schema.NonEmptyString,
  id: Schema.NonEmptyString,
  pinned: Schema.Boolean,
});

export type SetPinnedSavedViewInput = Schema.Schema.Type<
  typeof SetPinnedSavedViewInputSchema
>;

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export type AdminSavedViewsServiceImpl = {
  readonly list: (
    input: ListSavedViewsInput,
  ) => Effect.Effect<readonly AdminSavedView[], AdminSavedViewsServiceError>;
  readonly get: (
    input: GetSavedViewInput,
  ) => Effect.Effect<
    Option.Option<AdminSavedView>,
    AdminSavedViewsServiceError
  >;
  readonly create: (
    input: CreateSavedViewInput,
  ) => Effect.Effect<AdminSavedView, AdminSavedViewsServiceError>;
  readonly update: (
    input: UpdateSavedViewInput,
  ) => Effect.Effect<AdminSavedView, AdminSavedViewsServiceError>;
  readonly delete: (
    input: DeleteSavedViewInput,
  ) => Effect.Effect<void, AdminSavedViewsServiceError>;
  readonly setPinned: (
    input: SetPinnedSavedViewInput,
  ) => Effect.Effect<AdminSavedView, AdminSavedViewsServiceError>;
};

export class AdminSavedViewsService extends Context.Tag(
  "AdminSavedViewsService",
)<AdminSavedViewsService, AdminSavedViewsServiceImpl>() {}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const decodeListInput = Schema.decodeUnknown(ListSavedViewsInputSchema);
const decodeGetInput = Schema.decodeUnknown(GetSavedViewInputSchema);
const decodeCreateInput = Schema.decodeUnknown(CreateSavedViewInputSchema);
const decodeUpdateInput = Schema.decodeUnknown(UpdateSavedViewInputSchema);
const decodeDeleteInput = Schema.decodeUnknown(DeleteSavedViewInputSchema);
const decodeSetPinnedInput = Schema.decodeUnknown(
  SetPinnedSavedViewInputSchema,
);

const requireMatchingOwner = (
  requestContext: RequestContext,
  ownerSubjectId: string,
  operation: CrossUserAccessDenied["args"]["operation"],
) => {
  const actorId = requestContext.actorId;
  if (actorId === undefined) {
    return Effect.fail(new MissingActorIdentity({ operation }));
  }
  if (actorId !== ownerSubjectId) {
    return Effect.fail(
      new CrossUserAccessDenied({
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
    readonly action: (typeof adminSavedViewsAuditAction)[keyof typeof adminSavedViewsAuditAction];
    readonly target: string;
    readonly reason: (typeof reasonCatalogId)[keyof typeof reasonCatalogId];
  },
) =>
  auditLog.append({
    requestContext: input.requestContext,
    moduleId: platformModuleId.adminSavedViews,
    action: input.action,
    target: input.target,
    reason: input.reason,
  });

export const makeAdminSavedViewsService = (
  repository: AdminSavedViewsRepositoryService,
  auditLog: AuditLogModuleService,
): AdminSavedViewsServiceImpl => {
  const list: AdminSavedViewsServiceImpl["list"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeListInput(input);
      yield* requireMatchingOwner(
        decoded.requestContext,
        decoded.ownerSubjectId,
        "list",
      );
      return yield* repository.list(
        decoded.ownerSubjectId,
        decoded.filter === undefined
          ? undefined
          : {
              ...(decoded.filter.resourceKind === undefined
                ? {}
                : { resourceKind: decoded.filter.resourceKind }),
              ...(decoded.filter.pinnedOnly === undefined
                ? {}
                : { pinnedOnly: decoded.filter.pinnedOnly }),
            },
      );
    });

  const get: AdminSavedViewsServiceImpl["get"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeGetInput(input);
      yield* requireMatchingOwner(
        decoded.requestContext,
        decoded.ownerSubjectId,
        "get",
      );
      return yield* repository.get(decoded.id, decoded.ownerSubjectId);
    });

  const create: AdminSavedViewsServiceImpl["create"] = (input) =>
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
          resourceKind: decoded.resourceKind,
          serializedView: decoded.serializedView,
          ...(decoded.pinned === undefined ? {} : { pinned: decoded.pinned }),
        })
        .pipe(
          Effect.catchTag("AdminSavedViewsUniqueViolationError", (error) =>
            Effect.fail(
              new SavedViewAlreadyExists({
                ownerSubjectId: error.args.ownerSubjectId,
                name: error.args.name,
              }),
            ),
          ),
        );
      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: adminSavedViewsAuditAction.created,
        target: created.id,
        reason: reasonCatalogId.adminSavedViewCreate,
      });
      return created;
    });

  const update: AdminSavedViewsServiceImpl["update"] = (input) =>
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
          Effect.catchTag("AdminSavedViewsNotFoundError", (error) =>
            Effect.fail(
              new SavedViewNotFound({
                id: error.args.id,
                ownerSubjectId: error.args.ownerSubjectId,
              }),
            ),
          ),
          Effect.catchTag("AdminSavedViewsUniqueViolationError", (error) =>
            Effect.fail(
              new SavedViewAlreadyExists({
                ownerSubjectId: error.args.ownerSubjectId,
                name: error.args.name,
              }),
            ),
          ),
        );
      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: adminSavedViewsAuditAction.updated,
        target: updated.id,
        reason: reasonCatalogId.adminSavedViewUpdate,
      });
      return updated;
    });

  const remove: AdminSavedViewsServiceImpl["delete"] = (input) =>
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
          Effect.catchTag("AdminSavedViewsNotFoundError", (error) =>
            Effect.fail(
              new SavedViewNotFound({
                id: error.args.id,
                ownerSubjectId: error.args.ownerSubjectId,
              }),
            ),
          ),
        );
      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: adminSavedViewsAuditAction.deleted,
        target: decoded.id,
        reason: reasonCatalogId.adminSavedViewDelete,
      });
      return undefined;
    });

  const setPinned: AdminSavedViewsServiceImpl["setPinned"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeSetPinnedInput(input);
      yield* requireMatchingOwner(
        decoded.requestContext,
        decoded.ownerSubjectId,
        decoded.pinned ? "pin" : "unpin",
      );
      const updated = yield* repository
        .setPinned({
          id: decoded.id,
          ownerSubjectId: decoded.ownerSubjectId,
          pinned: decoded.pinned,
        })
        .pipe(
          Effect.catchTag("AdminSavedViewsNotFoundError", (error) =>
            Effect.fail(
              new SavedViewNotFound({
                id: error.args.id,
                ownerSubjectId: error.args.ownerSubjectId,
              }),
            ),
          ),
        );
      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: decoded.pinned
          ? adminSavedViewsAuditAction.pinned
          : adminSavedViewsAuditAction.unpinned,
        target: updated.id,
        reason: reasonCatalogId.adminSavedViewPin,
      });
      return updated;
    });

  return { list, get, create, update, delete: remove, setPinned };
};

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const makeAdminSavedViewsServiceLayer = () =>
  Layer.effect(
    AdminSavedViewsService,
    Effect.gen(function* () {
      const repository = yield* AdminSavedViewsRepository;
      const auditLog = yield* AuditLogModule;
      return makeAdminSavedViewsService(repository, auditLog);
    }),
  );

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const AdminSavedViewsProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
});

const decodeAdminSavedViewsProcessEnvironment = Schema.decodeUnknown(
  AdminSavedViewsProcessEnvironmentSchema,
);

export type AdminSavedViewsRuntimeOptions = {
  readonly postgresUrl: string;
};

const resolveAdminSavedViewsRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeAdminSavedViewsProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): AdminSavedViewsRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
      }),
    ),
  );

const makeAdminSavedViewsRuntime = (options: AdminSavedViewsRuntimeOptions) =>
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
      makeAdminSavedViewsRepositoryLayer(writeDatabase),
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
    );
    const serviceLayer = makeAdminSavedViewsServiceLayer().pipe(
      Layer.provide(baseLayer),
    );
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type AdminSavedViewsRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError;

export const runAdminSavedViewsFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: AdminSavedViewsServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | AdminSavedViewsRuntimeError> =>
  resolveAdminSavedViewsRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeAdminSavedViewsRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(AdminSavedViewsService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  );
