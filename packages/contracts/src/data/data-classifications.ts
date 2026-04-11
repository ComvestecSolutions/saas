import { Schema } from "effect";

const DataClassificationConstantSchema = Schema.Struct({
  public: Schema.Literal("public"),
  internal: Schema.Literal("internal"),
  tenantConfidential: Schema.Literal("tenant-confidential"),
  regulatedSensitive: Schema.Literal("regulated-sensitive"),
  secret: Schema.Literal("secret"),
  derivedAnalytics: Schema.Literal("derived-analytics"),
});

export const dataClassification = Schema.validateSync(
  DataClassificationConstantSchema,
)({
  public: "public",
  internal: "internal",
  tenantConfidential: "tenant-confidential",
  regulatedSensitive: "regulated-sensitive",
  secret: "secret",
  derivedAnalytics: "derived-analytics",
} satisfies Schema.Schema.Type<typeof DataClassificationConstantSchema>);

export const dataClassifications = [
  dataClassification.public,
  dataClassification.internal,
  dataClassification.tenantConfidential,
  dataClassification.regulatedSensitive,
  dataClassification.secret,
  dataClassification.derivedAnalytics,
] as const;

export const DataClassificationSchema = Schema.Literal(...dataClassifications);

export type DataClassification = Schema.Schema.Type<
  typeof DataClassificationSchema
>;
