import { Effect, ParseResult, Schema } from "effect";
import {
  type CreateNotificationCenterInAppNotificationInput,
  CreateNotificationCenterInAppNotificationInputSchema,
  type NotificationCenterInAppNotificationRecord,
  type NotificationCenterInAppNotificationSummaryView,
  NotificationCenterInAppNotificationReferenceSchema,
  NotificationCenterInAppNotificationSummaryViewListSchema,
  NotificationCenterInAppNotificationSummaryViewSchema,
  RequestContextSchema,
} from "@comvestec/contracts";
import {
  type NotificationCenterInAppModuleError,
  NotificationCenterInAppModule,
  makeNotificationCenterInAppModule,
} from "@comvestec/modules";
import {
  ConvexNotificationCenterInAppAdapter,
  makeConvexNotificationCenterInAppAdapter,
} from "../../adapters";

const notificationCenterInAppPageSizeDefault = 25;
const notificationCenterInAppPageSizeMaximum = 50;

export const EmitNotificationCenterInAppNotificationRequestSchema =
  Schema.Struct({
    sourceEventId:
      CreateNotificationCenterInAppNotificationInputSchema.fields.sourceEventId,
    sourceModuleId:
      CreateNotificationCenterInAppNotificationInputSchema.fields
        .sourceModuleId,
    tenantScope:
      CreateNotificationCenterInAppNotificationInputSchema.fields.tenantScope,
    tenantScopeId:
      CreateNotificationCenterInAppNotificationInputSchema.fields.tenantScopeId,
    actorId:
      CreateNotificationCenterInAppNotificationInputSchema.fields.actorId,
    family: CreateNotificationCenterInAppNotificationInputSchema.fields.family,
    title: CreateNotificationCenterInAppNotificationInputSchema.fields.title,
    bodySummary:
      CreateNotificationCenterInAppNotificationInputSchema.fields.bodySummary,
    actionLabel:
      CreateNotificationCenterInAppNotificationInputSchema.fields.actionLabel,
    actionUrl:
      CreateNotificationCenterInAppNotificationInputSchema.fields.actionUrl,
    correlationId:
      CreateNotificationCenterInAppNotificationInputSchema.fields.correlationId,
    correlatedEmailReceiptId:
      CreateNotificationCenterInAppNotificationInputSchema.fields
        .correlatedEmailReceiptId,
    correlatedDigestRunId:
      CreateNotificationCenterInAppNotificationInputSchema.fields
        .correlatedDigestRunId,
  });

export type EmitNotificationCenterInAppNotificationRequest = Schema.Schema.Type<
  typeof EmitNotificationCenterInAppNotificationRequestSchema
>;

export const ListCurrentActorInAppNotificationsRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  pageSize: Schema.optional(Schema.Number),
});

export type ListCurrentActorInAppNotificationsRequest = Schema.Schema.Type<
  typeof ListCurrentActorInAppNotificationsRequestSchema
>;

const CurrentActorInAppNotificationMutationRequestSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  notificationId:
    NotificationCenterInAppNotificationReferenceSchema.fields.notificationId,
});

export type MarkCurrentActorInAppNotificationReadRequest = Schema.Schema.Type<
  typeof CurrentActorInAppNotificationMutationRequestSchema
>;

export type DismissCurrentActorInAppNotificationRequest = Schema.Schema.Type<
  typeof CurrentActorInAppNotificationMutationRequestSchema
>;

export type NotificationCenterInAppCurrentActorRequiredError = {
  readonly _tag: "NotificationCenterInAppCurrentActorRequiredError";
};

export type NotificationCenterInAppNotificationNotFoundError = {
  readonly _tag: "NotificationCenterInAppNotificationNotFoundError";
  readonly notificationId: string;
};

export type NotificationCenterInAppRuntimeError = {
  readonly _tag: "NotificationCenterInAppRuntimeError";
  readonly cause: unknown;
};

export type NotificationCenterInAppServiceError =
  | ParseResult.ParseError
  | NotificationCenterInAppModuleError
  | NotificationCenterInAppCurrentActorRequiredError
  | NotificationCenterInAppNotificationNotFoundError;

export type NotificationCenterInAppService = {
  readonly emitInAppNotification: (
    input: EmitNotificationCenterInAppNotificationRequest,
  ) => Effect.Effect<
    NotificationCenterInAppNotificationRecord,
    NotificationCenterInAppServiceError
  >;
  readonly listCurrentActorInAppNotifications: (
    input: ListCurrentActorInAppNotificationsRequest,
  ) => Effect.Effect<
    readonly NotificationCenterInAppNotificationSummaryView[],
    NotificationCenterInAppServiceError
  >;
  readonly markCurrentActorInAppNotificationRead: (
    input: MarkCurrentActorInAppNotificationReadRequest,
  ) => Effect.Effect<
    NotificationCenterInAppNotificationSummaryView,
    NotificationCenterInAppServiceError
  >;
  readonly dismissCurrentActorInAppNotification: (
    input: DismissCurrentActorInAppNotificationRequest,
  ) => Effect.Effect<
    NotificationCenterInAppNotificationSummaryView,
    NotificationCenterInAppServiceError
  >;
};

export const NotificationCenterInAppRuntimeOptionsSchema = Schema.Struct({
  convexUrl: Schema.NonEmptyString,
  convexSiteUrl: Schema.NonEmptyString,
  keycloakBaseUrl: Schema.NonEmptyString,
  keycloakRealm: Schema.NonEmptyString,
  keycloakClientId: Schema.NonEmptyString,
  keycloakClientSecret: Schema.NonEmptyString,
  keycloakConvexServiceActorUsername: Schema.NonEmptyString,
  keycloakConvexServiceActorPassword: Schema.NonEmptyString,
});

export type NotificationCenterInAppRuntimeOptions = Schema.Schema.Type<
  typeof NotificationCenterInAppRuntimeOptionsSchema
>;

const NotificationCenterInAppProcessEnvironmentSchema = Schema.Struct({
  CONVEX_SELF_HOSTED_URL: Schema.NonEmptyString,
  CONVEX_SELF_HOSTED_SITE_URL: Schema.NonEmptyString,
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
  KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: Schema.NonEmptyString,
  KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: Schema.NonEmptyString,
});

const resolveCurrentActorId = (
  requestContext: ListCurrentActorInAppNotificationsRequest["requestContext"],
) =>
  Effect.fromNullable(requestContext.actorId).pipe(
    Effect.mapError(
      (): NotificationCenterInAppCurrentActorRequiredError => ({
        _tag: "NotificationCenterInAppCurrentActorRequiredError",
      }),
    ),
  );

const normalizePageSize = (pageSize: number | undefined) => {
  if (pageSize === undefined || !Number.isInteger(pageSize) || pageSize < 1) {
    return notificationCenterInAppPageSizeDefault;
  }

  return Math.min(pageSize, notificationCenterInAppPageSizeMaximum);
};

const buildNotificationCenterInAppSummaryView = (
  record: NotificationCenterInAppNotificationRecord,
) =>
  Schema.decodeUnknown(NotificationCenterInAppNotificationSummaryViewSchema)({
    id: record.notificationId,
    channel: record.channel,
    family: record.family,
    status: record.status,
    ...(record.title !== undefined ? { title: record.title } : {}),
    ...(record.bodySummary !== undefined
      ? { bodySummary: record.bodySummary }
      : {}),
    ...(record.actionLabel !== undefined
      ? { actionLabel: record.actionLabel }
      : {}),
    ...(record.actionUrl !== undefined ? { actionUrl: record.actionUrl } : {}),
    ...(record.readAt !== undefined ? { readAt: record.readAt } : {}),
    ...(record.dismissedAt !== undefined
      ? { dismissedAt: record.dismissedAt }
      : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });

const buildNotificationCenterInAppSummaryViewOrNotFound = (input: {
  readonly notificationId: string;
  readonly record: NotificationCenterInAppNotificationRecord | undefined;
}): Effect.Effect<
  NotificationCenterInAppNotificationSummaryView,
  ParseResult.ParseError | NotificationCenterInAppNotificationNotFoundError
> =>
  input.record === undefined
    ? Effect.fail({
        _tag: "NotificationCenterInAppNotificationNotFoundError",
        notificationId: input.notificationId,
      } satisfies NotificationCenterInAppNotificationNotFoundError)
    : buildNotificationCenterInAppSummaryView(input.record);

export const makeNotificationCenterInAppService = () =>
  Effect.gen(function* () {
    const notificationCenterInApp = yield* NotificationCenterInAppModule;

    return {
      emitInAppNotification: (
        input: EmitNotificationCenterInAppNotificationRequest,
      ) =>
        Schema.decodeUnknown(
          EmitNotificationCenterInAppNotificationRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            notificationCenterInApp.createInAppNotification({
              ...request,
              createdAt: new Date().toISOString(),
            }),
          ),
        ),
      listCurrentActorInAppNotifications: (
        input: ListCurrentActorInAppNotificationsRequest,
      ) =>
        Schema.decodeUnknown(ListCurrentActorInAppNotificationsRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            resolveCurrentActorId(request.requestContext).pipe(
              Effect.flatMap((actorId) =>
                notificationCenterInApp.listInAppNotifications({
                  tenantScope: request.requestContext.tenant.scope,
                  tenantScopeId: request.requestContext.tenant.scopeId,
                  actorId,
                  pageSize: normalizePageSize(request.pageSize),
                }),
              ),
            ),
          ),
          Effect.flatMap((records) =>
            Effect.forEach(records, (record) =>
              buildNotificationCenterInAppSummaryView(record),
            ),
          ),
          Effect.flatMap((views) =>
            Schema.decodeUnknown(
              NotificationCenterInAppNotificationSummaryViewListSchema,
            )(views),
          ),
        ),
      markCurrentActorInAppNotificationRead: (
        input: MarkCurrentActorInAppNotificationReadRequest,
      ): Effect.Effect<
        NotificationCenterInAppNotificationSummaryView,
        NotificationCenterInAppServiceError
      > =>
        Schema.decodeUnknown(
          CurrentActorInAppNotificationMutationRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            resolveCurrentActorId(request.requestContext).pipe(
              Effect.flatMap((actorId) =>
                notificationCenterInApp.markInAppNotificationRead({
                  notificationId: request.notificationId,
                  tenantScope: request.requestContext.tenant.scope,
                  tenantScopeId: request.requestContext.tenant.scopeId,
                  actorId,
                  readAt: new Date().toISOString(),
                }),
              ),
            ),
          ),
          Effect.flatMap((record) =>
            buildNotificationCenterInAppSummaryViewOrNotFound({
              notificationId: input.notificationId,
              record,
            }),
          ),
        ),
      dismissCurrentActorInAppNotification: (
        input: DismissCurrentActorInAppNotificationRequest,
      ): Effect.Effect<
        NotificationCenterInAppNotificationSummaryView,
        NotificationCenterInAppServiceError
      > =>
        Schema.decodeUnknown(
          CurrentActorInAppNotificationMutationRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            resolveCurrentActorId(request.requestContext).pipe(
              Effect.flatMap((actorId) =>
                notificationCenterInApp.dismissInAppNotification({
                  notificationId: request.notificationId,
                  tenantScope: request.requestContext.tenant.scope,
                  tenantScopeId: request.requestContext.tenant.scopeId,
                  actorId,
                  dismissedAt: new Date().toISOString(),
                }),
              ),
            ),
          ),
          Effect.flatMap((record) =>
            buildNotificationCenterInAppSummaryViewOrNotFound({
              notificationId: input.notificationId,
              record,
            }),
          ),
        ),
    } satisfies NotificationCenterInAppService;
  });

const makeNotificationCenterInAppRuntime = (
  options: NotificationCenterInAppRuntimeOptions,
) =>
  Effect.gen(function* () {
    const convexNotificationCenterInApp =
      yield* makeConvexNotificationCenterInAppAdapter({
        deploymentUrl: options.convexUrl,
        siteUrl: options.convexSiteUrl,
        keycloakBaseUrl: options.keycloakBaseUrl,
        keycloakRealm: options.keycloakRealm,
        keycloakClientId: options.keycloakClientId,
        keycloakClientSecret: options.keycloakClientSecret,
        keycloakConvexServiceActorUsername:
          options.keycloakConvexServiceActorUsername,
        keycloakConvexServiceActorPassword:
          options.keycloakConvexServiceActorPassword,
      });
    const notificationCenterInAppModule =
      yield* makeNotificationCenterInAppModule().pipe(
        Effect.provideService(
          ConvexNotificationCenterInAppAdapter,
          convexNotificationCenterInApp,
        ),
      );
    const service = yield* makeNotificationCenterInAppService().pipe(
      Effect.provideService(
        NotificationCenterInAppModule,
        notificationCenterInAppModule,
      ),
    );

    return {
      service,
      close: Effect.void,
    };
  });

export const resolveNotificationCenterInAppRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  Schema.decodeUnknown(NotificationCenterInAppProcessEnvironmentSchema)(
    environment,
  ).pipe(
    Effect.map(
      (resolvedEnvironment): NotificationCenterInAppRuntimeOptions => ({
        convexUrl: resolvedEnvironment.CONVEX_SELF_HOSTED_URL,
        convexSiteUrl: resolvedEnvironment.CONVEX_SELF_HOSTED_SITE_URL,
        keycloakBaseUrl: resolvedEnvironment.KEYCLOAK_BASE_URL,
        keycloakRealm: resolvedEnvironment.KEYCLOAK_REALM,
        keycloakClientId: resolvedEnvironment.KEYCLOAK_CLIENT_ID,
        keycloakClientSecret: resolvedEnvironment.KEYCLOAK_CLIENT_SECRET,
        keycloakConvexServiceActorUsername:
          resolvedEnvironment.KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME,
        keycloakConvexServiceActorPassword:
          resolvedEnvironment.KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD,
      }),
    ),
  );

const runNotificationCenterInAppWithResolvedOptions = <A, E>(
  options: NotificationCenterInAppRuntimeOptions,
  use: (service: NotificationCenterInAppService) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const runtime = yield* makeNotificationCenterInAppRuntime(options).pipe(
      Effect.mapError(
        (cause): NotificationCenterInAppRuntimeError => ({
          _tag: "NotificationCenterInAppRuntimeError",
          cause,
        }),
      ),
    );

    return yield* use(runtime.service).pipe(
      Effect.ensuring(Effect.ignore(runtime.close)),
    );
  });

export const runNotificationCenterInAppFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: NotificationCenterInAppService) => Effect.Effect<A, E>,
) =>
  resolveNotificationCenterInAppRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.mapError(
      (cause): NotificationCenterInAppRuntimeError => ({
        _tag: "NotificationCenterInAppRuntimeError",
        cause,
      }),
    ),
    Effect.flatMap((resolvedOptions) =>
      runNotificationCenterInAppWithResolvedOptions(resolvedOptions, use),
    ),
  );
