import {
  AbsoluteRedirectUriSchema,
  emailDeliveryTemplateId,
  IsoTimestampSchema,
  TenantContextSchema,
} from "@comvestec/contracts";
import { Effect, ParseResult, Schema } from "effect";
import {
  buildTenantLabel,
  escapeHtml,
  RenderedSystemEmailTemplateSchema,
} from "./shared";

export const billingInvoiceReadyEmailTemplateVersion = Schema.validateSync(
  Schema.NonEmptyString,
)("v1");

export const billingInvoiceReadyDigestEmailTemplateVersion =
  Schema.validateSync(Schema.NonEmptyString)("v1");

export const billingInvoiceReadyEmailTemplateTrackingId = Schema.validateSync(
  Schema.NonEmptyString,
)(
  `${emailDeliveryTemplateId.billingInvoiceReady}@${billingInvoiceReadyEmailTemplateVersion}`,
);

export const billingInvoiceReadyDigestEmailTemplateTrackingId =
  Schema.validateSync(Schema.NonEmptyString)(
    `${emailDeliveryTemplateId.billingInvoiceReadyDigest}@${billingInvoiceReadyDigestEmailTemplateVersion}`,
  );

export const RenderBillingInvoiceReadyEmailTemplateInputSchema = Schema.Struct({
  tenant: TenantContextSchema,
  recipientEmail: Schema.NonEmptyString,
  invoiceNumber: Schema.NonEmptyString,
  invoiceUrl: AbsoluteRedirectUriSchema,
  dueAt: IsoTimestampSchema,
  totalDue: Schema.NonEmptyString,
});

export type RenderBillingInvoiceReadyEmailTemplateInput = Schema.Schema.Type<
  typeof RenderBillingInvoiceReadyEmailTemplateInputSchema
>;

export const BillingInvoiceReadyDigestItemSchema = Schema.Struct({
  invoiceNumber: Schema.NonEmptyString,
  invoiceUrl: AbsoluteRedirectUriSchema,
  dueAt: IsoTimestampSchema,
  totalDue: Schema.NonEmptyString,
});

export type BillingInvoiceReadyDigestItem = Schema.Schema.Type<
  typeof BillingInvoiceReadyDigestItemSchema
>;

export const RenderBillingInvoiceReadyDigestEmailTemplateInputSchema =
  Schema.Struct({
    tenant: TenantContextSchema,
    recipientEmail: Schema.NonEmptyString,
    items: Schema.Array(BillingInvoiceReadyDigestItemSchema),
  });

export type RenderBillingInvoiceReadyDigestEmailTemplateInput =
  Schema.Schema.Type<
    typeof RenderBillingInvoiceReadyDigestEmailTemplateInputSchema
  >;

export const renderBillingInvoiceReadyEmailTemplate = (input: unknown) =>
  Schema.decodeUnknown(RenderBillingInvoiceReadyEmailTemplateInputSchema)(
    input,
  ).pipe(
    Effect.flatMap((request) => {
      const tenantLabel = buildTenantLabel(request.tenant);
      const escapedTenantLabel = escapeHtml(tenantLabel);
      const escapedRecipientEmail = escapeHtml(request.recipientEmail);
      const escapedInvoiceNumber = escapeHtml(request.invoiceNumber);
      const escapedInvoiceUrl = escapeHtml(request.invoiceUrl);
      const escapedDueAt = escapeHtml(request.dueAt);
      const escapedTotalDue = escapeHtml(request.totalDue);
      const subject = `Your invoice ${request.invoiceNumber} is ready`;

      return Schema.decodeUnknown(RenderedSystemEmailTemplateSchema)({
        template: billingInvoiceReadyEmailTemplateTrackingId,
        subject,
        html: [
          `<p>Your invoice ${escapedInvoiceNumber} for ${escapedTenantLabel} is ready.</p>`,
          `<p>This billing notice was sent to ${escapedRecipientEmail}. The total due is ${escapedTotalDue} by ${escapedDueAt}.</p>`,
          `<p>Review and pay the invoice at <a href="${escapedInvoiceUrl}">${escapedInvoiceUrl}</a>.</p>`,
        ].join(""),
        text: [
          `Your invoice ${request.invoiceNumber} for ${tenantLabel} is ready.`,
          `This billing notice was sent to ${request.recipientEmail}. The total due is ${request.totalDue} by ${request.dueAt}.`,
          `Review and pay the invoice at ${request.invoiceUrl}.`,
        ].join("\n\n"),
      });
    }),
  );

export const renderBillingInvoiceReadyDigestEmailTemplate = (input: unknown) =>
  Schema.decodeUnknown(RenderBillingInvoiceReadyDigestEmailTemplateInputSchema)(
    input,
  ).pipe(
    Effect.flatMap((request) => {
      const tenantLabel = buildTenantLabel(request.tenant);
      const escapedTenantLabel = escapeHtml(tenantLabel);
      const escapedRecipientEmail = escapeHtml(request.recipientEmail);
      const itemCount = request.items.length;
      const subject = `You have ${itemCount} invoice${itemCount === 1 ? "" : "s"} ready`;
      const htmlItems = request.items
        .map((item) => {
          const escapedInvoiceNumber = escapeHtml(item.invoiceNumber);
          const escapedInvoiceUrl = escapeHtml(item.invoiceUrl);
          const escapedDueAt = escapeHtml(item.dueAt);
          const escapedTotalDue = escapeHtml(item.totalDue);

          return [
            "<li>",
            `<strong>${escapedInvoiceNumber}</strong>`,
            ` for ${escapedTotalDue} due by ${escapedDueAt}. `,
            `<a href="${escapedInvoiceUrl}">${escapedInvoiceUrl}</a>`,
            "</li>",
          ].join("");
        })
        .join("");
      const textItems = request.items
        .map(
          (item) =>
            `${item.invoiceNumber}: ${item.totalDue} due by ${item.dueAt} (${item.invoiceUrl})`,
        )
        .join("\n");

      return Schema.decodeUnknown(RenderedSystemEmailTemplateSchema)({
        template: billingInvoiceReadyDigestEmailTemplateTrackingId,
        subject,
        html: [
          `<p>${itemCount} invoice${itemCount === 1 ? " is" : "s are"} ready for ${escapedTenantLabel}.</p>`,
          `<p>This digest was sent to ${escapedRecipientEmail}.</p>`,
          `<ul>${htmlItems}</ul>`,
        ].join(""),
        text: [
          `${itemCount} invoice${itemCount === 1 ? " is" : "s are"} ready for ${tenantLabel}.`,
          `This digest was sent to ${request.recipientEmail}.`,
          textItems,
        ].join("\n\n"),
      });
    }),
  );

export type RenderBillingInvoiceReadyEmailTemplateError =
  ParseResult.ParseError;

export type RenderBillingInvoiceReadyDigestEmailTemplateError =
  ParseResult.ParseError;
