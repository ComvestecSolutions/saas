/**
 * Notification center admin envelope module wrapper (admin-app
 * implementation plan §9 item 16 — final Phase 1 backend gap).
 *
 * Re-exports the canonical contract surface so downstream platform
 * + app code imports from `@comvestec/modules` without reaching
 * across packages. The platform service composes an injected
 * `NotificationCenterPort` wrapping the Novu admin surface; the
 * underlying notification-center module still lives in
 * `@comvestec/modules` under `notification-center`. Owner-locked
 * invariants (operator/support read + operator-or-admin-owner-or-
 * admin-admin write authz, reason-catalog decode, attachment
 * enforcement, audit emission, bounded list cache, bounded
 * pageSize, field-security redaction) live at the platform
 * service boundary in
 * `packages/platform/src/services/domains/notification-center-admin-service.ts`.
 *
 * No persistence: this slice projects Novu deliveries through
 * the injected port. The platform service owns the bounded cache
 * + audit + authz invariants; the upstream port owns the row
 * shape and resend semantics.
 */
import { platformModuleId } from "@comvestec/contracts";

export const notificationCenterAdminModuleId =
  platformModuleId.notificationCenterAdmin;

export {
  NotificationCenterAdminDetailInputSchema,
  NotificationCenterAdminListFiltersSchema,
  NotificationCenterAdminListInputSchema,
  NotificationCenterAdminListResultSchema,
  NotificationCenterAdminPartialFailureSchema,
  NotificationCenterAdminResendInputSchema,
  NotificationCenterAdminResendResultSchema,
  NotificationChannelSchema,
  NotificationDeliveryStatusSchema,
  NotificationDetailSchema,
  NotificationSummarySchema,
  notificationChannel,
  notificationChannels,
  notificationDeliveryStatus,
  notificationDeliveryStatuses,
} from "@comvestec/contracts";

export type {
  NotificationCenterAdminDetailInput,
  NotificationCenterAdminListFilters,
  NotificationCenterAdminListInput,
  NotificationCenterAdminListResult,
  NotificationCenterAdminPartialFailure,
  NotificationCenterAdminResendInput,
  NotificationCenterAdminResendResult,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationDetail,
  NotificationSummary,
} from "@comvestec/contracts";

/**
 * Pure helper shared by the platform service + any future read
 * consumer: snapshot freshness check used by the list cache to
 * decide whether a cached page is still within the
 * operator-configured TTL. Negative or non-finite TTLs collapse
 * to `false` so misconfiguration fails closed rather than
 * silently bypassing the TTL.
 */
export const isNotificationCenterAdminListFresh = (
  cachedAt: string,
  nowEpochMs: number,
  ttlSeconds: number,
): boolean => {
  const cachedMs = new Date(cachedAt).getTime();
  if (!Number.isFinite(cachedMs)) {
    return false;
  }
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    return false;
  }
  const ageMs = nowEpochMs - cachedMs;
  if (ageMs < 0) {
    return false;
  }
  return ageMs <= ttlSeconds * 1000;
};
