/**
 * Notification center admin envelope platform service (admin-app
 * implementation plan §9 item 16 — final Phase 1 backend gap).
 * Operator Desk surface for inspecting + resending Novu
 * notifications across channels.
 *
 * Composes:
 *
 *   - the {@link AuditLogModule} (one audit per accepted call)
 *   - an injected admin-org role-lookup port
 *     ({@link NotificationCenterAdminRoleLookupPort} — tests
 *     inject directly; the env-bound default Layer wraps
 *     `AdminOrganizationRepository.getMembershipByKeycloakSubjectId`)
 *   - an injected {@link NotificationCenterPort} (Context.Tag —
 *     tests inject directly; the env-bound default Layer now wraps
 *     the live Novu notifications/messages APIs so the Operator
 *     Desk reads and resend flow are backed by the upstream
 *     provider instead of the earlier honest-empty stub. The
 *     platform service owns ALL authz + reason + attachment +
 *     audit + cache invariants ABOVE the port so swapping the
 *     underlying Novu integration never erodes the contract.
 *
 * Owner-locked invariants enforced HERE (not in the HTTP
 * transport, not in the port):
 *
 *   - **Read authz** (`listNotifications` / `getNotificationDetail`):
 *     requires `actorType.platformOperator` OR
 *     `actorType.supportOperator` OR any admin-org membership
 *     (any role). Anonymous actors surface as
 *     {@link NotificationCenterAdminUnauthorized}.
 *   - **Write authz** (`resendNotification`): requires
 *     `actorType.platformOperator` OR `adminMemberRole.adminOwner`
 *     OR `adminMemberRole.adminAdmin`. Support operators are
 *     read-only; admin viewers/operators/etc. are denied.
 *   - **Reason catalog + attachment**: `resendNotification`
 *     decodes its supplied `reason` against
 *     `ReasonCatalogIdSchema`, enforces
 *     `validateReasonForAction(reasonId, notificationCenterAdminAuditAction.resent)`,
 *     and rejects empty/whitespace `reasonAttachmentText` because
 *     the catalog entry declares `requiresAttachment: true`.
 *   - **Bounded pagination**: every list call clamps the decoded
 *     `pageSize` at `listPageSizeMax`; `pageSize` exceeding the
 *     cap surfaces as
 *     {@link NotificationCenterAdminPageSizeTooLarge}.
 *   - **Field-security on read**: `recipientProjection`,
 *     `subjectProjection`, `lastError` (summary + detail),
 *     `payloadProjection`, and `providerMetadata` are
 *     regulated-sensitive per the manifest; values that are not
 *     visible to the requesting actor class (anything below
 *     platform-operator / support-operator) are redacted via the
 *     injected
 *     {@link NotificationCenterAdminFieldSecurityPort}.
 *   - **Bounded list cache**: keyed by
 *     `actorScope|filters|pageSize|pageToken` and bounded by
 *     `cacheMaxSize` with `cacheTtlSeconds` freshness;
 *     insertion-order eviction. Writes invalidate by clearing the
 *     entire cache (per-notification cardinality is small enough
 *     that the coarse eviction is the safest default).
 *   - **Partial failures**: per-bucket port failures degrade into
 *     `partialFailures` (mirrors universal-search +
 *     workflow-runs-admin). The aggregate only fails if the port
 *     surfaces a fatal error before any bucket completes.
 *
 * Runtime config:
 * `runNotificationCenterAdminFromEnvironment` decodes
 * `POSTGRES_URL` +
 * `NOVU_API_URL` +
 * `NOVU_API_KEY` +
 * `NOTIFICATION_CENTER_ADMIN_CACHE_MAX_SIZE` +
 * `NOTIFICATION_CENTER_ADMIN_CACHE_TTL_SECONDS` +
 * `NOTIFICATION_CENTER_ADMIN_LIST_PAGE_SIZE_MAX` at the boundary
 * with NO local fallbacks.
 */
import { and, desc, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  actorType,
  getReasonCatalogEntry,
  notificationChannel,
  notificationCenterAdminAuditAction,
  NotificationCenterAdminDetailInputSchema,
  NotificationCenterAdminListInputSchema,
  NotificationCenterAdminResendInputSchema,
  notificationDeliveryStatus,
  platformModuleId,
  reasonCatalogId,
  ReasonCatalogIdSchema,
  validateReasonForAction,
  type AuditAction,
  type NotificationCenterAdminDetailInput,
  type NotificationCenterAdminListInput,
  type NotificationCenterAdminListResult,
  type NotificationCenterAdminPartialFailure,
  type NotificationCenterAdminResendInput,
  type NotificationCenterAdminResendResult,
  type NotificationDetail,
  type NotificationSummary,
  type ReasonCatalogId,
  type RequestContext,
} from "@comvestec/contracts";
import {
  adminMemberRole,
  AdminOrganizationRepository,
  auditLogEventsTable,
  AuditLogModule,
  AuditLogPostgresRepository,
  makeAdminOrganizationRepositoryLayer,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
  type AdminMemberRole,
  type AdminOrganizationRepositoryError,
  type AdminOrganizationRepositoryService,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
} from "@comvestec/modules";
import {
  makeNovuAdapter,
  NovuAdapter,
  makePostgresAdapter,
  type NovuAdapterError,
  type NovuAdapterService,
  type NovuMessageRecord,
  type NovuNotificationEventRecord,
  type PostgresAdapterConnectionError,
  platformAdapterServiceName,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

type Operation =
  | "listNotifications"
  | "getNotificationDetail"
  | "resendNotification";

export class NotificationCenterAdminUnauthorized {
  readonly _tag = "NotificationCenterAdminUnauthorized" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly requestingActorId: string | undefined;
      readonly requestingActorType: string;
    },
  ) {}
}

export class NotificationCenterAdminMissingActorIdentity {
  readonly _tag = "NotificationCenterAdminMissingActorIdentity" as const;
  constructor(readonly args: { readonly operation: Operation }) {}
}

export class NotificationCenterAdminReasonNotInCatalog {
  readonly _tag = "NotificationCenterAdminReasonNotInCatalog" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: string;
    },
  ) {}
}

export class NotificationCenterAdminReasonActionMismatch {
  readonly _tag = "NotificationCenterAdminReasonActionMismatch" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: ReasonCatalogId;
      readonly auditAction: AuditAction;
    },
  ) {}
}

export class NotificationCenterAdminReasonAttachmentRequired {
  readonly _tag = "NotificationCenterAdminReasonAttachmentRequired" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly reasonCatalogId: ReasonCatalogId;
    },
  ) {}
}

export class NotificationCenterAdminNotificationNotFound {
  readonly _tag = "NotificationCenterAdminNotificationNotFound" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly notificationId: string;
    },
  ) {}
}

export class NotificationCenterAdminPageSizeTooLarge {
  readonly _tag = "NotificationCenterAdminPageSizeTooLarge" as const;
  constructor(
    readonly args: {
      readonly requested: number;
      readonly maximum: number;
    },
  ) {}
}

export class NotificationCenterAdminPortError {
  readonly _tag = "NotificationCenterAdminPortError" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly cause: unknown;
    },
  ) {}
}

export type NotificationCenterAdminServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | AdminOrganizationRepositoryError
  | NotificationCenterAdminUnauthorized
  | NotificationCenterAdminMissingActorIdentity
  | NotificationCenterAdminReasonNotInCatalog
  | NotificationCenterAdminReasonActionMismatch
  | NotificationCenterAdminReasonAttachmentRequired
  | NotificationCenterAdminNotificationNotFound
  | NotificationCenterAdminPageSizeTooLarge
  | NotificationCenterAdminPortError;

// ---------------------------------------------------------------------------
// NotificationCenterPort (Context.Tag — tests inject directly; the
// env-bound default Layer now wraps the live Novu notifications +
// messages APIs)
// ---------------------------------------------------------------------------

export type NotificationCenterPortListResult = {
  readonly notifications: ReadonlyArray<NotificationSummary>;
  readonly nextPageToken?: string;
  readonly partialFailures?: ReadonlyArray<NotificationCenterAdminPartialFailure>;
};

export type NotificationCenterPortService = {
  readonly listNotifications: (input: {
    readonly filters: NotificationCenterAdminListInput["filters"];
    readonly pageSize: number;
    readonly pageToken?: string;
  }) => Effect.Effect<
    NotificationCenterPortListResult,
    NotificationCenterAdminPortError
  >;
  readonly getNotificationDetail: (input: {
    readonly notificationId: string;
  }) => Effect.Effect<
    Option.Option<NotificationDetail>,
    NotificationCenterAdminPortError
  >;
  readonly resendNotification: (input: {
    readonly notificationId: string;
  }) => Effect.Effect<
    { readonly accepted: true; readonly resendNotificationId?: string },
    | NotificationCenterAdminPortError
    | NotificationCenterAdminNotificationNotFound
  >;
};

export class NotificationCenterPort extends Context.Tag(
  "NotificationCenterPort",
)<NotificationCenterPort, NotificationCenterPortService>() {}

type NotificationCenterPortCursor = {
  readonly page: number;
  readonly offset: number;
};

type NotificationCenterCompositeNotificationId = {
  readonly notificationEventId: string;
  readonly messageId: string;
};

const notificationCenterCompositeIdSeparator = "--";
const notificationCenterCursorSeparator = ":";
const novuMessagesPageSize = 50;
const novuMessagesScanPageLimit = 12;
const novuMessagesLookupPageLimit = 6;

const mapNotificationCenterPortError =
  (operation: Operation) => (cause: unknown) =>
    new NotificationCenterAdminPortError({
      operation,
      cause,
    });

const normalizeNullableString = (
  value: string | null | undefined,
): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  return value.length > 0 ? value : undefined;
};

const buildNotificationCenterCompositeNotificationId = (
  input: NotificationCenterCompositeNotificationId,
) =>
  `${input.notificationEventId}${notificationCenterCompositeIdSeparator}${input.messageId}`;

const parseNotificationCenterCompositeNotificationId = (input: {
  readonly notificationId: string;
  readonly operation: Operation;
}): Effect.Effect<
  NotificationCenterCompositeNotificationId,
  NotificationCenterAdminNotificationNotFound
> => {
  const parts = input.notificationId.split(
    notificationCenterCompositeIdSeparator,
  );
  if (
    parts.length !== 2 ||
    parts[0] === undefined ||
    parts[1] === undefined ||
    parts[0].length === 0 ||
    parts[1].length === 0
  ) {
    return Effect.fail(
      new NotificationCenterAdminNotificationNotFound({
        operation: input.operation,
        notificationId: input.notificationId,
      }),
    );
  }

  return Effect.succeed({
    notificationEventId: parts[0],
    messageId: parts[1],
  });
};

const buildNotificationCenterCursorToken = (
  cursor: NotificationCenterPortCursor,
) => `${cursor.page}${notificationCenterCursorSeparator}${cursor.offset}`;

const parseNotificationCenterCursorToken = (input: {
  readonly pageToken: string | undefined;
  readonly operation: Operation;
}): Effect.Effect<
  NotificationCenterPortCursor,
  NotificationCenterAdminPortError
> => {
  if (input.pageToken === undefined) {
    return Effect.succeed({ page: 0, offset: 0 });
  }

  const [pageText, offsetText] = input.pageToken.split(
    notificationCenterCursorSeparator,
  );
  const page = Number.parseInt(pageText ?? "", 10);
  const offset = Number.parseInt(offsetText ?? "", 10);

  if (
    !Number.isInteger(page) ||
    !Number.isInteger(offset) ||
    page < 0 ||
    offset < 0
  ) {
    return Effect.fail(
      new NotificationCenterAdminPortError({
        operation: input.operation,
        cause: new Error(
          `Invalid notification-center page token: ${input.pageToken}`,
        ),
      }),
    );
  }

  return Effect.succeed({ page, offset });
};

const resolveNotificationDeliveredAt = (
  message: NovuMessageRecord,
): string | undefined => {
  const deliveredAt = message.deliveredAt;
  if (deliveredAt === undefined || deliveredAt.length === 0) {
    return undefined;
  }

  const latest = deliveredAt[deliveredAt.length - 1];
  return latest === undefined || latest.length === 0 ? undefined : latest;
};

const mapNovuMessageChannel = (
  message: NovuMessageRecord,
): (typeof notificationChannel)[keyof typeof notificationChannel] => {
  switch (message.channel) {
    case "email":
      return notificationChannel.email;
    case "sms":
      return notificationChannel.sms;
    case "push":
      return notificationChannel.push;
    case "in_app":
      return notificationChannel.inApp;
    case "chat":
      return notificationChannel.webhook;
  }
};

const resolveNotificationDeliveryStatusFromMessage = (
  message: NovuMessageRecord,
): (typeof notificationDeliveryStatus)[keyof typeof notificationDeliveryStatus] => {
  if (message.status === "error") {
    return notificationDeliveryStatus.failed;
  }
  if (message.status === "warning") {
    return notificationDeliveryStatus.suppressed;
  }
  return resolveNotificationDeliveredAt(message) === undefined
    ? notificationDeliveryStatus.sent
    : notificationDeliveryStatus.delivered;
};

const resolveNotificationRecipientProjection = (
  message: NovuMessageRecord,
): string =>
  normalizeNullableString(message.email) ??
  normalizeNullableString(message.phone) ??
  normalizeNullableString(message.directWebhookUrl) ??
  normalizeNullableString(message.subscriber?.email ?? undefined) ??
  normalizeNullableString(message.subscriber?.phone ?? undefined) ??
  message.subscriber?.subscriberId ??
  message._subscriberId;

const resolveNotificationSubjectProjection = (
  message: NovuMessageRecord,
): string =>
  normalizeNullableString(message.subject) ??
  normalizeNullableString(message.title) ??
  normalizeNullableString(message.templateIdentifier) ??
  message._id;

const formatProjection = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  const encoded = JSON.stringify(value ?? {}, null, 2);
  return encoded === undefined ? "{}" : encoded;
};

const buildNotificationSummaryFromMessage = (
  message: NovuMessageRecord,
): NotificationSummary => {
  const deliveredAt = resolveNotificationDeliveredAt(message);
  const lastError = normalizeNullableString(message.errorText);

  return {
    notificationId: buildNotificationCenterCompositeNotificationId({
      notificationEventId: message._notificationId,
      messageId: message._id,
    }),
    channel: mapNovuMessageChannel(message),
    status: resolveNotificationDeliveryStatusFromMessage(message),
    recipientProjection: resolveNotificationRecipientProjection(message),
    subjectProjection: resolveNotificationSubjectProjection(message),
    createdAt: message.createdAt,
    ...(deliveredAt === undefined ? {} : { deliveredAt }),
    ...(lastError === undefined ? {} : { lastError }),
  };
};

const buildNotificationDetailFromMessage = (input: {
  readonly message: NovuMessageRecord;
  readonly event: NovuNotificationEventRecord;
}): NotificationDetail => {
  const summary = buildNotificationSummaryFromMessage(input.message);
  const payloadProjectionValue: Record<string, unknown> = {};
  if (input.event.payload !== undefined) {
    payloadProjectionValue.payload = input.event.payload;
  } else if (input.message.payload !== undefined) {
    payloadProjectionValue.payload = input.message.payload;
  }
  if (input.message.content !== undefined) {
    payloadProjectionValue.renderedContent = input.message.content;
  }

  const providerMetadataValue: Record<string, unknown> = {
    provider: platformAdapterServiceName.novu,
    messageId: input.message._id,
    parentNotificationId: input.message._notificationId,
    transactionId: input.message.transactionId,
  };
  const providerId = normalizeNullableString(input.message.providerId);
  if (providerId !== undefined) {
    providerMetadataValue.providerId = providerId;
  }
  const templateId = normalizeNullableString(input.message._templateId);
  if (templateId !== undefined) {
    providerMetadataValue.templateId = templateId;
  }
  const templateIdentifier = normalizeNullableString(
    input.message.templateIdentifier,
  );
  if (templateIdentifier !== undefined) {
    providerMetadataValue.templateIdentifier = templateIdentifier;
  }
  if (input.message.overrides !== undefined) {
    providerMetadataValue.overrides = input.message.overrides;
  }
  if (input.message.contextKeys !== undefined) {
    providerMetadataValue.contextKeys = input.message.contextKeys;
  } else if (input.event.contextKeys !== undefined) {
    providerMetadataValue.contextKeys = input.event.contextKeys;
  }
  const webhookUrl = normalizeNullableString(input.message.directWebhookUrl);
  if (webhookUrl !== undefined) {
    providerMetadataValue.directWebhookUrl = webhookUrl;
  }

  return {
    ...summary,
    payloadProjection: formatProjection(payloadProjectionValue),
    providerMetadata: formatProjection(providerMetadataValue),
    auditCorrelationId: input.event.transactionId,
  };
};

const hashRecipientProjection = (
  operation: Operation,
  value: string,
): Effect.Effect<string, NotificationCenterAdminPortError> =>
  Effect.tryPromise({
    try: async () => {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value.trim().toLowerCase()),
      );
      return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
    },
    catch: mapNotificationCenterPortError(operation),
  });

const resolveNovuListMessagesChannelFilter = (
  channelValue: NotificationCenterAdminListInput["filters"]["channel"],
): NovuMessageRecord["channel"] | undefined => {
  switch (channelValue) {
    case notificationChannel.email:
      return "email";
    case notificationChannel.sms:
      return "sms";
    case notificationChannel.push:
      return "push";
    case notificationChannel.inApp:
      return "in_app";
    case notificationChannel.webhook:
      return "chat";
    default:
      return undefined;
  }
};

const matchesNotificationFilters = (input: {
  readonly message: NovuMessageRecord;
  readonly filters: NotificationCenterAdminListInput["filters"];
}): Effect.Effect<boolean, NotificationCenterAdminPortError> =>
  Effect.gen(function* () {
    if (
      input.filters.channel !== undefined &&
      mapNovuMessageChannel(input.message) !== input.filters.channel
    ) {
      return false;
    }
    if (
      input.filters.status !== undefined &&
      resolveNotificationDeliveryStatusFromMessage(input.message) !==
        input.filters.status
    ) {
      return false;
    }

    const createdAtMs = Date.parse(input.message.createdAt);
    if (
      input.filters.since !== undefined &&
      (!Number.isFinite(createdAtMs) ||
        createdAtMs < Date.parse(input.filters.since))
    ) {
      return false;
    }
    if (
      input.filters.until !== undefined &&
      (!Number.isFinite(createdAtMs) ||
        createdAtMs > Date.parse(input.filters.until))
    ) {
      return false;
    }

    if (input.filters.recipientHash !== undefined) {
      const recipientHash = yield* hashRecipientProjection(
        "listNotifications",
        resolveNotificationRecipientProjection(input.message),
      );
      if (recipientHash !== input.filters.recipientHash) {
        return false;
      }
    }

    return true;
  });

const buildContextFromContextKeys = (
  contextKeys: ReadonlyArray<string> | undefined,
): Record<string, string> | undefined => {
  if (contextKeys === undefined || contextKeys.length === 0) {
    return undefined;
  }

  const context: Record<string, string> = {};
  for (const key of contextKeys) {
    const separatorIndex = key.indexOf(":");
    if (separatorIndex <= 0 || separatorIndex === key.length - 1) {
      continue;
    }
    context[key.slice(0, separatorIndex)] = key.slice(separatorIndex + 1);
  }

  return Object.keys(context).length === 0 ? undefined : context;
};

const loadNotificationCenterMessageRecord = (input: {
  readonly novuAdapter: NovuAdapterService;
  readonly notificationId: string;
  readonly operation: Operation;
}): Effect.Effect<
  {
    readonly event: NovuNotificationEventRecord;
    readonly message: NovuMessageRecord;
  },
  NotificationCenterAdminPortError | NotificationCenterAdminNotificationNotFound
> =>
  Effect.gen(function* () {
    const composite = yield* parseNotificationCenterCompositeNotificationId({
      notificationId: input.notificationId,
      operation: input.operation,
    });
    const event = yield* input.novuAdapter
      .getNotification({ notificationId: composite.notificationEventId })
      .pipe(Effect.mapError(mapNotificationCenterPortError(input.operation)));

    if (Option.isNone(event)) {
      return yield* Effect.fail(
        new NotificationCenterAdminNotificationNotFound({
          operation: input.operation,
          notificationId: input.notificationId,
        }),
      );
    }

    let page = 0;
    for (
      let lookupPage = 0;
      lookupPage < novuMessagesLookupPageLimit;
      lookupPage += 1
    ) {
      const messagePage = yield* input.novuAdapter
        .listMessages({
          transactionIds: [event.value.transactionId],
          page,
          limit: novuMessagesPageSize,
        })
        .pipe(Effect.mapError(mapNotificationCenterPortError(input.operation)));

      const message = messagePage.data.find(
        (candidate) =>
          candidate._id === composite.messageId &&
          candidate._notificationId === composite.notificationEventId,
      );
      if (message !== undefined) {
        return { event: event.value, message };
      }

      if (!messagePage.hasMore) {
        break;
      }
      page += 1;
    }

    return yield* Effect.fail(
      new NotificationCenterAdminNotificationNotFound({
        operation: input.operation,
        notificationId: input.notificationId,
      }),
    );
  });

/**
 * Default {@link NotificationCenterPort} implementation backed by
 * the live Novu notifications/messages APIs. The port translates
 * upstream event + message payloads into the admin contract while
 * keeping provider-specific pagination and resend details below the
 * platform-service boundary.
 */
export const makeDefaultNotificationCenterPort = (
  novuAdapter: NovuAdapterService,
): NotificationCenterPortService => ({
  listNotifications: (input) =>
    Effect.gen(function* () {
      const startCursor = yield* parseNotificationCenterCursorToken({
        pageToken: input.pageToken,
        operation: "listNotifications",
      });
      const notifications: NotificationSummary[] = [];
      let page = startCursor.page;
      let offset = startCursor.offset;
      let morePagesAvailable = false;

      for (let scan = 0; scan < novuMessagesScanPageLimit; scan += 1) {
        const messagePage = yield* novuAdapter
          .listMessages({
            ...(resolveNovuListMessagesChannelFilter(input.filters.channel) ===
            undefined
              ? {}
              : {
                  channel: resolveNovuListMessagesChannelFilter(
                    input.filters.channel,
                  ),
                }),
            page,
            limit: novuMessagesPageSize,
          })
          .pipe(
            Effect.mapError(
              mapNotificationCenterPortError("listNotifications"),
            ),
          );

        for (let index = offset; index < messagePage.data.length; index += 1) {
          const message = messagePage.data[index];
          if (message === undefined) {
            continue;
          }
          const matches = yield* matchesNotificationFilters({
            message,
            filters: input.filters,
          });
          if (!matches) {
            continue;
          }

          notifications.push(buildNotificationSummaryFromMessage(message));
          if (notifications.length >= input.pageSize) {
            const nextCursor =
              index + 1 < messagePage.data.length
                ? { page, offset: index + 1 }
                : messagePage.hasMore
                  ? { page: page + 1, offset: 0 }
                  : undefined;

            return {
              notifications,
              ...(nextCursor === undefined
                ? {}
                : {
                    nextPageToken:
                      buildNotificationCenterCursorToken(nextCursor),
                  }),
            } satisfies NotificationCenterPortListResult;
          }
        }

        if (!messagePage.hasMore) {
          return {
            notifications,
          } satisfies NotificationCenterPortListResult;
        }

        morePagesAvailable = true;
        page += 1;
        offset = 0;
      }

      return {
        notifications,
        ...(morePagesAvailable
          ? {
              nextPageToken: buildNotificationCenterCursorToken({
                page,
                offset: 0,
              }),
            }
          : {}),
        ...(morePagesAvailable
          ? {
              partialFailures: [
                {
                  bucket: "novu.messages.pagination",
                  reason:
                    "Notification list scanning stopped before exhausting all upstream Novu pages.",
                },
              ] as ReadonlyArray<NotificationCenterAdminPartialFailure>,
            }
          : {}),
      } satisfies NotificationCenterPortListResult;
    }),
  getNotificationDetail: (input) =>
    loadNotificationCenterMessageRecord({
      novuAdapter,
      notificationId: input.notificationId,
      operation: "getNotificationDetail",
    }).pipe(
      Effect.map((resolved) =>
        Option.some(
          buildNotificationDetailFromMessage({
            message: resolved.message,
            event: resolved.event,
          }),
        ),
      ),
      Effect.catchTag("NotificationCenterAdminNotificationNotFound", () =>
        Effect.succeed(Option.none<NotificationDetail>()),
      ),
    ),
  resendNotification: (input) =>
    Effect.gen(function* () {
      const resolved = yield* loadNotificationCenterMessageRecord({
        novuAdapter,
        notificationId: input.notificationId,
        operation: "resendNotification",
      });
      const triggerIdentifier =
        normalizeNullableString(resolved.message.templateIdentifier) ??
        resolved.event.template?.triggers[0]?.identifier;
      if (triggerIdentifier === undefined) {
        return yield* Effect.fail(
          new NotificationCenterAdminPortError({
            operation: "resendNotification",
            cause: new Error(
              `No trigger identifier was available for ${input.notificationId}.`,
            ),
          }),
        );
      }

      const subscriberId =
        resolved.event.subscriber?.subscriberId ??
        resolved.message.subscriber?.subscriberId ??
        resolved.message._subscriberId;
      const resendEmail =
        normalizeNullableString(resolved.event.subscriber?.email) ??
        normalizeNullableString(resolved.message.email);
      const resendPhone =
        normalizeNullableString(resolved.event.subscriber?.phone) ??
        normalizeNullableString(resolved.message.phone);
      const resendTarget =
        resolved.event.to ??
        (resendEmail === undefined && resendPhone === undefined
          ? subscriberId
          : {
              subscriberId,
              ...(resendEmail === undefined ? {} : { email: resendEmail }),
              ...(resendPhone === undefined ? {} : { phone: resendPhone }),
            });
      const resendContext = buildContextFromContextKeys(
        resolved.event.contextKeys ?? resolved.message.contextKeys,
      );

      const resent = yield* novuAdapter
        .triggerEvent({
          name: triggerIdentifier,
          to: resendTarget,
          ...(resolved.event.payload === undefined
            ? resolved.message.payload === undefined
              ? {}
              : { payload: resolved.message.payload }
            : { payload: resolved.event.payload }),
          ...(resolved.message.overrides === undefined
            ? {}
            : { overrides: resolved.message.overrides }),
          ...(resendContext === undefined ? {} : { context: resendContext }),
          transactionId: `${resolved.event.transactionId}-resend-${crypto.randomUUID()}`,
        })
        .pipe(
          Effect.mapError(mapNotificationCenterPortError("resendNotification")),
        );

      return {
        accepted: true as const,
        resendNotificationId: resent.id,
      };
    }),
});

export const makeDefaultNotificationCenterPortLayer = Layer.effect(
  NotificationCenterPort,
  NovuAdapter.pipe(Effect.map(makeDefaultNotificationCenterPort)),
);

export const makeStubNotificationCenterPort =
  (): NotificationCenterPortService => ({
    listNotifications: () =>
      Effect.succeed({
        notifications: [] as ReadonlyArray<NotificationSummary>,
      }),
    getNotificationDetail: () =>
      Effect.succeed(Option.none<NotificationDetail>()),
    resendNotification: (input) =>
      Effect.fail(
        new NotificationCenterAdminNotificationNotFound({
          operation: "resendNotification",
          notificationId: input.notificationId,
        }),
      ),
  });

export const makeStubNotificationCenterPortLayer = Layer.succeed(
  NotificationCenterPort,
  makeStubNotificationCenterPort(),
);

// ---------------------------------------------------------------------------
// Admin-org role-lookup port (mirrors workflow-runs-admin)
// ---------------------------------------------------------------------------

export type NotificationCenterAdminRoleLookupResult = {
  readonly role: AdminMemberRole | undefined;
};

export type NotificationCenterAdminRoleLookupPortService = {
  readonly lookupRole: (input: {
    readonly actorId: string;
  }) => Effect.Effect<
    NotificationCenterAdminRoleLookupResult,
    AdminOrganizationRepositoryError
  >;
};

export class NotificationCenterAdminRoleLookupPort extends Context.Tag(
  "NotificationCenterAdminRoleLookupPort",
)<
  NotificationCenterAdminRoleLookupPort,
  NotificationCenterAdminRoleLookupPortService
>() {}

export const makeDefaultNotificationCenterAdminRoleLookupPort = (
  repository: AdminOrganizationRepositoryService,
): NotificationCenterAdminRoleLookupPortService => ({
  lookupRole: (input) =>
    repository.getMembershipByKeycloakSubjectId(input.actorId).pipe(
      Effect.map((opt) => ({
        role: Option.isSome(opt) ? opt.value.role : undefined,
      })),
    ),
});

export const makeDefaultNotificationCenterAdminRoleLookupPortLayer =
  Layer.effect(
    NotificationCenterAdminRoleLookupPort,
    Effect.gen(function* () {
      const repository = yield* AdminOrganizationRepository;
      return makeDefaultNotificationCenterAdminRoleLookupPort(repository);
    }),
  );

// ---------------------------------------------------------------------------
// Field-security port (regulated-sensitive redaction)
// ---------------------------------------------------------------------------

export type NotificationCenterAdminFieldSecurityPortService = {
  readonly redactRegulatedSensitive: (actorTypeValue: string) => boolean;
};

export class NotificationCenterAdminFieldSecurityPort extends Context.Tag(
  "NotificationCenterAdminFieldSecurityPort",
)<
  NotificationCenterAdminFieldSecurityPort,
  NotificationCenterAdminFieldSecurityPortService
>() {}

export const makeDefaultNotificationCenterAdminFieldSecurityPort =
  (): NotificationCenterAdminFieldSecurityPortService => ({
    /**
     * Returns `true` when the requesting actor class is NOT
     * permitted to see `regulated-sensitive` values per the
     * field-security invariant — i.e. anyone outside of
     * platform-operator / support-operator.
     */
    redactRegulatedSensitive: (actorTypeValue) =>
      actorTypeValue !== actorType.platformOperator &&
      actorTypeValue !== actorType.supportOperator,
  });

export const makeDefaultNotificationCenterAdminFieldSecurityPortLayer =
  Layer.succeed(
    NotificationCenterAdminFieldSecurityPort,
    makeDefaultNotificationCenterAdminFieldSecurityPort(),
  );

// ---------------------------------------------------------------------------
// Decoders
// ---------------------------------------------------------------------------

const decodeListInput = Schema.decodeUnknown(
  NotificationCenterAdminListInputSchema,
);
const decodeDetailInput = Schema.decodeUnknown(
  NotificationCenterAdminDetailInputSchema,
);
const decodeResendInput = Schema.decodeUnknown(
  NotificationCenterAdminResendInputSchema,
);
const decodeReasonCatalogIdValue = Schema.decodeUnknown(ReasonCatalogIdSchema);

// ---------------------------------------------------------------------------
// Authz helpers
// ---------------------------------------------------------------------------

const requireReadActor = (
  requestContext: RequestContext,
  operation: Operation,
  roleLookupPort: NotificationCenterAdminRoleLookupPortService,
) =>
  Effect.gen(function* () {
    if (
      requestContext.actorType === actorType.anonymous ||
      requestContext.actorId === undefined
    ) {
      return yield* Effect.fail(
        new NotificationCenterAdminUnauthorized({
          operation,
          requestingActorId: requestContext.actorId,
          requestingActorType: requestContext.actorType,
        }),
      );
    }
    if (
      requestContext.actorType === actorType.platformOperator ||
      requestContext.actorType === actorType.supportOperator
    ) {
      return requestContext.actorId;
    }
    const lookup = yield* roleLookupPort.lookupRole({
      actorId: requestContext.actorId,
    });
    if (lookup.role === undefined) {
      return yield* Effect.fail(
        new NotificationCenterAdminUnauthorized({
          operation,
          requestingActorId: requestContext.actorId,
          requestingActorType: requestContext.actorType,
        }),
      );
    }
    return requestContext.actorId;
  });

const isWriteAllowedAdminRole = (role: AdminMemberRole): boolean =>
  role === adminMemberRole.adminOwner || role === adminMemberRole.adminAdmin;

const requireWriteActor = (
  requestContext: RequestContext,
  operation: Operation,
  roleLookupPort: NotificationCenterAdminRoleLookupPortService,
) =>
  Effect.gen(function* () {
    if (
      requestContext.actorType === actorType.anonymous ||
      requestContext.actorId === undefined
    ) {
      return yield* Effect.fail(
        new NotificationCenterAdminUnauthorized({
          operation,
          requestingActorId: requestContext.actorId,
          requestingActorType: requestContext.actorType,
        }),
      );
    }
    if (requestContext.actorType === actorType.platformOperator) {
      return requestContext.actorId;
    }
    const lookup = yield* roleLookupPort.lookupRole({
      actorId: requestContext.actorId,
    });
    if (lookup.role === undefined || !isWriteAllowedAdminRole(lookup.role)) {
      return yield* Effect.fail(
        new NotificationCenterAdminUnauthorized({
          operation,
          requestingActorId: requestContext.actorId,
          requestingActorType: requestContext.actorType,
        }),
      );
    }
    return requestContext.actorId;
  });

// ---------------------------------------------------------------------------
// Reason helpers
// ---------------------------------------------------------------------------

const validateReason = (
  operation: Operation,
  value: string,
  action: AuditAction,
): Effect.Effect<
  ReasonCatalogId,
  | NotificationCenterAdminReasonNotInCatalog
  | NotificationCenterAdminReasonActionMismatch
> =>
  decodeReasonCatalogIdValue(value).pipe(
    Effect.catchTag("ParseError", () =>
      Effect.fail(
        new NotificationCenterAdminReasonNotInCatalog({
          operation,
          reasonCatalogId: value,
        }),
      ),
    ),
    Effect.flatMap((decoded) => {
      if (!validateReasonForAction(decoded, action)) {
        return Effect.fail(
          new NotificationCenterAdminReasonActionMismatch({
            operation,
            reasonCatalogId: decoded,
            auditAction: action,
          }),
        );
      }
      return Effect.succeed(decoded);
    }),
  );

const requireAttachmentIfNeeded = (
  operation: Operation,
  reasonId: ReasonCatalogId,
  attachmentText: string | undefined,
): Effect.Effect<void, NotificationCenterAdminReasonAttachmentRequired> => {
  const entry = getReasonCatalogEntry(reasonId);
  if (Option.isNone(entry) || !entry.value.requiresAttachment) {
    return Effect.void;
  }
  if (attachmentText === undefined || attachmentText.trim().length === 0) {
    return Effect.fail(
      new NotificationCenterAdminReasonAttachmentRequired({
        operation,
        reasonCatalogId: reasonId,
      }),
    );
  }
  return Effect.void;
};

// ---------------------------------------------------------------------------
// Bounded list cache (insertion-order eviction)
// ---------------------------------------------------------------------------

type CacheEntry = {
  readonly value: NotificationCenterAdminListResult;
  readonly cachedAtMs: number;
};

type ListCache = {
  readonly get: (key: string) => CacheEntry | undefined;
  readonly set: (key: string, entry: CacheEntry) => void;
  readonly clear: () => void;
  readonly size: () => number;
};

const createListCache = (maxSize: number): ListCache => {
  const store = new Map<string, CacheEntry>();
  return {
    get: (key) => store.get(key),
    set: (key, entry) => {
      if (store.has(key)) {
        store.delete(key);
      } else if (store.size >= maxSize) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) {
          store.delete(oldest);
        }
      }
      store.set(key, entry);
    },
    clear: () => {
      store.clear();
    },
    size: () => store.size,
  };
};

const buildListCacheKey = (input: {
  readonly requestContext: RequestContext;
  readonly filters: NotificationCenterAdminListInput["filters"];
  readonly pageSize: number;
  readonly pageToken: string | undefined;
}): string =>
  [
    input.requestContext.tenant.scope,
    input.requestContext.tenant.scopeId,
    input.filters.channel ?? "-",
    input.filters.status ?? "-",
    input.filters.recipientHash ?? "-",
    input.filters.since ?? "-",
    input.filters.until ?? "-",
    input.pageSize,
    input.pageToken ?? "-",
  ].join("|");

const isFresh = (cachedAtMs: number, nowMs: number, ttlSeconds: number) =>
  nowMs - cachedAtMs < ttlSeconds * 1000;

// ---------------------------------------------------------------------------
// Field-security redactors
// ---------------------------------------------------------------------------

const REDACTED_TEXT = "[redacted]" as const;

const redactSummary = (
  summary: NotificationSummary,
  shouldRedact: boolean,
): NotificationSummary =>
  shouldRedact
    ? {
        ...summary,
        recipientProjection: REDACTED_TEXT,
        subjectProjection: REDACTED_TEXT,
        ...(summary.lastError === undefined
          ? {}
          : { lastError: REDACTED_TEXT }),
      }
    : summary;

const redactDetail = (
  detail: NotificationDetail,
  shouldRedact: boolean,
): NotificationDetail =>
  shouldRedact
    ? {
        ...detail,
        recipientProjection: REDACTED_TEXT,
        subjectProjection: REDACTED_TEXT,
        payloadProjection: REDACTED_TEXT,
        providerMetadata: REDACTED_TEXT,
        ...(detail.lastError === undefined ? {} : { lastError: REDACTED_TEXT }),
      }
    : detail;

// ---------------------------------------------------------------------------
// Service tag + impl
// ---------------------------------------------------------------------------

export type NotificationCenterAdminListView = {
  readonly result: NotificationCenterAdminListResult;
  readonly fromCache: boolean;
};

export type NotificationCenterAdminDetailView = {
  readonly detail: Option.Option<NotificationDetail>;
};

export type NotificationCenterAdminServiceImpl = {
  readonly listNotifications: (
    input: NotificationCenterAdminListInput,
  ) => Effect.Effect<
    NotificationCenterAdminListView,
    NotificationCenterAdminServiceError
  >;
  readonly getNotificationDetail: (
    input: NotificationCenterAdminDetailInput,
  ) => Effect.Effect<
    NotificationCenterAdminDetailView,
    NotificationCenterAdminServiceError
  >;
  readonly resendNotification: (
    input: NotificationCenterAdminResendInput,
  ) => Effect.Effect<
    NotificationCenterAdminResendResult,
    NotificationCenterAdminServiceError
  >;
};

export class NotificationCenterAdminService extends Context.Tag(
  "NotificationCenterAdminService",
)<NotificationCenterAdminService, NotificationCenterAdminServiceImpl>() {}

export type NotificationCenterAdminRuntimeBounds = {
  readonly cacheMaxSize: number;
  readonly cacheTtlSeconds: number;
  readonly listPageSizeMax: number;
};

export type NotificationCenterAdminServiceDependencies = {
  readonly auditLog: AuditLogModuleService;
  readonly notificationCenterPort: NotificationCenterPortService;
  readonly roleLookupPort: NotificationCenterAdminRoleLookupPortService;
  readonly fieldSecurityPort: NotificationCenterAdminFieldSecurityPortService;
  readonly bounds: NotificationCenterAdminRuntimeBounds;
  readonly now?: () => Date;
};

export const makeNotificationCenterAdminService = (
  deps: NotificationCenterAdminServiceDependencies,
): NotificationCenterAdminServiceImpl => {
  const {
    auditLog,
    notificationCenterPort,
    roleLookupPort,
    fieldSecurityPort,
    bounds,
  } = deps;
  const nowFn = deps.now ?? (() => new Date());
  const cache = createListCache(Math.max(1, bounds.cacheMaxSize));

  const listNotifications: NotificationCenterAdminServiceImpl["listNotifications"] =
    (input) =>
      Effect.gen(function* () {
        const decoded = yield* decodeListInput(input);
        if (decoded.pageSize > bounds.listPageSizeMax) {
          return yield* Effect.fail(
            new NotificationCenterAdminPageSizeTooLarge({
              requested: decoded.pageSize,
              maximum: bounds.listPageSizeMax,
            }),
          );
        }
        yield* requireReadActor(
          decoded.requestContext,
          "listNotifications",
          roleLookupPort,
        );

        const cacheKey = buildListCacheKey({
          requestContext: decoded.requestContext,
          filters: decoded.filters,
          pageSize: decoded.pageSize,
          pageToken: decoded.pageToken,
        });
        const nowMs = nowFn().getTime();
        const shouldRedact = fieldSecurityPort.redactRegulatedSensitive(
          decoded.requestContext.actorType,
        );

        const cached = cache.get(cacheKey);
        if (cached !== undefined) {
          if (isFresh(cached.cachedAtMs, nowMs, bounds.cacheTtlSeconds)) {
            yield* auditLog.append({
              requestContext: decoded.requestContext,
              moduleId: platformModuleId.notificationCenterAdmin,
              action: notificationCenterAdminAuditAction.listed,
              target: `pageSize:${decoded.pageSize}`,
              reason: reasonCatalogId.notificationCenterAdminResend,
            });
            return { result: cached.value, fromCache: true } as const;
          }
        }

        const portResult = yield* notificationCenterPort.listNotifications({
          filters: decoded.filters,
          pageSize: decoded.pageSize,
          ...(decoded.pageToken === undefined
            ? {}
            : { pageToken: decoded.pageToken }),
        });

        const redactedNotifications = portResult.notifications.map((summary) =>
          redactSummary(summary, shouldRedact),
        );
        const result: NotificationCenterAdminListResult = {
          notifications: redactedNotifications,
          ...(portResult.nextPageToken === undefined
            ? {}
            : { nextPageToken: portResult.nextPageToken }),
          ...(portResult.partialFailures === undefined ||
          portResult.partialFailures.length === 0
            ? {}
            : { partialFailures: portResult.partialFailures }),
        };

        cache.set(cacheKey, { value: result, cachedAtMs: nowMs });
        yield* auditLog.append({
          requestContext: decoded.requestContext,
          moduleId: platformModuleId.notificationCenterAdmin,
          action: notificationCenterAdminAuditAction.listed,
          target: `pageSize:${decoded.pageSize}`,
          reason: reasonCatalogId.notificationCenterAdminResend,
        });
        return { result, fromCache: false } as const;
      });

  const getNotificationDetail: NotificationCenterAdminServiceImpl["getNotificationDetail"] =
    (input) =>
      Effect.gen(function* () {
        const decoded = yield* decodeDetailInput(input);
        yield* requireReadActor(
          decoded.requestContext,
          "getNotificationDetail",
          roleLookupPort,
        );

        const shouldRedact = fieldSecurityPort.redactRegulatedSensitive(
          decoded.requestContext.actorType,
        );
        const detail = yield* notificationCenterPort.getNotificationDetail({
          notificationId: decoded.notificationId,
        });

        yield* auditLog.append({
          requestContext: decoded.requestContext,
          moduleId: platformModuleId.notificationCenterAdmin,
          action: notificationCenterAdminAuditAction.detailRead,
          target: decoded.notificationId,
          reason: reasonCatalogId.notificationCenterAdminResend,
        });

        return {
          detail: Option.map(detail, (d) => redactDetail(d, shouldRedact)),
        } as const;
      });

  const resendNotification: NotificationCenterAdminServiceImpl["resendNotification"] =
    (input) =>
      Effect.gen(function* () {
        const decoded = yield* decodeResendInput(input);
        yield* requireWriteActor(
          decoded.requestContext,
          "resendNotification",
          roleLookupPort,
        );
        const validatedReason = yield* validateReason(
          "resendNotification",
          decoded.reason,
          notificationCenterAdminAuditAction.resent,
        );
        yield* requireAttachmentIfNeeded(
          "resendNotification",
          validatedReason,
          decoded.reasonAttachmentText,
        );

        const portResult = yield* notificationCenterPort.resendNotification({
          notificationId: decoded.notificationId,
        });

        cache.clear();
        yield* auditLog.append({
          requestContext: {
            ...decoded.requestContext,
            reason: validatedReason,
          },
          moduleId: platformModuleId.notificationCenterAdmin,
          action: notificationCenterAdminAuditAction.resent,
          target: decoded.notificationId,
          reason: validatedReason,
        });

        const resent: NotificationCenterAdminResendResult = {
          accepted: true as const,
          notificationId: decoded.notificationId,
          ...(portResult.resendNotificationId === undefined
            ? {}
            : { resendNotificationId: portResult.resendNotificationId }),
        };
        return resent;
      });

  return { listNotifications, getNotificationDetail, resendNotification };
};

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const makeNotificationCenterAdminServiceLayer = (deps: {
  readonly bounds: NotificationCenterAdminRuntimeBounds;
}) =>
  Layer.effect(
    NotificationCenterAdminService,
    Effect.gen(function* () {
      const auditLog = yield* AuditLogModule;
      const notificationCenterPort = yield* NotificationCenterPort;
      const roleLookupPort = yield* NotificationCenterAdminRoleLookupPort;
      const fieldSecurityPort = yield* NotificationCenterAdminFieldSecurityPort;
      return makeNotificationCenterAdminService({
        auditLog,
        notificationCenterPort,
        roleLookupPort,
        fieldSecurityPort,
        bounds: deps.bounds,
      });
    }),
  );

// ---------------------------------------------------------------------------
// Env-bound runtime loader
// ---------------------------------------------------------------------------

const NotificationCenterAdminProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  NOVU_API_URL: Schema.NonEmptyString,
  NOVU_API_KEY: Schema.NonEmptyString,
  NOTIFICATION_CENTER_ADMIN_CACHE_MAX_SIZE: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  NOTIFICATION_CENTER_ADMIN_CACHE_TTL_SECONDS: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  NOTIFICATION_CENTER_ADMIN_LIST_PAGE_SIZE_MAX: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
});

const decodeNotificationCenterAdminProcessEnvironment = Schema.decodeUnknown(
  NotificationCenterAdminProcessEnvironmentSchema,
);

export type NotificationCenterAdminRuntimeOptions = {
  readonly postgresUrl: string;
  readonly novu: {
    readonly apiUrl: string;
    readonly apiKey: string;
  };
  readonly bounds: NotificationCenterAdminRuntimeBounds;
};

const resolveNotificationCenterAdminRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeNotificationCenterAdminProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): NotificationCenterAdminRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
        novu: {
          apiUrl: resolved.NOVU_API_URL,
          apiKey: resolved.NOVU_API_KEY,
        },
        bounds: {
          cacheMaxSize: resolved.NOTIFICATION_CENTER_ADMIN_CACHE_MAX_SIZE,
          cacheTtlSeconds: resolved.NOTIFICATION_CENTER_ADMIN_CACHE_TTL_SECONDS,
          listPageSizeMax:
            resolved.NOTIFICATION_CENTER_ADMIN_LIST_PAGE_SIZE_MAX,
        },
      }),
    ),
  );

const makeNotificationCenterAdminRuntime = (
  options: NotificationCenterAdminRuntimeOptions,
) =>
  Effect.gen(function* () {
    const postgres = yield* makePostgresAdapter({
      connectionString: options.postgresUrl,
    });
    const writeDatabase = buildWriteDatabase(postgres.database);
    const auditLogQueryable: AuditLogPostgresQueryable = {
      listEventsByModule: (moduleId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.moduleId, moduleId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTarget: (input) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(
            and(
              eq(auditLogEventsTable.moduleId, input.moduleId),
              eq(auditLogEventsTable.target, input.target),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByActor: (actorId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.actorId, actorId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTenant: (input) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(
            and(
              eq(auditLogEventsTable.tenantScope, input.tenantScope),
              eq(auditLogEventsTable.tenantScopeId, input.tenantScopeId),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt)),
    };
    const auditLogRepository = yield* makeAuditLogPostgresRepository({
      ...writeDatabase,
      ...auditLogQueryable,
    });
    const auditLog = yield* makeAuditLogModule(auditLogRepository);
    const novuAdapter = yield* makeNovuAdapter({
      apiUrl: options.novu.apiUrl,
      apiKey: options.novu.apiKey,
    });
    const adminOrgRepositoryLayer =
      makeAdminOrganizationRepositoryLayer(writeDatabase);
    const novuAdapterLayer = Layer.succeed(NovuAdapter, novuAdapter);
    const baseLayer = Layer.mergeAll(
      adminOrgRepositoryLayer,
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
      makeDefaultNotificationCenterAdminRoleLookupPortLayer.pipe(
        Layer.provide(adminOrgRepositoryLayer),
      ),
      makeDefaultNotificationCenterAdminFieldSecurityPortLayer,
      makeDefaultNotificationCenterPortLayer.pipe(
        Layer.provide(novuAdapterLayer),
      ),
    );
    const serviceLayer = makeNotificationCenterAdminServiceLayer({
      bounds: options.bounds,
    }).pipe(Layer.provide(baseLayer));
    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type NotificationCenterAdminRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError
  | NovuAdapterError;

export const runNotificationCenterAdminFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: NotificationCenterAdminServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | NotificationCenterAdminRuntimeError> =>
  resolveNotificationCenterAdminRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeNotificationCenterAdminRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(NotificationCenterAdminService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  ) as Effect.Effect<A, E | NotificationCenterAdminRuntimeError>;
