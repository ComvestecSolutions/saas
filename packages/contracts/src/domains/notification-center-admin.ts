/**
 * Notification center admin envelope contracts (admin-app
 * implementation plan §9 item 16 — final Phase 1 backend gap).
 * Operator-Desk surface for inspecting + resending Novu
 * notifications across channels.
 *
 * Owner-locked design (enforced in the platform service at
 * `packages/platform/src/services/domains/notification-center-admin-service.ts`):
 *
 *   - **Read authz**: `list` / `detail` require
 *     `actorType.platformOperator` OR `actorType.supportOperator`
 *     OR any admin-org membership row (any role).
 *   - **Write authz**: `resend` requires
 *     `actorType.platformOperator` OR
 *     `adminMemberRole.adminOwner` / `adminMemberRole.adminAdmin`.
 *     Support operators have read access only; admin viewers/etc.
 *     are denied. Anonymous always → typed Unauthorized.
 *   - **Reason-catalog + attachment**: every `resend` decodes its
 *     `reason` against `ReasonCatalogIdSchema` and enforces
 *     `validateReasonForAction(reasonId, notificationCenterAdminAuditAction.resent)`
 *     plus non-empty `reasonAttachmentText`.
 *   - **Field-security**: `recipientProjection`, `subjectProjection`,
 *     `payloadProjection`, `providerMetadata`, and `lastError` are
 *     `regulated-sensitive` per the matching manifest and are
 *     visible only to platform-operator / support-operator.
 *   - **Bounded list**: page size is capped at `listPageSizeMax`
 *     and per-bucket failures degrade to `partialFailures` (mirrors
 *     universal-search) rather than aborting the envelope.
 *
 * The platform service composes an injected `NotificationCenterPort`
 * (Context.Tag) representing the Novu notifications admin surface;
 * the default Layer ships a TODO(phase1-item16) pass-through stub
 * that returns honest empty results until the Novu admin port
 * lands — same staged pattern as workflow-runs-admin.
 */
import { Schema } from "effect";
import { RequestContextSchema } from "../access/request-context";
import { IsoTimestampSchema } from "../runtime/timestamps";

// ---------------------------------------------------------------------------
// Delivery status vocabulary
// ---------------------------------------------------------------------------

const NotificationDeliveryStatusConstantSchema = Schema.Struct({
  queued: Schema.Literal("queued"),
  sent: Schema.Literal("sent"),
  delivered: Schema.Literal("delivered"),
  failed: Schema.Literal("failed"),
  suppressed: Schema.Literal("suppressed"),
});

export const notificationDeliveryStatus = Schema.validateSync(
  NotificationDeliveryStatusConstantSchema,
)({
  queued: "queued",
  sent: "sent",
  delivered: "delivered",
  failed: "failed",
  suppressed: "suppressed",
} satisfies Schema.Schema.Type<
  typeof NotificationDeliveryStatusConstantSchema
>);

export const notificationDeliveryStatuses = [
  notificationDeliveryStatus.queued,
  notificationDeliveryStatus.sent,
  notificationDeliveryStatus.delivered,
  notificationDeliveryStatus.failed,
  notificationDeliveryStatus.suppressed,
] as const;

export const NotificationDeliveryStatusSchema = Schema.Literal(
  ...notificationDeliveryStatuses,
);

export type NotificationDeliveryStatus = Schema.Schema.Type<
  typeof NotificationDeliveryStatusSchema
>;

// ---------------------------------------------------------------------------
// Channel vocabulary
// ---------------------------------------------------------------------------

const NotificationChannelConstantSchema = Schema.Struct({
  email: Schema.Literal("email"),
  sms: Schema.Literal("sms"),
  push: Schema.Literal("push"),
  inApp: Schema.Literal("in-app"),
  webhook: Schema.Literal("webhook"),
});

export const notificationChannel = Schema.validateSync(
  NotificationChannelConstantSchema,
)({
  email: "email",
  sms: "sms",
  push: "push",
  inApp: "in-app",
  webhook: "webhook",
} satisfies Schema.Schema.Type<typeof NotificationChannelConstantSchema>);

export const notificationChannels = [
  notificationChannel.email,
  notificationChannel.sms,
  notificationChannel.push,
  notificationChannel.inApp,
  notificationChannel.webhook,
] as const;

export const NotificationChannelSchema = Schema.Literal(
  ...notificationChannels,
);

export type NotificationChannel = Schema.Schema.Type<
  typeof NotificationChannelSchema
>;

// ---------------------------------------------------------------------------
// Summary + detail envelopes
// ---------------------------------------------------------------------------

export const NotificationSummarySchema = Schema.Struct({
  notificationId: Schema.NonEmptyString,
  channel: NotificationChannelSchema,
  status: NotificationDeliveryStatusSchema,
  recipientProjection: Schema.NonEmptyString,
  subjectProjection: Schema.NonEmptyString,
  createdAt: IsoTimestampSchema,
  deliveredAt: Schema.optional(IsoTimestampSchema),
  lastError: Schema.optional(Schema.NonEmptyString),
});

export type NotificationSummary = Schema.Schema.Type<
  typeof NotificationSummarySchema
>;

export const NotificationDetailSchema = Schema.Struct({
  notificationId: Schema.NonEmptyString,
  channel: NotificationChannelSchema,
  status: NotificationDeliveryStatusSchema,
  recipientProjection: Schema.NonEmptyString,
  subjectProjection: Schema.NonEmptyString,
  createdAt: IsoTimestampSchema,
  deliveredAt: Schema.optional(IsoTimestampSchema),
  lastError: Schema.optional(Schema.NonEmptyString),
  payloadProjection: Schema.NonEmptyString,
  providerMetadata: Schema.NonEmptyString,
  auditCorrelationId: Schema.NonEmptyString,
});

export type NotificationDetail = Schema.Schema.Type<
  typeof NotificationDetailSchema
>;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const NotificationCenterAdminListFiltersSchema = Schema.Struct({
  channel: Schema.optional(NotificationChannelSchema),
  status: Schema.optional(NotificationDeliveryStatusSchema),
  recipientHash: Schema.optional(Schema.NonEmptyString),
  since: Schema.optional(IsoTimestampSchema),
  until: Schema.optional(IsoTimestampSchema),
});

export type NotificationCenterAdminListFilters = Schema.Schema.Type<
  typeof NotificationCenterAdminListFiltersSchema
>;

const PageSizeSchema = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThan(0),
  Schema.lessThanOrEqualTo(500),
);

export const NotificationCenterAdminListInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  filters: NotificationCenterAdminListFiltersSchema,
  pageSize: PageSizeSchema,
  pageToken: Schema.optional(Schema.NonEmptyString),
});

export type NotificationCenterAdminListInput = Schema.Schema.Type<
  typeof NotificationCenterAdminListInputSchema
>;

export const NotificationCenterAdminDetailInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  notificationId: Schema.NonEmptyString,
});

export type NotificationCenterAdminDetailInput = Schema.Schema.Type<
  typeof NotificationCenterAdminDetailInputSchema
>;

export const NotificationCenterAdminResendInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  notificationId: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  reasonAttachmentText: Schema.optional(Schema.NonEmptyString),
});

export type NotificationCenterAdminResendInput = Schema.Schema.Type<
  typeof NotificationCenterAdminResendInputSchema
>;

// ---------------------------------------------------------------------------
// Partial-failure entry (mirrors universal-search + workflow-runs-admin shape)
// ---------------------------------------------------------------------------

export const NotificationCenterAdminPartialFailureSchema = Schema.Struct({
  bucket: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
});

export type NotificationCenterAdminPartialFailure = Schema.Schema.Type<
  typeof NotificationCenterAdminPartialFailureSchema
>;

// ---------------------------------------------------------------------------
// List response envelope
// ---------------------------------------------------------------------------

export const NotificationCenterAdminListResultSchema = Schema.Struct({
  notifications: Schema.Array(NotificationSummarySchema),
  nextPageToken: Schema.optional(Schema.NonEmptyString),
  partialFailures: Schema.optional(
    Schema.Array(NotificationCenterAdminPartialFailureSchema),
  ),
});

export type NotificationCenterAdminListResult = Schema.Schema.Type<
  typeof NotificationCenterAdminListResultSchema
>;

// ---------------------------------------------------------------------------
// Write acknowledgement
// ---------------------------------------------------------------------------

export const NotificationCenterAdminResendResultSchema = Schema.Struct({
  accepted: Schema.Literal(true),
  notificationId: Schema.NonEmptyString,
  resendNotificationId: Schema.optional(Schema.NonEmptyString),
});

export type NotificationCenterAdminResendResult = Schema.Schema.Type<
  typeof NotificationCenterAdminResendResultSchema
>;
