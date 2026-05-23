import type { PgTable } from "drizzle-orm/pg-core";
import type { IndexColumn } from "drizzle-orm/pg-core/indexes";
import type { PgInsertValue } from "drizzle-orm/pg-core/query-builders/insert";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core/query-builders/update";

export type PostgresConflictTarget = IndexColumn | IndexColumn[];

type PostgresInsertRow<TTable extends PgTable> = PgInsertValue<TTable>;

export type PostgresInsertCommand = {
  readonly execute: () => Promise<unknown>;
};

export type PostgresInsertValuesBuilder<TTable extends PgTable = PgTable> = {
  readonly execute: () => Promise<unknown>;
  readonly onConflictDoUpdate: (options: {
    readonly target: PostgresConflictTarget;
    readonly set: PgUpdateSetSource<TTable>;
  }) => PostgresInsertCommand;
};

export type PostgresInsertBuilder<TTable extends PgTable = PgTable> = {
  readonly values: (
    values: PostgresInsertRow<TTable> | PostgresInsertRow<TTable>[],
  ) => PostgresInsertValuesBuilder<TTable>;
};

export type PostgresUpdateCommand<TTable extends PgTable = PgTable> = {
  readonly where: (condition: unknown) => {
    readonly returning: () => Promise<Array<TTable["$inferSelect"]>>;
  };
};

export type PostgresUpdateBuilder<TTable extends PgTable = PgTable> = {
  readonly set: (
    values: PgUpdateSetSource<TTable>,
  ) => PostgresUpdateCommand<TTable>;
};

export type PostgresDeleteCommand = {
  readonly execute: () => Promise<unknown>;
};

export type PostgresDeleteBuilder = {
  readonly where: (condition: unknown) => PostgresDeleteCommand;
};

export type PostgresSelectCommand<TTable extends PgTable = PgTable> = {
  readonly where: (
    condition: unknown,
  ) => Promise<Array<TTable["$inferSelect"]>>;
};

export type PostgresSelectBuilder = {
  readonly from: <TTable extends PgTable>(
    table: TTable,
  ) => PostgresSelectCommand<TTable>;
};

export type PostgresTransaction = {
  readonly insert: <TTable extends PgTable>(
    table: TTable,
  ) => PostgresInsertBuilder<TTable>;
  readonly update: <TTable extends PgTable>(
    table: TTable,
  ) => PostgresUpdateBuilder<TTable>;
};

/**
 * Capability mixin for repositories that need hard-deletes. Kept as
 * a separate intersection rather than folded into
 * {@link PostgresDatabase} so existing in-memory test harnesses
 * (which manually satisfy the database surface) do not have to grow
 * a delete builder they never use. Real production callers always
 * receive both surfaces through `buildWriteDatabase` in
 * `@comvestec/platform`.
 */
export type PostgresDeleteCapability = {
  readonly delete: <TTable extends PgTable>(
    table: TTable,
  ) => PostgresDeleteBuilder;
};

export type PostgresDatabase = PostgresTransaction & {
  readonly select: () => PostgresSelectBuilder;
  readonly transaction: <T>(
    callback: (tx: PostgresTransaction) => Promise<T>,
  ) => Promise<T>;
};
