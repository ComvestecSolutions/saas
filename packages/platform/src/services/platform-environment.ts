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
  readonly keycloakConvexServiceActorUsername: string;
  readonly keycloakConvexServiceActorPassword: Redacted.Redacted<string>;
  readonly otelEndpoint: string;
  readonly grafanaBaseUrl: string;
  readonly valkeyUrl: string;
  readonly unleashUrl: string;
  readonly unleashApiKey: Redacted.Redacted<string>;
  readonly ketoReadUrl: string;
  readonly ketoWriteUrl: string;
  readonly errorTrackingDsn: string;
  readonly openpanelClientId: string;
  readonly openpanelClientSecret: Redacted.Redacted<string>;
  readonly openpanelApiUrl: string;
  readonly novuApiKey: Redacted.Redacted<string>;
  readonly novuApiUrl: string;
  readonly meilisearchUrl: string;
  readonly meilisearchApiKey: Redacted.Redacted<string>;
  readonly polarAccessToken: Redacted.Redacted<string>;
  readonly polarApiUrl: string;
  readonly polarWebhookSecret: Redacted.Redacted<string>;
  readonly openmeterUrl: string;
  readonly openmeterApiKey: Redacted.Redacted<string>;
  readonly postalApiUrl: string;
  readonly postalApiKey: Redacted.Redacted<string>;
  readonly platformEmailSenderDisplayName: string;
  readonly platformEmailSenderFromEmail: string;
  readonly platformEmailSenderReplyToEmail: string;
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
        keycloakConvexServiceActorUsername:
          environment.keycloakConvexServiceActorUsername,
        keycloakConvexServiceActorPassword: Redacted.make(
          environment.keycloakConvexServiceActorPassword,
        ),
        otelEndpoint: environment.otelEndpoint,
        grafanaBaseUrl: environment.grafanaBaseUrl,
        valkeyUrl: environment.valkeyUrl,
        unleashUrl: environment.unleashUrl,
        unleashApiKey: Redacted.make(environment.unleashApiKey),
        ketoReadUrl: environment.ketoReadUrl,
        ketoWriteUrl: environment.ketoWriteUrl,
        errorTrackingDsn: environment.errorTrackingDsn,
        openpanelClientId: environment.openpanelClientId,
        openpanelClientSecret: Redacted.make(environment.openpanelClientSecret),
        openpanelApiUrl: environment.openpanelApiUrl,
        novuApiKey: Redacted.make(environment.novuApiKey),
        novuApiUrl: environment.novuApiUrl,
        meilisearchUrl: environment.meilisearchUrl,
        meilisearchApiKey: Redacted.make(environment.meilisearchApiKey),
        polarAccessToken: Redacted.make(environment.polarAccessToken),
        polarApiUrl: environment.polarApiUrl,
        polarWebhookSecret: Redacted.make(environment.polarWebhookSecret),
        openmeterUrl: environment.openmeterUrl,
        openmeterApiKey: Redacted.make(environment.openmeterApiKey),
        postalApiUrl: environment.postalApiUrl,
        postalApiKey: Redacted.make(environment.postalApiKey),
        platformEmailSenderDisplayName:
          environment.platformEmailSenderDisplayName,
        platformEmailSenderFromEmail: environment.platformEmailSenderFromEmail,
        platformEmailSenderReplyToEmail:
          environment.platformEmailSenderReplyToEmail,
      }),
    ),
  );

export const makePlatformEnvironmentLayer = (environment: unknown) =>
  Layer.effect(PlatformEnvironmentService, makeRuntimeEnvironment(environment));
