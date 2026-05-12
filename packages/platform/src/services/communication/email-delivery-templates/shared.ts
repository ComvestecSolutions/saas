import { Schema } from "effect";

export const RenderedSystemEmailTemplateSchema = Schema.Struct({
  template: Schema.NonEmptyString,
  subject: Schema.NonEmptyString,
  html: Schema.NonEmptyString,
  text: Schema.NonEmptyString,
});

export type RenderedSystemEmailTemplate = Schema.Schema.Type<
  typeof RenderedSystemEmailTemplateSchema
>;

export const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const escapeOptionalHtml = (value: string | undefined) =>
  value === undefined ? undefined : escapeHtml(value);

export const buildTenantLabel = (tenant: {
  readonly scope: string;
  readonly scopeId: string;
}) => `${tenant.scope} ${tenant.scopeId}`;

export const createBoundedNonEmptyStringSchema = (maxLength: number) =>
  Schema.NonEmptyString.pipe(
    Schema.filter((value) => value.length <= maxLength),
  );
