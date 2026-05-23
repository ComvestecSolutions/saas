/**
 * Notification center admin envelope contracts tests (admin-app
 * implementation plan §9 item 16 — final Phase 1 backend gap).
 * Pins:
 *
 *   - schema round-trips for list / detail / resend inputs and the
 *     list-response envelope
 *   - status + channel enum membership
 *   - registry membership of
 *     `permissionScope.notificationCenterAdminRead` +
 *     `.notificationCenterAdminWrite`,
 *     `platformModuleId.notificationCenterAdmin`, and the three
 *     `notificationCenterAdminAuditAction.*` entries
 *   - reason-catalog entry (`notification-center-admin.resend`) is
 *     present, owned by the notification-center-admin module,
 *     requires an attachment, and gates the matching audit action
 */
import { Schema } from "effect";
import { describe, expect, test } from "vitest";
import {
  auditActions,
  notificationChannel,
  notificationChannels,
  notificationCenterAdminAuditAction,
  NotificationCenterAdminDetailInputSchema,
  NotificationCenterAdminListInputSchema,
  NotificationCenterAdminListResultSchema,
  NotificationCenterAdminResendInputSchema,
  NotificationDetailSchema,
  notificationDeliveryStatus,
  notificationDeliveryStatuses,
  NotificationSummarySchema,
  permissionScope,
  permissionScopes,
  platformModuleId,
  platformModuleIds,
  reasonCatalogId,
  reasonCatalogRegistry,
  type NotificationCenterAdminDetailInput,
  type NotificationCenterAdminListInput,
  type NotificationCenterAdminListResult,
  type NotificationCenterAdminResendInput,
  type NotificationDetail,
  type NotificationSummary,
} from "@comvestec/contracts";

const decodeSummary = Schema.decodeUnknownSync(NotificationSummarySchema);
const decodeDetail = Schema.decodeUnknownSync(NotificationDetailSchema);
const decodeList = Schema.decodeUnknownSync(
  NotificationCenterAdminListInputSchema,
);
const decodeDetailInput = Schema.decodeUnknownSync(
  NotificationCenterAdminDetailInputSchema,
);
const decodeResendInput = Schema.decodeUnknownSync(
  NotificationCenterAdminResendInputSchema,
);
const decodeListResult = Schema.decodeUnknownSync(
  NotificationCenterAdminListResultSchema,
);

const requestContext = {
  actorType: "platform-operator" as const,
  actorId: "usr_op",
  sessionId: "sess_nca",
  correlationId: "corr_nca",
  tenant: {
    scope: "platform" as const,
    scopeId: "platform",
  },
};

describe("NotificationCenterAdmin schemas", () => {
  test("NotificationDeliveryStatusSchema enum", () => {
    expect(notificationDeliveryStatuses).toEqual([
      "queued",
      "sent",
      "delivered",
      "failed",
      "suppressed",
    ]);
  });

  test("NotificationChannelSchema enum", () => {
    expect(notificationChannels).toEqual([
      "email",
      "sms",
      "push",
      "in-app",
      "webhook",
    ]);
  });

  test("NotificationSummarySchema round-trips with regulated-sensitive projections", () => {
    const summary: NotificationSummary = {
      notificationId: "ntf_1",
      channel: notificationChannel.email,
      status: notificationDeliveryStatus.failed,
      recipientProjection: "user_***@example.com",
      subjectProjection: "[REDACTED-SUBJECT]",
      createdAt: "2026-02-01T00:00:00.000Z",
      deliveredAt: "2026-02-01T00:00:05.000Z",
      lastError: "smtp:451",
    };
    expect(decodeSummary(summary)).toStrictEqual(summary);
  });

  test("NotificationDetailSchema round-trips with payloadProjection + providerMetadata", () => {
    const detail: NotificationDetail = {
      notificationId: "ntf_1",
      channel: notificationChannel.email,
      status: notificationDeliveryStatus.delivered,
      recipientProjection: "user_***@example.com",
      subjectProjection: "[REDACTED-SUBJECT]",
      createdAt: "2026-02-01T00:00:00.000Z",
      deliveredAt: "2026-02-01T00:00:05.000Z",
      payloadProjection: '{"templateId":"welcome"}',
      providerMetadata: '{"novuMessageId":"abc123"}',
      auditCorrelationId: "corr_nca_detail",
    };
    expect(decodeDetail(detail)).toStrictEqual(detail);
  });

  test("NotificationCenterAdminListInputSchema decodes with bounded pageSize + optional pageToken + filters", () => {
    const input: NotificationCenterAdminListInput = {
      requestContext,
      filters: {
        channel: notificationChannel.email,
        status: notificationDeliveryStatus.failed,
        recipientHash: "hash_xyz",
        since: "2026-02-01T00:00:00.000Z",
        until: "2026-02-02T00:00:00.000Z",
      },
      pageSize: 50,
      pageToken: "tok_next",
    };
    expect(decodeList(input)).toStrictEqual(input);
  });

  test("NotificationCenterAdminListInputSchema rejects pageSize > 500", () => {
    expect(() =>
      decodeList({
        requestContext,
        filters: {},
        pageSize: 501,
      }),
    ).toThrow();
  });

  test("NotificationCenterAdminDetailInputSchema round-trips", () => {
    const input: NotificationCenterAdminDetailInput = {
      requestContext,
      notificationId: "ntf_1",
    };
    expect(decodeDetailInput(input)).toStrictEqual(input);
  });

  test("NotificationCenterAdminResendInputSchema round-trips", () => {
    const input: NotificationCenterAdminResendInput = {
      requestContext,
      notificationId: "ntf_1",
      reason: reasonCatalogId.notificationCenterAdminResend,
      reasonAttachmentText: "INC-77 runbook",
    };
    expect(decodeResendInput(input)).toStrictEqual(input);
  });

  test("NotificationCenterAdminListResultSchema admits nextPageToken + partialFailures", () => {
    const result: NotificationCenterAdminListResult = {
      notifications: [],
      nextPageToken: "tok_next",
      partialFailures: [{ bucket: "page-2", reason: "upstream-timeout" }],
    };
    expect(decodeListResult(result)).toStrictEqual(result);
  });
});

describe("NotificationCenterAdmin registry pins", () => {
  test("permissionScope.notificationCenterAdminRead + .notificationCenterAdminWrite are in the canonical list", () => {
    expect(permissionScope.notificationCenterAdminRead).toBe(
      "notification-center-admin:read",
    );
    expect(permissionScope.notificationCenterAdminWrite).toBe(
      "notification-center-admin:write",
    );
    expect(permissionScopes).toContain(
      permissionScope.notificationCenterAdminRead,
    );
    expect(permissionScopes).toContain(
      permissionScope.notificationCenterAdminWrite,
    );
  });

  test("platformModuleId.notificationCenterAdmin is in the canonical list", () => {
    expect(platformModuleId.notificationCenterAdmin).toBe(
      "notification-center-admin",
    );
    expect(platformModuleIds).toContain(
      platformModuleId.notificationCenterAdmin,
    );
  });

  test("notificationCenterAdminAuditAction.{listed,detailRead,resent} are in the canonical list", () => {
    expect(notificationCenterAdminAuditAction.listed).toBe(
      "notification-center-admin.listed",
    );
    expect(notificationCenterAdminAuditAction.detailRead).toBe(
      "notification-center-admin.detail-read",
    );
    expect(notificationCenterAdminAuditAction.resent).toBe(
      "notification-center-admin.resent",
    );
    expect(auditActions).toContain(notificationCenterAdminAuditAction.listed);
    expect(auditActions).toContain(
      notificationCenterAdminAuditAction.detailRead,
    );
    expect(auditActions).toContain(notificationCenterAdminAuditAction.resent);
  });

  test("reasonCatalogId.notificationCenterAdminResend has requiresAttachment: true and gates resent", () => {
    expect(reasonCatalogId.notificationCenterAdminResend).toBe(
      "notification-center-admin.resend",
    );
    const entry = reasonCatalogRegistry.find(
      (e) => e.id === reasonCatalogId.notificationCenterAdminResend,
    );
    expect(entry).toBeDefined();
    if (entry === undefined) {
      throw new Error("registry entry missing");
    }
    expect(entry.moduleId).toBe(platformModuleId.notificationCenterAdmin);
    expect(entry.requiresAttachment).toBe(true);
    expect(entry.auditActionsGated).toEqual([
      notificationCenterAdminAuditAction.resent,
    ]);
  });
});
