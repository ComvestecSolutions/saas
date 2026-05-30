/**
 * Operations Home aggregate v2 contracts per admin-app
 * implementation plan §9 item 3 and the Operator Desk
 * `/desk` default-layout section of
 * `specs/02-apps/admin-app/spec.md`.
 *
 * The aggregate is the single payload that the admin-app's Desk
 * Center Workbench loads on `/desk`. The platform service that
 * produces this payload fans out to multiple sources (KPIs,
 * alerts, recent audit, pending approvals, vendor posture) with
 * per-section failure tolerance: any source that fails degrades
 * to an empty section and surfaces a typed entry in
 * `partialFailures` instead of poisoning the whole snapshot.
 */
import { Schema } from "effect";
import { DataClassificationSchema } from "../data/data-classifications";
import { IsoTimestampSchema } from "../runtime/timestamps";

// ---------------------------------------------------------------------------
// KPI section
// ---------------------------------------------------------------------------

const KpiTrendDirectionConstantSchema = Schema.Struct({
  up: Schema.Literal("up"),
  down: Schema.Literal("down"),
  flat: Schema.Literal("flat"),
});

export const kpiTrendDirection = Schema.validateSync(
  KpiTrendDirectionConstantSchema,
)({
  up: "up",
  down: "down",
  flat: "flat",
} satisfies Schema.Schema.Type<typeof KpiTrendDirectionConstantSchema>);

export const kpiTrendDirections = [
  kpiTrendDirection.up,
  kpiTrendDirection.down,
  kpiTrendDirection.flat,
] as const;

export const KpiTrendDirectionSchema = Schema.Literal(...kpiTrendDirections);

export type KpiTrendDirection = Schema.Schema.Type<
  typeof KpiTrendDirectionSchema
>;

const KpiToneConstantSchema = Schema.Struct({
  nominal: Schema.Literal("nominal"),
  pending: Schema.Literal("pending"),
  drift: Schema.Literal("drift"),
  error: Schema.Literal("error"),
});

export const kpiTone = Schema.validateSync(KpiToneConstantSchema)({
  nominal: "nominal",
  pending: "pending",
  drift: "drift",
  error: "error",
} satisfies Schema.Schema.Type<typeof KpiToneConstantSchema>);

export const kpiTones = [
  kpiTone.nominal,
  kpiTone.pending,
  kpiTone.drift,
  kpiTone.error,
] as const;

export const KpiToneSchema = Schema.Literal(...kpiTones);

export type KpiTone = Schema.Schema.Type<typeof KpiToneSchema>;

const OperationsHomeDrillResourceKindConstantSchema = Schema.Struct({
  tenants: Schema.Literal("tenants"),
  auditEvents: Schema.Literal("audit-events"),
  users: Schema.Literal("users"),
  billingInvoices: Schema.Literal("billing-invoices"),
  openmeterUsage: Schema.Literal("openmeter-usage"),
  webhookDeliveries: Schema.Literal("webhook-deliveries"),
  workflowRuns: Schema.Literal("workflow-runs"),
  notifications: Schema.Literal("notifications"),
  alerts: Schema.Literal("alerts"),
  approvals: Schema.Literal("approvals"),
  vendors: Schema.Literal("vendors"),
});

export const operationsHomeDrillResourceKind = Schema.validateSync(
  OperationsHomeDrillResourceKindConstantSchema,
)({
  tenants: "tenants",
  auditEvents: "audit-events",
  users: "users",
  billingInvoices: "billing-invoices",
  openmeterUsage: "openmeter-usage",
  webhookDeliveries: "webhook-deliveries",
  workflowRuns: "workflow-runs",
  notifications: "notifications",
  alerts: "alerts",
  approvals: "approvals",
  vendors: "vendors",
} satisfies Schema.Schema.Type<
  typeof OperationsHomeDrillResourceKindConstantSchema
>);

export const operationsHomeDrillResourceKinds = [
  operationsHomeDrillResourceKind.tenants,
  operationsHomeDrillResourceKind.auditEvents,
  operationsHomeDrillResourceKind.users,
  operationsHomeDrillResourceKind.billingInvoices,
  operationsHomeDrillResourceKind.openmeterUsage,
  operationsHomeDrillResourceKind.webhookDeliveries,
  operationsHomeDrillResourceKind.workflowRuns,
  operationsHomeDrillResourceKind.notifications,
  operationsHomeDrillResourceKind.alerts,
  operationsHomeDrillResourceKind.approvals,
  operationsHomeDrillResourceKind.vendors,
] as const;

export const OperationsHomeDrillResourceKindSchema = Schema.Literal(
  ...operationsHomeDrillResourceKinds,
);

export type OperationsHomeDrillResourceKind = Schema.Schema.Type<
  typeof OperationsHomeDrillResourceKindSchema
>;

export const OperationsHomeKpiTrendSchema = Schema.Struct({
  direction: KpiTrendDirectionSchema,
  delta: Schema.Number,
  windowMinutes: Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
});

export type OperationsHomeKpiTrend = Schema.Schema.Type<
  typeof OperationsHomeKpiTrendSchema
>;

export const OperationsHomeKpiSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  label: Schema.NonEmptyString,
  value: Schema.Number,
  unit: Schema.NonEmptyString,
  trend: OperationsHomeKpiTrendSchema,
  tone: KpiToneSchema,
  drillResourceKind: OperationsHomeDrillResourceKindSchema,
  drillFilters: Schema.Record({
    key: Schema.NonEmptyString,
    value: Schema.Unknown,
  }),
});

export type OperationsHomeKpi = Schema.Schema.Type<
  typeof OperationsHomeKpiSchema
>;

// ---------------------------------------------------------------------------
// Active alerts section
// ---------------------------------------------------------------------------

const OperationsHomeAlertSeverityConstantSchema = Schema.Struct({
  info: Schema.Literal("info"),
  warning: Schema.Literal("warning"),
  critical: Schema.Literal("critical"),
});

export const operationsHomeAlertSeverity = Schema.validateSync(
  OperationsHomeAlertSeverityConstantSchema,
)({
  info: "info",
  warning: "warning",
  critical: "critical",
} satisfies Schema.Schema.Type<
  typeof OperationsHomeAlertSeverityConstantSchema
>);

export const operationsHomeAlertSeverities = [
  operationsHomeAlertSeverity.info,
  operationsHomeAlertSeverity.warning,
  operationsHomeAlertSeverity.critical,
] as const;

export const OperationsHomeAlertSeveritySchema = Schema.Literal(
  ...operationsHomeAlertSeverities,
);

export type OperationsHomeAlertSeverity = Schema.Schema.Type<
  typeof OperationsHomeAlertSeveritySchema
>;

export const OperationsHomeActiveAlertSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  severity: OperationsHomeAlertSeveritySchema,
  title: Schema.NonEmptyString,
  summary: Schema.NonEmptyString,
  openedAt: IsoTimestampSchema,
  sourceVendor: Schema.NonEmptyString,
  deepLink: Schema.optional(Schema.NonEmptyString),
});

export type OperationsHomeActiveAlert = Schema.Schema.Type<
  typeof OperationsHomeActiveAlertSchema
>;

// ---------------------------------------------------------------------------
// Recent audit section (top 20)
// ---------------------------------------------------------------------------

export const OperationsHomeRecentAuditEntrySchema = Schema.Struct({
  id: Schema.NonEmptyString,
  actor: Schema.NonEmptyString,
  action: Schema.NonEmptyString,
  target: Schema.NonEmptyString,
  occurredAt: IsoTimestampSchema,
  classification: DataClassificationSchema,
});

export type OperationsHomeRecentAuditEntry = Schema.Schema.Type<
  typeof OperationsHomeRecentAuditEntrySchema
>;

// ---------------------------------------------------------------------------
// Pending approvals section
// ---------------------------------------------------------------------------

export const OperationsHomePendingApprovalSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  kind: Schema.NonEmptyString,
  target: Schema.NonEmptyString,
  requestedBy: Schema.NonEmptyString,
  requestedAt: IsoTimestampSchema,
  reasonPreview: Schema.NonEmptyString,
  ttlSeconds: Schema.Int.pipe(Schema.greaterThanOrEqualTo(0)),
});

export type OperationsHomePendingApproval = Schema.Schema.Type<
  typeof OperationsHomePendingApprovalSchema
>;

// ---------------------------------------------------------------------------
// Vendor posture section
// ---------------------------------------------------------------------------

const OperationsHomeVendorPostureLevelConstantSchema = Schema.Struct({
  nominal: Schema.Literal("nominal"),
  degraded: Schema.Literal("degraded"),
  down: Schema.Literal("down"),
  unknown: Schema.Literal("unknown"),
});

export const operationsHomeVendorPostureLevel = Schema.validateSync(
  OperationsHomeVendorPostureLevelConstantSchema,
)({
  nominal: "nominal",
  degraded: "degraded",
  down: "down",
  unknown: "unknown",
} satisfies Schema.Schema.Type<
  typeof OperationsHomeVendorPostureLevelConstantSchema
>);

export const operationsHomeVendorPostureLevels = [
  operationsHomeVendorPostureLevel.nominal,
  operationsHomeVendorPostureLevel.degraded,
  operationsHomeVendorPostureLevel.down,
  operationsHomeVendorPostureLevel.unknown,
] as const;

export const OperationsHomeVendorPostureLevelSchema = Schema.Literal(
  ...operationsHomeVendorPostureLevels,
);

export type OperationsHomeVendorPostureLevel = Schema.Schema.Type<
  typeof OperationsHomeVendorPostureLevelSchema
>;

export const OperationsHomeVendorPostureSchema = Schema.Struct({
  vendor: Schema.NonEmptyString,
  posture: OperationsHomeVendorPostureLevelSchema,
  version: Schema.optional(Schema.NonEmptyString),
  lastIncidentAt: Schema.optional(IsoTimestampSchema),
  latencyP95Ms: Schema.optional(Schema.Number),
  message: Schema.optional(Schema.NonEmptyString),
});

export type OperationsHomeVendorPosture = Schema.Schema.Type<
  typeof OperationsHomeVendorPostureSchema
>;

// ---------------------------------------------------------------------------
// Partial-failure surface
// ---------------------------------------------------------------------------

const OperationsHomeSnapshotSectionConstantSchema = Schema.Struct({
  kpis: Schema.Literal("kpis"),
  activeAlerts: Schema.Literal("activeAlerts"),
  recentAudit: Schema.Literal("recentAudit"),
  pendingApprovals: Schema.Literal("pendingApprovals"),
  vendorPosture: Schema.Literal("vendorPosture"),
});

export const operationsHomeSnapshotSection = Schema.validateSync(
  OperationsHomeSnapshotSectionConstantSchema,
)({
  kpis: "kpis",
  activeAlerts: "activeAlerts",
  recentAudit: "recentAudit",
  pendingApprovals: "pendingApprovals",
  vendorPosture: "vendorPosture",
} satisfies Schema.Schema.Type<
  typeof OperationsHomeSnapshotSectionConstantSchema
>);

export const operationsHomeSnapshotSections = [
  operationsHomeSnapshotSection.kpis,
  operationsHomeSnapshotSection.activeAlerts,
  operationsHomeSnapshotSection.recentAudit,
  operationsHomeSnapshotSection.pendingApprovals,
  operationsHomeSnapshotSection.vendorPosture,
] as const;

export const OperationsHomeSnapshotSectionSchema = Schema.Literal(
  ...operationsHomeSnapshotSections,
);

export type OperationsHomeSnapshotSection = Schema.Schema.Type<
  typeof OperationsHomeSnapshotSectionSchema
>;

export const OperationsHomePartialFailureSchema = Schema.Struct({
  section: OperationsHomeSnapshotSectionSchema,
  reason: Schema.NonEmptyString,
});

export type OperationsHomePartialFailure = Schema.Schema.Type<
  typeof OperationsHomePartialFailureSchema
>;

// ---------------------------------------------------------------------------
// Snapshot envelope
// ---------------------------------------------------------------------------

export const OperationsHomeSnapshotSchema = Schema.Struct({
  generatedAt: IsoTimestampSchema,
  correlationId: Schema.NonEmptyString,
  windowMinutes: Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
  kpis: Schema.Array(OperationsHomeKpiSchema),
  activeAlerts: Schema.Array(OperationsHomeActiveAlertSchema),
  recentAudit: Schema.Array(OperationsHomeRecentAuditEntrySchema),
  pendingApprovals: Schema.Array(OperationsHomePendingApprovalSchema),
  vendorPosture: Schema.Array(OperationsHomeVendorPostureSchema),
  partialFailures: Schema.Array(OperationsHomePartialFailureSchema),
});

export type OperationsHomeSnapshot = Schema.Schema.Type<
  typeof OperationsHomeSnapshotSchema
>;
