import { spawnSync } from "child_process";
import { Schema } from "effect";
import {
  platformRequestCorrelationIdHeaderName,
  decodeProductAppAuthCallbackStateFromEnvironment,
} from "@comvestec/platform";

const LocalBackendE2eEnvironmentSchema = Schema.Struct({
  APP_BASE_URL: Schema.NonEmptyString,
  PRODUCT_APP_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
  VALKEY_URL: Schema.NonEmptyString,
});

const LocalBackendE2eFeatureFlagsEnvironmentSchema = Schema.Struct({
  UNLEASH_URL: Schema.NonEmptyString,
  UNLEASH_API_KEY: Schema.NonEmptyString,
});

const LocalBackendE2ePolarEnvironmentSchema = Schema.Struct({
  POLAR_ACCESS_TOKEN: Schema.NonEmptyString,
  POLAR_API_URL: Schema.NonEmptyString,
});

export type LocalBackendE2eEnvironment = Schema.Schema.Type<
  typeof LocalBackendE2eEnvironmentSchema
>;

const localRuntimePlaceholderPrefixes = [
  "set-in-local-env__",
  "generate-after-",
  "set-from-",
  "set-when-",
] as const;

let localBackendE2eFeatureFlagsReady: boolean | undefined;
let localBackendE2ePolarReady: boolean | undefined;

const isPlaceholderValue = (value: string | undefined) =>
  value === undefined ||
  value.trim().length === 0 ||
  localRuntimePlaceholderPrefixes.some((prefix) => value.includes(prefix));

export const tryResolveLocalBackendE2eEnvironment = () => {
  try {
    return Schema.decodeUnknownSync(LocalBackendE2eEnvironmentSchema)(
      process.env,
    );
  } catch {
    return undefined;
  }
};

export const tryResolveLocalBackendE2eFeatureFlagsEnvironment = () => {
  try {
    const environment = Schema.decodeUnknownSync(
      LocalBackendE2eFeatureFlagsEnvironmentSchema,
    )(process.env);

    return isPlaceholderValue(environment.UNLEASH_URL) ||
      isPlaceholderValue(environment.UNLEASH_API_KEY)
      ? undefined
      : environment;
  } catch {
    return undefined;
  }
};

export const tryResolveLocalBackendE2ePolarEnvironment = () => {
  try {
    const environment = Schema.decodeUnknownSync(
      LocalBackendE2ePolarEnvironmentSchema,
    )(process.env);

    return isPlaceholderValue(environment.POLAR_ACCESS_TOKEN) ||
      isPlaceholderValue(environment.POLAR_API_URL)
      ? undefined
      : environment;
  } catch {
    return undefined;
  }
};

export const isLocalBackendE2eFeatureFlagsReady = () => {
  if (localBackendE2eFeatureFlagsReady !== undefined) {
    return localBackendE2eFeatureFlagsReady;
  }

  if (tryResolveLocalBackendE2eFeatureFlagsEnvironment() === undefined) {
    localBackendE2eFeatureFlagsReady = false;
    return localBackendE2eFeatureFlagsReady;
  }

  const probe = spawnSync(
    "bun",
    [
      "-e",
      `import { Effect } from 'effect';
import { makeUnleashAdapter } from '@comvestec/platform';

const exit = await Effect.runPromiseExit(
  makeUnleashAdapter({
    url: process.env.UNLEASH_URL,
    apiKey: process.env.UNLEASH_API_KEY,
  }),
);

if (exit._tag === 'Success') {
  await Effect.runPromise(Effect.ignore(exit.value.close));
  console.log('true');
} else {
  console.log('false');
}`,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      timeout: 15_000,
      killSignal: "SIGKILL",
    },
  );

  localBackendE2eFeatureFlagsReady =
    probe.error === undefined &&
    probe.status === 0 &&
    (probe.stdout ?? "").toString().trim() === "true";

  return localBackendE2eFeatureFlagsReady;
};

export const isLocalBackendE2ePolarReady = () => {
  if (localBackendE2ePolarReady !== undefined) {
    return localBackendE2ePolarReady;
  }

  if (tryResolveLocalBackendE2ePolarEnvironment() === undefined) {
    localBackendE2ePolarReady = false;
    return localBackendE2ePolarReady;
  }

  const probe = spawnSync(
    "bun",
    [
      "-e",
      `import { Effect } from 'effect';
import { makePolarAdapter } from '@comvestec/platform';

const exit = await Effect.runPromiseExit(
  makePolarAdapter({
    apiKey: process.env.POLAR_ACCESS_TOKEN,
    apiUrl: process.env.POLAR_API_URL,
  }).pipe(Effect.flatMap((polar) => polar.listPlans)),
);

console.log(exit._tag === 'Success' ? 'true' : 'false');`,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      timeout: 15_000,
      killSignal: "SIGKILL",
    },
  );

  localBackendE2ePolarReady =
    probe.error === undefined &&
    probe.status === 0 &&
    (probe.stdout ?? "").toString().trim() === "true";

  return localBackendE2ePolarReady;
};

export const requireResponseRedirectLocation = (response: Response) => {
  const location = response.headers.get("location");

  if (location === null) {
    throw new Error("Expected redirect response to include a location header.");
  }

  return location;
};

export const requireResponseCorrelationId = (response: Response) => {
  const correlationId = response.headers.get(
    platformRequestCorrelationIdHeaderName,
  );

  if (correlationId === null) {
    throw new Error(
      "Expected backend response to include the platform correlation header.",
    );
  }

  return correlationId;
};

export const runBackendE2eStep = async <T>(
  label: string,
  operation: Promise<T> | T,
  timeoutMs = 10_000,
) => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
};

export const runBackendE2eBunProbe = <T>(
  script: string,
  options?: {
    readonly env?: NodeJS.ProcessEnv;
    readonly timeoutMs?: number;
  },
) => {
  const probe = spawnSync("bun", ["-e", script], {
    cwd: process.cwd(),
    env: options?.env ?? process.env,
    maxBuffer: 5 * 1024 * 1024,
    timeout: options?.timeoutMs ?? 30_000,
    killSignal: "SIGKILL",
  });
  const stdout = (probe.stdout ?? "").toString();
  const stderr = (probe.stderr ?? "").toString();

  if (probe.error !== undefined) {
    throw new Error(
      [
        `Bun backend-e2e probe failed: ${probe.error.message}`,
        stdout.length > 0 ? `stdout:\n${stdout}` : undefined,
        stderr.length > 0 ? `stderr:\n${stderr}` : undefined,
      ]
        .filter((value): value is string => value !== undefined)
        .join("\n\n"),
    );
  }

  if (probe.status !== 0) {
    throw new Error(
      [
        probe.signal !== null
          ? `Bun backend-e2e probe timed out after ${options?.timeoutMs ?? 30_000}ms.`
          : `Bun backend-e2e probe exited with status ${probe.status}.`,
        stdout.length > 0 ? `stdout:\n${stdout}` : undefined,
        stderr.length > 0 ? `stderr:\n${stderr}` : undefined,
      ]
        .filter((value): value is string => value !== undefined)
        .join("\n\n"),
    );
  }

  const trimmedStdout = stdout.trim();

  if (trimmedStdout.length === 0) {
    throw new Error("Bun backend-e2e probe did not emit JSON output.");
  }

  return JSON.parse(trimmedStdout) as T;
};

export const decodeAuthCallbackStateFromRedirectLocation = (
  environment: LocalBackendE2eEnvironment,
  redirectLocation: string,
) => {
  const redirectUrl = new URL(redirectLocation);
  const state = redirectUrl.searchParams.get("state");

  if (state === null) {
    throw new Error(
      "Expected auth redirect to include a signed callback state.",
    );
  }

  return decodeProductAppAuthCallbackStateFromEnvironment(environment, state);
};
