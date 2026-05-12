import {
  notificationCenterChannel,
  notificationCenterInAppStatus,
  notificationCenterNotificationFamily,
  platformModuleId,
  platformModuleIds,
  platformScope,
  type NotificationCenterInAppStatus,
  type NotificationCenterNotificationFamily,
  type PlatformModuleId,
  type PlatformScope,
} from "@comvestec/contracts";
import { Effect } from "effect";
import { mutationGeneric, queryGeneric } from "convex/server";
import { v, type GenericId, type ObjectType } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  requireWorkflowActorIdentity,
  toWorkflowActorIdentityBoundaryError,
} from "./keycloakWorkflowIdentity";

type NotificationCenterInAppRuntimeCtx = MutationCtx | QueryCtx;

const platformScopeValidator = v.union(
  v.literal(platformScope.platform),
  v.literal(platformScope.enterprise),
  v.literal(platformScope.organization),
  v.literal(platformScope.individual),
);

const notificationCenterInAppFamilyValidator = v.literal(
  notificationCenterNotificationFamily.billingInvoiceReady,
);

const notificationCenterInAppStatusValidator = v.union(
  v.literal(notificationCenterInAppStatus.unread),
  v.literal(notificationCenterInAppStatus.read),
  v.literal(notificationCenterInAppStatus.dismissed),
);

const notificationCenterInAppRecordValidator = v.object({
  notificationId: v.string(),
  sourceEventId: v.string(),
  sourceModuleId: v.string(),
  tenantScope: platformScopeValidator,
  tenantScopeId: v.string(),
  actorId: v.string(),
  channel: v.literal(notificationCenterChannel.inApp),
  family: notificationCenterInAppFamilyValidator,
  status: notificationCenterInAppStatusValidator,
  title: v.optional(v.string()),
  bodySummary: v.optional(v.string()),
  actionLabel: v.optional(v.string()),
  actionUrl: v.optional(v.string()),
  correlationId: v.optional(v.string()),
  correlatedEmailReceiptId: v.optional(v.string()),
  correlatedDigestRunId: v.optional(v.string()),
  readAt: v.optional(v.string()),
  dismissedAt: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
});

type NotificationCenterInAppNotificationRecordValue = ObjectType<
  typeof notificationCenterInAppRecordValidator.fields
>;

type NotificationCenterInAppNotificationDocument =
  NotificationCenterInAppNotificationRecordValue & {
    readonly _id: GenericId<"notificationCenterInAppNotifications">;
    readonly _creationTime: number;
  };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === "string";

const isoTimestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:Z|([+-])(\d{2}):(\d{2}))$/;

const isLeapYear = (year: number) =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysInMonth = (year: number, month: number) => {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
};

const isIsoTimestamp = (value: unknown): value is string => {
  if (typeof value !== "string") {
    return false;
  }

  const match = isoTimestampPattern.exec(value);

  if (match == null) {
    return false;
  }

  const year = Number.parseInt(match[1] ?? "", 10);
  const month = Number.parseInt(match[2] ?? "", 10);
  const day = Number.parseInt(match[3] ?? "", 10);
  const hour = Number.parseInt(match[4] ?? "", 10);
  const minute = Number.parseInt(match[5] ?? "", 10);
  const second = Number.parseInt(match[6] ?? "", 10);
  const offsetHour =
    match[9] == null ? undefined : Number.parseInt(match[9], 10);
  const offsetMinute =
    match[10] == null ? undefined : Number.parseInt(match[10], 10);

  if (month < 1 || month > 12) {
    return false;
  }

  if (day < 1 || day > daysInMonth(year, month)) {
    return false;
  }

  if (hour > 23 || minute > 59 || second > 59) {
    return false;
  }

  if (
    offsetHour !== undefined &&
    offsetMinute !== undefined &&
    (offsetHour > 23 || offsetMinute > 59)
  ) {
    return false;
  }

  return true;
};

const isPlatformScopeValue = (value: unknown): value is PlatformScope =>
  typeof value === "string" &&
  [
    platformScope.platform,
    platformScope.enterprise,
    platformScope.organization,
    platformScope.individual,
  ].includes(value as PlatformScope);

const isPlatformModuleIdValue = (value: unknown): value is PlatformModuleId =>
  typeof value === "string" &&
  platformModuleIds.includes(value as PlatformModuleId);

const isNotificationCenterInAppFamilyValue = (
  value: unknown,
): value is NotificationCenterNotificationFamily =>
  value === notificationCenterNotificationFamily.billingInvoiceReady;

const isNotificationCenterInAppStatusValue = (
  value: unknown,
): value is NotificationCenterInAppStatus =>
  value === notificationCenterInAppStatus.unread ||
  value === notificationCenterInAppStatus.read ||
  value === notificationCenterInAppStatus.dismissed;

const isNotificationCenterInAppNotificationDocument = (
  candidate: unknown,
): candidate is NotificationCenterInAppNotificationDocument =>
  isRecord(candidate) &&
  typeof candidate._id === "string" &&
  typeof candidate._creationTime === "number" &&
  typeof candidate.notificationId === "string" &&
  typeof candidate.sourceEventId === "string" &&
  isPlatformModuleIdValue(candidate.sourceModuleId) &&
  isPlatformScopeValue(candidate.tenantScope) &&
  typeof candidate.tenantScopeId === "string" &&
  typeof candidate.actorId === "string" &&
  candidate.channel === notificationCenterChannel.inApp &&
  isNotificationCenterInAppFamilyValue(candidate.family) &&
  isNotificationCenterInAppStatusValue(candidate.status) &&
  isOptionalString(candidate.title) &&
  isOptionalString(candidate.bodySummary) &&
  isOptionalString(candidate.actionLabel) &&
  isOptionalString(candidate.actionUrl) &&
  isOptionalString(candidate.correlationId) &&
  isOptionalString(candidate.correlatedEmailReceiptId) &&
  isOptionalString(candidate.correlatedDigestRunId) &&
  (candidate.readAt === undefined || isIsoTimestamp(candidate.readAt)) &&
  (candidate.dismissedAt === undefined ||
    isIsoTimestamp(candidate.dismissedAt)) &&
  isIsoTimestamp(candidate.createdAt) &&
  isIsoTimestamp(candidate.updatedAt);

const ensureIsoTimestamp = (value: string, errorMessage: string) => {
  if (!isIsoTimestamp(value)) {
    throw new Error(errorMessage);
  }
};

const ensureBoundedPageSize = (value: number) => {
  if (!Number.isInteger(value) || value < 1 || value > 50) {
    throw new Error(
      "Notification-center in-app listing requires a bounded integer page size between 1 and 50.",
    );
  }
};

const ensureNotificationCenterInAppIdentity = (
  ctx: NotificationCenterInAppRuntimeCtx,
  operation: string,
) =>
  Effect.tryPromise({
    try: () => ctx.auth.getUserIdentity(),
    catch: (cause) => new Error(String(cause)),
  }).pipe(
    Effect.flatMap((identity) =>
      requireWorkflowActorIdentity(identity, operation).pipe(
        Effect.mapError(toWorkflowActorIdentityBoundaryError),
      ),
    ),
  );

const toNotificationCenterInAppNotificationRecord = (
  document: NotificationCenterInAppNotificationRecordValue,
): NotificationCenterInAppNotificationRecordValue => ({
  notificationId: document.notificationId,
  sourceEventId: document.sourceEventId,
  sourceModuleId: document.sourceModuleId,
  tenantScope: document.tenantScope,
  tenantScopeId: document.tenantScopeId,
  actorId: document.actorId,
  channel: document.channel,
  family: document.family,
  status: document.status,
  ...(document.title !== undefined ? { title: document.title } : {}),
  ...(document.bodySummary !== undefined
    ? { bodySummary: document.bodySummary }
    : {}),
  ...(document.actionLabel !== undefined
    ? { actionLabel: document.actionLabel }
    : {}),
  ...(document.actionUrl !== undefined
    ? { actionUrl: document.actionUrl }
    : {}),
  ...(document.correlationId !== undefined
    ? { correlationId: document.correlationId }
    : {}),
  ...(document.correlatedEmailReceiptId !== undefined
    ? { correlatedEmailReceiptId: document.correlatedEmailReceiptId }
    : {}),
  ...(document.correlatedDigestRunId !== undefined
    ? { correlatedDigestRunId: document.correlatedDigestRunId }
    : {}),
  ...(document.readAt !== undefined ? { readAt: document.readAt } : {}),
  ...(document.dismissedAt !== undefined
    ? { dismissedAt: document.dismissedAt }
    : {}),
  createdAt: document.createdAt,
  updatedAt: document.updatedAt,
});

const findNotificationCenterInAppNotificationById = async (
  ctx: NotificationCenterInAppRuntimeCtx,
  notificationId: string,
): Promise<NotificationCenterInAppNotificationDocument | null> => {
  const notifications = await ctx.db
    .query("notificationCenterInAppNotifications")
    .filter((query) => query.eq(query.field("notificationId"), notificationId))
    .collect();

  return (
    notifications.find(
      (candidate): candidate is NotificationCenterInAppNotificationDocument =>
        isNotificationCenterInAppNotificationDocument(candidate) &&
        candidate.notificationId === notificationId,
    ) ?? null
  );
};

const listNotificationCenterInAppNotificationsForActor = async (
  ctx: NotificationCenterInAppRuntimeCtx,
  input: {
    readonly tenantScope: PlatformScope;
    readonly tenantScopeId: string;
    readonly actorId: string;
  },
) => {
  const notifications = await ctx.db
    .query("notificationCenterInAppNotifications")
    .filter((query) =>
      query.and(
        query.eq(query.field("tenantScope"), input.tenantScope),
        query.eq(query.field("tenantScopeId"), input.tenantScopeId),
        query.eq(query.field("actorId"), input.actorId),
      ),
    )
    .collect();

  return notifications
    .filter(isNotificationCenterInAppNotificationDocument)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
};

export const createInAppNotificationRecord = mutationGeneric({
  args: notificationCenterInAppRecordValidator.fields,
  returns: notificationCenterInAppRecordValidator,
  handler: async (ctx, args) => {
    await Effect.runPromise(
      ensureNotificationCenterInAppIdentity(
        ctx,
        "Notification-center in-app notification creation",
      ),
    );
    ensureIsoTimestamp(
      args.createdAt,
      "Notification-center in-app notifications require an ISO createdAt timestamp.",
    );
    ensureIsoTimestamp(
      args.updatedAt,
      "Notification-center in-app notifications require an ISO updatedAt timestamp.",
    );
    if (args.readAt !== undefined) {
      ensureIsoTimestamp(
        args.readAt,
        "Notification-center in-app notifications require an ISO readAt timestamp.",
      );
    }
    if (args.dismissedAt !== undefined) {
      ensureIsoTimestamp(
        args.dismissedAt,
        "Notification-center in-app notifications require an ISO dismissedAt timestamp.",
      );
    }

    const existingNotification =
      await findNotificationCenterInAppNotificationById(
        ctx,
        args.notificationId,
      );

    if (existingNotification !== null) {
      return toNotificationCenterInAppNotificationRecord(existingNotification);
    }

    await ctx.db.insert("notificationCenterInAppNotifications", args);

    return toNotificationCenterInAppNotificationRecord(args);
  },
});

export const getInAppNotificationRecord = queryGeneric({
  args: {
    notificationId: v.string(),
  },
  returns: v.union(notificationCenterInAppRecordValidator, v.null()),
  handler: async (ctx, args) => {
    await Effect.runPromise(
      ensureNotificationCenterInAppIdentity(
        ctx,
        "Notification-center in-app notification lookup",
      ),
    );

    const notification = await findNotificationCenterInAppNotificationById(
      ctx,
      args.notificationId,
    );

    return notification === null
      ? null
      : toNotificationCenterInAppNotificationRecord(notification);
  },
});

export const listInAppNotificationRecords = queryGeneric({
  args: {
    tenantScope: platformScopeValidator,
    tenantScopeId: v.string(),
    actorId: v.string(),
    pageSize: v.float64(),
  },
  returns: v.array(notificationCenterInAppRecordValidator),
  handler: async (ctx, args) => {
    await Effect.runPromise(
      ensureNotificationCenterInAppIdentity(
        ctx,
        "Notification-center in-app notification list",
      ),
    );
    ensureBoundedPageSize(args.pageSize);

    const notifications =
      await listNotificationCenterInAppNotificationsForActor(ctx, {
        tenantScope: args.tenantScope,
        tenantScopeId: args.tenantScopeId,
        actorId: args.actorId,
      });

    return notifications
      .slice(0, args.pageSize)
      .map(toNotificationCenterInAppNotificationRecord);
  },
});

export const markInAppNotificationRead = mutationGeneric({
  args: {
    notificationId: v.string(),
    tenantScope: platformScopeValidator,
    tenantScopeId: v.string(),
    actorId: v.string(),
    readAt: v.string(),
  },
  returns: v.union(notificationCenterInAppRecordValidator, v.null()),
  handler: async (ctx, args) => {
    await Effect.runPromise(
      ensureNotificationCenterInAppIdentity(
        ctx,
        "Notification-center in-app mark-read mutation",
      ),
    );
    ensureIsoTimestamp(
      args.readAt,
      "Notification-center in-app mark-read mutations require an ISO readAt timestamp.",
    );

    const notification = await findNotificationCenterInAppNotificationById(
      ctx,
      args.notificationId,
    );

    if (
      notification === null ||
      notification.tenantScope !== args.tenantScope ||
      notification.tenantScopeId !== args.tenantScopeId ||
      notification.actorId !== args.actorId
    ) {
      return null;
    }

    if (notification.status !== notificationCenterInAppStatus.unread) {
      return toNotificationCenterInAppNotificationRecord(notification);
    }

    const nextNotification: NotificationCenterInAppNotificationRecordValue = {
      ...toNotificationCenterInAppNotificationRecord(notification),
      status: notificationCenterInAppStatus.read,
      readAt: args.readAt,
      updatedAt: args.readAt,
    };

    await ctx.db.patch(notification._id, {
      status: nextNotification.status,
      readAt: nextNotification.readAt,
      updatedAt: nextNotification.updatedAt,
    });

    return toNotificationCenterInAppNotificationRecord(nextNotification);
  },
});

export const dismissInAppNotification = mutationGeneric({
  args: {
    notificationId: v.string(),
    tenantScope: platformScopeValidator,
    tenantScopeId: v.string(),
    actorId: v.string(),
    dismissedAt: v.string(),
  },
  returns: v.union(notificationCenterInAppRecordValidator, v.null()),
  handler: async (ctx, args) => {
    await Effect.runPromise(
      ensureNotificationCenterInAppIdentity(
        ctx,
        "Notification-center in-app dismiss mutation",
      ),
    );
    ensureIsoTimestamp(
      args.dismissedAt,
      "Notification-center in-app dismiss mutations require an ISO dismissedAt timestamp.",
    );

    const notification = await findNotificationCenterInAppNotificationById(
      ctx,
      args.notificationId,
    );

    if (
      notification === null ||
      notification.tenantScope !== args.tenantScope ||
      notification.tenantScopeId !== args.tenantScopeId ||
      notification.actorId !== args.actorId
    ) {
      return null;
    }

    if (notification.status === notificationCenterInAppStatus.dismissed) {
      return toNotificationCenterInAppNotificationRecord(notification);
    }

    const nextNotification: NotificationCenterInAppNotificationRecordValue = {
      ...toNotificationCenterInAppNotificationRecord(notification),
      status: notificationCenterInAppStatus.dismissed,
      dismissedAt: args.dismissedAt,
      updatedAt: args.dismissedAt,
    };

    await ctx.db.patch(notification._id, {
      status: nextNotification.status,
      dismissedAt: nextNotification.dismissedAt,
      updatedAt: nextNotification.updatedAt,
    });

    return toNotificationCenterInAppNotificationRecord(nextNotification);
  },
});
