/**
 * Admin-app notify-detail loader tests (admin-app implementation
 * plan §8.16 + §11 — Phase 6 vendor + workflow operator screens
 * commit 6c). Covers the discriminated-union mapping of the
 * `/desk/notify/$id` loader trio backed live by
 * `getNotificationCenterAdminDetailFromEnvironment`:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - `NotificationCenterAdminUnauthorized` → `denied`
 *   - `NotificationCenterAdminMissingActorIdentity` → `stale-session`
 *   - `NotificationCenterAdminNotificationNotFound` → `error` with not-found copy
 *   - `Option.none` from the helper → `error` with not-found copy
 *   - boundary error → `error`
 *   - happy path → `ready` carrying the notification detail
 */
import { describe, expect, it } from "vitest";
import { Effect, Option } from "effect";
import {
  notificationChannel,
  notificationDeliveryStatus,
} from "@comvestec/contracts";
import {
  loadAdminNotifyDetailRouteDataFromRequest,
  type AdminNotifyDetailDependencies,
  type AdminNotifyDetailInput,
} from "../../apps/admin-app/src/lib/notify-detail-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const baseInput: AdminNotifyDetailInput = {
  notificationId: "ntf_1",
};

const sampleNotification = {
  notificationId: "ntf_1",
  channel: notificationChannel.email,
  status: notificationDeliveryStatus.delivered,
  recipientProjection: "ops-recipient@example.test",
  subjectProjection: "Welcome to the workspace",
  createdAt: new Date(0).toISOString(),
  deliveredAt: new Date(1000).toISOString(),
  payloadProjection: '{ "template": "welcome" }',
  providerMetadata: '{ "providerId": "novu" }',
  auditCorrelationId: "corr_ntf_1",
};

const succeedingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed({}),
  getNotificationCenterAdminDetail: () =>
    Effect.succeed({ detail: Option.some(sampleNotification) }),
} as unknown as AdminNotifyDetailDependencies;

const failingResolveContext = (tag: string): AdminNotifyDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    getNotificationCenterAdminDetail: () =>
      Effect.succeed({ detail: Option.some(sampleNotification) }),
  }) as unknown as AdminNotifyDetailDependencies;

const failingDetail = (tag: string): AdminNotifyDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    getNotificationCenterAdminDetail: () => Effect.fail({ _tag: tag } as const),
  }) as unknown as AdminNotifyDetailDependencies;

const throwingDependencies = (error: unknown): AdminNotifyDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    getNotificationCenterAdminDetail: () => Effect.fail(error),
  }) as unknown as AdminNotifyDetailDependencies;

describe("admin-app notify-detail loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminNotifyDetailRouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with the notification detail", async () => {
    const result = await Effect.runPromise(
      loadAdminNotifyDetailRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.notification.notificationId).toBe("ntf_1");
    expect(result.notification.payloadProjection).toBe(
      '{ "template": "welcome" }',
    );
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminNotifyDetailRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        baseInput,
        failingResolveContext("IdentitySessionRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when the helper raises unauthorized", async () => {
    const result = await Effect.runPromise(
      loadAdminNotifyDetailRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        baseInput,
        failingDetail("NotificationCenterAdminUnauthorized"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns stale-session when the helper raises missing actor identity", async () => {
    const result = await Effect.runPromise(
      loadAdminNotifyDetailRouteDataFromRequest(
        buildRequest("sess-actorless"),
        {},
        baseInput,
        failingDetail("NotificationCenterAdminMissingActorIdentity"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns not-found error when the helper raises notification-not-found", async () => {
    const result = await Effect.runPromise(
      loadAdminNotifyDetailRouteDataFromRequest(
        buildRequest("sess-missing"),
        {},
        baseInput,
        failingDetail("NotificationCenterAdminNotificationNotFound"),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Notification not found");
  });

  it("returns not-found error when the helper returns Option.none for the detail", async () => {
    const noneDependencies = {
      resolveTrustedRequestContext: () => Effect.succeed({}),
      getNotificationCenterAdminDetail: () =>
        Effect.succeed({ detail: Option.none() }),
    } as unknown as AdminNotifyDetailDependencies;
    const result = await Effect.runPromise(
      loadAdminNotifyDetailRouteDataFromRequest(
        buildRequest("sess-none"),
        {},
        baseInput,
        noneDependencies,
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Notification not found");
  });

  it("returns error when the helper raises an untagged Error", async () => {
    const result = await Effect.runPromise(
      loadAdminNotifyDetailRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        baseInput,
        throwingDependencies(new Error("Upstream Novu admin port down.")),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Notification detail unavailable");
    expect(result.description).toBe("Upstream Novu admin port down.");
  });
});
