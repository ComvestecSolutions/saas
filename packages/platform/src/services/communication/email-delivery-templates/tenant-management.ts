import {
  AbsoluteRedirectUriSchema,
  emailDeliveryTemplateId,
  IsoTimestampSchema,
  TenantContextSchema,
  TenantMembershipRelationSchema,
} from "@comvestec/contracts";
import { Effect, ParseResult, Schema } from "effect";
import {
  buildTenantLabel,
  escapeHtml,
  RenderedSystemEmailTemplateSchema,
} from "./shared";

export const tenantInvitationEmailTemplateVersion = Schema.validateSync(
  Schema.NonEmptyString,
)("v1");

export const tenantInvitationEmailTemplateTrackingId = Schema.validateSync(
  Schema.NonEmptyString,
)(
  `${emailDeliveryTemplateId.tenantMembershipInvitation}@${tenantInvitationEmailTemplateVersion}`,
);

export const tenantInvitationReminderEmailTemplateTrackingId =
  Schema.validateSync(Schema.NonEmptyString)(
    `${emailDeliveryTemplateId.tenantMembershipInvitationReminder}@${tenantInvitationEmailTemplateVersion}`,
  );

export const tenantInvitationExpiryNotificationEmailTemplateTrackingId =
  Schema.validateSync(Schema.NonEmptyString)(
    `${emailDeliveryTemplateId.tenantMembershipInvitationExpiryNotification}@${tenantInvitationEmailTemplateVersion}`,
  );

export const RenderTenantInvitationEmailTemplateInputSchema = Schema.Struct({
  tenant: TenantContextSchema,
  recipientEmail: Schema.NonEmptyString,
  relation: TenantMembershipRelationSchema,
  invitationToken: Schema.NonEmptyString,
  expiresAt: IsoTimestampSchema,
  signInUrl: AbsoluteRedirectUriSchema,
});

export type RenderTenantInvitationEmailTemplateInput = Schema.Schema.Type<
  typeof RenderTenantInvitationEmailTemplateInputSchema
>;

export const RenderTenantInvitationFollowUpEmailTemplateInputSchema =
  Schema.Struct({
    tenant: TenantContextSchema,
    recipientEmail: Schema.NonEmptyString,
    relation: TenantMembershipRelationSchema,
    expiresAt: IsoTimestampSchema,
    signInUrl: AbsoluteRedirectUriSchema,
  });

export type RenderTenantInvitationFollowUpEmailTemplateInput =
  Schema.Schema.Type<
    typeof RenderTenantInvitationFollowUpEmailTemplateInputSchema
  >;

const buildRelationLabel = (
  relation: RenderTenantInvitationEmailTemplateInput["relation"],
) =>
  relation
    .split(/[-_]/u)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

const buildInvitationFollowUpTemplateContext = (
  request: RenderTenantInvitationFollowUpEmailTemplateInput,
) => {
  const tenantLabel = buildTenantLabel(request.tenant);
  const relationLabel = buildRelationLabel(request.relation);

  return {
    tenantLabel,
    relationLabel,
    escapedTenantLabel: escapeHtml(tenantLabel),
    escapedRelationLabel: escapeHtml(relationLabel),
    escapedRecipientEmail: escapeHtml(request.recipientEmail),
    escapedExpiresAt: escapeHtml(request.expiresAt),
    escapedSignInUrl: escapeHtml(request.signInUrl),
  } as const;
};

export const renderTenantInvitationEmailTemplate = (input: unknown) =>
  Schema.decodeUnknown(RenderTenantInvitationEmailTemplateInputSchema)(
    input,
  ).pipe(
    Effect.flatMap((request) => {
      const tenantLabel = buildTenantLabel(request.tenant);
      const relationLabel = buildRelationLabel(request.relation);
      const escapedSignInUrl = escapeHtml(request.signInUrl);
      const escapedInvitationToken = escapeHtml(request.invitationToken);
      const escapedRecipientEmail = escapeHtml(request.recipientEmail);
      const escapedTenantLabel = escapeHtml(tenantLabel);
      const escapedRelationLabel = escapeHtml(relationLabel);
      const escapedExpiresAt = escapeHtml(request.expiresAt);
      const subject = `Invitation to join ${tenantLabel}`;

      return Schema.decodeUnknown(RenderedSystemEmailTemplateSchema)({
        template: tenantInvitationEmailTemplateTrackingId,
        subject,
        html: [
          `<p>You have been invited to join ${escapedTenantLabel} as ${escapedRelationLabel}.</p>`,
          `<p>This invitation was sent to ${escapedRecipientEmail} and expires at ${escapedExpiresAt}.</p>`,
          `<p>Sign in at <a href="${escapedSignInUrl}">${escapedSignInUrl}</a>, then redeem this invitation token after authentication:</p>`,
          `<p><code>${escapedInvitationToken}</code></p>`,
        ].join(""),
        text: [
          `You have been invited to join ${tenantLabel} as ${relationLabel}.`,
          `This invitation was sent to ${request.recipientEmail} and expires at ${request.expiresAt}.`,
          `Sign in at ${request.signInUrl}, then redeem this invitation token after authentication:`,
          request.invitationToken,
        ].join("\n\n"),
      });
    }),
  );

export const renderTenantInvitationReminderEmailTemplate = (input: unknown) =>
  Schema.decodeUnknown(RenderTenantInvitationFollowUpEmailTemplateInputSchema)(
    input,
  ).pipe(
    Effect.flatMap((request) => {
      const context = buildInvitationFollowUpTemplateContext(request);

      return Schema.decodeUnknown(RenderedSystemEmailTemplateSchema)({
        template: tenantInvitationReminderEmailTemplateTrackingId,
        subject: `Reminder: invitation to join ${context.tenantLabel}`,
        html: [
          `<p>This is a reminder that your invitation to join ${context.escapedTenantLabel} as ${context.escapedRelationLabel} is still pending.</p>`,
          `<p>The invitation sent to ${context.escapedRecipientEmail} expires at ${context.escapedExpiresAt}.</p>`,
          `<p>Sign in at <a href="${context.escapedSignInUrl}">${context.escapedSignInUrl}</a>, then continue with the original invitation email or request a new invitation from an operator if you no longer have the token.</p>`,
        ].join(""),
        text: [
          `This is a reminder that your invitation to join ${context.tenantLabel} as ${context.relationLabel} is still pending.`,
          `The invitation sent to ${request.recipientEmail} expires at ${request.expiresAt}.`,
          `Sign in at ${request.signInUrl}, then continue with the original invitation email or request a new invitation from an operator if you no longer have the token.`,
        ].join("\n\n"),
      });
    }),
  );

export const renderTenantInvitationExpiryNotificationEmailTemplate = (
  input: unknown,
) =>
  Schema.decodeUnknown(RenderTenantInvitationFollowUpEmailTemplateInputSchema)(
    input,
  ).pipe(
    Effect.flatMap((request) => {
      const context = buildInvitationFollowUpTemplateContext(request);

      return Schema.decodeUnknown(RenderedSystemEmailTemplateSchema)({
        template: tenantInvitationExpiryNotificationEmailTemplateTrackingId,
        subject: `Invitation expired for ${context.tenantLabel}`,
        html: [
          `<p>Your invitation to join ${context.escapedTenantLabel} as ${context.escapedRelationLabel} has expired.</p>`,
          `<p>The expired invitation was sent to ${context.escapedRecipientEmail} and was valid until ${context.escapedExpiresAt}.</p>`,
          `<p>Sign in at <a href="${context.escapedSignInUrl}">${context.escapedSignInUrl}</a> for follow-up steps or request a new invitation from an operator.</p>`,
        ].join(""),
        text: [
          `Your invitation to join ${context.tenantLabel} as ${context.relationLabel} has expired.`,
          `The expired invitation was sent to ${request.recipientEmail} and was valid until ${request.expiresAt}.`,
          `Sign in at ${request.signInUrl} for follow-up steps or request a new invitation from an operator.`,
        ].join("\n\n"),
      });
    }),
  );

export type RenderTenantInvitationEmailTemplateError = ParseResult.ParseError;
