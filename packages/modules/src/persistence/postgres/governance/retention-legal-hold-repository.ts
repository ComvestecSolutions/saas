import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  type RetentionDataType,
  type RetentionLegalHoldListRequest,
  RetentionLegalHoldListRequestSchema,
  type RetentionLegalHoldRecord,
  RetentionLegalHoldRecordListSchema,
  RetentionLegalHoldRecordSchema,
  type RetentionPolicyListRequest,
  RetentionPolicyListRequestSchema,
  type RetentionPolicyRecord,
  RetentionPolicyRecordListSchema,
  RetentionPolicyRecordSchema,
} from "@comvestec/contracts";
import {
  retentionLegalHoldsTable,
  retentionPoliciesTable,
} from "./retention-legal-hold";

type RetentionPolicyRow = typeof retentionPoliciesTable.$inferSelect;
type RetentionLegalHoldRow = typeof retentionLegalHoldsTable.$inferSelect;

export type RetentionPolicyLookup = Pick<
  RetentionPolicyRecord,
  "scope" | "scopeId" | "dataType"
>;

export type ActiveRetentionLegalHoldLookup = Pick<
  RetentionLegalHoldRecord,
  "scope" | "scopeId" | "dataType" | "targetId"
>;

export type ReleaseRetentionLegalHoldRecordInput = {
  readonly legalHoldId: string;
  readonly releasedBy: string;
  readonly releasedAt: string;
};

export type RetentionLegalHoldPostgresQueryable = {
  readonly upsertRetentionPolicy: (
    record: typeof retentionPoliciesTable.$inferInsert,
  ) => Promise<RetentionPolicyRow>;
  readonly findRetentionPolicy: (
    scope: RetentionPolicyRecord["scope"],
    scopeId: string,
    dataType: RetentionDataType,
  ) => Promise<RetentionPolicyRow | undefined>;
  readonly listRetentionPoliciesByScope: (
    scope: RetentionPolicyRecord["scope"],
    scopeId: string,
  ) => Promise<readonly RetentionPolicyRow[]>;
  readonly createRetentionLegalHold: (
    record: typeof retentionLegalHoldsTable.$inferInsert,
  ) => Promise<RetentionLegalHoldRow>;
  readonly getRetentionLegalHoldById: (
    legalHoldId: string,
  ) => Promise<RetentionLegalHoldRow | undefined>;
  readonly findActiveRetentionLegalHold: (
    scope: RetentionLegalHoldRecord["scope"],
    scopeId: string,
    dataType: RetentionDataType,
    targetId: string,
  ) => Promise<RetentionLegalHoldRow | undefined>;
  readonly listRetentionLegalHoldsByScope: (
    scope: RetentionLegalHoldRecord["scope"],
    scopeId: string,
  ) => Promise<readonly RetentionLegalHoldRow[]>;
  readonly releaseRetentionLegalHold: (
    legalHoldId: string,
    releasedBy: string,
    releasedAt: Date,
  ) => Promise<RetentionLegalHoldRow | undefined>;
};

export type RetentionLegalHoldPostgresRepositoryQueryError = {
  readonly _tag: "RetentionLegalHoldPostgresRepositoryQueryError";
  readonly operation:
    | "upsertRetentionPolicy"
    | "findRetentionPolicy"
    | "listRetentionPolicies"
    | "createRetentionLegalHold"
    | "getRetentionLegalHold"
    | "findActiveRetentionLegalHold"
    | "listRetentionLegalHolds"
    | "releaseRetentionLegalHold";
  readonly cause: unknown;
};

export type RetentionLegalHoldActiveHoldAlreadyExistsError = {
  readonly _tag: "RetentionLegalHoldActiveHoldAlreadyExistsError";
  readonly scope: RetentionLegalHoldRecord["scope"];
  readonly scopeId: string;
  readonly dataType: RetentionDataType;
  readonly targetId: string;
};

export type RetentionLegalHoldPostgresRepositoryError =
  | RetentionLegalHoldActiveHoldAlreadyExistsError
  | ParseResult.ParseError
  | RetentionLegalHoldPostgresRepositoryQueryError;

const hasPostgresErrorCode = (cause: unknown, code: string): boolean => {
  if (typeof cause !== "object" || cause === null) {
    return false;
  }

  if ("code" in cause && cause.code === code) {
    return true;
  }

  return "cause" in cause ? hasPostgresErrorCode(cause.cause, code) : false;
};

const toIsoString = (value: Date | string | null | undefined) =>
  value == null
    ? undefined
    : value instanceof Date
      ? value.toISOString()
      : value;

const decodeRetentionPolicyRecord = Schema.decodeUnknown(
  RetentionPolicyRecordSchema,
);

const decodeRetentionLegalHoldRecord = Schema.decodeUnknown(
  RetentionLegalHoldRecordSchema,
);

const buildRetentionPolicyRecord = (row: RetentionPolicyRow) =>
  decodeRetentionPolicyRecord({
    policyId: row.policyId,
    scope: row.scope,
    scopeId: row.scopeId,
    dataType: row.dataType,
    retentionDays: row.retentionDays,
    changedBy: row.changedBy,
    createdAt: toIsoString(row.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date().toISOString(),
  });

const buildRetentionLegalHoldRecord = (row: RetentionLegalHoldRow) =>
  decodeRetentionLegalHoldRecord({
    legalHoldId: row.legalHoldId,
    scope: row.scope,
    scopeId: row.scopeId,
    dataType: row.dataType,
    targetId: row.targetId,
    reason: row.reason,
    evidence: row.evidence,
    status: row.status,
    placedBy: row.placedBy,
    placedAt: toIsoString(row.placedAt) ?? new Date().toISOString(),
    ...(row.releasedBy != null ? { releasedBy: row.releasedBy } : {}),
    ...(toIsoString(row.releasedAt) !== undefined
      ? { releasedAt: toIsoString(row.releasedAt) }
      : {}),
  });

export type RetentionLegalHoldPostgresRepositoryService = {
  readonly upsertRetentionPolicy: (
    input: RetentionPolicyRecord,
  ) => Effect.Effect<
    RetentionPolicyRecord,
    RetentionLegalHoldPostgresRepositoryError
  >;
  readonly findRetentionPolicy: (
    input: RetentionPolicyLookup,
  ) => Effect.Effect<
    RetentionPolicyRecord | undefined,
    RetentionLegalHoldPostgresRepositoryError
  >;
  readonly listRetentionPolicies: (
    input: RetentionPolicyListRequest,
  ) => Effect.Effect<
    readonly RetentionPolicyRecord[],
    RetentionLegalHoldPostgresRepositoryError
  >;
  readonly createRetentionLegalHold: (
    input: RetentionLegalHoldRecord,
  ) => Effect.Effect<
    RetentionLegalHoldRecord,
    RetentionLegalHoldPostgresRepositoryError
  >;
  readonly getRetentionLegalHold: (
    legalHoldId: string,
  ) => Effect.Effect<
    RetentionLegalHoldRecord | undefined,
    RetentionLegalHoldPostgresRepositoryError
  >;
  readonly findActiveRetentionLegalHold: (
    input: ActiveRetentionLegalHoldLookup,
  ) => Effect.Effect<
    RetentionLegalHoldRecord | undefined,
    RetentionLegalHoldPostgresRepositoryError
  >;
  readonly listRetentionLegalHolds: (
    input: RetentionLegalHoldListRequest,
  ) => Effect.Effect<
    readonly RetentionLegalHoldRecord[],
    RetentionLegalHoldPostgresRepositoryError
  >;
  readonly releaseRetentionLegalHold: (
    input: ReleaseRetentionLegalHoldRecordInput,
  ) => Effect.Effect<
    RetentionLegalHoldRecord | undefined,
    RetentionLegalHoldPostgresRepositoryError
  >;
};

export class RetentionLegalHoldPostgresRepository extends Context.Tag(
  "RetentionLegalHoldPostgresRepository",
)<
  RetentionLegalHoldPostgresRepository,
  RetentionLegalHoldPostgresRepositoryService
>() {}

export const makeRetentionLegalHoldPostgresRepository = (
  database: RetentionLegalHoldPostgresQueryable,
) =>
  Effect.succeed<RetentionLegalHoldPostgresRepositoryService>({
    upsertRetentionPolicy: (input: RetentionPolicyRecord) =>
      Schema.decodeUnknown(RetentionPolicyRecordSchema)(input).pipe(
        Effect.flatMap((record) =>
          Effect.tryPromise({
            try: () =>
              database.upsertRetentionPolicy({
                policyId: record.policyId,
                scope: record.scope,
                scopeId: record.scopeId,
                dataType: record.dataType,
                retentionDays: record.retentionDays,
                changedBy: record.changedBy,
                createdAt: new Date(record.createdAt),
                updatedAt: new Date(record.updatedAt),
              }),
            catch: (cause) =>
              ({
                _tag: "RetentionLegalHoldPostgresRepositoryQueryError",
                operation: "upsertRetentionPolicy",
                cause,
              }) satisfies RetentionLegalHoldPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) => buildRetentionPolicyRecord(row)),
      ),
    findRetentionPolicy: (input: RetentionPolicyLookup) =>
      Schema.decodeUnknown(
        Schema.Struct({
          scope: RetentionPolicyRecordSchema.fields.scope,
          scopeId: RetentionPolicyRecordSchema.fields.scopeId,
          dataType: RetentionPolicyRecordSchema.fields.dataType,
        }),
      )(input).pipe(
        Effect.flatMap((lookup) =>
          Effect.tryPromise({
            try: () =>
              database.findRetentionPolicy(
                lookup.scope,
                lookup.scopeId,
                lookup.dataType,
              ),
            catch: (cause) =>
              ({
                _tag: "RetentionLegalHoldPostgresRepositoryQueryError",
                operation: "findRetentionPolicy",
                cause,
              }) satisfies RetentionLegalHoldPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildRetentionPolicyRecord(row).pipe(
                Effect.map((record) => record),
              ),
        ),
      ),
    listRetentionPolicies: (input: RetentionPolicyListRequest) =>
      Schema.decodeUnknown(RetentionPolicyListRequestSchema)(input).pipe(
        Effect.flatMap((request) =>
          Effect.tryPromise({
            try: () =>
              database.listRetentionPoliciesByScope(
                request.scope,
                request.scopeId,
              ),
            catch: (cause) =>
              ({
                _tag: "RetentionLegalHoldPostgresRepositoryQueryError",
                operation: "listRetentionPolicies",
                cause,
              }) satisfies RetentionLegalHoldPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((rows) =>
          Effect.forEach(rows, (row) => buildRetentionPolicyRecord(row)),
        ),
        Effect.flatMap((records) =>
          Schema.decodeUnknown(RetentionPolicyRecordListSchema)(records),
        ),
      ),
    createRetentionLegalHold: (input: RetentionLegalHoldRecord) =>
      Schema.decodeUnknown(RetentionLegalHoldRecordSchema)(input).pipe(
        Effect.flatMap((record) =>
          Effect.tryPromise({
            try: () =>
              database.createRetentionLegalHold({
                legalHoldId: record.legalHoldId,
                scope: record.scope,
                scopeId: record.scopeId,
                dataType: record.dataType,
                targetId: record.targetId,
                reason: record.reason,
                evidence: record.evidence,
                status: record.status,
                placedBy: record.placedBy,
                placedAt: new Date(record.placedAt),
                releasedBy: record.releasedBy ?? null,
                releasedAt:
                  record.releasedAt === undefined
                    ? null
                    : new Date(record.releasedAt),
              }),
            catch: (cause) =>
              hasPostgresErrorCode(cause, "23505")
                ? ({
                    _tag: "RetentionLegalHoldActiveHoldAlreadyExistsError",
                    scope: record.scope,
                    scopeId: record.scopeId,
                    dataType: record.dataType,
                    targetId: record.targetId,
                  } satisfies RetentionLegalHoldActiveHoldAlreadyExistsError)
                : ({
                    _tag: "RetentionLegalHoldPostgresRepositoryQueryError",
                    operation: "createRetentionLegalHold",
                    cause,
                  } satisfies RetentionLegalHoldPostgresRepositoryQueryError),
          }),
        ),
        Effect.flatMap((row) => buildRetentionLegalHoldRecord(row)),
      ),
    getRetentionLegalHold: (legalHoldId: string) =>
      Schema.decodeUnknown(Schema.NonEmptyString)(legalHoldId).pipe(
        Effect.flatMap((decodedLegalHoldId) =>
          Effect.tryPromise({
            try: () => database.getRetentionLegalHoldById(decodedLegalHoldId),
            catch: (cause) =>
              ({
                _tag: "RetentionLegalHoldPostgresRepositoryQueryError",
                operation: "getRetentionLegalHold",
                cause,
              }) satisfies RetentionLegalHoldPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildRetentionLegalHoldRecord(row),
        ),
      ),
    findActiveRetentionLegalHold: (input: ActiveRetentionLegalHoldLookup) =>
      Schema.decodeUnknown(
        Schema.Struct({
          scope: RetentionLegalHoldRecordSchema.fields.scope,
          scopeId: RetentionLegalHoldRecordSchema.fields.scopeId,
          dataType: RetentionLegalHoldRecordSchema.fields.dataType,
          targetId: RetentionLegalHoldRecordSchema.fields.targetId,
        }),
      )(input).pipe(
        Effect.flatMap((lookup) =>
          Effect.tryPromise({
            try: () =>
              database.findActiveRetentionLegalHold(
                lookup.scope,
                lookup.scopeId,
                lookup.dataType,
                lookup.targetId,
              ),
            catch: (cause) =>
              ({
                _tag: "RetentionLegalHoldPostgresRepositoryQueryError",
                operation: "findActiveRetentionLegalHold",
                cause,
              }) satisfies RetentionLegalHoldPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildRetentionLegalHoldRecord(row),
        ),
      ),
    listRetentionLegalHolds: (input: RetentionLegalHoldListRequest) =>
      Schema.decodeUnknown(RetentionLegalHoldListRequestSchema)(input).pipe(
        Effect.flatMap((request) =>
          Effect.tryPromise({
            try: () =>
              database.listRetentionLegalHoldsByScope(
                request.scope,
                request.scopeId,
              ),
            catch: (cause) =>
              ({
                _tag: "RetentionLegalHoldPostgresRepositoryQueryError",
                operation: "listRetentionLegalHolds",
                cause,
              }) satisfies RetentionLegalHoldPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((rows) =>
          Effect.forEach(rows, (row) => buildRetentionLegalHoldRecord(row)),
        ),
        Effect.flatMap((records) =>
          Schema.decodeUnknown(RetentionLegalHoldRecordListSchema)(records),
        ),
      ),
    releaseRetentionLegalHold: (input: ReleaseRetentionLegalHoldRecordInput) =>
      Schema.decodeUnknown(
        Schema.Struct({
          legalHoldId: Schema.NonEmptyString,
          releasedBy: Schema.NonEmptyString,
          releasedAt: RetentionLegalHoldRecordSchema.fields.placedAt,
        }),
      )(input).pipe(
        Effect.flatMap((request) =>
          Effect.tryPromise({
            try: () =>
              database.releaseRetentionLegalHold(
                request.legalHoldId,
                request.releasedBy,
                new Date(request.releasedAt),
              ),
            catch: (cause) =>
              ({
                _tag: "RetentionLegalHoldPostgresRepositoryQueryError",
                operation: "releaseRetentionLegalHold",
                cause,
              }) satisfies RetentionLegalHoldPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildRetentionLegalHoldRecord(row),
        ),
      ),
  });

export const makeRetentionLegalHoldPostgresRepositoryLayer = (
  database: RetentionLegalHoldPostgresQueryable,
) =>
  Layer.effect(
    RetentionLegalHoldPostgresRepository,
    makeRetentionLegalHoldPostgresRepository(database),
  );
