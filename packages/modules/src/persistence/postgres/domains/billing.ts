import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const billingEntitlementsTable = pgTable(
  "billing_entitlements",
  {
    entitlementId: text("entitlement_id").notNull(),
    moduleId: varchar("module_id", { length: 64 }).notNull(),
    featureKey: text("feature_key").notNull(),
    scope: varchar("scope", { length: 32 }).notNull(),
    scopeId: text("scope_id").notNull(),
    active: boolean("active").notNull().default(true),
    quotaSnapshot: jsonb("quota_snapshot").$type<Record<string, unknown>>(),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.entitlementId] }),
    uniqueIndex("billing_entitlements_scope_feature_idx").on(
      table.moduleId,
      table.featureKey,
      table.scope,
      table.scopeId,
    ),
  ],
);

export const billingPlansTable = pgTable(
  "billing_plans",
  {
    planId: text("plan_id").notNull(),
    planKey: text("plan_key").notNull(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.planId] }),
    uniqueIndex("billing_plans_plan_key_idx").on(table.planKey),
  ],
);

export const billingPlanPricesTable = pgTable(
  "billing_plan_prices",
  {
    priceId: text("price_id").notNull(),
    planId: text("plan_id").notNull(),
    billingInterval: varchar("billing_interval", { length: 16 }).notNull(),
    currency: varchar("currency", { length: 16 }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    providerPriceId: text("provider_price_id"),
    active: boolean("active").notNull().default(true),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.priceId] }),
    uniqueIndex("billing_plan_prices_provider_price_idx").on(
      table.providerPriceId,
    ),
    index("billing_plan_prices_plan_interval_idx").on(
      table.planId,
      table.billingInterval,
      table.currency,
    ),
  ],
);

export const billingPlanEntitlementsTable = pgTable(
  "billing_plan_entitlements",
  {
    entitlementId: text("entitlement_id").notNull(),
    planId: text("plan_id").notNull(),
    moduleId: varchar("module_id", { length: 64 }).notNull(),
    featureKey: text("feature_key"),
    included: boolean("included").notNull().default(true),
    metered: boolean("metered").notNull().default(false),
    meterKey: text("meter_key"),
    unit: text("unit"),
    quotaLimit: integer("quota_limit"),
    quotaPeriod: varchar("quota_period", { length: 16 }),
    enforcementMode: varchar("enforcement_mode", { length: 32 }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    primaryKey({ columns: [table.entitlementId] }),
    index("billing_plan_entitlements_plan_idx").on(
      table.planId,
      table.moduleId,
      table.featureKey,
    ),
  ],
);

export const billingCustomerAccountsTable = pgTable(
  "billing_customer_accounts",
  {
    accountId: text("account_id").notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerCustomerId: text("provider_customer_id").notNull(),
    actorId: text("actor_id").notNull(),
    scope: varchar("scope", { length: 32 }).notNull(),
    scopeId: text("scope_id").notNull(),
    email: text("email"),
    status: varchar("status", { length: 32 }).notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId] }),
    uniqueIndex("billing_customer_accounts_provider_customer_idx").on(
      table.provider,
      table.providerCustomerId,
    ),
    index("billing_customer_accounts_scope_idx").on(
      table.scope,
      table.scopeId,
      table.provider,
    ),
  ],
);

export const billingSubscriptionsTable = pgTable(
  "billing_subscriptions",
  {
    subscriptionId: text("subscription_id").notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    accountId: text("account_id").notNull(),
    scope: varchar("scope", { length: 32 }).notNull(),
    scopeId: text("scope_id").notNull(),
    planId: text("plan_id").notNull(),
    priceId: text("price_id"),
    status: varchar("status", { length: 32 }).notNull(),
    checkoutSessionId: text("checkout_session_id"),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp("current_period_end", {
      withTimezone: true,
    }),
    cancelAt: timestamp("cancel_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.subscriptionId] }),
    uniqueIndex("billing_subscriptions_provider_subscription_idx").on(
      table.provider,
      table.providerSubscriptionId,
    ),
    index("billing_subscriptions_scope_idx").on(
      table.scope,
      table.scopeId,
      table.status,
    ),
  ],
);

export const billingPaymentEventsTable = pgTable(
  "billing_payment_events",
  {
    eventId: text("event_id").notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerEventId: text("provider_event_id").notNull(),
    subscriptionId: text("subscription_id"),
    scope: varchar("scope", { length: 32 }),
    scopeId: text("scope_id"),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    amountMinor: integer("amount_minor"),
    currency: varchar("currency", { length: 16 }),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId] }),
    uniqueIndex("billing_payment_events_provider_event_idx").on(
      table.provider,
      table.providerEventId,
    ),
    index("billing_payment_events_scope_idx").on(
      table.scope,
      table.scopeId,
      table.recordedAt,
    ),
  ],
);

export const webhookReceiptsTable = pgTable(
  "webhook_receipts",
  {
    receiptId: text("receipt_id").notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    deliveryId: text("delivery_id").notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    processingState: varchar("processing_state", { length: 32 })
      .notNull()
      .default("pending"),
    verifiedSignature: boolean("verified_signature").notNull().default(false),
    scope: varchar("scope", { length: 32 }),
    scopeId: text("scope_id"),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.receiptId] }),
    uniqueIndex("webhook_receipts_provider_delivery_idx").on(
      table.provider,
      table.deliveryId,
    ),
    index("webhook_receipts_provider_received_idx").on(
      table.provider,
      table.receivedAt,
    ),
  ],
);
