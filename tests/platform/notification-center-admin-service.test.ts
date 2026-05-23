/**
 * Notification center admin envelope platform service tests
 * (admin-app implementation plan §9 item 16 — final Phase 1
 * backend gap). Pins owner-locked invariants enforced ABOVE the
 * injected `NotificationCenterPort` +
 * `NotificationCenterAdminRoleLookupPort` in
 * `packages/platform/src/services/domains/notification-center-admin-service.ts`:
 *
 *   - anonymous list/detail/resend → Unauthorized, NO audit
 *   - support operator allowed to list + detail; denied write
 *   - admin-owner allowed to resend; admin-viewer denied
 *   - pageSize > maximum → NotificationCenterAdminPageSizeTooLarge
 *   - reason not in catalog / action mismatch / missing attachment
 *     rejections (resend)
 *   - bounded list cache: identical key returns `fromCache: true`
 *     within TTL and re-derives after TTL expires; insertion-order
 *     eviction past `cacheMaxSize`; resend clears the cache
 *   - partialFailures pass-through populates the envelope
 *   - field-security: non-operator readers receive redacted
 *     `recipientProjection` + `subjectProjection` + `lastError`
 *     on summaries and additionally `payloadProjection` +
 *     `providerMetadata` on detail; operators see raw values
 *   - audit appended exactly once per accepted operation
 */
import { Effect, Exit, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  notificationCenterAdminAuditAction,
  notificationChannel,
  notificationDeliveryStatus,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  type AuditEvent,
  type NotificationCenterAdminListInput,
  type NotificationDetail,
  type NotificationSummary,
  type RequestContext,
} from "@comvestec/contracts";
import {
  adminMemberRole,
  type AdminMemberRole,
  type AuditLogModuleService,
} from "@comvestec/modules";
import {
  makeNotificationCenterAdminService,
  makeStubNotificationCenterPort,
  NotificationCenterAdminPageSizeTooLarge,
  NotificationCenterAdminReasonActionMismatch,
  NotificationCenterAdminReasonAttachmentRequired,
  NotificationCenterAdminReasonNotInCatalog,
  NotificationCenterAdminUnauthorized,
  type NotificationCenterAdminFieldSecurityPortService,
  type NotificationCenterAdminRoleLookupPortService,
  type NotificationCenterAdminRuntimeBounds,
  type NotificationCenterPortService,
} from "@comvestec/platform";

const tenant = {
  scope: platformScope.platform,
  scopeId: platformScope.platform,
} as const;

const operatorContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_op",
  sessionId: "sess_ncadmin",
  correlationId: "corr_ncadmin_op",
  reason: undefined,
  tenant,
};

const supportContext: RequestContext = {
  actorType: actorType.supportOperator,
  actorId: "usr_support",
  sessionId: "sess_ncadmin",
  correlationId: "corr_ncadmin_support",
  reason: undefined,
  tenant,
};

const orgMemberContext: RequestContext = {
  actorType: actorType.organizationMember,
  actorId: "usr_member",
  sessionId: "sess_ncadmin",
  correlationId: "corr_ncadmin_member",
  reason: undefined,
  tenant,
};

const anonymousContext: RequestContext = {
  actorType: actorType.anonymous,
  actorId: undefined,
  sessionId: undefined,
  correlationId: "corr_ncadmin_anon",
  reason: undefined,
  tenant,
};

const defaultBounds: NotificationCenterAdminRuntimeBounds = {
  cacheMaxSize: 4,
  cacheTtlSeconds: 5,
  listPageSizeMax: 50,
};

type AuditCall = {
  readonly action: string;
  readonly target: string;
  readonly reason: string | undefined;
};

const createAuditDouble = () => {
  const calls: AuditCall[] = [];
  const service: AuditLogModuleService = {
    append: (input) => {
      calls.push({
        action: input.action,
        target: input.target,
        reason: input.reason,
      });
      return Effect.succeed({
        id: `evt_${calls.length}`,
        moduleId: input.moduleId,
        action: input.action,
        target: input.target,
        reason: input.reason,
        actorType: input.requestContext.actorType,
        actorId: input.requestContext.actorId ?? null,
        sessionId: input.requestContext.sessionId,
        correlationId: input.requestContext.correlationId,
        tenantScope: input.requestContext.tenant.scope,
        tenantScopeId: input.requestContext.tenant.scopeId,
        recordedAt: "2026-06-01T00:00:00.000Z",
      } as unknown as AuditEvent);
    },
    queryByModule: () => Effect.succeed([]),
    queryByTarget: () => Effect.succeed([]),
    queryByActor: () => Effect.succeed([]),
    queryByTenant: () => Effect.succeed([]),
    requirements: Effect.succeed([]),
  };
  return {
    service,
    get calls(): ReadonlyArray<AuditCall> {
      return calls;
    },
  };
};

const createRoleLookupDouble = (
  rolesByActor: ReadonlyMap<string, AdminMemberRole | undefined>,
): NotificationCenterAdminRoleLookupPortService => ({
  lookupRole: (input) =>
    Effect.succeed({ role: rolesByActor.get(input.actorId) }),
});

const createDefaultFieldSecurity =
  (): NotificationCenterAdminFieldSecurityPortService => ({
    redactRegulatedSensitive: (actorTypeValue) =>
      actorTypeValue !== actorType.platformOperator &&
      actorTypeValue !== actorType.supportOperator,
  });

const buildSummary = (
  overrides: Partial<NotificationSummary> = {},
): NotificationSummary => ({
  notificationId: "ntf_1",
  channel: notificationChannel.email,
  status: notificationDeliveryStatus.failed,
  recipientProjection: "user@example.com",
  subjectProjection: "Welcome to Comvestec",
  createdAt: "2026-05-18T12:00:00.000Z",
  lastError: "smtp timeout",
  ...overrides,
});

const buildDetail = (
  overrides: Partial<NotificationDetail> = {},
): NotificationDetail => ({
  notificationId: "ntf_1",
  channel: notificationChannel.email,
  status: notificationDeliveryStatus.failed,
  recipientProjection: "user@example.com",
  subjectProjection: "Welcome to Comvestec",
  createdAt: "2026-05-18T12:00:00.000Z",
  lastError: "smtp timeout",
  payloadProjection: '{"orderId":"ord_1"}',
  providerMetadata: '{"novuTransactionId":"tx_1"}',
  auditCorrelationId: "corr_ncadmin_seed",
  ...overrides,
});

type PortOverrides = {
  readonly summaries?: ReadonlyArray<NotificationSummary>;
  readonly detail?: NotificationDetail | undefined;
  readonly partialFailures?: ReadonlyArray<{
    readonly bucket: string;
    readonly reason: string;
  }>;
};

const createPortDouble = (
  overrides: PortOverrides = {},
): NotificationCenterPortService => {
  const stub = makeStubNotificationCenterPort();
  return {
    ...stub,
    listNotifications: () =>
      Effect.succeed({
        notifications: overrides.summaries ?? [],
        ...(overrides.partialFailures === undefined
          ? {}
          : { partialFailures: overrides.partialFailures }),
      }),
    getNotificationDetail: () =>
      Effect.succeed(
        overrides.detail === undefined
          ? Option.none<NotificationDetail>()
          : Option.some(overrides.detail),
      ),
    resendNotification: () => Effect.succeed({ accepted: true as const }),
  };
};

type ServiceOverrides = {
  readonly port?: NotificationCenterPortService;
  readonly rolesByActor?: ReadonlyMap<string, AdminMemberRole | undefined>;
  readonly bounds?: NotificationCenterAdminRuntimeBounds;
  readonly now?: () => Date;
  readonly fieldSecurity?: NotificationCenterAdminFieldSecurityPortService;
};

const buildService = (overrides: ServiceOverrides = {}) => {
  const audit = createAuditDouble();
  const port = overrides.port ?? createPortDouble();
  const roleLookupPort = createRoleLookupDouble(
    overrides.rolesByActor ?? new Map(),
  );
  const fieldSecurityPort =
    overrides.fieldSecurity ?? createDefaultFieldSecurity();
  const service = makeNotificationCenterAdminService({
    auditLog: audit.service,
    notificationCenterPort: port,
    roleLookupPort,
    fieldSecurityPort,
    bounds: overrides.bounds ?? defaultBounds,
    ...(overrides.now === undefined ? {} : { now: overrides.now }),
  });
  return { service, audit };
};

const defaultListInput: NotificationCenterAdminListInput = {
  requestContext: operatorContext,
  filters: {},
  pageSize: 25,
};

describe("notification-center-admin platform service", () => {
  it("rejects anonymous list with Unauthorized and emits no audit", async () => {
    const { service, audit } = buildService();
    const result = await Effect.runPromiseExit(
      service.listNotifications({
        ...defaultListInput,
        requestContext: anonymousContext,
      }),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      expect(JSON.stringify(result.cause)).toContain(
        "NotificationCenterAdminUnauthorized",
      );
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("allows platform-operator list and emits exactly one audit", async () => {
    const summary = buildSummary();
    const { service, audit } = buildService({
      port: createPortDouble({ summaries: [summary] }),
    });
    const view = await Effect.runPromise(
      service.listNotifications(defaultListInput),
    );
    expect(view.fromCache).toBe(false);
    expect(view.result.notifications).toHaveLength(1);
    expect(view.result.notifications[0]!.recipientProjection).toBe(
      "user@example.com",
    );
    expect(view.result.notifications[0]!.lastError).toBe("smtp timeout");
    expect(audit.calls).toEqual([
      {
        action: notificationCenterAdminAuditAction.listed,
        target: "pageSize:25",
        reason: reasonCatalogId.notificationCenterAdminResend,
      },
    ]);
  });

  it("allows support-operator list + detail and emits the read audits", async () => {
    const summary = buildSummary();
    const detail = buildDetail();
    const port = createPortDouble({ summaries: [summary], detail });
    const { service, audit } = buildService({ port });

    const list = await Effect.runPromise(
      service.listNotifications({
        ...defaultListInput,
        requestContext: supportContext,
      }),
    );
    expect(list.result.notifications).toHaveLength(1);

    const det = await Effect.runPromise(
      service.getNotificationDetail({
        requestContext: supportContext,
        notificationId: detail.notificationId,
      }),
    );
    expect(Option.isSome(det.detail)).toBe(true);

    expect(audit.calls.map((c) => c.action)).toEqual([
      notificationCenterAdminAuditAction.listed,
      notificationCenterAdminAuditAction.detailRead,
    ]);
  });

  it("redacts regulated-sensitive fields for non-operator readers", async () => {
    const summary = buildSummary();
    const detail = buildDetail();
    const port = createPortDouble({ summaries: [summary], detail });
    const rolesByActor = new Map<string, AdminMemberRole | undefined>([
      [orgMemberContext.actorId!, adminMemberRole.viewer],
    ]);
    const { service } = buildService({ port, rolesByActor });

    const list = await Effect.runPromise(
      service.listNotifications({
        ...defaultListInput,
        requestContext: orgMemberContext,
      }),
    );
    expect(list.result.notifications[0]!.recipientProjection).toBe(
      "[redacted]",
    );
    expect(list.result.notifications[0]!.subjectProjection).toBe("[redacted]");
    expect(list.result.notifications[0]!.lastError).toBe("[redacted]");

    const det = await Effect.runPromise(
      service.getNotificationDetail({
        requestContext: orgMemberContext,
        notificationId: detail.notificationId,
      }),
    );
    expect(Option.isSome(det.detail)).toBe(true);
    if (Option.isSome(det.detail)) {
      expect(det.detail.value.recipientProjection).toBe("[redacted]");
      expect(det.detail.value.subjectProjection).toBe("[redacted]");
      expect(det.detail.value.payloadProjection).toBe("[redacted]");
      expect(det.detail.value.providerMetadata).toBe("[redacted]");
      expect(det.detail.value.lastError).toBe("[redacted]");
    }
  });

  it("denies support-operator resend attempts", async () => {
    const { service, audit } = buildService();
    const result = await Effect.runPromiseExit(
      service.resendNotification({
        requestContext: supportContext,
        notificationId: "ntf_1",
        reason: reasonCatalogId.notificationCenterAdminResend,
        reasonAttachmentText: "ticket COM-1",
      }),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      expect(JSON.stringify(result.cause)).toContain("Unauthorized");
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("allows admin-owner resend and clears the list cache", async () => {
    const summary = buildSummary();
    const port = createPortDouble({ summaries: [summary] });
    const adminOwnerContext: RequestContext = {
      ...operatorContext,
      actorType: actorType.organizationAdmin,
      actorId: "usr_admin_owner",
    };
    const rolesByActor = new Map<string, AdminMemberRole | undefined>([
      [adminOwnerContext.actorId!, adminMemberRole.adminOwner],
    ]);
    const { service, audit } = buildService({ port, rolesByActor });

    const listView = await Effect.runPromise(
      service.listNotifications(defaultListInput),
    );
    expect(listView.fromCache).toBe(false);
    const cachedAgain = await Effect.runPromise(
      service.listNotifications(defaultListInput),
    );
    expect(cachedAgain.fromCache).toBe(true);

    const resent = await Effect.runPromise(
      service.resendNotification({
        requestContext: adminOwnerContext,
        notificationId: summary.notificationId,
        reason: reasonCatalogId.notificationCenterAdminResend,
        reasonAttachmentText: "ticket COM-7",
      }),
    );
    expect(resent.accepted).toBe(true);

    const afterResend = await Effect.runPromise(
      service.listNotifications(defaultListInput),
    );
    expect(afterResend.fromCache).toBe(false);

    expect(audit.calls.map((c) => c.action)).toEqual([
      notificationCenterAdminAuditAction.listed,
      notificationCenterAdminAuditAction.listed,
      notificationCenterAdminAuditAction.resent,
      notificationCenterAdminAuditAction.listed,
    ]);
  });

  it("denies admin-viewer resend attempts", async () => {
    const viewerContext: RequestContext = {
      ...operatorContext,
      actorType: actorType.organizationMember,
      actorId: "usr_viewer",
    };
    const rolesByActor = new Map<string, AdminMemberRole | undefined>([
      [viewerContext.actorId!, adminMemberRole.viewer],
    ]);
    const { service } = buildService({ rolesByActor });
    const result = await Effect.runPromiseExit(
      service.resendNotification({
        requestContext: viewerContext,
        notificationId: "ntf_1",
        reason: reasonCatalogId.notificationCenterAdminResend,
        reasonAttachmentText: "ticket COM-9",
      }),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      expect(JSON.stringify(result.cause)).toContain("Unauthorized");
    }
  });

  it("rejects pageSize above the configured maximum", async () => {
    const { service } = buildService({
      bounds: { ...defaultBounds, listPageSizeMax: 10 },
    });
    const result = await Effect.runPromiseExit(
      service.listNotifications({ ...defaultListInput, pageSize: 25 }),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      expect(JSON.stringify(result.cause)).toContain(
        "NotificationCenterAdminPageSizeTooLarge",
      );
    }
  });

  it("rejects reason not present in the catalog (resend)", async () => {
    const { service } = buildService();
    const result = await Effect.runPromiseExit(
      service.resendNotification({
        requestContext: operatorContext,
        notificationId: "ntf_1",
        reason: "not-a-catalog-id",
        reasonAttachmentText: "ticket COM-10",
      }),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      expect(JSON.stringify(result.cause)).toContain("ReasonNotInCatalog");
    }
  });

  it("rejects reason that does not match the audit action", async () => {
    const { service } = buildService();
    const result = await Effect.runPromiseExit(
      service.resendNotification({
        requestContext: operatorContext,
        notificationId: "ntf_1",
        reason: reasonCatalogId.workflowRunsAdminReplay,
        reasonAttachmentText: "ticket COM-11",
      }),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      expect(JSON.stringify(result.cause)).toContain("ReasonActionMismatch");
    }
  });

  it("rejects resend when the catalog-required attachment is missing", async () => {
    const { service } = buildService();
    const result = await Effect.runPromiseExit(
      service.resendNotification({
        requestContext: operatorContext,
        notificationId: "ntf_1",
        reason: reasonCatalogId.notificationCenterAdminResend,
      }),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      expect(JSON.stringify(result.cause)).toContain(
        "ReasonAttachmentRequired",
      );
    }
  });

  it("propagates partialFailures from the port into the envelope", async () => {
    const summary = buildSummary();
    const port = createPortDouble({
      summaries: [summary],
      partialFailures: [{ bucket: "novu", reason: "timeout" }],
    });
    const { service } = buildService({ port });
    const view = await Effect.runPromise(
      service.listNotifications(defaultListInput),
    );
    expect(view.result.partialFailures).toEqual([
      { bucket: "novu", reason: "timeout" },
    ]);
  });

  it("evicts in insertion-order once cacheMaxSize is exceeded", async () => {
    let portCalls = 0;
    const port: NotificationCenterPortService = {
      ...makeStubNotificationCenterPort(),
      listNotifications: () => {
        portCalls += 1;
        return Effect.succeed({
          notifications: [] as ReadonlyArray<NotificationSummary>,
        });
      },
    };
    const { service } = buildService({
      port,
      bounds: { ...defaultBounds, cacheMaxSize: 2 },
    });

    // 3 distinct page sizes — evicts the first when the 3rd lands.
    await Effect.runPromise(
      service.listNotifications({ ...defaultListInput, pageSize: 1 }),
    );
    await Effect.runPromise(
      service.listNotifications({ ...defaultListInput, pageSize: 2 }),
    );
    await Effect.runPromise(
      service.listNotifications({ ...defaultListInput, pageSize: 3 }),
    );
    expect(portCalls).toBe(3);

    // Repeating the FIRST key now misses (evicted) but the THIRD still hits.
    const evicted = await Effect.runPromise(
      service.listNotifications({ ...defaultListInput, pageSize: 1 }),
    );
    expect(evicted.fromCache).toBe(false);
    const stillCached = await Effect.runPromise(
      service.listNotifications({ ...defaultListInput, pageSize: 3 }),
    );
    expect(stillCached.fromCache).toBe(true);
  });

  it("re-derives after TTL expires", async () => {
    let portCalls = 0;
    const port: NotificationCenterPortService = {
      ...makeStubNotificationCenterPort(),
      listNotifications: () => {
        portCalls += 1;
        return Effect.succeed({
          notifications: [] as ReadonlyArray<NotificationSummary>,
        });
      },
    };
    let nowMs = 1_700_000_000_000;
    const { service } = buildService({
      port,
      bounds: { ...defaultBounds, cacheTtlSeconds: 1 },
      now: () => new Date(nowMs),
    });
    await Effect.runPromise(service.listNotifications(defaultListInput));
    nowMs += 500;
    const fresh = await Effect.runPromise(
      service.listNotifications(defaultListInput),
    );
    expect(fresh.fromCache).toBe(true);
    nowMs += 2_000;
    const stale = await Effect.runPromise(
      service.listNotifications(defaultListInput),
    );
    expect(stale.fromCache).toBe(false);
    expect(portCalls).toBe(2);
  });

  it("emits exactly one audit on detail-read for the seen notification", async () => {
    const detail = buildDetail();
    const port = createPortDouble({ detail });
    const { service, audit } = buildService({ port });

    await Effect.runPromise(
      service.getNotificationDetail({
        requestContext: operatorContext,
        notificationId: detail.notificationId,
      }),
    );

    expect(audit.calls).toEqual([
      {
        action: notificationCenterAdminAuditAction.detailRead,
        target: detail.notificationId,
        reason: reasonCatalogId.notificationCenterAdminResend,
      },
    ]);
  });

  // Keep the error-class imports load-bearing for direct downstream
  // consumers without forcing the suite to introspect cause types.
  it("exports the documented typed error classes", () => {
    expect(NotificationCenterAdminUnauthorized.name).toBe(
      "NotificationCenterAdminUnauthorized",
    );
    expect(NotificationCenterAdminPageSizeTooLarge.name).toBe(
      "NotificationCenterAdminPageSizeTooLarge",
    );
    expect(NotificationCenterAdminReasonNotInCatalog.name).toBe(
      "NotificationCenterAdminReasonNotInCatalog",
    );
    expect(NotificationCenterAdminReasonActionMismatch.name).toBe(
      "NotificationCenterAdminReasonActionMismatch",
    );
    expect(NotificationCenterAdminReasonAttachmentRequired.name).toBe(
      "NotificationCenterAdminReasonAttachmentRequired",
    );
  });
});
