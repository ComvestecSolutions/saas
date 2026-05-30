/**
 * Admin-app notify-list loader tests (admin-app
 * implementation plan §8.16 + §11 — Phase 6 vendor + workflow
 * operator screens commit 6b). Covers the discriminated-union
 * mapping of the `/desk/notify` loader trio backed live by
 * `listNotificationCenterAdminFromEnvironment` through
 * `resolveTrustedRequestContextFromSessionId`:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - `NotificationCenterAdminUnauthorized` → `denied`
 *   - `NotificationCenterAdminMissingActorIdentity` → `stale-session`
 *   - boundary error → `error`
 *   - happy path → `ready` carrying filters + result envelope
 *
 * Mirrors `tests/platform/admin-app-api-key-detail-loader.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  notificationChannel,
  notificationDeliveryStatus,
} from "@comvestec/contracts";
import {
  loadAdminNotifyListRouteDataFromRequest,
  type AdminNotifyListDependencies,
  type AdminNotifyListInput,
} from "../../apps/admin-app/src/lib/notify-list-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const baseInput: AdminNotifyListInput = {
  filters: {},
  pageSize: 50,
};

const sampleResult = {
  notifications: [
    {
      notificationId: "ntf_1",
      channel: notificationChannel.email,
      status: notificationDeliveryStatus.delivered,
      recipientProjection: "ops@example.test",
      subjectProjection: "Welcome",
      createdAt: new Date(0).toISOString(),
    },
  ],
};

const succeedingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed({}),
  listNotificationCenterAdmin: () =>
    Effect.succeed({ result: sampleResult, fromCache: false }),
} as unknown as AdminNotifyListDependencies;

const failingResolveContext = (tag: string): AdminNotifyListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    listNotificationCenterAdmin: () =>
      Effect.succeed({ result: sampleResult, fromCache: false }),
  }) as unknown as AdminNotifyListDependencies;

const failingList = (tag: string): AdminNotifyListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    listNotificationCenterAdmin: () => Effect.fail({ _tag: tag } as const),
  }) as unknown as AdminNotifyListDependencies;

const throwingDependencies = (error: unknown): AdminNotifyListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    listNotificationCenterAdmin: () => Effect.fail(error),
  }) as unknown as AdminNotifyListDependencies;

describe("admin-app notify-list loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminNotifyListRouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with the listed notifications", async () => {
    const result = await Effect.runPromise(
      loadAdminNotifyListRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.result.notifications.length).toBe(1);
    expect(result.result.notifications[0]?.notificationId).toBe("ntf_1");
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminNotifyListRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        baseInput,
        failingResolveContext("IdentitySessionRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when the notification-center helper raises unauthorized", async () => {
    const result = await Effect.runPromise(
      loadAdminNotifyListRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        baseInput,
        failingList("NotificationCenterAdminUnauthorized"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns stale-session when the helper raises missing-actor-identity", async () => {
    const result = await Effect.runPromise(
      loadAdminNotifyListRouteDataFromRequest(
        buildRequest("sess-noactor"),
        {},
        baseInput,
        failingList("NotificationCenterAdminMissingActorIdentity"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns error when the helper raises an untagged Error", async () => {
    const result = await Effect.runPromise(
      loadAdminNotifyListRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        baseInput,
        throwingDependencies(new Error("Upstream notification adapter down.")),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Notification center unavailable");
    expect(result.description).toBe("Upstream notification adapter down.");
  });
});
