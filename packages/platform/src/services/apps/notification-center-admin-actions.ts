import { Effect } from "effect";
import type {
  NotificationCenterAdminListFilters,
  RequestContext,
} from "@comvestec/contracts";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

/**
 * Root-safe app helpers for the notification-center admin
 * envelope platform service (admin-app implementation plan §9
 * item 16 — final Phase 1 backend gap).
 *
 * Mirrors `workflow-runs-admin-actions.ts`,
 * `run-as-banner-state-actions.ts`,
 * `capability-snapshot-v2-actions.ts`, and
 * `openpanel-events-read-actions.ts` EXACTLY: helpers stay free
 * of any `Request` / `Response` shaping, never own a duplicate
 * `Effect.tryPromise`, and load the env-bound service runtime
 * through the single `loadRuntimeModuleOrDie` seam so the import
 * graph remains safe to evaluate at app root scope.
 */
const loadNotificationCenterAdminRuntime = () =>
  loadRuntimeModuleOrDie(
    () => import("../domains/notification-center-admin-service"),
  );

export const listNotificationCenterAdminFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly filters: NotificationCenterAdminListFilters;
    readonly pageSize: number;
    readonly pageToken?: string;
  },
) =>
  loadNotificationCenterAdminRuntime().pipe(
    Effect.flatMap(({ runNotificationCenterAdminFromEnvironment: run }) =>
      run(environment, (service) => service.listNotifications(input)),
    ),
  );

export const getNotificationCenterAdminDetailFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly notificationId: string;
  },
) =>
  loadNotificationCenterAdminRuntime().pipe(
    Effect.flatMap(({ runNotificationCenterAdminFromEnvironment: run }) =>
      run(environment, (service) => service.getNotificationDetail(input)),
    ),
  );

export const resendNotificationFromEnvironment = (
  environment: unknown,
  input: {
    readonly requestContext: RequestContext;
    readonly notificationId: string;
    readonly reason: string;
    readonly reasonAttachmentText?: string;
  },
) =>
  loadNotificationCenterAdminRuntime().pipe(
    Effect.flatMap(({ runNotificationCenterAdminFromEnvironment: run }) =>
      run(environment, (service) => service.resendNotification(input)),
    ),
  );
