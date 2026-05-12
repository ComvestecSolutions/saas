import { Schema } from "effect";
import { AbsoluteRedirectUriSchema } from "../runtime/redirect-uris";
import { IsoTimestampSchema } from "../runtime/timestamps";
import { platformScope, PlatformScopeSchema } from "../access/platform-scopes";

const NonEmptyWebhookEventListSchema = Schema.Array(Schema.NonEmptyString).pipe(
  Schema.filter((events) => events.length > 0),
);

const WebhookSubscriptionStatusConstantSchema = Schema.Struct({
  active: Schema.Literal("active"),
  paused: Schema.Literal("paused"),
});

export const webhookSubscriptionStatus = Schema.validateSync(
  WebhookSubscriptionStatusConstantSchema,
)({
  active: "active",
  paused: "paused",
} satisfies Schema.Schema.Type<typeof WebhookSubscriptionStatusConstantSchema>);

export const WebhookSubscriptionStatusSchema = Schema.Literal(
  webhookSubscriptionStatus.active,
  webhookSubscriptionStatus.paused,
);

export type WebhookSubscriptionStatus = Schema.Schema.Type<
  typeof WebhookSubscriptionStatusSchema
>;

export const WebhookSubscriptionEventSchema = Schema.NonEmptyString;

export type WebhookSubscriptionEvent = Schema.Schema.Type<
  typeof WebhookSubscriptionEventSchema
>;

export const WebhookSubscriptionUrlSchema = AbsoluteRedirectUriSchema;

export type WebhookSubscriptionUrl = Schema.Schema.Type<
  typeof WebhookSubscriptionUrlSchema
>;

export const WebhookSubscriptionRecordSchema = Schema.Struct({
  subscriptionId: Schema.NonEmptyString,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  url: WebhookSubscriptionUrlSchema,
  events: NonEmptyWebhookEventListSchema,
  status: WebhookSubscriptionStatusSchema,
  lastDeliveryAt: Schema.optional(IsoTimestampSchema),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type WebhookSubscriptionRecord = Schema.Schema.Type<
  typeof WebhookSubscriptionRecordSchema
>;

export const WebhookSubscriptionRecordListSchema = Schema.Array(
  WebhookSubscriptionRecordSchema,
);

export type WebhookSubscriptionRecordList = Schema.Schema.Type<
  typeof WebhookSubscriptionRecordListSchema
>;

export const WebhookSubscriptionAdminViewSchema = Schema.Struct({
  subscriptionId: Schema.NonEmptyString,
  url: WebhookSubscriptionUrlSchema,
  events: NonEmptyWebhookEventListSchema,
  status: WebhookSubscriptionStatusSchema,
  lastDeliveryAt: Schema.optional(IsoTimestampSchema),
});

export type WebhookSubscriptionAdminView = Schema.Schema.Type<
  typeof WebhookSubscriptionAdminViewSchema
>;

export const WebhookSubscriptionAdminViewListSchema = Schema.Array(
  WebhookSubscriptionAdminViewSchema,
);

export type WebhookSubscriptionAdminViewList = Schema.Schema.Type<
  typeof WebhookSubscriptionAdminViewListSchema
>;

const WebhookOutboundDeliveryStatusConstantSchema = Schema.Struct({
  pending: Schema.Literal("pending"),
  delivered: Schema.Literal("delivered"),
  blocked: Schema.Literal("blocked"),
});

export const webhookOutboundDeliveryStatus = Schema.validateSync(
  WebhookOutboundDeliveryStatusConstantSchema,
)({
  pending: "pending",
  delivered: "delivered",
  blocked: "blocked",
} satisfies Schema.Schema.Type<
  typeof WebhookOutboundDeliveryStatusConstantSchema
>);

export const WebhookOutboundDeliveryStatusSchema = Schema.Literal(
  webhookOutboundDeliveryStatus.pending,
  webhookOutboundDeliveryStatus.delivered,
  webhookOutboundDeliveryStatus.blocked,
);

export type WebhookOutboundDeliveryStatus = Schema.Schema.Type<
  typeof WebhookOutboundDeliveryStatusSchema
>;

export const WebhookOutboundDeliveryPayloadSchema = Schema.NonEmptyString;

export type WebhookOutboundDeliveryPayload = Schema.Schema.Type<
  typeof WebhookOutboundDeliveryPayloadSchema
>;

export const WebhookOutboundDeliveryRecordSchema = Schema.Struct({
  deliveryId: Schema.NonEmptyString,
  subscriptionId: Schema.NonEmptyString,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  eventType: WebhookSubscriptionEventSchema,
  payload: WebhookOutboundDeliveryPayloadSchema,
  status: WebhookOutboundDeliveryStatusSchema,
  attemptCount: Schema.Number,
  maxAttempts: Schema.Number,
  nextAttemptAt: Schema.optional(IsoTimestampSchema),
  deliveredAt: Schema.optional(IsoTimestampSchema),
  exhaustedAt: Schema.optional(IsoTimestampSchema),
  lastError: Schema.optional(Schema.NonEmptyString),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type WebhookOutboundDeliveryRecord = Schema.Schema.Type<
  typeof WebhookOutboundDeliveryRecordSchema
>;

export const WebhookOutboundDeliveryRecordListSchema = Schema.Array(
  WebhookOutboundDeliveryRecordSchema,
);

export type WebhookOutboundDeliveryRecordList = Schema.Schema.Type<
  typeof WebhookOutboundDeliveryRecordListSchema
>;

const WebhookApiKeyStatusConstantSchema = Schema.Struct({
  active: Schema.Literal("active"),
  revoked: Schema.Literal("revoked"),
});

export const webhookApiKeyStatus = Schema.validateSync(
  WebhookApiKeyStatusConstantSchema,
)({
  active: "active",
  revoked: "revoked",
} satisfies Schema.Schema.Type<typeof WebhookApiKeyStatusConstantSchema>);

export const WebhookApiKeyStatusSchema = Schema.Literal(
  webhookApiKeyStatus.active,
  webhookApiKeyStatus.revoked,
);

export type WebhookApiKeyStatus = Schema.Schema.Type<
  typeof WebhookApiKeyStatusSchema
>;

export const WebhookApiKeyLabelSchema = Schema.NonEmptyString;

export type WebhookApiKeyLabel = Schema.Schema.Type<
  typeof WebhookApiKeyLabelSchema
>;

export const WebhookApiKeyPrefixSchema = Schema.NonEmptyString;

export type WebhookApiKeyPrefix = Schema.Schema.Type<
  typeof WebhookApiKeyPrefixSchema
>;

export const WebhookApiKeySecretSchema = Schema.NonEmptyString;

export type WebhookApiKeySecret = Schema.Schema.Type<
  typeof WebhookApiKeySecretSchema
>;

export const WebhookApiKeyTenantScopeSchema = Schema.Literal(
  platformScope.enterprise,
  platformScope.organization,
  platformScope.individual,
);

export type WebhookApiKeyTenantScope = Schema.Schema.Type<
  typeof WebhookApiKeyTenantScopeSchema
>;

export const WebhookApiKeyRecordSchema = Schema.Struct({
  apiKeyId: Schema.NonEmptyString,
  scope: WebhookApiKeyTenantScopeSchema,
  scopeId: Schema.NonEmptyString,
  label: WebhookApiKeyLabelSchema,
  secretHash: Schema.NonEmptyString,
  prefix: WebhookApiKeyPrefixSchema,
  status: WebhookApiKeyStatusSchema,
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
  rotatedAt: Schema.optional(IsoTimestampSchema),
  revokedAt: Schema.optional(IsoTimestampSchema),
});

export type WebhookApiKeyRecord = Schema.Schema.Type<
  typeof WebhookApiKeyRecordSchema
>;

export const WebhookApiKeyRecordListSchema = Schema.Array(
  WebhookApiKeyRecordSchema,
);

export type WebhookApiKeyRecordList = Schema.Schema.Type<
  typeof WebhookApiKeyRecordListSchema
>;

export const WebhookApiKeyAdminViewSchema = Schema.Struct({
  apiKeyId: Schema.NonEmptyString,
  label: WebhookApiKeyLabelSchema,
  prefix: WebhookApiKeyPrefixSchema,
  status: WebhookApiKeyStatusSchema,
  createdAt: IsoTimestampSchema,
  rotatedAt: Schema.optional(IsoTimestampSchema),
  revokedAt: Schema.optional(IsoTimestampSchema),
});

export type WebhookApiKeyAdminView = Schema.Schema.Type<
  typeof WebhookApiKeyAdminViewSchema
>;

export const WebhookApiKeyAdminViewListSchema = Schema.Array(
  WebhookApiKeyAdminViewSchema,
);

export type WebhookApiKeyAdminViewList = Schema.Schema.Type<
  typeof WebhookApiKeyAdminViewListSchema
>;

export const WebhookApiKeyOneTimeSecretResultSchema = Schema.Struct({
  apiKey: WebhookApiKeyAdminViewSchema,
  secret: WebhookApiKeySecretSchema,
});

export type WebhookApiKeyOneTimeSecretResult = Schema.Schema.Type<
  typeof WebhookApiKeyOneTimeSecretResultSchema
>;

export const CreateWebhookSubscriptionInputSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  url: WebhookSubscriptionUrlSchema,
  events: NonEmptyWebhookEventListSchema,
});

export type CreateWebhookSubscriptionInput = Schema.Schema.Type<
  typeof CreateWebhookSubscriptionInputSchema
>;

export const CreateWebhookApiKeyInputSchema = Schema.Struct({
  scope: WebhookApiKeyTenantScopeSchema,
  scopeId: Schema.NonEmptyString,
  label: WebhookApiKeyLabelSchema,
});

export type CreateWebhookApiKeyInput = Schema.Schema.Type<
  typeof CreateWebhookApiKeyInputSchema
>;

export const WebhookSubscriptionListRequestSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type WebhookSubscriptionListRequest = Schema.Schema.Type<
  typeof WebhookSubscriptionListRequestSchema
>;

export const WebhookSubscriptionLookupSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  subscriptionId: Schema.NonEmptyString,
});

export type WebhookSubscriptionLookup = Schema.Schema.Type<
  typeof WebhookSubscriptionLookupSchema
>;

export const RequestWebhookOutboundDeliveryInputSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  subscriptionId: Schema.NonEmptyString,
  eventType: WebhookSubscriptionEventSchema,
  payload: WebhookOutboundDeliveryPayloadSchema,
  scheduledAt: Schema.optional(IsoTimestampSchema),
});

export type RequestWebhookOutboundDeliveryInput = Schema.Schema.Type<
  typeof RequestWebhookOutboundDeliveryInputSchema
>;

export const WebhookApiKeyListRequestSchema = Schema.Struct({
  scope: WebhookApiKeyTenantScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type WebhookApiKeyListRequest = Schema.Schema.Type<
  typeof WebhookApiKeyListRequestSchema
>;

export const WebhookApiKeyLookupSchema = Schema.Struct({
  scope: WebhookApiKeyTenantScopeSchema,
  scopeId: Schema.NonEmptyString,
  apiKeyId: Schema.NonEmptyString,
});

export type WebhookApiKeyLookup = Schema.Schema.Type<
  typeof WebhookApiKeyLookupSchema
>;
