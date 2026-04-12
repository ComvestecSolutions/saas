import { Schema } from "effect";

const ConfigSchemaTypeConstantSchema = Schema.Struct({
  boolean: Schema.Literal("boolean"),
  string: Schema.Literal("string"),
  number: Schema.Literal("number"),
  stringOrNull: Schema.Literal("string | null"),
});

export const configSchemaType = Schema.validateSync(
  ConfigSchemaTypeConstantSchema,
)({
  boolean: "boolean",
  string: "string",
  number: "number",
  stringOrNull: "string | null",
} satisfies Schema.Schema.Type<typeof ConfigSchemaTypeConstantSchema>);

export const configSchemaTypes = [
  configSchemaType.boolean,
  configSchemaType.string,
  configSchemaType.number,
  configSchemaType.stringOrNull,
] as const;

export const ConfigSchemaTypeSchema = Schema.Literal(...configSchemaTypes);

export type ConfigSchemaType = Schema.Schema.Type<
  typeof ConfigSchemaTypeSchema
>;
