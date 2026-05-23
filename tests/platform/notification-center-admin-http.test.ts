/**
 * Notification-center admin envelope HTTP transport tests
 * (admin-app implementation plan §9 item 16 — final Phase 1
 * backend gap). Mirrors `workflow-runs-admin-http.test.ts`:
 * exercises `createNotificationCenterAdminHttpHandlerWithDependencies`
 * with an injected request-context resolver + service double so
 * we cover routing, body decoding, error-tag → status mapping,
 * 405 method-not-allowed, 404 unknown sub-path, and the
 * backend-api registry pin.
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  notificationCenterAdminAuditAction,
  notificationChannel,
  notificationDeliveryStatus,
  platformScope,
  reasonCatalogId,
  type NotificationCenterAdminListResult,
  type NotificationDetail,
  type RequestContext,
} from "@comvestec/contracts";
import {
  createNotificationCenterAdminHttpHandlerWithDependencies,
  notificationCenterAdminApiBasePath,
  notificationCenterAdminApiPath,
  NotificationCenterAdminMissingActorIdentity,
  NotificationCenterAdminNotificationNotFound,
  NotificationCenterAdminPageSizeTooLarge,
  NotificationCenterAdminReasonActionMismatch,
  NotificationCenterAdminReasonAttachmentRequired,
  NotificationCenterAdminReasonNotInCatalog,
  NotificationCenterAdminUnauthorized,
  type NotificationCenterAdminServiceImpl,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_notification_center_admin_http_operator",
  sessionId: "sess_notification_center_admin_http",
  correlationId: "corr_notification_center_admin_http",
  reason: reasonCatalogId.notificationCenterAdminResend,
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const emptyListResult = (): NotificationCenterAdminListResult => ({
  notifications: [],
});

const sampleDetail = (): NotificationDetail => ({
  notificationId: "ntf_target_detail",
  channel: notificationChannel.email,
  status: notificationDeliveryStatus.delivered,
  recipientProjection: "user@example.com",
  subjectProjection: "Welcome to Comvestec",
  createdAt: "2026-02-01T00:00:00.000Z",
  payloadProjection: "<redacted>",
  providerMetadata: "<redacted>",
  auditCorrelationId: "corr_notification_center_admin_http",
});

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(new Error(`unexpected notification-center-admin call: ${method}`));

const createServiceDouble = (
  overrides: Partial<NotificationCenterAdminServiceImpl> = {},
): NotificationCenterAdminServiceImpl => ({
  listNotifications:
    overrides.listNotifications ??
    (() => unexpectedServiceCall("listNotifications")),
  getNotificationDetail:
    overrides.getNotificationDetail ??
    (() => unexpectedServiceCall("getNotificationDetail")),
  resendNotification:
    overrides.resendNotification ??
    (() => unexpectedServiceCall("resendNotification")),
});

const createTestHandler = (
  service: Partial<NotificationCenterAdminServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createNotificationCenterAdminHttpHandlerWithDependencies({
    resolveRequestContext: (resolverOverride ??
      (() => Effect.succeed(trustedRequestContext))) as (
      request: Request,
    ) => Effect.Effect<RequestContext, never>,
    runWithService: (use) => use(createServiceDouble(service)),
  });

const url = (path: string) => `http://localhost${path}`;

const resendBody = (overrides: Record<string, unknown> = {}) => ({
  notificationId: "ntf_target_resend",
  reason: reasonCatalogId.notificationCenterAdminResend,
  reasonAttachmentText: "runbook://notification-center/resend",
  ...overrides,
});

const postJson = (path: string, body: unknown) =>
  new Request(url(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const getRequest = (path: string) => new Request(url(path), { method: "GET" });

// ---------------------------------------------------------------------------
// Path table + registry pin
// ---------------------------------------------------------------------------

describe("notification-center-admin HTTP — path table + registry", () => {
  it("pins the public base path and per-route literals", () => {
    expect(notificationCenterAdminApiBasePath).toBe(
      "/api/notification-center-admin",
    );
    expect(notificationCenterAdminApiPath).toEqual({
      list: "/api/notification-center-admin/list",
      detail: "/api/notification-center-admin/detail",
      resend: "/api/notification-center-admin/resend",
    });
  });

  it("is registered against the canonical backend API router via notificationCenterAdminApiBasePath", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(
      backendApiSource.includes("notificationCenterAdminApiBasePath"),
    ).toBe(true);
    expect(backendApiSource.includes("notificationCenterAdminHandler")).toBe(
      true,
    );
    expect(
      backendApiSource.includes("handleNotificationCenterAdminHttpRequest"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /list
// ---------------------------------------------------------------------------

describe("notification-center-admin HTTP — /list", () => {
  it("returns 200 { result, fromCache } on happy path", async () => {
    const result = emptyListResult();
    const handler = createTestHandler({
      listNotifications: () => Effect.succeed({ result, fromCache: false }),
    });
    const response = await Effect.runPromise(
      handler(getRequest(notificationCenterAdminApiPath.list)),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      result,
      fromCache: false,
    });
  });

  it("returns 400 when filters fail to decode (invalid status)", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(`${notificationCenterAdminApiPath.list}?status=not-a-status`),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps NotificationCenterAdminUnauthorized to 401", async () => {
    const handler = createTestHandler({
      listNotifications: () =>
        Effect.fail(
          new NotificationCenterAdminUnauthorized({
            operation: "listNotifications",
            requestingActorId: undefined,
            requestingActorType: actorType.individualUser,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(getRequest(notificationCenterAdminApiPath.list)),
    );
    expect(response.status).toBe(401);
  });

  it("maps NotificationCenterAdminMissingActorIdentity to 401", async () => {
    const handler = createTestHandler({
      listNotifications: () =>
        Effect.fail(
          new NotificationCenterAdminMissingActorIdentity({
            operation: "listNotifications",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(getRequest(notificationCenterAdminApiPath.list)),
    );
    expect(response.status).toBe(401);
  });

  it("maps NotificationCenterAdminPageSizeTooLarge to 400", async () => {
    const handler = createTestHandler({
      listNotifications: () =>
        Effect.fail(
          new NotificationCenterAdminPageSizeTooLarge({
            requested: 9999,
            maximum: 500,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(getRequest(notificationCenterAdminApiPath.list)),
    );
    expect(response.status).toBe(400);
  });

  it("returns 500 for unknown / untagged service errors", async () => {
    const handler = createTestHandler({
      listNotifications: () =>
        Effect.fail(new Error("boom") as unknown as never),
    });
    const response = await Effect.runPromise(
      handler(getRequest(notificationCenterAdminApiPath.list)),
    );
    expect(response.status).toBe(500);
  });

  it("maps the missing-session-header tag to 401 via the resolver seam", async () => {
    const handler = createTestHandler({}, () =>
      Effect.fail({ _tag: "SubscriberJourneySessionIdMissingError" } as const),
    );
    const response = await Effect.runPromise(
      handler(getRequest(notificationCenterAdminApiPath.list)),
    );
    expect(response.status).toBe(401);
  });

  it("maps IdentitySessionRequestContextNotFoundError to 404 via the resolver seam", async () => {
    const handler = createTestHandler({}, () =>
      Effect.fail({
        _tag: "IdentitySessionRequestContextNotFoundError",
      } as const),
    );
    const response = await Effect.runPromise(
      handler(getRequest(notificationCenterAdminApiPath.list)),
    );
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /detail
// ---------------------------------------------------------------------------

describe("notification-center-admin HTTP — /detail", () => {
  it("returns 200 { detail } on happy path (Option.some)", async () => {
    const detail = sampleDetail();
    const handler = createTestHandler({
      getNotificationDetail: () =>
        Effect.succeed({ detail: Option.some(detail) }),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(
            `${notificationCenterAdminApiPath.detail}?notificationId=ntf_target_detail`,
          ),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ detail });
  });

  it("returns 200 { detail: null } when service returns Option.none", async () => {
    const handler = createTestHandler({
      getNotificationDetail: () => Effect.succeed({ detail: Option.none() }),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(
            `${notificationCenterAdminApiPath.detail}?notificationId=ntf_target_detail`,
          ),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ detail: null });
  });

  it("returns 400 when notificationId query parameter is missing", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(getRequest(notificationCenterAdminApiPath.detail)),
    );
    expect(response.status).toBe(400);
  });

  it("maps NotificationCenterAdminNotificationNotFound to 404", async () => {
    const handler = createTestHandler({
      getNotificationDetail: () =>
        Effect.fail(
          new NotificationCenterAdminNotificationNotFound({
            operation: "getNotificationDetail",
            notificationId: "ntf_missing",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(
            `${notificationCenterAdminApiPath.detail}?notificationId=ntf_missing`,
          ),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(404);
  });

  it("maps NotificationCenterAdminUnauthorized to 401", async () => {
    const handler = createTestHandler({
      getNotificationDetail: () =>
        Effect.fail(
          new NotificationCenterAdminUnauthorized({
            operation: "getNotificationDetail",
            requestingActorId: undefined,
            requestingActorType: actorType.individualUser,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url(
            `${notificationCenterAdminApiPath.detail}?notificationId=ntf_target_detail`,
          ),
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /resend
// ---------------------------------------------------------------------------

describe("notification-center-admin HTTP — /resend", () => {
  it("returns 202 { accepted, notificationId } on happy path", async () => {
    const handler = createTestHandler({
      resendNotification: () =>
        Effect.succeed({
          accepted: true as const,
          notificationId: "ntf_target_resend",
        }),
    });
    const response = await Effect.runPromise(
      handler(postJson(notificationCenterAdminApiPath.resend, resendBody())),
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      notificationId: "ntf_target_resend",
    });
  });

  it("returns 400 when the body schema does not match", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(postJson(notificationCenterAdminApiPath.resend, {})),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(notificationCenterAdminApiPath.resend), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not-json",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps NotificationCenterAdminReasonNotInCatalog to 400", async () => {
    const handler = createTestHandler({
      resendNotification: () =>
        Effect.fail(
          new NotificationCenterAdminReasonNotInCatalog({
            operation: "resendNotification",
            reasonCatalogId: "not-in-catalog",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(notificationCenterAdminApiPath.resend, resendBody())),
    );
    expect(response.status).toBe(400);
  });

  it("maps NotificationCenterAdminReasonActionMismatch to 400", async () => {
    const handler = createTestHandler({
      resendNotification: () =>
        Effect.fail(
          new NotificationCenterAdminReasonActionMismatch({
            operation: "resendNotification",
            reasonCatalogId: reasonCatalogId.workflowRunsAdminReplay,
            auditAction: notificationCenterAdminAuditAction.resent,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(notificationCenterAdminApiPath.resend, resendBody())),
    );
    expect(response.status).toBe(400);
  });

  it("maps NotificationCenterAdminReasonAttachmentRequired to 400", async () => {
    const handler = createTestHandler({
      resendNotification: () =>
        Effect.fail(
          new NotificationCenterAdminReasonAttachmentRequired({
            operation: "resendNotification",
            reasonCatalogId: reasonCatalogId.notificationCenterAdminResend,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(notificationCenterAdminApiPath.resend, resendBody())),
    );
    expect(response.status).toBe(400);
  });

  it("maps NotificationCenterAdminNotificationNotFound to 404", async () => {
    const handler = createTestHandler({
      resendNotification: () =>
        Effect.fail(
          new NotificationCenterAdminNotificationNotFound({
            operation: "resendNotification",
            notificationId: "ntf_missing",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(notificationCenterAdminApiPath.resend, resendBody())),
    );
    expect(response.status).toBe(404);
  });

  it("maps NotificationCenterAdminUnauthorized to 401", async () => {
    const handler = createTestHandler({
      resendNotification: () =>
        Effect.fail(
          new NotificationCenterAdminUnauthorized({
            operation: "resendNotification",
            requestingActorId: "usr_support",
            requestingActorType: actorType.supportOperator,
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(postJson(notificationCenterAdminApiPath.resend, resendBody())),
    );
    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 405 / 404
// ---------------------------------------------------------------------------

describe("notification-center-admin HTTP — method-not-allowed + unknown sub-path", () => {
  it("rejects POST on /list with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(notificationCenterAdminApiPath.list), {
          method: "POST",
        }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects POST on /detail with 405 + Allow: GET", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(notificationCenterAdminApiPath.detail), {
          method: "POST",
        }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });

  it("rejects GET on /resend with 405 + Allow: POST", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(notificationCenterAdminApiPath.resend), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it("returns 404 on unknown sub-path", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/notification-center-admin/not-a-route"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});
