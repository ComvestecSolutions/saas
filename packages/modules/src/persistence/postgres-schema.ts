import { getTableColumns, sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const auditLogEventsTable = pgTable(
  "audit_log_events",
  {
    eventId: text("event_id").notNull(),
    moduleId: varchar("module_id", { length: 64 }).notNull(),
    action: text("action").notNull(),
    target: text("target").notNull(),
    actorId: text("actor_id").notNull(),
    tenantScope: varchar("tenant_scope", { length: 32 }).notNull(),
    tenantScopeId: text("tenant_scope_id").notNull(),
    reason: text("reason"),
    correlationId: text("correlation_id"),
    requestContext: jsonb("request_context")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId] }),
    index("audit_log_events_module_idx").on(table.moduleId, table.recordedAt),
    index("audit_log_events_scope_idx").on(
      table.tenantScope,
      table.tenantScopeId,
    ),
  ],
);

export const runtimeConfigOverridesTable = pgTable(
  "runtime_config_overrides",
  {
    overrideId: text("override_id").notNull(),
    moduleId: varchar("module_id", { length: 64 }).notNull(),
    key: text("key").notNull(),
    scope: varchar("scope", { length: 32 }).notNull(),
    scopeId: text("scope_id").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    source: varchar("source", { length: 32 }).notNull(),
    changedBy: text("changed_by").notNull(),
    approvalReason: text("approval_reason"),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.overrideId] }),
    uniqueIndex("runtime_config_overrides_scope_key_idx").on(
      table.moduleId,
      table.key,
      table.scope,
      table.scopeId,
    ),
  ],
);

export const runtimeConfigSyncArtifactsTable = pgTable(
  "runtime_config_sync_artifacts",
  {
    proposalId: text("proposal_id").notNull(),
    moduleId: varchar("module_id", { length: 64 }).notNull(),
    key: text("key").notNull(),
    action: varchar("action", { length: 32 }).notNull(),
    artifactPath: text("artifact_path").notNull(),
    runtimeValue: jsonb("runtime_value").$type<unknown>(),
    codeValue: jsonb("code_value").$type<unknown>(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.proposalId] }),
    index("runtime_config_sync_artifacts_module_idx").on(
      table.moduleId,
      table.generatedAt,
    ),
  ],
);

export const identitySessionAuditTable = pgTable(
  "identity_session_audit",
  {
    eventId: text("event_id").notNull(),
    sessionId: text("session_id").notNull(),
    actorId: text("actor_id").notNull(),
    tenantScope: varchar("tenant_scope", { length: 32 }).notNull(),
    tenantScopeId: text("tenant_scope_id").notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    provider: text("provider"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId] }),
    index("identity_session_audit_session_idx").on(
      table.sessionId,
      table.recordedAt,
    ),
  ],
);

export const tenantBrandingDomainVerificationTable = pgTable(
  "tenant_branding_domain_verifications",
  {
    verificationId: text("verification_id").notNull(),
    scope: varchar("scope", { length: 32 }).notNull(),
    scopeId: text("scope_id").notNull(),
    requestedHost: text("requested_host").notNull(),
    lifecycleState: varchar("lifecycle_state", { length: 32 }).notNull(),
    dnsProof: jsonb("dns_proof").$type<Record<string, unknown>>(),
    approvedBy: text("approved_by"),
    approvalNotes: text("approval_notes"),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.verificationId] }),
    uniqueIndex("tenant_branding_domain_scope_host_idx").on(
      table.scope,
      table.scopeId,
      table.requestedHost,
    ),
  ],
);

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

export const postgresRecordTables = {
  auditLogEventsTable,
  runtimeConfigOverridesTable,
  runtimeConfigSyncArtifactsTable,
  identitySessionAuditTable,
  tenantBrandingDomainVerificationTable,
  billingEntitlementsTable,
};

export const getPostgresSchemaColumnNames = () => ({
  auditLogEventsTable: Object.keys(getTableColumns(auditLogEventsTable)),
  runtimeConfigOverridesTable: Object.keys(
    getTableColumns(runtimeConfigOverridesTable),
  ),
  runtimeConfigSyncArtifactsTable: Object.keys(
    getTableColumns(runtimeConfigSyncArtifactsTable),
  ),
  identitySessionAuditTable: Object.keys(
    getTableColumns(identitySessionAuditTable),
  ),
  tenantBrandingDomainVerificationTable: Object.keys(
    getTableColumns(tenantBrandingDomainVerificationTable),
  ),
  billingEntitlementsTable: Object.keys(
    getTableColumns(billingEntitlementsTable),
  ),
});
