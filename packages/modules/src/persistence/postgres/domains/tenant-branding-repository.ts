import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  type CustomDomainVerificationReference,
  CustomDomainVerificationReferenceSchema,
  type CustomDomainVerificationScopeReference,
  CustomDomainVerificationScopeReferenceSchema,
  type CustomDomainVerificationRecord,
  CustomDomainVerificationRecordSchema,
} from "@comvestec/contracts";
import { tenantBrandingDomainVerificationTable } from "./tenant-branding";

type TenantBrandingDomainVerificationRow =
  typeof tenantBrandingDomainVerificationTable.$inferSelect;

export type TenantBrandingDomainVerificationAlreadyExistsError = {
  readonly _tag: "TenantBrandingDomainVerificationAlreadyExistsError";
  readonly scope: CustomDomainVerificationRecord["scope"];
  readonly scopeId: string;
  readonly requestedHost: string;
};

export type TenantBrandingDomainVerificationPostgresQueryable = {
  readonly createCustomDomainVerification: (
    record: typeof tenantBrandingDomainVerificationTable.$inferInsert,
  ) => Promise<TenantBrandingDomainVerificationRow>;
  readonly updateCustomDomainVerification: (
    record: typeof tenantBrandingDomainVerificationTable.$inferInsert,
  ) => Promise<TenantBrandingDomainVerificationRow | undefined>;
  readonly findCustomDomainVerification: (
    input: CustomDomainVerificationReference,
  ) => Promise<TenantBrandingDomainVerificationRow | undefined>;
  readonly findCurrentCustomDomainVerification: (
    input: CustomDomainVerificationScopeReference,
  ) => Promise<TenantBrandingDomainVerificationRow | undefined>;
};

export type TenantBrandingDomainVerificationPostgresRepositoryQueryError = {
  readonly _tag: "TenantBrandingDomainVerificationPostgresRepositoryQueryError";
  readonly operation:
    | "createCustomDomainVerification"
    | "updateCustomDomainVerification"
    | "findCustomDomainVerification"
    | "findCurrentCustomDomainVerification";
  readonly cause: unknown;
};

export type TenantBrandingDomainVerificationPostgresRepositoryError =
  | ParseResult.ParseError
  | TenantBrandingDomainVerificationAlreadyExistsError
  | TenantBrandingDomainVerificationPostgresRepositoryQueryError;

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

const decodeCustomDomainVerificationRecord = Schema.decodeUnknown(
  CustomDomainVerificationRecordSchema,
);

const buildCustomDomainVerificationRecord = (
  row: TenantBrandingDomainVerificationRow,
) =>
  decodeCustomDomainVerificationRecord({
    verificationId: row.verificationId,
    scope: row.scope,
    scopeId: row.scopeId,
    requestedHost: row.requestedHost,
    lifecycleState: row.lifecycleState,
    ...(row.dnsProof != null ? { dnsProof: row.dnsProof } : {}),
    ...(row.approvedBy != null ? { approvedBy: row.approvedBy } : {}),
    ...(row.approvalNotes != null ? { approvalNotes: row.approvalNotes } : {}),
    changedAt: toIsoString(row.changedAt) ?? new Date().toISOString(),
  });

export type TenantBrandingDomainVerificationPostgresRepositoryService = {
  readonly createCustomDomainVerification: (
    input: CustomDomainVerificationRecord,
  ) => Effect.Effect<
    CustomDomainVerificationRecord,
    TenantBrandingDomainVerificationPostgresRepositoryError
  >;
  readonly updateCustomDomainVerification: (
    input: CustomDomainVerificationRecord,
  ) => Effect.Effect<
    CustomDomainVerificationRecord | undefined,
    | ParseResult.ParseError
    | TenantBrandingDomainVerificationPostgresRepositoryQueryError
  >;
  readonly findCustomDomainVerification: (
    input: CustomDomainVerificationReference,
  ) => Effect.Effect<
    CustomDomainVerificationRecord | undefined,
    | ParseResult.ParseError
    | TenantBrandingDomainVerificationPostgresRepositoryQueryError
  >;
  readonly findCurrentCustomDomainVerification: (
    input: CustomDomainVerificationScopeReference,
  ) => Effect.Effect<
    CustomDomainVerificationRecord | undefined,
    | ParseResult.ParseError
    | TenantBrandingDomainVerificationPostgresRepositoryQueryError
  >;
};

export class TenantBrandingDomainVerificationPostgresRepository extends Context.Tag(
  "TenantBrandingDomainVerificationPostgresRepository",
)<
  TenantBrandingDomainVerificationPostgresRepository,
  TenantBrandingDomainVerificationPostgresRepositoryService
>() {}

export const makeTenantBrandingDomainVerificationPostgresRepository = (
  database: TenantBrandingDomainVerificationPostgresQueryable,
) =>
  Effect.succeed<TenantBrandingDomainVerificationPostgresRepositoryService>({
    createCustomDomainVerification: (
      input: CustomDomainVerificationRecord,
    ): Effect.Effect<
      CustomDomainVerificationRecord,
      TenantBrandingDomainVerificationPostgresRepositoryError
    > =>
      Schema.decodeUnknown(CustomDomainVerificationRecordSchema)(input).pipe(
        Effect.flatMap((record) =>
          Effect.tryPromise({
            try: () =>
              database.createCustomDomainVerification({
                verificationId: record.verificationId,
                scope: record.scope,
                scopeId: record.scopeId,
                requestedHost: record.requestedHost.toLowerCase(),
                lifecycleState: record.lifecycleState,
                dnsProof: record.dnsProof ?? null,
                approvedBy: record.approvedBy ?? null,
                approvalNotes: record.approvalNotes ?? null,
                changedAt: new Date(record.changedAt),
              }),
            catch: (cause) =>
              hasPostgresErrorCode(cause, "23505")
                ? ({
                    _tag: "TenantBrandingDomainVerificationAlreadyExistsError",
                    scope: record.scope,
                    scopeId: record.scopeId,
                    requestedHost: record.requestedHost,
                  } satisfies TenantBrandingDomainVerificationAlreadyExistsError)
                : ({
                    _tag: "TenantBrandingDomainVerificationPostgresRepositoryQueryError",
                    operation: "createCustomDomainVerification",
                    cause,
                  } satisfies TenantBrandingDomainVerificationPostgresRepositoryQueryError),
          }),
        ),
        Effect.flatMap((row) => buildCustomDomainVerificationRecord(row)),
      ),
    updateCustomDomainVerification: (input: CustomDomainVerificationRecord) =>
      Schema.decodeUnknown(CustomDomainVerificationRecordSchema)(input).pipe(
        Effect.flatMap((record) =>
          Effect.tryPromise({
            try: () =>
              database.updateCustomDomainVerification({
                verificationId: record.verificationId,
                scope: record.scope,
                scopeId: record.scopeId,
                requestedHost: record.requestedHost.toLowerCase(),
                lifecycleState: record.lifecycleState,
                dnsProof: record.dnsProof ?? null,
                approvedBy: record.approvedBy ?? null,
                approvalNotes: record.approvalNotes ?? null,
                changedAt: new Date(record.changedAt),
              }),
            catch: (cause) =>
              ({
                _tag: "TenantBrandingDomainVerificationPostgresRepositoryQueryError",
                operation: "updateCustomDomainVerification",
                cause,
              }) satisfies TenantBrandingDomainVerificationPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildCustomDomainVerificationRecord(row).pipe(
                Effect.map((record) => record),
              ),
        ),
      ),
    findCustomDomainVerification: (input: CustomDomainVerificationReference) =>
      Schema.decodeUnknown(CustomDomainVerificationReferenceSchema)(input).pipe(
        Effect.flatMap((reference) =>
          Effect.tryPromise({
            try: () =>
              database.findCustomDomainVerification({
                ...reference,
                requestedHost: reference.requestedHost.toLowerCase(),
              }),
            catch: (cause) =>
              ({
                _tag: "TenantBrandingDomainVerificationPostgresRepositoryQueryError",
                operation: "findCustomDomainVerification",
                cause,
              }) satisfies TenantBrandingDomainVerificationPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildCustomDomainVerificationRecord(row).pipe(
                Effect.map((record) => record),
              ),
        ),
      ),
    findCurrentCustomDomainVerification: (
      input: CustomDomainVerificationScopeReference,
    ) =>
      Schema.decodeUnknown(CustomDomainVerificationScopeReferenceSchema)(
        input,
      ).pipe(
        Effect.flatMap((reference) =>
          Effect.tryPromise({
            try: () => database.findCurrentCustomDomainVerification(reference),
            catch: (cause) =>
              ({
                _tag: "TenantBrandingDomainVerificationPostgresRepositoryQueryError",
                operation: "findCurrentCustomDomainVerification",
                cause,
              }) satisfies TenantBrandingDomainVerificationPostgresRepositoryQueryError,
          }),
        ),
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(undefined)
            : buildCustomDomainVerificationRecord(row).pipe(
                Effect.map((record) => record),
              ),
        ),
      ),
  });

export const makeTenantBrandingDomainVerificationPostgresRepositoryLayer = (
  database: TenantBrandingDomainVerificationPostgresQueryable,
) =>
  Layer.effect(
    TenantBrandingDomainVerificationPostgresRepository,
    makeTenantBrandingDomainVerificationPostgresRepository(database),
  );
