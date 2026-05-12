import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  type NotificationCenterDigestCandidateRecord,
  NotificationCenterDigestCandidateRecordSchema,
  type NotificationCenterDigestRunRecord,
  NotificationCenterDigestRunRecordSchema,
  type NotificationCenterDigestRunReference,
  NotificationCenterDigestRunReferenceSchema,
  type NotificationCenterEmailPreferenceRecord,
  NotificationCenterEmailPreferenceRecordSchema,
  type NotificationCenterEmailPreferenceReference,
  NotificationCenterEmailPreferenceReferenceSchema,
  type NotificationCenterEmailReceiptReference,
  NotificationCenterEmailReceiptReferenceSchema,
  type NotificationCenterEmailReceiptRecord,
  NotificationCenterEmailReceiptRecordSchema,
} from "@comvestec/contracts";
import {
  type NovuAdapterError,
  type NovuNotificationDispatchReceipt,
  NovuAdapter,
} from "@comvestec/platform";
import { NotificationCenterPostgresRepository } from "../persistence/postgres/domains/notification-center";

export const QueueEmailNotificationCommandSchema = Schema.Struct({
  recipient: Schema.NonEmptyString,
  template: Schema.NonEmptyString,
  subject: Schema.NonEmptyString,
});

export type QueueEmailNotificationCommand = Schema.Schema.Type<
  typeof QueueEmailNotificationCommandSchema
>;

export type NotificationCenterModuleService = {
  readonly queueEmailNotification: (
    input: QueueEmailNotificationCommand,
  ) => Effect.Effect<NovuNotificationDispatchReceipt, NovuAdapterError>;
  readonly createEmailReceipt: (
    input: NotificationCenterEmailReceiptRecord,
  ) => Effect.Effect<
    NotificationCenterEmailReceiptRecord,
    | ParseResult.ParseError
    | import("../persistence/postgres/domains/notification-center").NotificationCenterPostgresRepositoryError
  >;
  readonly findEmailReceipt: (
    input: NotificationCenterEmailReceiptReference,
  ) => Effect.Effect<
    NotificationCenterEmailReceiptRecord | undefined,
    | ParseResult.ParseError
    | import("../persistence/postgres/domains/notification-center").NotificationCenterPostgresRepositoryError
  >;
  readonly findDigestRun: (
    input: NotificationCenterDigestRunReference,
  ) => Effect.Effect<
    NotificationCenterDigestRunRecord | undefined,
    | ParseResult.ParseError
    | import("../persistence/postgres/domains/notification-center").NotificationCenterPostgresRepositoryError
  >;
  readonly listDigestCandidatesByDigestRun: (input: {
    readonly digestRunId: string;
  }) => Effect.Effect<
    readonly NotificationCenterDigestCandidateRecord[],
    | ParseResult.ParseError
    | import("../persistence/postgres/domains/notification-center").NotificationCenterPostgresRepositoryError
  >;
  readonly findEmailPreference: (
    input: NotificationCenterEmailPreferenceReference,
  ) => Effect.Effect<
    NotificationCenterEmailPreferenceRecord | undefined,
    | ParseResult.ParseError
    | import("../persistence/postgres/domains/notification-center").NotificationCenterPostgresRepositoryError
  >;
  readonly upsertDigestCandidate: (
    input: NotificationCenterDigestCandidateRecord,
  ) => Effect.Effect<
    NotificationCenterDigestCandidateRecord,
    | ParseResult.ParseError
    | import("../persistence/postgres/domains/notification-center").NotificationCenterPostgresRepositoryError
  >;
  readonly upsertDigestRun: (
    input: NotificationCenterDigestRunRecord,
  ) => Effect.Effect<
    NotificationCenterDigestRunRecord,
    | ParseResult.ParseError
    | import("../persistence/postgres/domains/notification-center").NotificationCenterPostgresRepositoryError
  >;
  readonly upsertEmailPreference: (
    input: NotificationCenterEmailPreferenceRecord,
  ) => Effect.Effect<
    NotificationCenterEmailPreferenceRecord,
    | ParseResult.ParseError
    | import("../persistence/postgres/domains/notification-center").NotificationCenterPostgresRepositoryError
  >;
};

export class NotificationCenterModule extends Context.Tag(
  "NotificationCenterModule",
)<NotificationCenterModule, NotificationCenterModuleService>() {}

export const makeNotificationCenterModule = () =>
  Effect.gen(function* () {
    const novu = yield* NovuAdapter;
    const notificationCenterRepository =
      yield* NotificationCenterPostgresRepository;

    return {
      queueEmailNotification: (input: QueueEmailNotificationCommand) =>
        Schema.decodeUnknown(QueueEmailNotificationCommandSchema)(input).pipe(
          Effect.flatMap((request) =>
            novu.triggerNotification({
              channel: "email",
              recipient: request.recipient,
              template: request.template,
              subject: request.subject,
            }),
          ),
        ),
      createEmailReceipt: (input: NotificationCenterEmailReceiptRecord) =>
        Schema.decodeUnknown(NotificationCenterEmailReceiptRecordSchema)(
          input,
        ).pipe(
          Effect.flatMap((record) =>
            notificationCenterRepository.createEmailReceipt(record),
          ),
        ),
      findDigestRun: (input: NotificationCenterDigestRunReference) =>
        Schema.decodeUnknown(NotificationCenterDigestRunReferenceSchema)(
          input,
        ).pipe(
          Effect.flatMap((reference) =>
            notificationCenterRepository.findDigestRun(reference),
          ),
        ),
      findEmailReceipt: (input: NotificationCenterEmailReceiptReference) =>
        Schema.decodeUnknown(NotificationCenterEmailReceiptReferenceSchema)(
          input,
        ).pipe(
          Effect.flatMap((reference) =>
            notificationCenterRepository.findEmailReceipt(reference),
          ),
        ),
      listDigestCandidatesByDigestRun: (input: {
        readonly digestRunId: string;
      }) =>
        Schema.decodeUnknown(NotificationCenterDigestRunReferenceSchema)({
          digestRunId: input.digestRunId,
        }).pipe(
          Effect.flatMap((reference) =>
            notificationCenterRepository.listDigestCandidatesByDigestRun({
              digestRunId: reference.digestRunId,
            }),
          ),
        ),
      findEmailPreference: (
        input: NotificationCenterEmailPreferenceReference,
      ) =>
        Schema.decodeUnknown(NotificationCenterEmailPreferenceReferenceSchema)(
          input,
        ).pipe(
          Effect.flatMap((reference) =>
            notificationCenterRepository.findEmailPreference(reference),
          ),
        ),
      upsertDigestCandidate: (input: NotificationCenterDigestCandidateRecord) =>
        Schema.decodeUnknown(NotificationCenterDigestCandidateRecordSchema)(
          input,
        ).pipe(
          Effect.flatMap((record) =>
            notificationCenterRepository.upsertDigestCandidate(record),
          ),
        ),
      upsertDigestRun: (input: NotificationCenterDigestRunRecord) =>
        Schema.decodeUnknown(NotificationCenterDigestRunRecordSchema)(
          input,
        ).pipe(
          Effect.flatMap((record) =>
            notificationCenterRepository.upsertDigestRun(record),
          ),
        ),
      upsertEmailPreference: (input: NotificationCenterEmailPreferenceRecord) =>
        Schema.decodeUnknown(NotificationCenterEmailPreferenceRecordSchema)(
          input,
        ).pipe(
          Effect.flatMap((record) =>
            notificationCenterRepository.upsertEmailPreference(record),
          ),
        ),
    } satisfies NotificationCenterModuleService;
  });

export const NotificationCenterModuleLive = Layer.effect(
  NotificationCenterModule,
  makeNotificationCenterModule(),
);
