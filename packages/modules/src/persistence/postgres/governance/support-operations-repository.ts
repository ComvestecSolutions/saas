import { Context, Effect, ParseResult, Schema } from "effect";
import {
  PlatformScopeSchema,
  type SupportOperationsCaseStatus,
  SupportOperationsCaseStatusSchema,
  type SupportOperationsBreakGlassIncidentStatus,
  SupportOperationsBreakGlassIncidentStatusSchema,
  type SupportOperationsImpersonationSessionStatus,
  SupportOperationsImpersonationSessionStatusSchema,
} from "@comvestec/contracts";
import {
  type SupportOperationsCaseRecord,
  SupportOperationsCaseRecordListSchema,
  SupportOperationsCaseRecordSchema,
  type SupportOperationsBreakGlassIncidentRecord,
  SupportOperationsBreakGlassIncidentRecordListSchema,
  SupportOperationsBreakGlassIncidentRecordSchema,
  type SupportOperationsImpersonationSessionRecord,
  SupportOperationsImpersonationSessionRecordListSchema,
  SupportOperationsImpersonationSessionRecordSchema,
} from "../../../governance/support-operations";
import {
  supportOperationsCasesTable,
  supportOperationsBreakGlassIncidentsTable,
  supportOperationsImpersonationSessionsTable,
} from "./support-operations";

type SupportOperationsCaseRow = typeof supportOperationsCasesTable.$inferSelect;
type SupportOperationsImpersonationSessionRow =
  typeof supportOperationsImpersonationSessionsTable.$inferSelect;
type SupportOperationsBreakGlassIncidentRow =
  typeof supportOperationsBreakGlassIncidentsTable.$inferSelect;

export const SupportOperationsCaseListFiltersSchema = Schema.Struct({
  status: Schema.optional(SupportOperationsCaseStatusSchema),
  tenantScope: Schema.optional(PlatformScopeSchema),
  tenantScopeId: Schema.optional(Schema.NonEmptyString),
});

export type SupportOperationsCaseListFilters = Schema.Schema.Type<
  typeof SupportOperationsCaseListFiltersSchema
>;

export type SupportOperationsCaseListInput =
  | SupportOperationsCaseStatus
  | SupportOperationsCaseListFilters;

export type SupportOperationsCasePostgresQueryable = {
  readonly upsertSupportCase: (
    record: typeof supportOperationsCasesTable.$inferInsert,
  ) => Promise<SupportOperationsCaseRow>;
  readonly getSupportCase: (
    caseId: string,
  ) => Promise<SupportOperationsCaseRow | undefined>;
  readonly listSupportCases: (
    input?: SupportOperationsCaseListInput,
  ) => Promise<readonly SupportOperationsCaseRow[]>;
};

export type SupportOperationsImpersonationSessionPostgresQueryable = {
  readonly upsertImpersonationSession: (
    record: typeof supportOperationsImpersonationSessionsTable.$inferInsert,
  ) => Promise<SupportOperationsImpersonationSessionRow>;
  readonly getImpersonationSession: (
    caseId: string,
  ) => Promise<SupportOperationsImpersonationSessionRow | undefined>;
  readonly listImpersonationSessions: (
    status?: SupportOperationsImpersonationSessionStatus,
  ) => Promise<readonly SupportOperationsImpersonationSessionRow[]>;
};

export type SupportOperationsBreakGlassIncidentPostgresQueryable = {
  readonly upsertBreakGlassIncident: (
    record: typeof supportOperationsBreakGlassIncidentsTable.$inferInsert,
  ) => Promise<SupportOperationsBreakGlassIncidentRow>;
  readonly getBreakGlassIncident: (
    caseId: string,
  ) => Promise<SupportOperationsBreakGlassIncidentRow | undefined>;
  readonly listBreakGlassIncidents: (
    status?: SupportOperationsBreakGlassIncidentStatus,
  ) => Promise<readonly SupportOperationsBreakGlassIncidentRow[]>;
};

export type SupportOperationsCasePostgresRepositoryQueryError = {
  readonly _tag: "SupportOperationsCasePostgresRepositoryQueryError";
  readonly operation:
    | "upsertSupportCase"
    | "getSupportCase"
    | "listSupportCases";
  readonly cause: unknown;
};

export type SupportOperationsImpersonationSessionPostgresRepositoryQueryError =
  {
    readonly _tag: "SupportOperationsImpersonationSessionPostgresRepositoryQueryError";
    readonly operation:
      | "upsertImpersonationSession"
      | "getImpersonationSession"
      | "listImpersonationSessions"
      | "updateImpersonationSession";
    readonly cause: unknown;
  };

export type SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError = {
  readonly _tag: "SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError";
  readonly operation:
    | "upsertBreakGlassIncident"
    | "getBreakGlassIncident"
    | "listBreakGlassIncidents";
  readonly cause: unknown;
};

export type SupportOperationsCasePostgresRepositoryError =
  | ParseResult.ParseError
  | SupportOperationsCasePostgresRepositoryQueryError;

export type SupportOperationsImpersonationSessionPostgresRepositoryError =
  | ParseResult.ParseError
  | SupportOperationsImpersonationSessionPostgresRepositoryQueryError;

export type SupportOperationsBreakGlassIncidentPostgresRepositoryError =
  | ParseResult.ParseError
  | SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError;

const toIsoString = (value: Date | string | null | undefined) =>
  value == null
    ? undefined
    : value instanceof Date
      ? value.toISOString()
      : value;

const buildSupportOperationsCaseRecord = (row: SupportOperationsCaseRow) =>
  Schema.decodeUnknown(SupportOperationsCaseRecordSchema)({
    caseId: row.caseId,
    supportAgent: row.supportAgent,
    tenantScope: row.tenantScope,
    tenantScopeId: row.tenantScopeId,
    summary: row.summary,
    status: row.status,
    priority: row.priority,
    startedAt: toIsoString(row.startedAt),
    lastUpdatedAt: toIsoString(row.lastUpdatedAt),
  });

const buildSupportOperationsImpersonationSessionRecord = (
  row: SupportOperationsImpersonationSessionRow,
) =>
  Schema.decodeUnknown(SupportOperationsImpersonationSessionRecordSchema)({
    caseId: row.caseId,
    supportAgent: row.supportAgent,
    impersonatedUser: row.impersonatedUser,
    startedAt: toIsoString(row.startedAt),
    durationMinutes: row.durationMinutes,
    status: row.status,
    approvedBy: row.approvedBy,
    reason: row.reason,
    expiresAt: toIsoString(row.expiresAt),
  });

const buildSupportOperationsBreakGlassIncidentRecord = (
  row: SupportOperationsBreakGlassIncidentRow,
) =>
  Schema.decodeUnknown(SupportOperationsBreakGlassIncidentRecordSchema)({
    caseId: row.caseId,
    supportAgent: row.supportAgent,
    startedAt: toIsoString(row.startedAt),
    status: row.status,
    approvedBy: row.approvedBy,
    reason: row.reason,
    expiresAt: toIsoString(row.expiresAt),
  });

const listImpersonationSessionRows = (
  database: SupportOperationsImpersonationSessionPostgresQueryable,
  status?: SupportOperationsImpersonationSessionStatus,
) =>
  Effect.tryPromise({
    try: () => database.listImpersonationSessions(status),
    catch: (cause) =>
      ({
        _tag: "SupportOperationsImpersonationSessionPostgresRepositoryQueryError",
        operation: "listImpersonationSessions",
        cause,
      }) satisfies SupportOperationsImpersonationSessionPostgresRepositoryQueryError,
  });

const listSupportCaseRows = (
  database: SupportOperationsCasePostgresQueryable,
  input?: SupportOperationsCaseListInput,
) =>
  Effect.tryPromise({
    try: () => database.listSupportCases(input),
    catch: (cause) =>
      ({
        _tag: "SupportOperationsCasePostgresRepositoryQueryError",
        operation: "listSupportCases",
        cause,
      }) satisfies SupportOperationsCasePostgresRepositoryQueryError,
  });

const listBreakGlassIncidentRows = (
  database: SupportOperationsBreakGlassIncidentPostgresQueryable,
  status?: SupportOperationsBreakGlassIncidentStatus,
) =>
  Effect.tryPromise({
    try: () => database.listBreakGlassIncidents(status),
    catch: (cause) =>
      ({
        _tag: "SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError",
        operation: "listBreakGlassIncidents",
        cause,
      }) satisfies SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError,
  });

const buildSupportOperationsImpersonationSessionRecordList = (
  rows: readonly SupportOperationsImpersonationSessionRow[],
) =>
  Effect.forEach(rows, (row) =>
    buildSupportOperationsImpersonationSessionRecord(row),
  ).pipe(
    Effect.flatMap((records) =>
      Schema.decodeUnknown(
        SupportOperationsImpersonationSessionRecordListSchema,
      )(records),
    ),
  );

const buildSupportOperationsCaseRecordList = (
  rows: readonly SupportOperationsCaseRow[],
) =>
  Effect.forEach(rows, (row) => buildSupportOperationsCaseRecord(row)).pipe(
    Effect.flatMap((records) =>
      Schema.decodeUnknown(SupportOperationsCaseRecordListSchema)(records),
    ),
  );

const buildSupportOperationsBreakGlassIncidentRecordList = (
  rows: readonly SupportOperationsBreakGlassIncidentRow[],
) =>
  Effect.forEach(rows, (row) =>
    buildSupportOperationsBreakGlassIncidentRecord(row),
  ).pipe(
    Effect.flatMap((records) =>
      Schema.decodeUnknown(SupportOperationsBreakGlassIncidentRecordListSchema)(
        records,
      ),
    ),
  );

export type SupportOperationsImpersonationSessionPostgresRepositoryService = {
  readonly upsertImpersonationSession: (
    input: SupportOperationsImpersonationSessionRecord,
  ) => Effect.Effect<
    SupportOperationsImpersonationSessionRecord,
    SupportOperationsImpersonationSessionPostgresRepositoryError
  >;
  readonly getImpersonationSession: (
    caseId: string,
  ) => Effect.Effect<
    SupportOperationsImpersonationSessionRecord | undefined,
    SupportOperationsImpersonationSessionPostgresRepositoryError
  >;
  readonly listImpersonationSessions: (
    status?: SupportOperationsImpersonationSessionStatus,
  ) => Effect.Effect<
    readonly SupportOperationsImpersonationSessionRecord[],
    SupportOperationsImpersonationSessionPostgresRepositoryError
  >;
};

export type SupportOperationsCasePostgresRepositoryService = {
  readonly upsertSupportCase: (
    input: SupportOperationsCaseRecord,
  ) => Effect.Effect<
    SupportOperationsCaseRecord,
    SupportOperationsCasePostgresRepositoryError
  >;
  readonly getSupportCase: (
    caseId: string,
  ) => Effect.Effect<
    SupportOperationsCaseRecord | undefined,
    SupportOperationsCasePostgresRepositoryError
  >;
  readonly listSupportCases: (
    input?: SupportOperationsCaseListInput,
  ) => Effect.Effect<
    readonly SupportOperationsCaseRecord[],
    SupportOperationsCasePostgresRepositoryError
  >;
};

export type SupportOperationsBreakGlassIncidentPostgresRepositoryService = {
  readonly upsertBreakGlassIncident: (
    input: SupportOperationsBreakGlassIncidentRecord,
  ) => Effect.Effect<
    SupportOperationsBreakGlassIncidentRecord,
    SupportOperationsBreakGlassIncidentPostgresRepositoryError
  >;
  readonly getBreakGlassIncident: (
    caseId: string,
  ) => Effect.Effect<
    SupportOperationsBreakGlassIncidentRecord | undefined,
    SupportOperationsBreakGlassIncidentPostgresRepositoryError
  >;
  readonly listBreakGlassIncidents: (
    status?: SupportOperationsBreakGlassIncidentStatus,
  ) => Effect.Effect<
    readonly SupportOperationsBreakGlassIncidentRecord[],
    SupportOperationsBreakGlassIncidentPostgresRepositoryError
  >;
};

export class SupportOperationsImpersonationSessionPostgresRepository extends Context.Tag(
  "SupportOperationsImpersonationSessionPostgresRepository",
)<
  SupportOperationsImpersonationSessionPostgresRepository,
  SupportOperationsImpersonationSessionPostgresRepositoryService
>() {}

export class SupportOperationsCasePostgresRepository extends Context.Tag(
  "SupportOperationsCasePostgresRepository",
)<
  SupportOperationsCasePostgresRepository,
  SupportOperationsCasePostgresRepositoryService
>() {}

export class SupportOperationsBreakGlassIncidentPostgresRepository extends Context.Tag(
  "SupportOperationsBreakGlassIncidentPostgresRepository",
)<
  SupportOperationsBreakGlassIncidentPostgresRepository,
  SupportOperationsBreakGlassIncidentPostgresRepositoryService
>() {}

export const makeSupportOperationsCasePostgresRepository = (
  database: SupportOperationsCasePostgresQueryable,
) =>
  Effect.succeed<SupportOperationsCasePostgresRepositoryService>({
    upsertSupportCase: (input) =>
      Schema.decodeUnknown(SupportOperationsCaseRecordSchema)(input).pipe(
        Effect.flatMap((record) =>
          Effect.tryPromise({
            try: () =>
              database.upsertSupportCase({
                caseId: record.caseId,
                supportAgent: record.supportAgent,
                tenantScope: record.tenantScope,
                tenantScopeId: record.tenantScopeId,
                summary: record.summary,
                status: record.status,
                priority: record.priority,
                startedAt: new Date(record.startedAt),
                lastUpdatedAt: new Date(record.lastUpdatedAt),
              }),
            catch: (cause) =>
              ({
                _tag: "SupportOperationsCasePostgresRepositoryQueryError",
                operation: "upsertSupportCase",
                cause,
              }) satisfies SupportOperationsCasePostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) => buildSupportOperationsCaseRecord(row)),
      ),
    getSupportCase: (caseId) =>
      Schema.decodeUnknown(Schema.NonEmptyString)(caseId).pipe(
        Effect.flatMap((validatedCaseId) =>
          Effect.tryPromise({
            try: () => database.getSupportCase(validatedCaseId),
            catch: (cause) =>
              ({
                _tag: "SupportOperationsCasePostgresRepositoryQueryError",
                operation: "getSupportCase",
                cause,
              }) satisfies SupportOperationsCasePostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildSupportOperationsCaseRecord(row),
        ),
      ),
    listSupportCases: (input) =>
      input === undefined
        ? listSupportCaseRows(database).pipe(
            Effect.flatMap((rows) =>
              buildSupportOperationsCaseRecordList(rows),
            ),
          )
        : Schema.decodeUnknown(
            Schema.Union(
              SupportOperationsCaseStatusSchema,
              SupportOperationsCaseListFiltersSchema,
            ),
          )(input).pipe(
            Effect.flatMap((validatedInput) =>
              listSupportCaseRows(database, validatedInput),
            ),
            Effect.flatMap((rows) =>
              buildSupportOperationsCaseRecordList(rows),
            ),
          ),
  });

export const makeSupportOperationsImpersonationSessionPostgresRepository = (
  database: SupportOperationsImpersonationSessionPostgresQueryable,
) =>
  Effect.succeed<SupportOperationsImpersonationSessionPostgresRepositoryService>(
    {
      upsertImpersonationSession: (input) =>
        Schema.decodeUnknown(SupportOperationsImpersonationSessionRecordSchema)(
          input,
        ).pipe(
          Effect.flatMap((record) =>
            Effect.tryPromise({
              try: () =>
                database.upsertImpersonationSession({
                  caseId: record.caseId,
                  supportAgent: record.supportAgent,
                  impersonatedUser: record.impersonatedUser,
                  startedAt: new Date(record.startedAt),
                  durationMinutes: record.durationMinutes,
                  status: record.status,
                  approvedBy: record.approvedBy,
                  reason: record.reason,
                  expiresAt: new Date(record.expiresAt),
                }),
              catch: (cause) =>
                ({
                  _tag: "SupportOperationsImpersonationSessionPostgresRepositoryQueryError",
                  operation: "upsertImpersonationSession",
                  cause,
                }) satisfies SupportOperationsImpersonationSessionPostgresRepositoryQueryError,
            }),
          ),
          Effect.flatMap((row) =>
            buildSupportOperationsImpersonationSessionRecord(row),
          ),
        ),
      getImpersonationSession: (caseId) =>
        Schema.decodeUnknown(Schema.NonEmptyString)(caseId).pipe(
          Effect.flatMap((validatedCaseId) =>
            Effect.tryPromise({
              try: () => database.getImpersonationSession(validatedCaseId),
              catch: (cause) =>
                ({
                  _tag: "SupportOperationsImpersonationSessionPostgresRepositoryQueryError",
                  operation: "getImpersonationSession",
                  cause,
                }) satisfies SupportOperationsImpersonationSessionPostgresRepositoryQueryError,
            }),
          ),
          Effect.flatMap((row) =>
            row === undefined
              ? Effect.succeed(undefined)
              : buildSupportOperationsImpersonationSessionRecord(row),
          ),
        ),
      listImpersonationSessions: (status) =>
        status === undefined
          ? listImpersonationSessionRows(database).pipe(
              Effect.flatMap((rows) =>
                buildSupportOperationsImpersonationSessionRecordList(rows),
              ),
            )
          : Schema.decodeUnknown(
              SupportOperationsImpersonationSessionStatusSchema,
            )(status).pipe(
              Effect.flatMap((validatedStatus) =>
                listImpersonationSessionRows(database, validatedStatus),
              ),
              Effect.flatMap((rows) =>
                buildSupportOperationsImpersonationSessionRecordList(rows),
              ),
            ),
    },
  );

export const makeSupportOperationsBreakGlassIncidentPostgresRepository = (
  database: SupportOperationsBreakGlassIncidentPostgresQueryable,
) =>
  Effect.succeed<SupportOperationsBreakGlassIncidentPostgresRepositoryService>({
    upsertBreakGlassIncident: (input) =>
      Schema.decodeUnknown(SupportOperationsBreakGlassIncidentRecordSchema)(
        input,
      ).pipe(
        Effect.flatMap((record) =>
          Effect.tryPromise({
            try: () =>
              database.upsertBreakGlassIncident({
                caseId: record.caseId,
                supportAgent: record.supportAgent,
                startedAt: new Date(record.startedAt),
                status: record.status,
                approvedBy: record.approvedBy,
                reason: record.reason,
                expiresAt: new Date(record.expiresAt),
              }),
            catch: (cause) =>
              ({
                _tag: "SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError",
                operation: "upsertBreakGlassIncident",
                cause,
              }) satisfies SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) =>
          buildSupportOperationsBreakGlassIncidentRecord(row),
        ),
      ),
    getBreakGlassIncident: (caseId) =>
      Schema.decodeUnknown(Schema.NonEmptyString)(caseId).pipe(
        Effect.flatMap((validatedCaseId) =>
          Effect.tryPromise({
            try: () => database.getBreakGlassIncident(validatedCaseId),
            catch: (cause) =>
              ({
                _tag: "SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError",
                operation: "getBreakGlassIncident",
                cause,
              }) satisfies SupportOperationsBreakGlassIncidentPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildSupportOperationsBreakGlassIncidentRecord(row),
        ),
      ),
    listBreakGlassIncidents: (status) =>
      status === undefined
        ? listBreakGlassIncidentRows(database).pipe(
            Effect.flatMap((rows) =>
              buildSupportOperationsBreakGlassIncidentRecordList(rows),
            ),
          )
        : Schema.decodeUnknown(SupportOperationsBreakGlassIncidentStatusSchema)(
            status,
          ).pipe(
            Effect.flatMap((validatedStatus) =>
              listBreakGlassIncidentRows(database, validatedStatus),
            ),
            Effect.flatMap((rows) =>
              buildSupportOperationsBreakGlassIncidentRecordList(rows),
            ),
          ),
  });
