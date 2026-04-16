import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import { PlatformScopeSchema } from "@comvestec/contracts";
import { PlatformAdapterServiceNameSchema } from "@comvestec/platform";
import type { PostgresDatabase } from "../database";
import { identitySessionAuditTable } from "./identity-session";

const IdentitySessionAuditMetadataSchema = Schema.Record({
  key: Schema.NonEmptyString,
  value: Schema.Any,
});

export const IdentitySessionLifecycleEventSchema = Schema.Struct({
  eventId: Schema.NonEmptyString,
  sessionId: Schema.NonEmptyString,
  actorId: Schema.NonEmptyString,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  eventType: Schema.NonEmptyString,
  provider: Schema.optional(PlatformAdapterServiceNameSchema),
  metadata: Schema.optional(IdentitySessionAuditMetadataSchema),
  recordedAt: Schema.optional(Schema.NonEmptyString),
});

export type IdentitySessionLifecycleEvent = Schema.Schema.Type<
  typeof IdentitySessionLifecycleEventSchema
>;

export type IdentitySessionAuditInsert =
  typeof identitySessionAuditTable.$inferInsert;

export type IdentitySessionPostgresRepositoryPersistenceError = {
  readonly _tag: "IdentitySessionPostgresRepositoryPersistenceError";
  readonly operation: "persistLifecycleEvent";
  readonly cause: unknown;
};

export type IdentitySessionPostgresRepositoryError =
  | ParseResult.ParseError
  | IdentitySessionPostgresRepositoryPersistenceError;

const parseTimestamp = (value: string | undefined) =>
  value === undefined ? undefined : new Date(value);

const decodeIdentitySessionLifecycleEvent = Schema.decodeUnknown(
  IdentitySessionLifecycleEventSchema,
);

export const buildIdentitySessionAuditInsert = (
  input: IdentitySessionLifecycleEvent,
) =>
  decodeIdentitySessionLifecycleEvent(input).pipe(
    Effect.map(
      (event): IdentitySessionAuditInsert => ({
        eventId: event.eventId,
        sessionId: event.sessionId,
        actorId: event.actorId,
        tenantScope: event.tenantScope,
        tenantScopeId: event.tenantScopeId,
        eventType: event.eventType,
        ...(event.provider !== undefined ? { provider: event.provider } : {}),
        metadata: event.metadata ?? {},
        ...(event.recordedAt !== undefined
          ? { recordedAt: parseTimestamp(event.recordedAt) }
          : {}),
      }),
    ),
  );

const normalizeLifecycleEvent = (event: IdentitySessionLifecycleEvent) =>
  decodeIdentitySessionLifecycleEvent({
    ...event,
    metadata: event.metadata ?? {},
  });

export type IdentitySessionPostgresRepositoryService = {
  readonly persistLifecycleEvent: (
    input: IdentitySessionLifecycleEvent,
  ) => Effect.Effect<
    IdentitySessionLifecycleEvent,
    IdentitySessionPostgresRepositoryError
  >;
};

export class IdentitySessionPostgresRepository extends Context.Tag(
  "IdentitySessionPostgresRepository",
)<
  IdentitySessionPostgresRepository,
  IdentitySessionPostgresRepositoryService
>() {}

export const makeIdentitySessionPostgresRepository = (
  database: PostgresDatabase,
) =>
  Effect.succeed<IdentitySessionPostgresRepositoryService>({
    persistLifecycleEvent: (input: IdentitySessionLifecycleEvent) =>
      decodeIdentitySessionLifecycleEvent(input).pipe(
        Effect.flatMap((event) =>
          buildIdentitySessionAuditInsert(event)
            .pipe(
              Effect.flatMap((insertRow) =>
                Effect.tryPromise({
                  try: () =>
                    database
                      .insert(identitySessionAuditTable)
                      .values(insertRow)
                      .onConflictDoUpdate({
                        target: [identitySessionAuditTable.eventId],
                        set: {
                          sessionId: insertRow.sessionId,
                          actorId: insertRow.actorId,
                          tenantScope: insertRow.tenantScope,
                          tenantScopeId: insertRow.tenantScopeId,
                          eventType: insertRow.eventType,
                          provider: insertRow.provider,
                          metadata: insertRow.metadata,
                          recordedAt: insertRow.recordedAt,
                        },
                      })
                      .execute(),
                  catch: (cause) =>
                    ({
                      _tag: "IdentitySessionPostgresRepositoryPersistenceError",
                      operation: "persistLifecycleEvent",
                      cause,
                    }) satisfies IdentitySessionPostgresRepositoryPersistenceError,
                }),
              ),
            )
            .pipe(Effect.flatMap(() => normalizeLifecycleEvent(event))),
        ),
      ),
  });

export const makeIdentitySessionPostgresRepositoryLayer = (
  database: PostgresDatabase,
) =>
  Layer.effect(
    IdentitySessionPostgresRepository,
    makeIdentitySessionPostgresRepository(database),
  );
