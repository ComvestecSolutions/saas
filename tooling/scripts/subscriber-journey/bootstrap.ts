import { Effect, Schema } from "effect";
import { env as processEnvironment, exit as exitProcess } from "node:process";
import {
  hostFromUrlString,
  issueKeycloakPasswordGrant,
  isPlaceholderValue,
  originFromUrlString,
  printToolingScriptError,
  requestEmpty,
  requestJson,
  requestUnknownJson,
  resolveOptionalOverride,
  runBunScript,
  subscriberJourneySmokeDefaults,
  uniqueStrings,
} from "./common";

const SubscriberJourneyBootstrapEnvironmentSchema = Schema.Struct({
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_ADMIN: Schema.NonEmptyString,
  KEYCLOAK_ADMIN_PASSWORD: Schema.NonEmptyString,
  APP_BASE_URL: Schema.NonEmptyString,
  PRODUCT_APP_PORT: Schema.NonEmptyString,
  ADMIN_APP_PORT: Schema.NonEmptyString,
  SUBSCRIBER_JOURNEY_PUBLIC_BASE_URL: Schema.optional(Schema.NonEmptyString),
  SUBSCRIBER_JOURNEY_SMOKE_RETURN_HOST: Schema.optional(Schema.NonEmptyString),
  SUBSCRIBER_JOURNEY_SMOKE_USER_USERNAME: Schema.optional(
    Schema.NonEmptyString,
  ),
  SUBSCRIBER_JOURNEY_SMOKE_USER_EMAIL: Schema.optional(Schema.NonEmptyString),
  SUBSCRIBER_JOURNEY_SMOKE_USER_PASSWORD: Schema.optional(
    Schema.NonEmptyString,
  ),
  SUBSCRIBER_JOURNEY_SMOKE_USER_FIRST_NAME: Schema.optional(
    Schema.NonEmptyString,
  ),
  SUBSCRIBER_JOURNEY_SMOKE_USER_LAST_NAME: Schema.optional(
    Schema.NonEmptyString,
  ),
});

type SubscriberJourneyBootstrapEnvironment = Schema.Schema.Type<
  typeof SubscriberJourneyBootstrapEnvironmentSchema
>;

const KeycloakClientMatchSchema = Schema.Array(
  Schema.Struct({
    id: Schema.NonEmptyString,
  }),
);

const KeycloakUserMatchSchema = Schema.Array(
  Schema.Struct({
    id: Schema.NonEmptyString,
  }),
);

const decodeBootstrapEnvironment = Schema.decodeUnknown(
  SubscriberJourneyBootstrapEnvironmentSchema,
);

const decodeKeycloakClientMatch = Schema.decodeUnknown(
  KeycloakClientMatchSchema,
);

const decodeKeycloakUserMatch = Schema.decodeUnknown(KeycloakUserMatchSchema);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readStringArray = (record: Record<string, unknown>, key: string) => {
  const value = record[key];

  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
};

const resolveSmokeFixture = (
  environment: SubscriberJourneyBootstrapEnvironment,
) => {
  const returnHost = resolveOptionalOverride(
    environment.SUBSCRIBER_JOURNEY_SMOKE_RETURN_HOST,
    `http://localhost:${environment.PRODUCT_APP_PORT}/auth/callback`,
  );

  return {
    username: resolveOptionalOverride(
      environment.SUBSCRIBER_JOURNEY_SMOKE_USER_USERNAME,
      subscriberJourneySmokeDefaults.username,
    ),
    email: resolveOptionalOverride(
      environment.SUBSCRIBER_JOURNEY_SMOKE_USER_EMAIL,
      subscriberJourneySmokeDefaults.email,
    ),
    password: resolveOptionalOverride(
      environment.SUBSCRIBER_JOURNEY_SMOKE_USER_PASSWORD,
      subscriberJourneySmokeDefaults.password,
    ),
    firstName: resolveOptionalOverride(
      environment.SUBSCRIBER_JOURNEY_SMOKE_USER_FIRST_NAME,
      subscriberJourneySmokeDefaults.firstName,
    ),
    lastName: resolveOptionalOverride(
      environment.SUBSCRIBER_JOURNEY_SMOKE_USER_LAST_NAME,
      subscriberJourneySmokeDefaults.lastName,
    ),
    returnHost,
  };
};

const createKeycloakAdminHeaders = (accessToken: string) => ({
  Accept: "application/json",
  Authorization: `Bearer ${accessToken}`,
});

const buildExactMatchUrl = (
  baseUrl: string,
  pathname: string,
  key: string,
  value: string,
) => {
  const url = new URL(pathname, baseUrl);
  url.searchParams.set(key, value);
  url.searchParams.set("exact", "true");
  return url.toString();
};

const ensureClientRepresentation = (value: unknown) =>
  isRecord(value)
    ? Effect.succeed(value)
    : Effect.fail({
        _tag: "ToolingScriptConfigurationError",
        key: "KEYCLOAK_CLIENT_ID",
        message:
          "Keycloak returned an unexpected client representation payload.",
      } as const);

const main = Effect.gen(function* () {
  const environment = yield* decodeBootstrapEnvironment(processEnvironment);
  const smokeFixture = resolveSmokeFixture(environment);

  console.log(
    "Applying PostgreSQL migrations for the subscriber journey backend...",
  );
  yield* runBunScript("db:migrate");

  console.log("Requesting a Keycloak admin session...");
  const adminAccessToken = yield* issueKeycloakPasswordGrant({
    baseUrl: environment.KEYCLOAK_BASE_URL,
    realm: "master",
    clientId: "admin-cli",
    username: environment.KEYCLOAK_ADMIN,
    password: environment.KEYCLOAK_ADMIN_PASSWORD,
  });

  const keycloakHeaders = createKeycloakAdminHeaders(adminAccessToken);

  const keycloakClientMatches = yield* requestJson({
    operation: "keycloak.lookupClient",
    url: buildExactMatchUrl(
      environment.KEYCLOAK_BASE_URL,
      `/admin/realms/${environment.KEYCLOAK_REALM}/clients`,
      "clientId",
      environment.KEYCLOAK_CLIENT_ID,
    ),
    init: {
      headers: keycloakHeaders,
    },
    decode: decodeKeycloakClientMatch,
  });

  const keycloakClient = keycloakClientMatches[0];

  if (keycloakClient === undefined) {
    return yield* Effect.fail({
      _tag: "ToolingScriptConfigurationError",
      key: "KEYCLOAK_CLIENT_ID",
      message: `Keycloak client \"${environment.KEYCLOAK_CLIENT_ID}\" was not found in realm \"${environment.KEYCLOAK_REALM}\".`,
    } as const);
  }

  const rawClientRepresentation = yield* requestUnknownJson({
    operation: "keycloak.readClient",
    url: new URL(
      `/admin/realms/${environment.KEYCLOAK_REALM}/clients/${keycloakClient.id}`,
      environment.KEYCLOAK_BASE_URL,
    ).toString(),
    init: {
      headers: keycloakHeaders,
    },
  });

  const clientRepresentation = yield* ensureClientRepresentation(
    rawClientRepresentation,
  );

  const appBaseOrigin = yield* originFromUrlString(
    environment.APP_BASE_URL,
    "APP_BASE_URL",
  );
  const smokeReturnOrigin = yield* originFromUrlString(
    smokeFixture.returnHost,
    "SUBSCRIBER_JOURNEY_SMOKE_RETURN_HOST",
  );
  const optionalPublicBaseOrigin =
    environment.SUBSCRIBER_JOURNEY_PUBLIC_BASE_URL === undefined ||
    isPlaceholderValue(environment.SUBSCRIBER_JOURNEY_PUBLIC_BASE_URL)
      ? undefined
      : yield* originFromUrlString(
          environment.SUBSCRIBER_JOURNEY_PUBLIC_BASE_URL,
          "SUBSCRIBER_JOURNEY_PUBLIC_BASE_URL",
        );

  const desiredOrigins = uniqueStrings([
    appBaseOrigin,
    `http://localhost:${environment.PRODUCT_APP_PORT}`,
    `http://localhost:${environment.ADMIN_APP_PORT}`,
    smokeReturnOrigin,
    ...(optionalPublicBaseOrigin !== undefined
      ? [optionalPublicBaseOrigin]
      : []),
  ]);

  const desiredRedirectUris = uniqueStrings(
    desiredOrigins.map((origin) => `${origin}/*`),
  );

  const mergedRedirectUris = uniqueStrings([
    ...readStringArray(clientRepresentation, "redirectUris"),
    ...desiredRedirectUris,
  ]);
  const mergedWebOrigins = uniqueStrings([
    ...readStringArray(clientRepresentation, "webOrigins"),
    ...desiredOrigins,
  ]);

  yield* requestEmpty({
    operation: "keycloak.updateClient",
    url: new URL(
      `/admin/realms/${environment.KEYCLOAK_REALM}/clients/${keycloakClient.id}`,
      environment.KEYCLOAK_BASE_URL,
    ).toString(),
    init: {
      method: "PUT",
      headers: {
        ...keycloakHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...clientRepresentation,
        redirectUris: mergedRedirectUris,
        webOrigins: mergedWebOrigins,
        directAccessGrantsEnabled: true,
        serviceAccountsEnabled: true,
        standardFlowEnabled: true,
      }),
    },
  });

  const keycloakUserLookupUrl = buildExactMatchUrl(
    environment.KEYCLOAK_BASE_URL,
    `/admin/realms/${environment.KEYCLOAK_REALM}/users`,
    "username",
    smokeFixture.username,
  );

  const existingUsers = yield* requestJson({
    operation: "keycloak.lookupSmokeUser",
    url: keycloakUserLookupUrl,
    init: {
      headers: keycloakHeaders,
    },
    decode: decodeKeycloakUserMatch,
  });

  if (existingUsers[0] === undefined) {
    yield* requestEmpty({
      operation: "keycloak.createSmokeUser",
      url: new URL(
        `/admin/realms/${environment.KEYCLOAK_REALM}/users`,
        environment.KEYCLOAK_BASE_URL,
      ).toString(),
      init: {
        method: "POST",
        headers: {
          ...keycloakHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: smokeFixture.username,
          email: smokeFixture.email,
          firstName: smokeFixture.firstName,
          lastName: smokeFixture.lastName,
          enabled: true,
          emailVerified: true,
        }),
      },
    });
  }

  const ensuredUsers = yield* requestJson({
    operation: "keycloak.ensureSmokeUser",
    url: keycloakUserLookupUrl,
    init: {
      headers: keycloakHeaders,
    },
    decode: decodeKeycloakUserMatch,
  });

  const smokeUser = ensuredUsers[0];

  if (smokeUser === undefined) {
    return yield* Effect.fail({
      _tag: "ToolingScriptConfigurationError",
      key: "SUBSCRIBER_JOURNEY_SMOKE_USER_USERNAME",
      message:
        "Failed to create or locate the subscriber-journey smoke user in Keycloak.",
    } as const);
  }

  yield* requestEmpty({
    operation: "keycloak.updateSmokeUserProfile",
    url: new URL(
      `/admin/realms/${environment.KEYCLOAK_REALM}/users/${smokeUser.id}`,
      environment.KEYCLOAK_BASE_URL,
    ).toString(),
    init: {
      method: "PUT",
      headers: {
        ...keycloakHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: smokeUser.id,
        username: smokeFixture.username,
        email: smokeFixture.email,
        firstName: smokeFixture.firstName,
        lastName: smokeFixture.lastName,
        enabled: true,
        emailVerified: true,
      }),
    },
  });

  yield* requestEmpty({
    operation: "keycloak.resetSmokeUserPassword",
    url: new URL(
      `/admin/realms/${environment.KEYCLOAK_REALM}/users/${smokeUser.id}/reset-password`,
      environment.KEYCLOAK_BASE_URL,
    ).toString(),
    init: {
      method: "PUT",
      headers: {
        ...keycloakHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        temporary: false,
        type: "password",
        value: smokeFixture.password,
      }),
    },
  });

  const smokeReturnHost = yield* hostFromUrlString(
    smokeFixture.returnHost,
    "SUBSCRIBER_JOURNEY_SMOKE_RETURN_HOST",
  );

  console.log("Subscriber journey bootstrap completed.");
  console.log(`- Keycloak realm: ${environment.KEYCLOAK_REALM}`);
  console.log(`- Keycloak client: ${environment.KEYCLOAK_CLIENT_ID}`);
  console.log(`- Smoke user: ${smokeFixture.username} (${smokeFixture.email})`);
  console.log(`- Smoke return host: ${smokeFixture.returnHost}`);
  console.log(`- Smoke request host header: ${smokeReturnHost}`);
});

try {
  await Effect.runPromise(main);
} catch (error) {
  printToolingScriptError(error);
  exitProcess(1);
}
