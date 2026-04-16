import { Effect, ParseResult, Schema } from "effect";
import { dirname, resolve } from "node:path";
import { env as processEnvironment, execPath } from "node:process";
import { fileURLToPath } from "node:url";

export const subscriberJourneySmokeDefaults = {
  username: "smoke.owner",
  email: "smoke.owner@local.test",
  password: "Passw0rd!",
  firstName: "Smoke",
  lastName: "Owner",
  tenantId: "org_smoke",
  enterpriseId: "ent_smoke",
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

export const workspaceRootDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

export const decodeKeycloakTokenResponse = Schema.decodeUnknown(
  KeycloakTokenResponseSchema,
);

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
      const childProcess = Bun.spawn([execPath, "run", script], {
        cwd: workspaceRootDirectory,
        env: processEnvironment,
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
