import { Schema } from "effect";

const UnleashBackendClientNameSchema = Schema.NonEmptyString;

export const unleashBackendClientName = Schema.validateSync(
  UnleashBackendClientNameSchema,
)(
  "comvestec-backend-local" satisfies Schema.Schema.Type<
    typeof UnleashBackendClientNameSchema
  >,
);

export const normalizeUnleashApiUrl = (url: string) => {
  const trimmedUrl = url.replace(/\/$/, "");

  if (trimmedUrl.endsWith("/api")) {
    return trimmedUrl;
  }

  return `${trimmedUrl}/api`;
};

export const buildUnleashClientFeaturesEndpoint = (url: string) =>
  `${normalizeUnleashApiUrl(url)}/client/features`;

export const buildUnleashValidationHeaders = (apiKey: string) => ({
  Accept: "application/json",
  Authorization: apiKey,
  "UNLEASH-APPNAME": unleashBackendClientName,
  "UNLEASH-INSTANCEID": unleashBackendClientName,
});
