import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import { findModuleManifest } from "@comvestec/config";
import {
  actorType as actorTypeConstant,
  dataClassification,
  type DataClassification,
  ProjectionDescriptorSchema,
  RequestContextSchema,
  PlatformModuleIdSchema,
} from "@comvestec/contracts";

const FieldSecurityRequestSchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  requestContext: RequestContextSchema,
  projection: ProjectionDescriptorSchema,
  record: Schema.Any,
});

export type FieldSecurityRequest = Schema.Schema.Type<
  typeof FieldSecurityRequestSchema
>;

export const FieldSecurityResultSchema = Schema.Struct({
  projectedRecord: Schema.Any,
  visibleFields: Schema.Array(Schema.NonEmptyString),
  redactedFields: Schema.Array(Schema.NonEmptyString),
  auditedFields: Schema.Array(Schema.NonEmptyString),
});

export type FieldSecurityResult = Schema.Schema.Type<
  typeof FieldSecurityResultSchema
>;

const getPathValue = (
  record: Record<string, unknown>,
  path: string,
): unknown => {
  const keys = path.split(".");
  let current: unknown = record;

  for (const key of keys) {
    if (typeof current !== "object" || current === null || !(key in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return current;
};

const setPathValue = (
  record: Record<string, unknown>,
  path: string,
  value: unknown,
): void => {
  const keys = path.split(".");
  let current = record;

  keys.forEach((key, index) => {
    const isLeaf = index === keys.length - 1;

    if (isLeaf) {
      current[key] = value;
      return;
    }

    const next = current[key];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      current[key] = {};
    }

    current = current[key] as Record<string, unknown>;
  });
};

const redactValue = (
  actorType: FieldSecurityRequest["requestContext"]["actorType"],
  classification: DataClassification | undefined,
  value: unknown,
) => {
  if (classification === dataClassification.secret) {
    return "[REDACTED]";
  }

  if (
    classification === dataClassification.regulatedSensitive &&
    actorType !== actorTypeConstant.platformOperator &&
    actorType !== actorTypeConstant.supportOperator
  ) {
    return "[REDACTED]";
  }

  if (
    actorType === actorTypeConstant.anonymous &&
    classification !== dataClassification.public
  ) {
    return "[REDACTED]";
  }

  return value;
};

export type FieldSecurityModuleService = {
  readonly applyProjection: (
    input: FieldSecurityRequest,
  ) => Effect.Effect<FieldSecurityResult, ParseResult.ParseError>;
};

export class FieldSecurityModule extends Context.Tag("FieldSecurityModule")<
  FieldSecurityModule,
  FieldSecurityModuleService
>() {}

export const makeFieldSecurityModule = () =>
  Effect.succeed<FieldSecurityModuleService>({
    applyProjection: (input: FieldSecurityRequest) =>
      Schema.decodeUnknown(FieldSecurityRequestSchema)(input).pipe(
        Effect.flatMap((request) => {
          const rawRecord =
            typeof request.record === "object" &&
            request.record !== null &&
            !Array.isArray(request.record)
              ? (request.record as Record<string, unknown>)
              : {};

          const manifest = findModuleManifest(request.moduleId);

          const classificationMap = new Map(
            (manifest?.fieldClassifications ?? []).map((classification) => [
              classification.field,
              classification.classification,
            ]),
          );

          const projectedRecord: Record<string, unknown> = {};
          const redactedFields: string[] = [];

          request.projection.visibleFields.forEach((field) => {
            const value = getPathValue(rawRecord, field);
            if (value === undefined) {
              return;
            }

            const classification = classificationMap.get(field);
            const redactedValue = redactValue(
              request.requestContext.actorType,
              classification,
              value,
            );

            if (redactedValue !== value) {
              redactedFields.push(field);
            }

            setPathValue(projectedRecord, field, redactedValue);
          });

          const auditedFields = request.projection.auditedFields.filter(
            (field) => request.projection.visibleFields.includes(field),
          );

          return Schema.decodeUnknown(FieldSecurityResultSchema)({
            projectedRecord,
            visibleFields: [...request.projection.visibleFields],
            redactedFields,
            auditedFields,
          });
        }),
      ),
  });

export const FieldSecurityModuleLive = Layer.effect(
  FieldSecurityModule,
  makeFieldSecurityModule(),
);
