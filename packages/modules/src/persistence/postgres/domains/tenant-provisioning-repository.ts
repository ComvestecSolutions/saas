import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  TenantOwnerProvisioningSchema,
  type TenantOwnerProvisioning,
} from "../../../domains/tenant-management";
import type { PostgresDatabase } from "../database";
import { tenantProvisioningReceiptsTable } from "./tenant-provisioning";

export type TenantProvisioningReceiptInsert =
  typeof tenantProvisioningReceiptsTable.$inferInsert;

export type TenantProvisioningPostgresRepositoryPersistenceError = {
  readonly _tag: "TenantProvisioningPostgresRepositoryPersistenceError";
  readonly operation: "persistProvisioningReceipt";
  readonly cause: unknown;
};

export type TenantProvisioningPostgresRepositoryError =
  | ParseResult.ParseError
  | TenantProvisioningPostgresRepositoryPersistenceError;

const parseTimestamp = (value: string | undefined) =>
  value === undefined ? undefined : new Date(value);

const decodeTenantOwnerProvisioning = Schema.decodeUnknown(
  TenantOwnerProvisioningSchema,
);

const buildTenantProvisioningReceiptInsert = (input: TenantOwnerProvisioning) =>
  decodeTenantOwnerProvisioning(input).pipe(
    Effect.map(
      (provisioning): TenantProvisioningReceiptInsert => ({
        provisioningId: provisioning.provisioningId,
        tenantScope: provisioning.requestContext.tenant.scope,
        tenantScopeId: provisioning.requestContext.tenant.scopeId,
        ownerActorId: provisioning.ownerActorId,
        status: provisioning.status,
        correlationId: provisioning.requestContext.correlationId,
        authorizationTuples: provisioning.authorizationTuples,
        requestContext: provisioning.requestContext,
        metadata: provisioning.metadata,
        ...(provisioning.provisionedAt !== undefined
          ? { provisionedAt: parseTimestamp(provisioning.provisionedAt) }
          : {}),
        ...(provisioning.provisionedAt !== undefined
          ? { updatedAt: parseTimestamp(provisioning.provisionedAt) }
          : {}),
      }),
    ),
  );

const normalizeTenantOwnerProvisioning = (input: TenantOwnerProvisioning) =>
  decodeTenantOwnerProvisioning({
    ...input,
    metadata: input.metadata ?? {},
  });

export type TenantProvisioningPostgresRepositoryService = {
  readonly persistProvisioningReceipt: (
    input: TenantOwnerProvisioning,
  ) => Effect.Effect<
    TenantOwnerProvisioning,
    TenantProvisioningPostgresRepositoryError
  >;
};

export class TenantProvisioningPostgresRepository extends Context.Tag(
  "TenantProvisioningPostgresRepository",
)<
  TenantProvisioningPostgresRepository,
  TenantProvisioningPostgresRepositoryService
>() {}

export const makeTenantProvisioningPostgresRepository = (
  database: PostgresDatabase,
) =>
  Effect.succeed<TenantProvisioningPostgresRepositoryService>({
    persistProvisioningReceipt: (input: TenantOwnerProvisioning) =>
      decodeTenantOwnerProvisioning(input).pipe(
        Effect.flatMap((provisioning) =>
          buildTenantProvisioningReceiptInsert(provisioning)
            .pipe(
              Effect.flatMap((insertRow) =>
                Effect.tryPromise({
                  try: () =>
                    database
                      .insert(tenantProvisioningReceiptsTable)
                      .values(insertRow)
                      .onConflictDoUpdate({
                        target: [
                          tenantProvisioningReceiptsTable.provisioningId,
                        ],
                        set: {
                          tenantScope: insertRow.tenantScope,
                          tenantScopeId: insertRow.tenantScopeId,
                          ownerActorId: insertRow.ownerActorId,
                          status: insertRow.status,
                          correlationId: insertRow.correlationId,
                          authorizationTuples: insertRow.authorizationTuples,
                          requestContext: insertRow.requestContext,
                          metadata: insertRow.metadata,
                          provisionedAt: insertRow.provisionedAt,
                          updatedAt: insertRow.updatedAt,
                        },
                      })
                      .execute(),
                  catch: (cause) =>
                    ({
                      _tag: "TenantProvisioningPostgresRepositoryPersistenceError",
                      operation: "persistProvisioningReceipt",
                      cause,
                    }) satisfies TenantProvisioningPostgresRepositoryPersistenceError,
                }),
              ),
            )
            .pipe(
              Effect.flatMap(() =>
                normalizeTenantOwnerProvisioning(provisioning),
              ),
            ),
        ),
      ),
  });

export const makeTenantProvisioningPostgresRepositoryLayer = (
  database: PostgresDatabase,
) =>
  Layer.effect(
    TenantProvisioningPostgresRepository,
    makeTenantProvisioningPostgresRepository(database),
  );
