import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import { BillingEntitlementRecordSchema } from "../../../domains/billing-metering";
import {
  BillingInvoiceHistoryEntrySchema,
  BillingPlanIntervalSchema,
  BillingSubscriptionStatusSchema,
  TenantContextSchema,
  billingSubscriptionStatus,
  platformScope,
  type PlatformScope,
} from "@comvestec/contracts";
import { PlatformAdapterServiceNameSchema } from "@comvestec/platform";
import {
  billingEntitlementsTable,
  billingPaymentEventsTable,
  billingSubscriptionsTable,
} from "./billing";

const BillingTenantLookupSchema = TenantContextSchema;

export type BillingTenantLookup = Schema.Schema.Type<
  typeof BillingTenantLookupSchema
>;

export const BillingSubscriptionStateSchema = Schema.Struct({
  subscriptionId: Schema.NonEmptyString,
  provider: PlatformAdapterServiceNameSchema,
  accountId: Schema.optional(Schema.NonEmptyString),
  planId: Schema.NonEmptyString,
  priceId: Schema.optional(Schema.NonEmptyString),
  status: BillingSubscriptionStatusSchema,
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
  invoiceHistory: Schema.Array(BillingInvoiceHistoryEntrySchema),
});

export type BillingTenantAccessState = Schema.Schema.Type<
  typeof BillingTenantAccessStateSchema
>;

type BillingEntitlementRow = typeof billingEntitlementsTable.$inferSelect;
type BillingPaymentEventRow = typeof billingPaymentEventsTable.$inferSelect;
type BillingSubscriptionRow = typeof billingSubscriptionsTable.$inferSelect;

const liveBillingSubscriptionStatuses = new Set<string>([
  billingSubscriptionStatus.pending,
  billingSubscriptionStatus.active,
  billingSubscriptionStatus.pastDue,
]);

export type BillingStatePostgresQueryable = {
  readonly listEntitlementsByScope: (
    scope: PlatformScope,
    scopeId: string,
  ) => Promise<readonly BillingEntitlementRow[]>;
  readonly listPaymentEventsByScope: (
    scope: PlatformScope,
    scopeId: string,
  ) => Promise<readonly BillingPaymentEventRow[]>;
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

const toTimestamp = (value: Date | string | null | undefined) => {
  if (value == null) {
    return 0;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? 0 : timestamp;
};

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
    ...(row.accountId != null ? { accountId: row.accountId } : {}),
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

const buildInvoiceHistoryEntry = (row: BillingPaymentEventRow) =>
  Schema.decodeUnknown(BillingInvoiceHistoryEntrySchema)({
    eventId: row.eventId,
    provider: row.provider,
    providerEventId: row.providerEventId,
    ...(row.subscriptionId != null
      ? { subscriptionId: row.subscriptionId }
      : {}),
    ...(row.scope != null ? { scope: row.scope } : {}),
    ...(row.scopeId != null ? { scopeId: row.scopeId } : {}),
    eventType: row.eventType,
    status: row.status,
    ...(typeof row.amountMinor === "number"
      ? { amountMinor: row.amountMinor }
      : {}),
    ...(typeof row.currency === "string" ? { currency: row.currency } : {}),
    ...(row.effectiveAt != null
      ? { effectiveAt: toIsoString(row.effectiveAt) }
      : {}),
    recordedAt: toIsoString(row.recordedAt) ?? new Date().toISOString(),
  });

const resolveBillingTenantLookupCandidates = (lookup: BillingTenantLookup) => {
  const candidates: Array<{
    scope: PlatformScope;
    scopeId: string;
  }> = [];

  const addCandidate = (scope: PlatformScope, scopeId: string) => {
    if (
      candidates.some(
        (candidate) =>
          candidate.scope === scope && candidate.scopeId === scopeId,
      )
    ) {
      return;
    }

    candidates.push({ scope, scopeId });
  };

  switch (lookup.scope) {
    case platformScope.individual:
      addCandidate(
        platformScope.individual,
        lookup.individualId ?? lookup.scopeId,
      );

      if (lookup.organizationId !== undefined) {
        addCandidate(platformScope.organization, lookup.organizationId);
      }

      if (lookup.enterpriseId !== undefined) {
        addCandidate(platformScope.enterprise, lookup.enterpriseId);
      }

      break;
    case platformScope.organization:
      addCandidate(
        platformScope.organization,
        lookup.organizationId ?? lookup.scopeId,
      );

      if (lookup.enterpriseId !== undefined) {
        addCandidate(platformScope.enterprise, lookup.enterpriseId);
      }

      break;
    case platformScope.enterprise:
      addCandidate(
        platformScope.enterprise,
        lookup.enterpriseId ?? lookup.scopeId,
      );

      break;
    case platformScope.platform:
      break;
  }

  addCandidate(platformScope.platform, platformScope.platform);

  return candidates;
};

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
            const candidates = resolveBillingTenantLookupCandidates(request);
            const [
              entitlementRowsByCandidate,
              paymentEventRowsByCandidate,
              subscriptionRowsByCandidate,
            ] = yield* Effect.tryPromise({
              try: () =>
                Promise.all([
                  Promise.all(
                    candidates.map((candidate) =>
                      database.listEntitlementsByScope(
                        candidate.scope,
                        candidate.scopeId,
                      ),
                    ),
                  ),
                  Promise.all(
                    candidates.map((candidate) =>
                      database.listPaymentEventsByScope(
                        candidate.scope,
                        candidate.scopeId,
                      ),
                    ),
                  ),
                  Promise.all(
                    candidates.map((candidate) =>
                      database.getLatestSubscriptionByScope(
                        candidate.scope,
                        candidate.scopeId,
                      ),
                    ),
                  ),
                ]),
              catch: (cause) =>
                ({
                  _tag: "BillingStatePostgresRepositoryQueryError",
                  operation: "getTenantAccessState",
                  cause,
                }) satisfies BillingStatePostgresRepositoryQueryError,
            });
            const entitlementRows = entitlementRowsByCandidate.flat();
            const entitlements = yield* Effect.forEach(
              entitlementRows.filter((row) => row.active ?? false),
              buildEntitlementRecord,
            );
            const subscriptionRow =
              subscriptionRowsByCandidate.find(
                (row) =>
                  row !== undefined &&
                  liveBillingSubscriptionStatuses.has(row.status),
              ) ?? subscriptionRowsByCandidate.find((row) => row !== undefined);
            const subscription =
              subscriptionRow === undefined
                ? undefined
                : yield* buildSubscriptionState(subscriptionRow);
            const invoiceHistoryRows = paymentEventRowsByCandidate
              .flat()
              .filter((row) => {
                if (subscriptionRow === undefined) {
                  return true;
                }

                if (row.subscriptionId === subscriptionRow.subscriptionId) {
                  return true;
                }

                return (
                  row.subscriptionId == null &&
                  row.scope === subscriptionRow.scope &&
                  row.scopeId === subscriptionRow.scopeId
                );
              })
              .sort(
                (left, right) =>
                  toTimestamp(right.recordedAt) - toTimestamp(left.recordedAt),
              );
            const invoiceHistory = yield* Effect.forEach(
              invoiceHistoryRows,
              buildInvoiceHistoryEntry,
            );

            return yield* Schema.decodeUnknown(BillingTenantAccessStateSchema)({
              ...(subscription !== undefined ? { subscription } : {}),
              entitlements,
              invoiceHistory,
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
