import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  AuditEventSchema,
  type AuditEvent,
  type PlatformModuleId,
} from "@comvestec/contracts";
import { auditLogEventsTable } from "./audit-log";
import type { PostgresDatabase } from "./database";

type AuditLogEventRow = typeof auditLogEventsTable.$inferSelect;

export type AuditLogPostgresQueryable = {
  readonly listEventsByModule: (
    moduleId: PlatformModuleId,
  ) => Promise<readonly AuditLogEventRow[]>;
};

export type AuditLogPostgresDatabase = PostgresDatabase &
  AuditLogPostgresQueryable;

export type AuditLogPostgresRepositoryPersistenceError = {
  readonly _tag: "AuditLogPostgresRepositoryPersistenceError";
  readonly operation: "insertAuditEvent" | "queryByModule";
  readonly cause: unknown;
};

export type AuditLogPostgresRepositoryError =
  | ParseResult.ParseError
  | AuditLogPostgresRepositoryPersistenceError;

export type AuditLogPostgresRepositoryService = {
  readonly insertAuditEvent: (
    event: AuditEvent,
  ) => Effect.Effect<AuditEvent, AuditLogPostgresRepositoryError>;
  readonly queryByModule: (
    moduleId: PlatformModuleId,
  ) => Effect.Effect<readonly AuditEvent[], AuditLogPostgresRepositoryError>;
};

export class AuditLogPostgresRepository extends Context.Tag(
  "AuditLogPostgresRepository",
)<AuditLogPostgresRepository, AuditLogPostgresRepositoryService>() {}

const decodeAuditEvent = Schema.decodeUnknown(AuditEventSchema);

const toIsoString = (value: Date | string | null | undefined) =>
  value == null
    ? undefined
    : value instanceof Date
      ? value.toISOString()
      : value;

const buildAuditEventRecord = (row: AuditLogEventRow) =>
  decodeAuditEvent({
    eventId: row.eventId,
    timestamp: toIsoString(row.recordedAt) ?? new Date().toISOString(),
    actorId: row.actorId,
    tenantScope: row.tenantScope,
    tenantScopeId: row.tenantScopeId,
    moduleId: row.moduleId,
    action: row.action,
    target: row.target,
    ...(row.reason != null ? { reason: row.reason } : {}),
    ...(row.correlationId != null ? { correlationId: row.correlationId } : {}),
  });

export const makeAuditLogPostgresRepository = (
  database: AuditLogPostgresDatabase,
): Effect.Effect<AuditLogPostgresRepositoryService> =>
  Effect.succeed<AuditLogPostgresRepositoryService>({
    insertAuditEvent: (event: AuditEvent) =>
      Schema.decodeUnknown(AuditEventSchema)(event).pipe(
        Effect.flatMap((decoded) =>
          Effect.tryPromise({
            try: () =>
              database
                .insert(auditLogEventsTable)
                .values({
                  eventId: decoded.eventId,
                  moduleId: decoded.moduleId,
                  action: decoded.action,
                  target: decoded.target,
                  actorId: decoded.actorId,
                  tenantScope: decoded.tenantScope,
                  tenantScopeId: decoded.tenantScopeId,
                  reason: decoded.reason ?? null,
                  correlationId: decoded.correlationId ?? null,
                  requestContext: {},
                })
                .onConflictDoUpdate({
                  target: [auditLogEventsTable.eventId],
                  set: {
                    action: decoded.action,
                    target: decoded.target,
                    reason: decoded.reason ?? null,
                    correlationId: decoded.correlationId ?? null,
                  },
                })
                .execute()
                .then(() => decoded),
            catch: (cause) =>
              ({
                _tag: "AuditLogPostgresRepositoryPersistenceError",
                operation: "insertAuditEvent",
                cause,
              }) satisfies AuditLogPostgresRepositoryPersistenceError,
          }),
        ),
      ),

    queryByModule: (moduleId: PlatformModuleId) =>
      Effect.gen(function* () {
        const rows = yield* Effect.tryPromise({
          try: () => database.listEventsByModule(moduleId),
          catch: (cause) =>
            ({
              _tag: "AuditLogPostgresRepositoryPersistenceError",
              operation: "queryByModule",
              cause,
            }) satisfies AuditLogPostgresRepositoryPersistenceError,
        });

        return yield* Effect.forEach(rows, buildAuditEventRecord);
      }),
  });

export const AuditLogPostgresRepositoryLive = (
  database: AuditLogPostgresDatabase,
) =>
  Layer.effect(
    AuditLogPostgresRepository,
    makeAuditLogPostgresRepository(database),
  );
