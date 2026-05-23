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
 *     tests inject directly; the env-bound default Layer ships a
 *     staged pass-through stub `TODO(phase1-item16)` returning
 *     honest empty results until the notification-center module
 *     publishes its Novu-backed admin port; same staged pattern
 *     used by `workflow-runs-admin-service`). The platform
 *     service owns ALL authz + reason + attachment + audit +
 *     cache invariants ABOVE the port so swapping the underlying
 *     Novu integration never erodes the contract.
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
  notificationCenterAdminAuditAction,
  NotificationCenterAdminDetailInputSchema,
  NotificationCenterAdminListInputSchema,
  NotificationCenterAdminResendInputSchema,
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
  makePostgresAdapter,
  type PostgresAdapterConnectionError,
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
// env-bound default Layer ships a staged pass-through stub that
// returns honest empty results until the notification-center module
// publishes its Novu-backed admin port)
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

/**
 * Default {@link NotificationCenterPort} implementation.
 * TODO(phase1-item16): swap to the real Novu-backed admin port
 * once the upstream publishes the typed surface. Until then the
 * port returns honest empty results so the cache + audit + authz
 * invariants still exercise correctly and the admin console
 * renders an empty envelope rather than synthesized data.
 */
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
  readonly bounds: NotificationCenterAdminRuntimeBounds;
};

const resolveNotificationCenterAdminRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeNotificationCenterAdminProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): NotificationCenterAdminRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
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
    const adminOrgRepositoryLayer =
      makeAdminOrganizationRepositoryLayer(writeDatabase);
    const baseLayer = Layer.mergeAll(
      adminOrgRepositoryLayer,
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
      makeDefaultNotificationCenterAdminRoleLookupPortLayer.pipe(
        Layer.provide(adminOrgRepositoryLayer),
      ),
      makeDefaultNotificationCenterAdminFieldSecurityPortLayer,
      makeStubNotificationCenterPortLayer,
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
  | PostgresAdapterConnectionError;

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
