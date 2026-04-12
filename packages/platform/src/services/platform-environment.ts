import { Context, Effect, Layer, Redacted, Schema } from "effect";
import { PlatformEnvironmentSchema } from "@comvestec/config";

export type RuntimeEnvironment = {
  readonly nodeEnv: string;
  readonly appBaseUrl: string;
  readonly convexUrl: string;
  readonly convexSiteUrl: string;
  readonly convexAdminKey: Redacted.Redacted<string>;
  readonly postgresUrl: Redacted.Redacted<string>;
  readonly keycloakBaseUrl: string;
  readonly keycloakRealm: string;
  readonly keycloakClientId: string;
  readonly keycloakClientSecret: Redacted.Redacted<string>;
  readonly otelEndpoint: string;
  readonly grafanaBaseUrl: string;
  readonly valkeyUrl: string;
  readonly unleashUrl: string;
  readonly unleashApiKey: Redacted.Redacted<string>;
  readonly ketoReadUrl: string;
  readonly ketoWriteUrl: string;
  readonly errorTrackingDsn: string;
  readonly posthogApiKey: Redacted.Redacted<string>;
  readonly posthogHost: string;
  readonly novuApiKey: Redacted.Redacted<string>;
  readonly novuApiUrl: string;
  readonly meilisearchUrl: string;
  readonly meilisearchApiKey: Redacted.Redacted<string>;
  readonly polarApiKey: Redacted.Redacted<string>;
  readonly polarApiUrl: string;
  readonly openmeterUrl: string;
  readonly openmeterApiKey: Redacted.Redacted<string>;
  readonly postalApiUrl: string;
  readonly postalApiKey: Redacted.Redacted<string>;
};

export class PlatformEnvironmentService extends Context.Tag(
  "PlatformEnvironmentService",
)<PlatformEnvironmentService, RuntimeEnvironment>() {}

export const makeRuntimeEnvironment = (input: unknown) =>
  Schema.decodeUnknown(PlatformEnvironmentSchema)(input).pipe(
    Effect.map(
      (environment): RuntimeEnvironment => ({
        nodeEnv: environment.nodeEnv,
        appBaseUrl: environment.appBaseUrl,
        convexUrl: environment.convexUrl,
        convexSiteUrl: environment.convexSiteUrl,
        convexAdminKey: Redacted.make(environment.convexAdminKey),
        postgresUrl: Redacted.make(environment.postgresUrl),
        keycloakBaseUrl: environment.keycloakBaseUrl,
        keycloakRealm: environment.keycloakRealm,
        keycloakClientId: environment.keycloakClientId,
        keycloakClientSecret: Redacted.make(environment.keycloakClientSecret),
        otelEndpoint: environment.otelEndpoint,
        grafanaBaseUrl: environment.grafanaBaseUrl,
        valkeyUrl: environment.valkeyUrl,
        unleashUrl: environment.unleashUrl,
        unleashApiKey: Redacted.make(environment.unleashApiKey),
        ketoReadUrl: environment.ketoReadUrl,
        ketoWriteUrl: environment.ketoWriteUrl,
        errorTrackingDsn: environment.errorTrackingDsn,
        posthogApiKey: Redacted.make(environment.posthogApiKey),
        posthogHost: environment.posthogHost,
        novuApiKey: Redacted.make(environment.novuApiKey),
        novuApiUrl: environment.novuApiUrl,
        meilisearchUrl: environment.meilisearchUrl,
        meilisearchApiKey: Redacted.make(environment.meilisearchApiKey),
        polarApiKey: Redacted.make(environment.polarApiKey),
        polarApiUrl: environment.polarApiUrl,
        openmeterUrl: environment.openmeterUrl,
        openmeterApiKey: Redacted.make(environment.openmeterApiKey),
        postalApiUrl: environment.postalApiUrl,
        postalApiKey: Redacted.make(environment.postalApiKey),
      }),
    ),
  );

export const makePlatformEnvironmentLayer = (environment: unknown) =>
  Layer.effect(PlatformEnvironmentService, makeRuntimeEnvironment(environment));
