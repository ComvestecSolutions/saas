import {
  AbsoluteRedirectUriSchema,
  emailDeliveryTemplateId,
  IsoTimestampSchema,
} from "@comvestec/contracts";
import { Effect, ParseResult, Schema } from "effect";
import {
  createBoundedNonEmptyStringSchema,
  escapeHtml,
  escapeOptionalHtml,
  RenderedSystemEmailTemplateSchema,
} from "./shared";

const notificationCenterDisplayNameHintMaxLength = 120;
const notificationCenterWelcomeCampaignNextStepMaxLength = 160;
const notificationCenterWelcomeCampaignNextStepMaxItems = 4;
const notificationCenterNewsletterIssueLabelMaxLength = 160;
const notificationCenterNewsletterHighlightTitleMaxLength = 120;
const notificationCenterNewsletterHighlightSummaryMaxLength = 280;
const notificationCenterNewsletterHighlightMaxItems = 6;

const NotificationCenterDisplayNameHintSchema =
  createBoundedNonEmptyStringSchema(notificationCenterDisplayNameHintMaxLength);

const NotificationCenterWelcomeCampaignNextStepSchema =
  createBoundedNonEmptyStringSchema(
    notificationCenterWelcomeCampaignNextStepMaxLength,
  );

const NotificationCenterWelcomeCampaignNextStepsSchema = Schema.Array(
  NotificationCenterWelcomeCampaignNextStepSchema,
).pipe(
  Schema.filter(
    (value) =>
      value.length <= notificationCenterWelcomeCampaignNextStepMaxItems,
  ),
);

const NotificationCenterNewsletterIssueLabelSchema =
  createBoundedNonEmptyStringSchema(
    notificationCenterNewsletterIssueLabelMaxLength,
  );

const NotificationCenterNewsletterHighlightTitleSchema =
  createBoundedNonEmptyStringSchema(
    notificationCenterNewsletterHighlightTitleMaxLength,
  );

const NotificationCenterNewsletterHighlightSummarySchema =
  createBoundedNonEmptyStringSchema(
    notificationCenterNewsletterHighlightSummaryMaxLength,
  );

export const notificationCenterWelcomeCampaignEmailTemplateVersion =
  Schema.validateSync(Schema.NonEmptyString)("v1");

export const notificationCenterNewsletterEmailTemplateVersion =
  Schema.validateSync(Schema.NonEmptyString)("v1");

export const notificationCenterWelcomeCampaignEmailTemplateTrackingId =
  Schema.validateSync(Schema.NonEmptyString)(
    `${emailDeliveryTemplateId.notificationCenterWelcomeCampaign}@${notificationCenterWelcomeCampaignEmailTemplateVersion}`,
  );

export const notificationCenterNewsletterEmailTemplateTrackingId =
  Schema.validateSync(Schema.NonEmptyString)(
    `${emailDeliveryTemplateId.notificationCenterNewsletter}@${notificationCenterNewsletterEmailTemplateVersion}`,
  );

export const RenderNotificationCenterWelcomeCampaignEmailTemplateInputSchema =
  Schema.Struct({
    recipientEmail: Schema.NonEmptyString,
    primaryActionUrl: AbsoluteRedirectUriSchema,
    supportUrl: AbsoluteRedirectUriSchema,
    nextSteps: NotificationCenterWelcomeCampaignNextStepsSchema,
    sentAt: Schema.optional(IsoTimestampSchema),
    displayNameHint: Schema.optional(NotificationCenterDisplayNameHintSchema),
  });

export type RenderNotificationCenterWelcomeCampaignEmailTemplateInput =
  Schema.Schema.Type<
    typeof RenderNotificationCenterWelcomeCampaignEmailTemplateInputSchema
  >;

export const NotificationCenterNewsletterHighlightSchema = Schema.Struct({
  title: NotificationCenterNewsletterHighlightTitleSchema,
  summary: NotificationCenterNewsletterHighlightSummarySchema,
  articleUrl: AbsoluteRedirectUriSchema,
});

export type NotificationCenterNewsletterHighlight = Schema.Schema.Type<
  typeof NotificationCenterNewsletterHighlightSchema
>;

const NotificationCenterNewsletterHighlightsSchema = Schema.Array(
  NotificationCenterNewsletterHighlightSchema,
).pipe(
  Schema.filter(
    (value) => value.length <= notificationCenterNewsletterHighlightMaxItems,
  ),
);

export const RenderNotificationCenterNewsletterEmailTemplateInputSchema =
  Schema.Struct({
    recipientEmail: Schema.NonEmptyString,
    issueLabel: NotificationCenterNewsletterIssueLabelSchema,
    publishedAt: IsoTimestampSchema,
    webViewUrl: AbsoluteRedirectUriSchema,
    unsubscribeUrl: AbsoluteRedirectUriSchema,
    highlights: NotificationCenterNewsletterHighlightsSchema,
  });

export type RenderNotificationCenterNewsletterEmailTemplateInput =
  Schema.Schema.Type<
    typeof RenderNotificationCenterNewsletterEmailTemplateInputSchema
  >;

export const renderNotificationCenterWelcomeCampaignEmailTemplate = (
  input: unknown,
) =>
  Schema.decodeUnknown(
    RenderNotificationCenterWelcomeCampaignEmailTemplateInputSchema,
  )(input).pipe(
    Effect.flatMap((request) => {
      const escapedRecipientEmail = escapeHtml(request.recipientEmail);
      const escapedPrimaryActionUrl = escapeHtml(request.primaryActionUrl);
      const escapedSupportUrl = escapeHtml(request.supportUrl);
      const escapedSentAt = escapeOptionalHtml(request.sentAt);
      const displayNameSuffix =
        request.displayNameHint === undefined
          ? ""
          : ` to ${request.displayNameHint}`;
      const escapedDisplayNameSuffix =
        request.displayNameHint === undefined
          ? ""
          : ` to ${escapeHtml(request.displayNameHint)}`;
      const subject = `Welcome${displayNameSuffix}`;
      const htmlNextSteps = request.nextSteps
        .map((step) => `<li>${escapeHtml(step)}</li>`)
        .join("");
      const textNextSteps = request.nextSteps
        .map((step) => `- ${step}`)
        .join("\n");

      return Schema.decodeUnknown(RenderedSystemEmailTemplateSchema)({
        template: notificationCenterWelcomeCampaignEmailTemplateTrackingId,
        subject,
        html: [
          `<p>Welcome${escapedDisplayNameSuffix}.</p>`,
          `<p>This email was sent to ${escapedRecipientEmail}.${escapedSentAt === undefined ? "" : ` The welcome message was prepared at ${escapedSentAt}.`}</p>`,
          `<p>Continue at <a href="${escapedPrimaryActionUrl}">${escapedPrimaryActionUrl}</a>.</p>`,
          htmlNextSteps.length === 0
            ? ""
            : `<p>Recommended next steps:</p><ul>${htmlNextSteps}</ul>`,
          `<p>If you need help, visit <a href="${escapedSupportUrl}">${escapedSupportUrl}</a>.</p>`,
        ].join(""),
        text: [
          `Welcome${displayNameSuffix}.`,
          `This email was sent to ${request.recipientEmail}.${request.sentAt === undefined ? "" : ` The welcome message was prepared at ${request.sentAt}.`}`,
          `Continue at ${request.primaryActionUrl}.`,
          textNextSteps.length === 0
            ? ""
            : `Recommended next steps:\n${textNextSteps}`,
          `If you need help, visit ${request.supportUrl}.`,
        ]
          .filter((section) => section.length > 0)
          .join("\n\n"),
      });
    }),
  );

export const renderNotificationCenterNewsletterEmailTemplate = (
  input: unknown,
) =>
  Schema.decodeUnknown(
    RenderNotificationCenterNewsletterEmailTemplateInputSchema,
  )(input).pipe(
    Effect.flatMap((request) => {
      const escapedRecipientEmail = escapeHtml(request.recipientEmail);
      const escapedIssueLabel = escapeHtml(request.issueLabel);
      const escapedPublishedAt = escapeHtml(request.publishedAt);
      const escapedWebViewUrl = escapeHtml(request.webViewUrl);
      const escapedUnsubscribeUrl = escapeHtml(request.unsubscribeUrl);
      const htmlHighlights = request.highlights
        .map((highlight) => {
          const escapedTitle = escapeHtml(highlight.title);
          const escapedSummary = escapeHtml(highlight.summary);
          const escapedArticleUrl = escapeHtml(highlight.articleUrl);

          return [
            "<li>",
            `<strong>${escapedTitle}</strong><br />`,
            `${escapedSummary}<br />`,
            `<a href="${escapedArticleUrl}">${escapedArticleUrl}</a>`,
            "</li>",
          ].join("");
        })
        .join("");
      const textHighlights = request.highlights
        .map(
          (highlight) =>
            `${highlight.title}: ${highlight.summary} (${highlight.articleUrl})`,
        )
        .join("\n");
      const subject = `Newsletter: ${request.issueLabel}`;

      return Schema.decodeUnknown(RenderedSystemEmailTemplateSchema)({
        template: notificationCenterNewsletterEmailTemplateTrackingId,
        subject,
        html: [
          `<p>${escapedIssueLabel} is ready.</p>`,
          `<p>This newsletter was sent to ${escapedRecipientEmail} at ${escapedPublishedAt}.</p>`,
          htmlHighlights.length === 0 ? "" : `<ul>${htmlHighlights}</ul>`,
          `<p>Read the web version at <a href="${escapedWebViewUrl}">${escapedWebViewUrl}</a>.</p>`,
          `<p>Manage newsletter preferences at <a href="${escapedUnsubscribeUrl}">${escapedUnsubscribeUrl}</a>.</p>`,
        ].join(""),
        text: [
          `${request.issueLabel} is ready.`,
          `This newsletter was sent to ${request.recipientEmail} at ${request.publishedAt}.`,
          textHighlights,
          `Read the web version at ${request.webViewUrl}.`,
          `Manage newsletter preferences at ${request.unsubscribeUrl}.`,
        ]
          .filter((section) => section.length > 0)
          .join("\n\n"),
      });
    }),
  );

export type RenderNotificationCenterWelcomeCampaignEmailTemplateError =
  ParseResult.ParseError;

export type RenderNotificationCenterNewsletterEmailTemplateError =
  ParseResult.ParseError;
