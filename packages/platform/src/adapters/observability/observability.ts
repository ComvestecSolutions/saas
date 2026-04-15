import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import { TelemetryKindSchema } from "@comvestec/contracts";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const ObservabilityAdapterOptionsSchema = Schema.Struct({
  otlpHttpEndpoint: Schema.NonEmptyString,
  grafanaBaseUrl: Schema.NonEmptyString,
});

export type ObservabilityAdapterOptions = Schema.Schema.Type<
  typeof ObservabilityAdapterOptionsSchema
>;

const TelemetryEmissionSchema = Schema.Struct({
  kind: TelemetryKindSchema,
  service: Schema.NonEmptyString,
  payload: Schema.Any,
});

export type TelemetryEmission = Schema.Schema.Type<
  typeof TelemetryEmissionSchema
>;

const ObservabilityHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.observability,
);

export type ObservabilityHealthcheck = Schema.Schema.Type<
  typeof ObservabilityHealthcheckSchema
>;

export type ObservabilityAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.observability;
  readonly otlpHttpEndpoint: string;
  readonly grafanaBaseUrl: string;
  readonly healthcheck: Effect.Effect<ObservabilityHealthcheck>;
  readonly emit: (
    input: TelemetryEmission,
  ) => Effect.Effect<TelemetryEmission, ParseResult.ParseError>;
};

export class ObservabilityAdapter extends Context.Tag("ObservabilityAdapter")<
  ObservabilityAdapter,
  ObservabilityAdapterService
>() {}

export const makeObservabilityAdapter = (input: ObservabilityAdapterOptions) =>
  Schema.decodeUnknown(ObservabilityAdapterOptionsSchema)(input).pipe(
    Effect.map(
      (options): ObservabilityAdapterService => ({
        serviceName: platformAdapterServiceName.observability,
        otlpHttpEndpoint: options.otlpHttpEndpoint,
        grafanaBaseUrl: options.grafanaBaseUrl,
        healthcheck: Effect.succeed({
          healthy: true,
          service: platformAdapterServiceName.observability,
        }),
        emit: (emissionInput: TelemetryEmission) =>
          Schema.decodeUnknown(TelemetryEmissionSchema)(emissionInput),
      }),
    ),
  );

export const makeObservabilityAdapterLayer = (
  options: ObservabilityAdapterOptions,
) => Layer.effect(ObservabilityAdapter, makeObservabilityAdapter(options));
