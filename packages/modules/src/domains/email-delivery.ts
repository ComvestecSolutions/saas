import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  type EmailDeliveryProviderEvent,
  EmailDeliveryProviderEventSchema,
  type EmailDeliveryTrackingRecord,
  EmailDeliveryTrackingRecordSchema,
  emailDeliveryProviderEventType,
  type EmailRecipientSuppressionRecord,
  EmailRecipientSuppressionRecordSchema,
  emailDeliveryStatus,
  emailSuppressionReason,
  RequestContextSchema,
} from "@comvestec/contracts";
import {
  type PostalSendEmailReceipt,
  PostalAdapter,
  type PostalAdapterRequestError,
  platformAdapterServiceName,
} from "@comvestec/platform";
import {
  BrandingResolutionResultSchema,
  platformBrandFallbackCompanyName,
} from "./tenant-branding";
import {
  EmailDeliveryPostgresRepository,
  type EmailDeliveryPostgresRepositoryError,
} from "../persistence";

export const EmailSenderIdentitySchema = Schema.Struct({
  displayName: Schema.NonEmptyString,
  fromEmail: Schema.NonEmptyString,
  replyToEmail: Schema.NonEmptyString,
});

export type EmailSenderIdentity = Schema.Schema.Type<
  typeof EmailSenderIdentitySchema
>;

export const SendTransactionalEmailCommandSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  recipient: Schema.NonEmptyString,
  template: Schema.optional(Schema.NonEmptyString),
  subject: Schema.NonEmptyString,
  html: Schema.NonEmptyString,
  text: Schema.optional(Schema.NonEmptyString),
  platformSender: EmailSenderIdentitySchema,
  branding: BrandingResolutionResultSchema,
  brandedEmailsEnabled: Schema.Boolean,
});

export type SendTransactionalEmailCommand = Schema.Schema.Type<
  typeof SendTransactionalEmailCommandSchema
>;

export type EmailRecipientSuppressedError = {
  readonly _tag: "EmailRecipientSuppressedError";
  readonly recipient: string;
  readonly reason: EmailRecipientSuppressionRecord["reason"];
};

export type EmailDeliveryTrackingRecordMissingError = {
  readonly _tag: "EmailDeliveryTrackingRecordMissingError";
  readonly messageId: string;
};

export type EmailDeliveryModuleError =
  | ParseResult.ParseError
  | EmailDeliveryPostgresRepositoryError
  | PostalAdapterRequestError
  | EmailRecipientSuppressedError
  | EmailDeliveryTrackingRecordMissingError;

const buildResolvedSenderIdentity = (
  input: SendTransactionalEmailCommand,
): Effect.Effect<EmailSenderIdentity, ParseResult.ParseError> => {
  const useBrandedSender =
    input.brandedEmailsEnabled && input.branding.adminProjection.entitled;
  const brandedDisplayName =
    input.branding.adminProjection.companyName ===
    platformBrandFallbackCompanyName
      ? undefined
      : input.branding.adminProjection.companyName;

  return Schema.decodeUnknown(EmailSenderIdentitySchema)({
    displayName:
      useBrandedSender && brandedDisplayName != null
        ? brandedDisplayName
        : input.platformSender.displayName,
    fromEmail: input.platformSender.fromEmail,
    replyToEmail:
      useBrandedSender && input.branding.adminProjection.replyToEmail != null
        ? input.branding.adminProjection.replyToEmail
        : input.platformSender.replyToEmail,
  });
};

const buildTrackedDeliveryMessageId = (input: SendTransactionalEmailCommand) =>
  [
    "email-delivery",
    input.requestContext.tenant.scope,
    input.requestContext.tenant.scopeId,
    crypto.randomUUID(),
  ].join(":");

const buildQueuedTrackingRecord = (input: {
  readonly command: SendTransactionalEmailCommand;
  readonly sender: EmailSenderIdentity;
  readonly messageId: string;
  readonly queuedAt: string;
}) =>
  Schema.decodeUnknown(EmailDeliveryTrackingRecordSchema)({
    messageId: input.messageId,
    provider: platformAdapterServiceName.postal,
    tenantScope: input.command.requestContext.tenant.scope,
    tenantScopeId: input.command.requestContext.tenant.scopeId,
    recipient: input.command.recipient,
    status: emailDeliveryStatus.queued,
    ...(input.command.template !== undefined
      ? { template: input.command.template }
      : {}),
    senderDisplayName: input.sender.displayName,
    fromEmail: input.sender.fromEmail,
    replyToEmail: input.sender.replyToEmail,
    sentAt: input.queuedAt,
    lastEventAt: input.queuedAt,
    createdAt: input.queuedAt,
    updatedAt: input.queuedAt,
  });

const buildFailedTrackingRecord = (record: EmailDeliveryTrackingRecord) =>
  Schema.decodeUnknown(EmailDeliveryTrackingRecordSchema)({
    ...record,
    status: emailDeliveryStatus.failed,
    lastEventAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

const buildQueuedReceiptTrackingRecord = (input: {
  readonly record: EmailDeliveryTrackingRecord;
  readonly receipt: PostalSendEmailReceipt;
}) =>
  Schema.decodeUnknown(EmailDeliveryTrackingRecordSchema)({
    ...input.record,
    provider: input.receipt.provider,
    sentAt: input.receipt.sentAt,
    lastEventAt: input.receipt.sentAt,
    updatedAt: input.receipt.sentAt,
  });

const persistQueuedReceiptBestEffort = (input: {
  readonly emailDeliveryRepository: EmailDeliveryPostgresRepository["Type"];
  readonly currentRecord: EmailDeliveryTrackingRecord;
  readonly receipt: PostalSendEmailReceipt;
}): Effect.Effect<PostalSendEmailReceipt> =>
  buildQueuedReceiptTrackingRecord({
    record: input.currentRecord,
    receipt: input.receipt,
  }).pipe(
    Effect.flatMap((updatedRecord) =>
      input.emailDeliveryRepository.updateTrackedDelivery({
        currentRecord: input.currentRecord,
        nextRecord: updatedRecord,
      }),
    ),
    Effect.flatMap((persistedUpdatedRecord) =>
      persistedUpdatedRecord === undefined
        ? Effect.fail({
            _tag: "EmailDeliveryTrackingRecordMissingError",
            messageId: input.currentRecord.messageId,
          } satisfies EmailDeliveryTrackingRecordMissingError)
        : Effect.void,
    ),
    Effect.as(input.receipt),
    Effect.catchAll(() => Effect.succeed(input.receipt)),
  );

const getEmailDeliveryStatusPriority = (
  status: EmailDeliveryTrackingRecord["status"],
) => {
  switch (status) {
    case emailDeliveryStatus.queued:
      return 0;
    case emailDeliveryStatus.delivered:
      return 1;
    case emailDeliveryStatus.bounced:
      return 2;
    case emailDeliveryStatus.complained:
      return 3;
    case emailDeliveryStatus.failed:
      return 4;
  }
};

const getEmailSuppressionReasonPriority = (
  reason: EmailRecipientSuppressionRecord["reason"],
) => {
  switch (reason) {
    case emailSuppressionReason.bounced:
      return 0;
    case emailSuppressionReason.complained:
      return 1;
  }
};

const getProviderEventStatus = (event: EmailDeliveryProviderEvent) => {
  switch (event.eventType) {
    case emailDeliveryProviderEventType.delivered:
      return emailDeliveryStatus.delivered;
    case emailDeliveryProviderEventType.bounced:
      return emailDeliveryStatus.bounced;
    case emailDeliveryProviderEventType.complained:
      return emailDeliveryStatus.complained;
  }
};

const getTimestampInstant = (value: string) => {
  const parsedInstant = Date.parse(value);

  return Number.isNaN(parsedInstant) ? undefined : parsedInstant;
};

const normalizeIsoTimestamp = (value: string) => new Date(value).toISOString();

const areTrackedDeliveryStatesEqual = (input: {
  readonly left: EmailDeliveryTrackingRecord;
  readonly right: EmailDeliveryTrackingRecord;
}) =>
  input.left.status === input.right.status &&
  input.left.lastEventAt === input.right.lastEventAt &&
  input.left.updatedAt === input.right.updatedAt &&
  input.left.bounceType === input.right.bounceType;

const areRecipientSuppressionStatesEqual = (input: {
  readonly left: EmailRecipientSuppressionRecord;
  readonly right: EmailRecipientSuppressionRecord;
}) =>
  input.left.reason === input.right.reason &&
  input.left.sourceMessageId === input.right.sourceMessageId &&
  input.left.suppressedAt === input.right.suppressedAt &&
  input.left.updatedAt === input.right.updatedAt &&
  input.left.bounceType === input.right.bounceType;

const isProviderEventRepresentedByTrackedDelivery = (input: {
  readonly record: EmailDeliveryTrackingRecord;
  readonly event: EmailDeliveryProviderEvent;
}) =>
  input.record.status === getProviderEventStatus(input.event) &&
  input.record.lastEventAt === normalizeIsoTimestamp(input.event.occurredAt) &&
  (input.event.eventType !== emailDeliveryProviderEventType.bounced ||
    input.record.bounceType === input.event.bounceType);

const shouldApplySuppressionEvent = (input: {
  readonly currentSuppression?: EmailRecipientSuppressionRecord;
  readonly event: Extract<
    EmailDeliveryProviderEvent,
    { readonly eventType: "bounced" | "complained" }
  >;
}) => {
  if (input.currentSuppression === undefined) {
    return true;
  }

  const currentSuppressedAt = getTimestampInstant(
    input.currentSuppression.suppressedAt,
  );
  const nextSuppressedAt = getTimestampInstant(input.event.occurredAt);

  if (currentSuppressedAt !== undefined && nextSuppressedAt !== undefined) {
    if (nextSuppressedAt > currentSuppressedAt) {
      return true;
    }

    if (nextSuppressedAt < currentSuppressedAt) {
      return false;
    }
  }

  if (
    (currentSuppressedAt === undefined || nextSuppressedAt === undefined) &&
    input.event.occurredAt !== input.currentSuppression.suppressedAt
  ) {
    return input.event.occurredAt > input.currentSuppression.suppressedAt;
  }

  const nextReason =
    input.event.eventType === emailDeliveryProviderEventType.bounced
      ? emailSuppressionReason.bounced
      : emailSuppressionReason.complained;

  return (
    getEmailSuppressionReasonPriority(nextReason) >
    getEmailSuppressionReasonPriority(input.currentSuppression.reason)
  );
};

const shouldApplyProviderEvent = (input: {
  readonly record: EmailDeliveryTrackingRecord;
  readonly event: EmailDeliveryProviderEvent;
}) => {
  if (input.record.status === emailDeliveryStatus.failed) {
    return false;
  }

  if (input.record.status !== emailDeliveryStatus.queued) {
    const currentEventAt = input.record.lastEventAt;

    if (currentEventAt !== undefined) {
      const currentEventInstant = getTimestampInstant(currentEventAt);
      const nextEventInstant = getTimestampInstant(input.event.occurredAt);

      if (
        currentEventInstant !== undefined &&
        nextEventInstant !== undefined &&
        nextEventInstant < currentEventInstant
      ) {
        return false;
      }

      if (
        (currentEventInstant === undefined || nextEventInstant === undefined) &&
        input.event.occurredAt < currentEventAt
      ) {
        return false;
      }
    }
  }

  return (
    getEmailDeliveryStatusPriority(getProviderEventStatus(input.event)) >=
    getEmailDeliveryStatusPriority(input.record.status)
  );
};

const buildTrackedDeliveryRecordFromEvent = (input: {
  readonly record: EmailDeliveryTrackingRecord;
  readonly event: EmailDeliveryProviderEvent;
}) => {
  if (!shouldApplyProviderEvent(input)) {
    return Effect.succeed(input.record);
  }

  const { bounceType: _ignoredBounceType, ...recordWithoutBounceType } =
    input.record;
  const normalizedEventAt = normalizeIsoTimestamp(input.event.occurredAt);

  return Schema.decodeUnknown(EmailDeliveryTrackingRecordSchema)({
    ...recordWithoutBounceType,
    status: getProviderEventStatus(input.event),
    lastEventAt: normalizedEventAt,
    ...(input.event.eventType === emailDeliveryProviderEventType.bounced
      ? { bounceType: input.event.bounceType }
      : {}),
    updatedAt: normalizedEventAt,
  });
};

const buildRecipientSuppressionRecord = (input: {
  readonly record: EmailDeliveryTrackingRecord;
  readonly event: Extract<
    EmailDeliveryProviderEvent,
    { readonly eventType: "bounced" | "complained" }
  >;
  readonly existingSuppression?: EmailRecipientSuppressionRecord;
}) => {
  const normalizedRecipient = input.record.recipient.trim().toLowerCase();
  const normalizedSuppressedAt = normalizeIsoTimestamp(input.event.occurredAt);

  if (
    input.existingSuppression !== undefined &&
    !shouldApplySuppressionEvent({
      currentSuppression: input.existingSuppression,
      event: input.event,
    })
  ) {
    return Effect.succeed(input.existingSuppression);
  }

  return Schema.decodeUnknown(EmailRecipientSuppressionRecordSchema)({
    suppressionId:
      input.existingSuppression?.suppressionId ??
      ["email-recipient-suppression", normalizedRecipient].join(":"),
    recipient: normalizedRecipient,
    reason:
      input.event.eventType === emailDeliveryProviderEventType.bounced
        ? emailSuppressionReason.bounced
        : emailSuppressionReason.complained,
    sourceMessageId: input.record.messageId,
    ...(input.event.eventType === emailDeliveryProviderEventType.bounced
      ? { bounceType: input.event.bounceType }
      : {}),
    suppressedAt: normalizedSuppressedAt,
    createdAt: input.existingSuppression?.createdAt ?? normalizedSuppressedAt,
    updatedAt: normalizedSuppressedAt,
  });
};

export type EmailDeliveryModuleService = {
  readonly sendTransactionalEmail: (
    input: SendTransactionalEmailCommand,
  ) => Effect.Effect<PostalSendEmailReceipt, EmailDeliveryModuleError>;
  readonly recordProviderDeliveryEvent: (
    input: EmailDeliveryProviderEvent,
  ) => Effect.Effect<EmailDeliveryTrackingRecord, EmailDeliveryModuleError>;
};

export class EmailDeliveryModule extends Context.Tag("EmailDeliveryModule")<
  EmailDeliveryModule,
  EmailDeliveryModuleService
>() {}

export type EmailDeliveryProviderEventRecorder = Pick<
  EmailDeliveryModuleService,
  "recordProviderDeliveryEvent"
>;

export const makeEmailDeliveryProviderEventRecorder = (
  emailDeliveryRepository: EmailDeliveryPostgresRepository["Type"],
): EmailDeliveryProviderEventRecorder => {
  const requireTrackedDeliveryRecord = (
    trackedDelivery: EmailDeliveryTrackingRecord | undefined,
    messageId: string,
  ): Effect.Effect<
    EmailDeliveryTrackingRecord,
    EmailDeliveryTrackingRecordMissingError
  > =>
    trackedDelivery === undefined
      ? Effect.fail({
          _tag: "EmailDeliveryTrackingRecordMissingError",
          messageId,
        } satisfies EmailDeliveryTrackingRecordMissingError)
      : Effect.succeed(trackedDelivery);
  const isSuppressionEvent = (
    event: EmailDeliveryProviderEvent,
  ): event is Extract<
    EmailDeliveryProviderEvent,
    { readonly eventType: "bounced" | "complained" }
  > =>
    event.eventType === emailDeliveryProviderEventType.bounced ||
    event.eventType === emailDeliveryProviderEventType.complained;
  const persistSuppressionForEvent = (input: {
    readonly record: EmailDeliveryTrackingRecord;
    readonly event: Extract<
      EmailDeliveryProviderEvent,
      { readonly eventType: "bounced" | "complained" }
    >;
  }): Effect.Effect<
    EmailDeliveryTrackingRecord,
    EmailDeliveryPostgresRepositoryError | ParseResult.ParseError
  > =>
    emailDeliveryRepository
      .findRecipientSuppression({
        recipient: input.record.recipient,
      })
      .pipe(
        Effect.flatMap((existingSuppression) =>
          buildRecipientSuppressionRecord({
            record: input.record,
            event: input.event,
            ...(existingSuppression !== undefined
              ? {
                  existingSuppression,
                }
              : {}),
          }).pipe(
            Effect.flatMap((nextSuppressionRecord) =>
              existingSuppression !== undefined &&
              areRecipientSuppressionStatesEqual({
                left: existingSuppression,
                right: nextSuppressionRecord,
              })
                ? Effect.succeed(input.record)
                : emailDeliveryRepository
                    .upsertRecipientSuppression({
                      ...(existingSuppression !== undefined
                        ? {
                            currentRecord: existingSuppression,
                          }
                        : {}),
                      nextRecord: nextSuppressionRecord,
                    })
                    .pipe(
                      Effect.flatMap((persistedSuppressionRecord) =>
                        areRecipientSuppressionStatesEqual({
                          left: persistedSuppressionRecord,
                          right: nextSuppressionRecord,
                        })
                          ? Effect.succeed(input.record)
                          : persistSuppressionForEvent({
                              record: input.record,
                              event: input.event,
                            }),
                      ),
                    ),
            ),
          ),
        ),
      );
  const persistTrackedDeliveryUpdate = (input: {
    readonly currentRecord: EmailDeliveryTrackingRecord;
    readonly event: EmailDeliveryProviderEvent;
  }): Effect.Effect<
    EmailDeliveryTrackingRecord,
    | EmailDeliveryPostgresRepositoryError
    | ParseResult.ParseError
    | EmailDeliveryTrackingRecordMissingError
  > =>
    buildTrackedDeliveryRecordFromEvent({
      record: input.currentRecord,
      event: input.event,
    }).pipe(
      Effect.flatMap((nextRecord) =>
        areTrackedDeliveryStatesEqual({
          left: input.currentRecord,
          right: nextRecord,
        })
          ? Effect.succeed(input.currentRecord)
          : emailDeliveryRepository
              .updateTrackedDelivery({
                currentRecord: input.currentRecord,
                nextRecord,
              })
              .pipe(
                Effect.flatMap((persistedRecord) =>
                  requireTrackedDeliveryRecord(
                    persistedRecord,
                    input.currentRecord.messageId,
                  ),
                ),
                Effect.flatMap((persistedRecord) =>
                  areTrackedDeliveryStatesEqual({
                    left: persistedRecord,
                    right: nextRecord,
                  })
                    ? Effect.succeed(persistedRecord)
                    : persistTrackedDeliveryUpdate({
                        currentRecord: persistedRecord,
                        event: input.event,
                      }),
                ),
              ),
      ),
    );

  return {
    recordProviderDeliveryEvent: (input: EmailDeliveryProviderEvent) =>
      Schema.decodeUnknown(EmailDeliveryProviderEventSchema)(input).pipe(
        Effect.flatMap((event) =>
          emailDeliveryRepository
            .findTrackedDelivery({
              messageId: event.messageId,
            })
            .pipe(
              Effect.flatMap((trackedDelivery) =>
                requireTrackedDeliveryRecord(trackedDelivery, event.messageId),
              ),
              Effect.flatMap((trackedDelivery) =>
                persistTrackedDeliveryUpdate({
                  currentRecord: trackedDelivery,
                  event,
                }).pipe(
                  Effect.flatMap((persistedUpdatedRecord) =>
                    isSuppressionEvent(event) &&
                    isProviderEventRepresentedByTrackedDelivery({
                      record: persistedUpdatedRecord,
                      event,
                    })
                      ? persistSuppressionForEvent({
                          record: persistedUpdatedRecord,
                          event,
                        })
                      : Effect.succeed(persistedUpdatedRecord),
                  ),
                ),
              ),
            ),
        ),
      ),
  };
};

export const makeEmailDeliveryModule = () =>
  Effect.gen(function* () {
    const postal = yield* PostalAdapter;
    const emailDeliveryRepository = yield* EmailDeliveryPostgresRepository;
    const providerEventRecorder = makeEmailDeliveryProviderEventRecorder(
      emailDeliveryRepository,
    );

    return {
      sendTransactionalEmail: (input: SendTransactionalEmailCommand) =>
        Schema.decodeUnknown(SendTransactionalEmailCommandSchema)(input).pipe(
          Effect.flatMap((request) =>
            emailDeliveryRepository
              .findRecipientSuppression({ recipient: request.recipient })
              .pipe(
                Effect.flatMap((suppression) =>
                  suppression === undefined
                    ? Effect.succeed(request)
                    : Effect.fail({
                        _tag: "EmailRecipientSuppressedError",
                        recipient: suppression.recipient,
                        reason: suppression.reason,
                      } satisfies EmailRecipientSuppressedError),
                ),
                Effect.flatMap((allowedRequest) =>
                  buildResolvedSenderIdentity(allowedRequest).pipe(
                    Effect.flatMap((sender) => {
                      const messageId =
                        buildTrackedDeliveryMessageId(allowedRequest);
                      const queuedAt = new Date().toISOString();

                      return buildQueuedTrackingRecord({
                        command: allowedRequest,
                        sender,
                        messageId,
                        queuedAt,
                      }).pipe(
                        Effect.flatMap((queuedRecord) =>
                          emailDeliveryRepository.createTrackedDelivery(
                            queuedRecord,
                          ),
                        ),
                        Effect.flatMap((createdRecord) =>
                          postal
                            .sendEmail({
                              messageId,
                              recipient: allowedRequest.recipient,
                              subject: allowedRequest.subject,
                              html: allowedRequest.html,
                              ...(allowedRequest.text != null
                                ? { text: allowedRequest.text }
                                : {}),
                              fromEmail: sender.fromEmail,
                              fromName: sender.displayName,
                              replyToEmail: sender.replyToEmail,
                            })
                            .pipe(
                              Effect.flatMap((receipt) =>
                                persistQueuedReceiptBestEffort({
                                  emailDeliveryRepository,
                                  currentRecord: createdRecord,
                                  receipt,
                                }),
                              ),
                              Effect.catchAll((error) =>
                                buildFailedTrackingRecord(createdRecord).pipe(
                                  Effect.flatMap((failedRecord) =>
                                    emailDeliveryRepository.updateTrackedDelivery(
                                      {
                                        currentRecord: createdRecord,
                                        nextRecord: failedRecord,
                                      },
                                    ),
                                  ),
                                  Effect.flatMap((persistedFailedRecord) =>
                                    persistedFailedRecord === undefined
                                      ? Effect.fail<EmailDeliveryModuleError>({
                                          _tag: "EmailDeliveryTrackingRecordMissingError",
                                          messageId,
                                        } satisfies EmailDeliveryTrackingRecordMissingError)
                                      : Effect.fail<EmailDeliveryModuleError>(
                                          error,
                                        ),
                                  ),
                                ),
                              ),
                            ),
                        ),
                      );
                    }),
                  ),
                ),
              ),
          ),
        ),
      recordProviderDeliveryEvent:
        providerEventRecorder.recordProviderDeliveryEvent,
    } satisfies EmailDeliveryModuleService;
  });

export const EmailDeliveryModuleLive = Layer.effect(
  EmailDeliveryModule,
  makeEmailDeliveryModule(),
);
