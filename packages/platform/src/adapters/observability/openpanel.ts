import { Context, Effect, Layer, Schema } from "effect";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const OpenpanelAdapterOptionsSchema = Schema.Struct({
  clientId: Schema.NonEmptyString,
  apiUrl: Schema.NonEmptyString,
});

export type OpenPanelAdapterOptions = Schema.Schema.Type<
  typeof OpenpanelAdapterOptionsSchema
>;

const OpenpanelHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.openpanel,
);

export type OpenPanelHealthcheck = Schema.Schema.Type<
  typeof OpenpanelHealthcheckSchema
>;

export type OpenPanelAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.openpanel;
  readonly clientId: string;
  readonly apiUrl: string;
  readonly healthcheck: Effect.Effect<OpenPanelHealthcheck>;
};

export class OpenPanelAdapter extends Context.Tag("OpenPanelAdapter")<
  OpenPanelAdapter,
  OpenPanelAdapterService
>() {}

export const makeOpenPanelAdapter = (input: OpenPanelAdapterOptions) =>
  Schema.decodeUnknown(OpenpanelAdapterOptionsSchema)(input).pipe(
    Effect.map(
      (options): OpenPanelAdapterService => ({
        serviceName: platformAdapterServiceName.openpanel,
        clientId: options.clientId,
        apiUrl: options.apiUrl,
        healthcheck: Effect.succeed({
          healthy: true,
          service: platformAdapterServiceName.openpanel,
        }),
      }),
    ),
  );

export const makeOpenPanelAdapterLayer = (options: OpenPanelAdapterOptions) =>
  Layer.effect(OpenPanelAdapter, makeOpenPanelAdapter(options));
