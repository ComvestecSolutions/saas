import { Effect, ParseResult, Schema } from "effect";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { identityClaimKey, type RequestContext } from "@comvestec/contracts";
import { makeValkeyAdapter } from "@comvestec/platform";

export const subscriberJourneySmokeDefaults = {
  username: "smoke.owner",
  email: "smoke.owner@local.test",
  password: "Passw0rd!",
  firstName: "Smoke",
  lastName: "Owner",
  tenantId: "org_smoke",
  enterpriseId: "ent_smoke",
} as const;

export const subscriberJourneyConvexServiceActorDefaults = {
  username: "convex.billing.service",
  email: "convex.billing.service@local.test",
  password: "Passw0rd!",
  firstName: "Convex",
  lastName: "Billing Service",
} as const;

export type ToolingScriptConfigurationError = {
  readonly _tag: "ToolingScriptConfigurationError";
  readonly key: string;
  readonly message: string;
};

export type ToolingScriptHttpError = {
  readonly _tag: "ToolingScriptHttpError";
  readonly operation: string;
  readonly cause: unknown;
  readonly status?: number;
  readonly body?: string;
};

export type ToolingScriptProcessError = {
  readonly _tag: "ToolingScriptProcessError";
  readonly script: string;
  readonly exitCode: number;
};

const isTaggedError = (error: unknown): error is { readonly _tag: string } =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  typeof (error as Record<string, unknown>)._tag === "string";

const isToolingScriptConfigurationError = (
  error: unknown,
): error is ToolingScriptConfigurationError =>
  isTaggedError(error) && error._tag === "ToolingScriptConfigurationError";

const isToolingScriptProcessError = (
  error: unknown,
): error is ToolingScriptProcessError =>
  isTaggedError(error) && error._tag === "ToolingScriptProcessError";

const isToolingScriptHttpError = (
  error: unknown,
): error is ToolingScriptHttpError =>
  isTaggedError(error) && error._tag === "ToolingScriptHttpError";

type ToolingScriptRequestFailure = {
  readonly cause: unknown;
  readonly status?: number;
  readonly body?: string;
};

const KeycloakTokenResponseSchema = Schema.Struct({
  access_token: Schema.NonEmptyString,
});

type KeycloakTokenResponse = Schema.Schema.Type<
  typeof KeycloakTokenResponseSchema
>;

const isToolingScriptRequestFailure = (
  cause: unknown,
): cause is ToolingScriptRequestFailure =>
  typeof cause === "object" && cause !== null && "cause" in cause;

const buildToolingScriptHttpError = (
  operation: string,
  failure: ToolingScriptRequestFailure,
): ToolingScriptHttpError => ({
  _tag: "ToolingScriptHttpError",
  operation,
  cause: failure.cause,
  ...(failure.status !== undefined ? { status: failure.status } : {}),
  ...(failure.body !== undefined ? { body: failure.body } : {}),
});

const buildToolingScriptProcessError = (
  script: string,
  exitCode: number,
): ToolingScriptProcessError => ({
  _tag: "ToolingScriptProcessError",
  script,
  exitCode,
});

type BunWithWhich = typeof Bun & {
  readonly which?: (executable: string) => string | null | undefined;
};

const bunRuntime = (
  globalThis as typeof globalThis & {
    readonly Bun?: BunWithWhich;
  }
).Bun;

const bunExecutableFromPath = bunRuntime?.which?.("bun");

export const workspaceRootDirectory = dirname(
  fileURLToPath(new URL("../../../package.json", import.meta.url)),
);

export const bunExecutablePath =
  process.execPath.length > 0
    ? process.execPath
    : (bunExecutableFromPath ?? "bun");

export const decodeKeycloakTokenResponse = Schema.decodeUnknown(
  KeycloakTokenResponseSchema,
);

const buildToolingScriptConfigurationError = (
  key: string,
  message: string,
): ToolingScriptConfigurationError => ({
  _tag: "ToolingScriptConfigurationError",
  key,
  message,
});

export const createKeycloakAdminHeaders = (accessToken: string) => ({
  Accept: "application/json",
  Authorization: `Bearer ${accessToken}`,
});

export const buildExactMatchUrl = (
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const ensureRecord = (input: {
  readonly value: unknown;
  readonly key: string;
  readonly message: string;
}) =>
  isRecord(input.value)
    ? Effect.succeed(input.value)
    : Effect.fail(
        buildToolingScriptConfigurationError(input.key, input.message),
      );

const readStringArray = (record: Record<string, unknown>, key: string) => {
  const value = record[key];

  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
};

export const keycloakActorTypeProtocolMapperName = "comvestec-actor-type";

const buildKeycloakActorTypeProtocolMapper = () => ({
  name: keycloakActorTypeProtocolMapperName,
  protocol: "openid-connect",
  protocolMapper: "oidc-usermodel-attribute-mapper",
  config: {
    "access.token.claim": "true",
    "id.token.claim": "true",
    "userinfo.token.claim": "true",
    "claim.name": identityClaimKey.actorType,
    "jsonType.label": "String",
    "user.attribute": identityClaimKey.actorType,
  },
});

const buildKeycloakActorTypeProfileAttribute = () => ({
  name: identityClaimKey.actorType,
  displayName: "Comvestec actor type",
  permissions: {
    view: ["admin"],
    edit: ["admin"],
  },
  multivalued: false,
});

export const ensureKeycloakActorTypeClaimConfiguration = (input: {
  readonly baseUrl: string;
  readonly realm: string;
  readonly clientId: string;
  readonly headers: Readonly<Record<string, string>>;
}) =>
  Effect.gen(function* () {
    const userProfileUrl = new URL(
      `/admin/realms/${input.realm}/users/profile`,
      input.baseUrl,
    ).toString();
    const rawUserProfileConfiguration = yield* requestUnknownJson({
      operation: "keycloak.readUserProfile",
      url: userProfileUrl,
      init: {
        headers: input.headers,
      },
    });
    const userProfileConfiguration = yield* ensureRecord({
      value: rawUserProfileConfiguration,
      key: "KEYCLOAK_REALM",
      message:
        "Keycloak returned an unexpected user-profile configuration payload.",
    });
    const existingUserProfileAttributes = Array.isArray(
      userProfileConfiguration.attributes,
    )
      ? userProfileConfiguration.attributes.filter(isRecord)
      : [];
    const mergedUserProfileAttributes = [
      ...existingUserProfileAttributes.filter(
        (attribute) => attribute.name !== identityClaimKey.actorType,
      ),
      buildKeycloakActorTypeProfileAttribute(),
    ];

    yield* requestEmpty({
      operation: "keycloak.updateUserProfile",
      url: userProfileUrl,
      init: {
        method: "PUT",
        headers: {
          ...input.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...userProfileConfiguration,
          attributes: mergedUserProfileAttributes,
        }),
      },
    });

    const protocolMappersUrl = new URL(
      `/admin/realms/${input.realm}/clients/${input.clientId}/protocol-mappers/models`,
      input.baseUrl,
    ).toString();
    const rawProtocolMappers = yield* requestUnknownJson({
      operation: "keycloak.listClientProtocolMappers",
      url: protocolMappersUrl,
      init: {
        headers: input.headers,
      },
    });

    if (!Array.isArray(rawProtocolMappers)) {
      return yield* Effect.fail(
        buildToolingScriptConfigurationError(
          "KEYCLOAK_CLIENT_ID",
          "Keycloak returned an unexpected protocol-mapper payload.",
        ),
      );
    }

    const existingActorTypeMapper = rawProtocolMappers
      .filter(isRecord)
      .find((mapper) => mapper.name === keycloakActorTypeProtocolMapperName);
    const actorTypeMapper = buildKeycloakActorTypeProtocolMapper();

    if (existingActorTypeMapper === undefined) {
      yield* requestEmpty({
        operation: "keycloak.createActorTypeProtocolMapper",
        url: protocolMappersUrl,
        init: {
          method: "POST",
          headers: {
            ...input.headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(actorTypeMapper),
        },
      });
      return;
    }

    const existingActorTypeMapperId = existingActorTypeMapper.id;

    if (
      typeof existingActorTypeMapperId !== "string" ||
      existingActorTypeMapperId.length === 0
    ) {
      return yield* Effect.fail(
        buildToolingScriptConfigurationError(
          "KEYCLOAK_CLIENT_ID",
          "Keycloak returned an actor-type protocol mapper without an id.",
        ),
      );
    }

    yield* requestEmpty({
      operation: "keycloak.updateActorTypeProtocolMapper",
      url: new URL(
        `/admin/realms/${input.realm}/clients/${input.clientId}/protocol-mappers/models/${existingActorTypeMapperId}`,
        input.baseUrl,
      ).toString(),
      init: {
        method: "PUT",
        headers: {
          ...input.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...actorTypeMapper,
          id: existingActorTypeMapperId,
        }),
      },
    });
  });

export const requestJson = <A>(options: {
  readonly operation: string;
  readonly url: string;
  readonly init?: RequestInit;
  readonly decode: (
    payload: unknown,
  ) => Effect.Effect<A, ParseResult.ParseError>;
}) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(options.url, options.init);
      const responseText = await response.text();

      if (!response.ok) {
        throw {
          cause: response.statusText,
          status: response.status,
          body: responseText,
        } satisfies ToolingScriptRequestFailure;
      }

      return responseText.length === 0 ? {} : JSON.parse(responseText);
    },
    catch: (cause) => {
      if (isToolingScriptRequestFailure(cause)) {
        return buildToolingScriptHttpError(options.operation, cause);
      }

      return buildToolingScriptHttpError(options.operation, { cause });
    },
  }).pipe(Effect.flatMap(options.decode));

export const requestUnknownJson = (options: {
  readonly operation: string;
  readonly url: string;
  readonly init?: RequestInit;
}) =>
  requestJson({
    ...options,
    decode: (payload) => Effect.succeed(payload),
  });

export const requestEmpty = (options: {
  readonly operation: string;
  readonly url: string;
  readonly init?: RequestInit;
}) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(options.url, options.init);
      const responseText = await response.text();

      if (!response.ok) {
        throw {
          cause: response.statusText,
          status: response.status,
          body: responseText,
        } satisfies ToolingScriptRequestFailure;
      }
    },
    catch: (cause) => {
      if (isToolingScriptRequestFailure(cause)) {
        return buildToolingScriptHttpError(options.operation, cause);
      }

      return buildToolingScriptHttpError(options.operation, { cause });
    },
  });

export const issueKeycloakPasswordGrant = (input: {
  readonly baseUrl: string;
  readonly realm: string;
  readonly clientId: string;
  readonly username: string;
  readonly password: string;
  readonly clientSecret?: string;
}) => {
  const tokenUrl = new URL(
    `/realms/${input.realm}/protocol/openid-connect/token`,
    input.baseUrl,
  );

  const form = new URLSearchParams({
    client_id: input.clientId,
    grant_type: "password",
    username: input.username,
    password: input.password,
  });

  if (input.clientSecret !== undefined) {
    form.set("client_secret", input.clientSecret);
  }

  return requestJson({
    operation: `keycloak.passwordGrant:${input.realm}`,
    url: tokenUrl.toString(),
    init: {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    },
    decode: decodeKeycloakTokenResponse,
  }).pipe(
    Effect.map((response: KeycloakTokenResponse) => response.access_token),
  );
};

export const runBunScript = (script: string) =>
  Effect.tryPromise({
    try: async () => {
      const childProcess = Bun.spawn([bunExecutablePath, "run", script], {
        cwd: workspaceRootDirectory,
        env: Bun.env,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      const exitCode = await childProcess.exited;

      if (exitCode !== 0) {
        throw buildToolingScriptProcessError(script, exitCode);
      }
    },
    catch: (cause) => {
      if (
        typeof cause === "object" &&
        cause !== null &&
        "_tag" in cause &&
        cause._tag === "ToolingScriptProcessError"
      ) {
        return cause;
      }

      return buildToolingScriptProcessError(script, -1);
    },
  });

export const persistSyntheticRequestContextSession = (input: {
  readonly valkeyUrl: string;
  readonly sessionId: string;
  readonly requestContext: RequestContext;
}) =>
  makeValkeyAdapter({ url: input.valkeyUrl }).pipe(
    Effect.flatMap((valkey) =>
      valkey
        .writeSession({
          sessionId: input.sessionId,
          requestContext: input.requestContext,
        })
        .pipe(Effect.ensuring(Effect.ignore(valkey.close))),
    ),
  );

export const resolveOptionalOverride = (
  value: string | undefined,
  fallback: string,
) => {
  const trimmedValue = value?.trim();
  return trimmedValue !== undefined && trimmedValue.length > 0
    ? trimmedValue
    : fallback;
};

export const uniqueStrings = (values: Iterable<string>) => [
  ...new Set([...values].filter((value) => value.length > 0)),
];

export const originFromUrlString = (value: string, key: string) =>
  Effect.try({
    try: () => new URL(value).origin,
    catch: () =>
      ({
        _tag: "ToolingScriptConfigurationError",
        key,
        message: `${key} must be a valid absolute URL.`,
      }) satisfies ToolingScriptConfigurationError,
  });

export const hostFromUrlString = (value: string, key: string) =>
  Effect.try({
    try: () => new URL(value).host,
    catch: () =>
      ({
        _tag: "ToolingScriptConfigurationError",
        key,
        message: `${key} must be a valid absolute URL.`,
      }) satisfies ToolingScriptConfigurationError,
  });

export const isPlaceholderValue = (value: string) =>
  value.startsWith("set-from-") ||
  value.startsWith("generate-after-") ||
  value.includes("set-public-tunnel-host-before-live-smoke");

export const requireConfiguredValue = (key: string, value: string) =>
  isPlaceholderValue(value)
    ? Effect.fail({
        _tag: "ToolingScriptConfigurationError",
        key,
        message: `${key} still contains a placeholder value. Update .env before running this live step.`,
      } satisfies ToolingScriptConfigurationError)
    : Effect.succeed(value);

export const printToolingScriptError = (error: unknown) => {
  if (isToolingScriptConfigurationError(error)) {
    console.error(`Configuration error for ${error.key}: ${error.message}`);
    return;
  }

  if (isToolingScriptProcessError(error)) {
    console.error(
      `Command failed: bun run ${error.script} exited with code ${error.exitCode}.`,
    );
    return;
  }

  if (isToolingScriptHttpError(error)) {
    console.error(`HTTP error during ${error.operation}.`);

    if (error.status !== undefined) {
      console.error(`Status: ${error.status}`);
    }

    if (error.body !== undefined && error.body.length > 0) {
      console.error(error.body);
    }

    return;
  }

  if (isTaggedError(error) && error._tag === "ParseError") {
    console.error(String(error));
    return;
  }

  console.error(error);
};
