import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import { BillingEntitlementRecordSchema } from "../../domains/billing-metering";
import {
  BillingPlanIntervalSchema,
  PlatformScopeSchema,
  type PlatformScope,
} from "@comvestec/contracts";
import { PlatformAdapterServiceNameSchema } from "@comvestec/platform";
import { billingEntitlementsTable, billingSubscriptionsTable } from "./billing";

const BillingTenantLookupSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type BillingTenantLookup = Schema.Schema.Type<
  typeof BillingTenantLookupSchema
>;

export const BillingSubscriptionStateSchema = Schema.Struct({
  subscriptionId: Schema.NonEmptyString,
  provider: PlatformAdapterServiceNameSchema,
  planId: Schema.NonEmptyString,
  priceId: Schema.optional(Schema.NonEmptyString),
  status: Schema.NonEmptyString,
  billingInterval: Schema.optional(BillingPlanIntervalSchema),
  currentPeriodEnd: Schema.optional(Schema.NonEmptyString),
  cancelAt: Schema.optional(Schema.NonEmptyString),
  canceledAt: Schema.optional(Schema.NonEmptyString),
});

export type BillingSubscriptionState = Schema.Schema.Type<
  typeof BillingSubscriptionStateSchema
>;

export const BillingTenantAccessStateSchema = Schema.Struct({
  subscription: Schema.optional(BillingSubscriptionStateSchema),
  entitlements: Schema.Array(BillingEntitlementRecordSchema),
});

export type BillingTenantAccessState = Schema.Schema.Type<
  typeof BillingTenantAccessStateSchema
>;

type BillingEntitlementRow = typeof billingEntitlementsTable.$inferSelect;
type BillingSubscriptionRow = typeof billingSubscriptionsTable.$inferSelect;

export type BillingStatePostgresQueryable = {
  readonly listEntitlementsByScope: (
    scope: PlatformScope,
    scopeId: string,
  ) => Promise<readonly BillingEntitlementRow[]>;
  readonly getLatestSubscriptionByScope: (
    scope: PlatformScope,
    scopeId: string,
  ) => Promise<BillingSubscriptionRow | undefined>;
};

export type BillingStatePostgresRepositoryQueryError = {
  readonly _tag: "BillingStatePostgresRepositoryQueryError";
  readonly operation: "getTenantAccessState";
  readonly cause: unknown;
};

export type BillingStatePostgresRepositoryError =
  | ParseResult.ParseError
  | BillingStatePostgresRepositoryQueryError;

const toIsoString = (value: Date | string | null | undefined) =>
  value == null
    ? undefined
    : value instanceof Date
      ? value.toISOString()
      : value;

const buildEntitlementRecord = (row: BillingEntitlementRow) =>
  Schema.decodeUnknown(BillingEntitlementRecordSchema)({
    entitlementId: row.entitlementId,
    moduleId: row.moduleId,
    featureKey: row.featureKey,
    scope: row.scope,
    scopeId: row.scopeId,
    active: row.active ?? false,
    ...(row.quotaSnapshot != null ? { quotaSnapshot: row.quotaSnapshot } : {}),
    grantedAt: toIsoString(row.grantedAt) ?? new Date().toISOString(),
    ...(row.expiresAt != null ? { expiresAt: toIsoString(row.expiresAt) } : {}),
  });

const buildSubscriptionState = (row: BillingSubscriptionRow) =>
  Schema.decodeUnknown(BillingSubscriptionStateSchema)({
    subscriptionId: row.subscriptionId,
    provider: row.provider,
    planId: row.planId,
    ...(row.priceId != null ? { priceId: row.priceId } : {}),
    status: row.status,
    ...(typeof row.metadata?.interval === "string"
      ? { billingInterval: row.metadata.interval }
      : {}),
    ...(row.currentPeriodEnd != null
      ? { currentPeriodEnd: toIsoString(row.currentPeriodEnd) }
      : {}),
    ...(row.cancelAt != null ? { cancelAt: toIsoString(row.cancelAt) } : {}),
    ...(row.canceledAt != null
      ? { canceledAt: toIsoString(row.canceledAt) }
      : {}),
  });

export type BillingStatePostgresRepositoryService = {
  readonly getTenantAccessState: (
    input: BillingTenantLookup,
  ) => Effect.Effect<
    BillingTenantAccessState,
    BillingStatePostgresRepositoryError
  >;
};

export class BillingStatePostgresRepository extends Context.Tag(
  "BillingStatePostgresRepository",
)<BillingStatePostgresRepository, BillingStatePostgresRepositoryService>() {}

export const makeBillingStatePostgresRepository = (
  database: BillingStatePostgresQueryable,
) =>
  Effect.succeed<BillingStatePostgresRepositoryService>({
    getTenantAccessState: (input: BillingTenantLookup) =>
      Schema.decodeUnknown(BillingTenantLookupSchema)(input).pipe(
        Effect.flatMap((request) =>
          Effect.gen(function* () {
            const [entitlementRows, subscriptionRow] = yield* Effect.tryPromise(
              {
                try: () =>
                  Promise.all([
                    database.listEntitlementsByScope(
                      request.scope,
                      request.scopeId,
                    ),
                    database.getLatestSubscriptionByScope(
                      request.scope,
                      request.scopeId,
                    ),
                  ]),
                catch: (cause) =>
                  ({
                    _tag: "BillingStatePostgresRepositoryQueryError",
                    operation: "getTenantAccessState",
                    cause,
                  }) satisfies BillingStatePostgresRepositoryQueryError,
              },
            );
            const entitlements = yield* Effect.forEach(
              entitlementRows.filter((row) => row.active ?? false),
              buildEntitlementRecord,
            );
            const subscription =
              subscriptionRow === undefined
                ? undefined
                : yield* buildSubscriptionState(subscriptionRow);

            return yield* Schema.decodeUnknown(BillingTenantAccessStateSchema)({
              ...(subscription !== undefined ? { subscription } : {}),
              entitlements,
            });
          }),
        ),
      ),
  });

export const makeBillingStatePostgresRepositoryLayer = (
  database: BillingStatePostgresQueryable,
) =>
  Layer.effect(
    BillingStatePostgresRepository,
    makeBillingStatePostgresRepository(database),
  );
