import {
  AbsoluteRedirectUriSchema,
  emailDeliveryTemplateId,
  IsoTimestampSchema,
} from "@comvestec/contracts";
import { Effect, ParseResult, Schema } from "effect";
import {
  escapeHtml,
  escapeOptionalHtml,
  RenderedSystemEmailTemplateSchema,
} from "./shared";

const buildDisplayNameSuffix = (displayNameHint: string | undefined) =>
  displayNameHint === undefined ? "" : ` for ${displayNameHint}`;

const buildEscapedDisplayNameSuffix = (displayNameHint: string | undefined) =>
  displayNameHint === undefined ? "" : ` for ${escapeHtml(displayNameHint)}`;

export const identitySessionEmailVerificationEmailTemplateVersion =
  Schema.validateSync(Schema.NonEmptyString)("v1");

export const identitySessionMfaCodeEmailTemplateVersion = Schema.validateSync(
  Schema.NonEmptyString,
)("v1");

export const identitySessionPasswordResetEmailTemplateVersion =
  Schema.validateSync(Schema.NonEmptyString)("v1");

export const identitySessionEmailVerificationEmailTemplateTrackingId =
  Schema.validateSync(Schema.NonEmptyString)(
    `${emailDeliveryTemplateId.identitySessionEmailVerification}@${identitySessionEmailVerificationEmailTemplateVersion}`,
  );

export const identitySessionMfaCodeEmailTemplateTrackingId =
  Schema.validateSync(Schema.NonEmptyString)(
    `${emailDeliveryTemplateId.identitySessionMfaCode}@${identitySessionMfaCodeEmailTemplateVersion}`,
  );

export const identitySessionPasswordResetEmailTemplateTrackingId =
  Schema.validateSync(Schema.NonEmptyString)(
    `${emailDeliveryTemplateId.identitySessionPasswordReset}@${identitySessionPasswordResetEmailTemplateVersion}`,
  );

export const RenderIdentitySessionEmailVerificationEmailTemplateInputSchema =
  Schema.Struct({
    recipientEmail: Schema.NonEmptyString,
    verificationUrl: AbsoluteRedirectUriSchema,
    expiresAt: IsoTimestampSchema,
    requestedAt: Schema.optional(IsoTimestampSchema),
    displayNameHint: Schema.optional(Schema.NonEmptyString),
  });

export type RenderIdentitySessionEmailVerificationEmailTemplateInput =
  Schema.Schema.Type<
    typeof RenderIdentitySessionEmailVerificationEmailTemplateInputSchema
  >;

export const RenderIdentitySessionMfaCodeEmailTemplateInputSchema =
  Schema.Struct({
    recipientEmail: Schema.NonEmptyString,
    mfaCode: Schema.NonEmptyString,
    expiresAt: IsoTimestampSchema,
    requestedAt: Schema.optional(IsoTimestampSchema),
    displayNameHint: Schema.optional(Schema.NonEmptyString),
  });

export type RenderIdentitySessionMfaCodeEmailTemplateInput = Schema.Schema.Type<
  typeof RenderIdentitySessionMfaCodeEmailTemplateInputSchema
>;

export const RenderIdentitySessionPasswordResetEmailTemplateInputSchema =
  Schema.Struct({
    recipientEmail: Schema.NonEmptyString,
    resetUrl: AbsoluteRedirectUriSchema,
    expiresAt: IsoTimestampSchema,
    requestedAt: Schema.optional(IsoTimestampSchema),
    displayNameHint: Schema.optional(Schema.NonEmptyString),
  });

export type RenderIdentitySessionPasswordResetEmailTemplateInput =
  Schema.Schema.Type<
    typeof RenderIdentitySessionPasswordResetEmailTemplateInputSchema
  >;

export const renderIdentitySessionEmailVerificationEmailTemplate = (
  input: unknown,
) =>
  Schema.decodeUnknown(
    RenderIdentitySessionEmailVerificationEmailTemplateInputSchema,
  )(input).pipe(
    Effect.flatMap((request) => {
      const escapedRecipientEmail = escapeHtml(request.recipientEmail);
      const escapedVerificationUrl = escapeHtml(request.verificationUrl);
      const escapedExpiresAt = escapeHtml(request.expiresAt);
      const escapedRequestedAt = escapeOptionalHtml(request.requestedAt);
      const subject = `Verify your email${buildDisplayNameSuffix(request.displayNameHint)}`;

      return Schema.decodeUnknown(RenderedSystemEmailTemplateSchema)({
        template: identitySessionEmailVerificationEmailTemplateTrackingId,
        subject,
        html: [
          `<p>An email verification was requested${buildEscapedDisplayNameSuffix(request.displayNameHint)}.</p>`,
          `<p>This email was sent to ${escapedRecipientEmail}.${escapedRequestedAt === undefined ? "" : ` The request was recorded at ${escapedRequestedAt}.`}</p>`,
          `<p>Use <a href="${escapedVerificationUrl}">${escapedVerificationUrl}</a> before ${escapedExpiresAt} to verify this address.</p>`,
          "<p>If you did not request this verification, you can ignore this email.</p>",
        ].join(""),
        text: [
          `An email verification was requested${buildDisplayNameSuffix(request.displayNameHint)}.`,
          `This email was sent to ${request.recipientEmail}.${request.requestedAt === undefined ? "" : ` The request was recorded at ${request.requestedAt}.`}`,
          `Use ${request.verificationUrl} before ${request.expiresAt} to verify this address.`,
          "If you did not request this verification, you can ignore this email.",
        ].join("\n\n"),
      });
    }),
  );

export const renderIdentitySessionMfaCodeEmailTemplate = (input: unknown) =>
  Schema.decodeUnknown(RenderIdentitySessionMfaCodeEmailTemplateInputSchema)(
    input,
  ).pipe(
    Effect.flatMap((request) => {
      const escapedRecipientEmail = escapeHtml(request.recipientEmail);
      const escapedMfaCode = escapeHtml(request.mfaCode);
      const escapedExpiresAt = escapeHtml(request.expiresAt);
      const escapedRequestedAt = escapeOptionalHtml(request.requestedAt);
      const subject = `Your MFA code${buildDisplayNameSuffix(request.displayNameHint)}`;

      return Schema.decodeUnknown(RenderedSystemEmailTemplateSchema)({
        template: identitySessionMfaCodeEmailTemplateTrackingId,
        subject,
        html: [
          `<p>A multi-factor authentication code was requested${buildEscapedDisplayNameSuffix(request.displayNameHint)}.</p>`,
          `<p>This email was sent to ${escapedRecipientEmail}.${escapedRequestedAt === undefined ? "" : ` The request was recorded at ${escapedRequestedAt}.`}</p>`,
          `<p>Use this code before ${escapedExpiresAt} to continue:</p>`,
          `<p><code>${escapedMfaCode}</code></p>`,
          "<p>If you did not request this code, you can ignore this email.</p>",
        ].join(""),
        text: [
          `A multi-factor authentication code was requested${buildDisplayNameSuffix(request.displayNameHint)}.`,
          `This email was sent to ${request.recipientEmail}.${request.requestedAt === undefined ? "" : ` The request was recorded at ${request.requestedAt}.`}`,
          `Use this code before ${request.expiresAt} to continue:`,
          request.mfaCode,
          "If you did not request this code, you can ignore this email.",
        ].join("\n\n"),
      });
    }),
  );

export const renderIdentitySessionPasswordResetEmailTemplate = (
  input: unknown,
) =>
  Schema.decodeUnknown(
    RenderIdentitySessionPasswordResetEmailTemplateInputSchema,
  )(input).pipe(
    Effect.flatMap((request) => {
      const escapedRecipientEmail = escapeHtml(request.recipientEmail);
      const escapedResetUrl = escapeHtml(request.resetUrl);
      const escapedExpiresAt = escapeHtml(request.expiresAt);
      const escapedRequestedAt = escapeOptionalHtml(request.requestedAt);
      const subject = `Reset your password${buildDisplayNameSuffix(request.displayNameHint)}`;

      return Schema.decodeUnknown(RenderedSystemEmailTemplateSchema)({
        template: identitySessionPasswordResetEmailTemplateTrackingId,
        subject,
        html: [
          `<p>A password reset was requested${buildEscapedDisplayNameSuffix(request.displayNameHint)}.</p>`,
          `<p>This email was sent to ${escapedRecipientEmail}.${escapedRequestedAt === undefined ? "" : ` The request was recorded at ${escapedRequestedAt}.`}</p>`,
          `<p>Use <a href="${escapedResetUrl}">${escapedResetUrl}</a> before ${escapedExpiresAt} to continue.</p>`,
          "<p>If you did not request this reset, you can ignore this email.</p>",
        ].join(""),
        text: [
          `A password reset was requested${buildDisplayNameSuffix(request.displayNameHint)}.`,
          `This email was sent to ${request.recipientEmail}.${request.requestedAt === undefined ? "" : ` The request was recorded at ${request.requestedAt}.`}`,
          `Use ${request.resetUrl} before ${request.expiresAt} to continue.`,
          "If you did not request this reset, you can ignore this email.",
        ].join("\n\n"),
      });
    }),
  );

export type RenderIdentitySessionEmailVerificationEmailTemplateError =
  ParseResult.ParseError;

export type RenderIdentitySessionMfaCodeEmailTemplateError =
  ParseResult.ParseError;

export type RenderIdentitySessionPasswordResetEmailTemplateError =
  ParseResult.ParseError;
