import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  type CreateNotificationCenterInAppNotificationInput,
  CreateNotificationCenterInAppNotificationInputSchema,
  type DismissNotificationCenterInAppNotificationInput,
  DismissNotificationCenterInAppNotificationInputSchema,
  type ListNotificationCenterInAppNotificationsInput,
  ListNotificationCenterInAppNotificationsInputSchema,
  type MarkNotificationCenterInAppNotificationReadInput,
  MarkNotificationCenterInAppNotificationReadInputSchema,
  type NotificationCenterInAppNotificationRecord,
  NotificationCenterInAppNotificationRecordListSchema,
  NotificationCenterInAppNotificationRecordSchema,
  type NotificationCenterInAppNotificationReference,
  NotificationCenterInAppNotificationReferenceSchema,
} from "@comvestec/contracts";
import {
  ConvexNotificationCenterInAppAdapter,
  type ConvexNotificationCenterInAppAdapterError,
} from "@comvestec/platform";

export type NotificationCenterInAppModuleError =
  | ParseResult.ParseError
  | ConvexNotificationCenterInAppAdapterError;

export type NotificationCenterInAppModuleService = {
  readonly createInAppNotification: (
    input: CreateNotificationCenterInAppNotificationInput,
  ) => Effect.Effect<
    NotificationCenterInAppNotificationRecord,
    NotificationCenterInAppModuleError
  >;
  readonly getInAppNotification: (
    input: NotificationCenterInAppNotificationReference,
  ) => Effect.Effect<
    NotificationCenterInAppNotificationRecord | undefined,
    NotificationCenterInAppModuleError
  >;
  readonly listInAppNotifications: (
    input: ListNotificationCenterInAppNotificationsInput,
  ) => Effect.Effect<
    readonly NotificationCenterInAppNotificationRecord[],
    NotificationCenterInAppModuleError
  >;
  readonly markInAppNotificationRead: (
    input: MarkNotificationCenterInAppNotificationReadInput,
  ) => Effect.Effect<
    NotificationCenterInAppNotificationRecord | undefined,
    NotificationCenterInAppModuleError
  >;
  readonly dismissInAppNotification: (
    input: DismissNotificationCenterInAppNotificationInput,
  ) => Effect.Effect<
    NotificationCenterInAppNotificationRecord | undefined,
    NotificationCenterInAppModuleError
  >;
};

export class NotificationCenterInAppModule extends Context.Tag(
  "NotificationCenterInAppModule",
)<NotificationCenterInAppModule, NotificationCenterInAppModuleService>() {}

export const makeNotificationCenterInAppModule = () =>
  Effect.gen(function* () {
    const inAppNotifications = yield* ConvexNotificationCenterInAppAdapter;

    return {
      createInAppNotification: (
        input: CreateNotificationCenterInAppNotificationInput,
      ) =>
        Schema.decodeUnknown(
          CreateNotificationCenterInAppNotificationInputSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            inAppNotifications.createInAppNotificationRecord(request),
          ),
          Effect.flatMap((record) =>
            Schema.decodeUnknown(
              NotificationCenterInAppNotificationRecordSchema,
            )(record),
          ),
        ),
      getInAppNotification: (
        input: NotificationCenterInAppNotificationReference,
      ) =>
        Schema.decodeUnknown(
          NotificationCenterInAppNotificationReferenceSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            inAppNotifications.getInAppNotificationRecord(request),
          ),
          Effect.flatMap((record) =>
            record === undefined
              ? Effect.succeed(undefined)
              : Schema.decodeUnknown(
                  NotificationCenterInAppNotificationRecordSchema,
                )(record),
          ),
        ),
      listInAppNotifications: (
        input: ListNotificationCenterInAppNotificationsInput,
      ) =>
        Schema.decodeUnknown(
          ListNotificationCenterInAppNotificationsInputSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            inAppNotifications.listInAppNotificationRecords(request),
          ),
          Effect.flatMap((records) =>
            Schema.decodeUnknown(
              NotificationCenterInAppNotificationRecordListSchema,
            )(records),
          ),
        ),
      markInAppNotificationRead: (
        input: MarkNotificationCenterInAppNotificationReadInput,
      ) =>
        Schema.decodeUnknown(
          MarkNotificationCenterInAppNotificationReadInputSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            inAppNotifications.markInAppNotificationRead(request),
          ),
          Effect.flatMap((record) =>
            record === undefined
              ? Effect.succeed(undefined)
              : Schema.decodeUnknown(
                  NotificationCenterInAppNotificationRecordSchema,
                )(record),
          ),
        ),
      dismissInAppNotification: (
        input: DismissNotificationCenterInAppNotificationInput,
      ) =>
        Schema.decodeUnknown(
          DismissNotificationCenterInAppNotificationInputSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            inAppNotifications.dismissInAppNotification(request),
          ),
          Effect.flatMap((record) =>
            record === undefined
              ? Effect.succeed(undefined)
              : Schema.decodeUnknown(
                  NotificationCenterInAppNotificationRecordSchema,
                )(record),
          ),
        ),
    } satisfies NotificationCenterInAppModuleService;
  });

export const NotificationCenterInAppModuleLive = Layer.effect(
  NotificationCenterInAppModule,
  makeNotificationCenterInAppModule(),
);
