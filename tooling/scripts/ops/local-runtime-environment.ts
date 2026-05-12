import { constants as fsConstants } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const workspaceRootDirectory = resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
);

export const envExampleFilePath = resolve(
  workspaceRootDirectory,
  ".env.example",
);
export const envLocalFilePath = resolve(workspaceRootDirectory, ".env.local");
export const legacyEnvFilePath = resolve(workspaceRootDirectory, ".env");
export const localRuntimeVaultPath = "platform/local-ops/runtime-env";

export const localPlaceholderPrefix = "set-in-local-env__";
export const generatedDuringBootstrapPrefix = "generate-after-";
export const externalProviderPlaceholderPrefix = "set-from-";
export const operatorBootstrapPlaceholderPrefix = "set-when-";
export const envFileSecretOnlyKeys = ["OPENPANEL_RESEND_API_KEY"] as const;

export const vaultManagedEnvironmentKeys = [
  "POSTGRES_DB",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_URL",
  "POSTGRES_URL_INTERNAL",
  "CONVEX_POSTGRES_URL",
  "KEYCLOAK_ADMIN",
  "KEYCLOAK_ADMIN_PASSWORD",
  "KEYCLOAK_CLIENT_SECRET",
  "KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD",
  "SUBSCRIBER_JOURNEY_SMOKE_USER_PASSWORD",
  "GRAFANA_ADMIN_USER",
  "GRAFANA_ADMIN_PASSWORD",
  "GLITCHTIP_SECRET_KEY",
  "GLITCHTIP_DATABASE_URL",
  "GLITCHTIP_OPERATOR_EMAIL",
  "GLITCHTIP_OPERATOR_PASSWORD",
  "KETO_DSN",
  "UNLEASH_API_KEY",
  "UNLEASH_API_TOKEN",
  "UNLEASH_DATABASE_URL",
  "UNLEASH_OPERATOR_USERNAME",
  "UNLEASH_OPERATOR_EMAIL",
  "UNLEASH_OPERATOR_PASSWORD",
  "MEILISEARCH_MASTER_KEY",
  "MEILISEARCH_API_KEY",
  "NOVU_MONGO_INITDB_ROOT_PASSWORD",
  "NOVU_MONGO_URL",
  "NOVU_JWT_SECRET",
  "NOVU_STORE_ENCRYPTION_KEY",
  "NOVU_FNAME",
  "NOVU_LNAME",
  "NOVU_EMAIL",
  "NOVU_ORGANIZATION_NAME",
  "NOVU_PASSWORD",
  "OPENMETER_POSTGRES_URL",
  "OPENMETER_API_KEY",
  "POSTAL_MARIADB_PASSWORD",
  "POSTAL_RAILS_SECRET_KEY",
  "POSTAL_SIGNING_KEY_BASE64",
  "POSTAL_FNAME",
  "POSTAL_LNAME",
  "POSTAL_EMAIL",
  "POSTAL_PASSWORD",
  "OPENPANEL_POSTGRES_USER",
  "OPENPANEL_POSTGRES_PASSWORD",
  "OPENPANEL_POSTGRES_DB",
  "OPENPANEL_DATABASE_URL",
  "OPENPANEL_DATABASE_URL_DIRECT",
  "OPENPANEL_COOKIE_SECRET",
  "OPENPANEL_OPERATOR_EMAIL",
  "OPENPANEL_OPERATOR_PASSWORD",
] as const;

export type VaultManagedEnvironmentKey =
  (typeof vaultManagedEnvironmentKeys)[number];

type PostgresUrlInput = {
  readonly scheme: "postgres" | "postgresql";
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly database?: string;
  readonly query?: string;
};

type VaultTokenResolution = {
  readonly token?: string;
  readonly source?: string;
};

type VaultKvV2Path = {
  readonly mount: string;
  readonly secretPath: string;
};

type VaultRecordResult = {
  readonly data: Readonly<Record<string, string>>;
  readonly tokenSource?: string;
  readonly wasFound: boolean;
};

export type LocalRuntimeEnvironmentResult = {
  readonly values: Readonly<Record<string, string>>;
  readonly baseValues: Readonly<Record<string, string>>;
  readonly envFileSources: readonly string[];
  readonly vaultData: Readonly<Record<string, string>>;
  readonly vaultTokenSource?: string;
  readonly vaultWasFound: boolean;
  readonly missingManagedKeys: readonly VaultManagedEnvironmentKey[];
  readonly legacyEnvWasRead: boolean;
};

const overlayShellValuesOntoPlaceholders = (input: {
  readonly values: Readonly<Record<string, string>>;
  readonly shellValues: Readonly<Record<string, string | undefined>>;
}) =>
  Object.fromEntries(
    Object.entries(input.values).map(([key, value]) => {
      const shellValue = input.shellValues[key]?.trim();

      return [
        key,
        shellValue !== undefined &&
        shellValue.length > 0 &&
        isPlaceholderValue(value)
          ? shellValue
          : value,
      ];
    }),
  );

const sortObjectEntries = (values: Readonly<Record<string, string>>) =>
  Object.entries(values).sort(([left], [right]) => left.localeCompare(right));

export const buildPostgresUrl = (input: PostgresUrlInput) => {
  const credentials = `${encodeURIComponent(input.user)}:${encodeURIComponent(input.password)}`;
  const databasePath = input.database !== undefined ? `/${input.database}` : "";
  const querySuffix = input.query !== undefined ? `?${input.query}` : "";

  return `${input.scheme}://${credentials}@${input.host}:${input.port}${databasePath}${querySuffix}`;
};

export const resolveHostPostgresPort = (
  values: Readonly<Record<string, string>>,
) => {
  const rawPortValue = values.POSTGRES_PORT?.trim();

  if (rawPortValue === undefined) {
    return 5432;
  }

  const parsedPort = Number.parseInt(rawPortValue, 10);

  return Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 5432;
};

const collectEnvFileSecretKeys = (
  baseValues: Readonly<Record<string, string>>,
) =>
  new Set<string>([
    ...Object.entries(baseValues).flatMap(([key, value]) =>
      isPlaceholderValue(value) ? [key] : [],
    ),
    ...envFileSecretOnlyKeys,
  ]);

export const collectConcreteEnvFileSecretEntries = (input: {
  readonly values: Readonly<Record<string, string>>;
  readonly baseValues: Readonly<Record<string, string>>;
}) => {
  const secretKeys = collectEnvFileSecretKeys(input.baseValues);
  const concreteEntries = Object.entries(input.values).reduce<
    Array<readonly [string, string]>
  >((entries, [key, value]) => {
    const normalizedValue = value.trim();

    if (
      secretKeys.has(key) &&
      normalizedValue.length > 0 &&
      !isPlaceholderValue(normalizedValue)
    ) {
      entries.push([key, value]);
    }

    return entries;
  }, []);

  return Object.fromEntries(
    concreteEntries.sort(([left], [right]) => left.localeCompare(right)),
  ) satisfies Record<string, string>;
};

const collectConcreteEnvFileSecretKeys = (input: {
  readonly values: Readonly<Record<string, string>>;
  readonly baseValues: Readonly<Record<string, string>>;
}) => Object.keys(collectConcreteEnvFileSecretEntries(input));

export const scrubConcreteSecretValuesFromEnvFileContents = (input: {
  readonly fileContents: string;
  readonly baseValues: Readonly<Record<string, string>>;
}) => {
  const removedSecretKeys = collectConcreteEnvFileSecretKeys({
    values: parseEnvFileContents(input.fileContents),
    baseValues: input.baseValues,
  });
  const removedSecretKeySet = new Set(removedSecretKeys);
  const lineEnding = input.fileContents.includes("\r\n") ? "\r\n" : "\n";
  const retainedLines = input.fileContents.split(/\r?\n/u).filter((line) => {
    const trimmedLine = line.trim();

    if (trimmedLine.length === 0 || trimmedLine.startsWith("#")) {
      return true;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex <= 0) {
      return true;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();

    return !removedSecretKeySet.has(key);
  });
  const hasRetainedEntries = retainedLines.some((line) => {
    const trimmedLine = line.trim();

    return trimmedLine.length > 0 && !trimmedLine.startsWith("#");
  });

  return {
    contents: retainedLines.join(lineEnding),
    removedKeys: removedSecretKeys,
    hasRetainedEntries,
  } as const;
};

export const mergeResolvedLocalRuntimeEnvironmentValues = (input: {
  readonly baseValues: Readonly<Record<string, string>>;
  readonly legacyDotEnvValues: Readonly<Record<string, string>>;
  readonly envOverrideValues: Readonly<Record<string, string>>;
  readonly vaultValues: Readonly<Record<string, string>>;
}) =>
  ({
    ...input.baseValues,
    ...input.legacyDotEnvValues,
    ...input.envOverrideValues,
    ...input.vaultValues,
  }) satisfies Record<string, string>;

export const toWorkspaceRelativePath = (filePath: string) =>
  relative(workspaceRootDirectory, filePath).replace(/\\/g, "/");

const assertEnvFileDoesNotStoreConcreteSecrets = (input: {
  readonly filePath: string;
  readonly values: Readonly<Record<string, string>>;
  readonly baseValues: Readonly<Record<string, string>>;
}) => {
  const concreteSecretKeys = collectConcreteEnvFileSecretKeys({
    values: input.values,
    baseValues: input.baseValues,
  });

  if (concreteSecretKeys.length === 0) {
    return;
  }

  throw new Error(
    `Concrete secret values must not be stored in ${toWorkspaceRelativePath(input.filePath)}. Move these keys into Vault at ${localRuntimeVaultPath} or pass them only for the current command: ${concreteSecretKeys.join(", ")}`,
  );
};

const syncHostPostgresUrlWithEffectivePort = (
  values: Readonly<Record<string, string>>,
) => {
  const postgresUser = values.POSTGRES_USER?.trim();
  const postgresPassword = values.POSTGRES_PASSWORD?.trim();
  const postgresDatabase = values.POSTGRES_DB?.trim();

  if (
    postgresUser === undefined ||
    postgresUser.length === 0 ||
    postgresPassword === undefined ||
    postgresPassword.length === 0 ||
    postgresDatabase === undefined ||
    postgresDatabase.length === 0
  ) {
    return values;
  }

  return {
    ...values,
    POSTGRES_URL: buildPostgresUrl({
      scheme: "postgresql",
      host: "localhost",
      port: resolveHostPostgresPort(values),
      user: postgresUser,
      password: postgresPassword,
      database: postgresDatabase,
    }),
  } satisfies Record<string, string>;
};

const resolveWorkspaceFilePath = (filePath: string) =>
  isAbsolute(filePath) ? filePath : resolve(workspaceRootDirectory, filePath);

const fileExists = async (filePath: string) => {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

export const isPlaceholderValue = (value: string) =>
  value.includes(localPlaceholderPrefix) ||
  value.startsWith(generatedDuringBootstrapPrefix) ||
  value.startsWith(externalProviderPlaceholderPrefix) ||
  value.startsWith(operatorBootstrapPlaceholderPrefix);

export const parseEnvFileContents = (fileContents: string) => {
  const envValues: Record<string, string> = {};

  for (const line of fileContents.split(/\r?\n/u)) {
    const trimmedLine = line.trim();

    if (trimmedLine.length === 0 || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
    const value =
      rawValue.startsWith('"') && rawValue.endsWith('"')
        ? rawValue.slice(1, -1)
        : rawValue.startsWith("'") && rawValue.endsWith("'")
          ? rawValue.slice(1, -1)
          : rawValue;

    envValues[key] = value;
  }

  return envValues;
};

const readEnvFile = async (filePath: string) =>
  parseEnvFileContents(await readFile(filePath, "utf8"));

const readOptionalEnvFile = async (filePath: string) =>
  (await fileExists(filePath)) ? await readEnvFile(filePath) : {};

const resolveVaultKvV2Path = (vaultPath: string): VaultKvV2Path => {
  const [mount, ...secretPathSegments] = vaultPath
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (mount === undefined || secretPathSegments.length === 0) {
    throw new Error(
      `Vault KV path must include both a mount and secret path. Received: ${vaultPath}`,
    );
  }

  return {
    mount,
    secretPath: secretPathSegments.join("/"),
  };
};

const buildVaultApiUrl = (vaultAddress: string, vaultPath: string) => {
  const { mount, secretPath } = resolveVaultKvV2Path(vaultPath);
  const normalizedAddress = vaultAddress.replace(/\/$/u, "");

  return `${normalizedAddress}/v1/${mount}/data/${secretPath}`;
};

const resolveVaultTokenFilePath = () => {
  const explicitTokenFilePath = process.env.VAULT_TOKEN_FILE?.trim();

  if (explicitTokenFilePath !== undefined && explicitTokenFilePath.length > 0) {
    return explicitTokenFilePath;
  }

  return join(homedir(), ".vault-token");
};

const resolveVaultToken = async (): Promise<VaultTokenResolution> => {
  const explicitToken = process.env.VAULT_TOKEN?.trim();

  if (explicitToken !== undefined && explicitToken.length > 0) {
    return {
      token: explicitToken,
      source: "VAULT_TOKEN",
    };
  }

  const tokenFilePath = resolveVaultTokenFilePath();

  if (!(await fileExists(tokenFilePath))) {
    return {};
  }

  const token = (await readFile(tokenFilePath, "utf8")).trim();

  return token.length === 0
    ? {}
    : {
        token,
        source:
          tokenFilePath === join(homedir(), ".vault-token")
            ? "~/.vault-token"
            : tokenFilePath,
      };
};

export const readVaultKvRecord = async (input?: {
  readonly vaultAddress?: string;
  readonly vaultPath?: string;
  readonly allowMissingToken?: boolean;
  readonly allowMissingSecret?: boolean;
}) => {
  const vaultAddress =
    input?.vaultAddress?.trim() || process.env.VAULT_ADDR?.trim() || "";
  const vaultPath = input?.vaultPath ?? localRuntimeVaultPath;
  const { token, source } = await resolveVaultToken();

  if (token === undefined || token.length === 0) {
    if (input?.allowMissingToken === true) {
      return {
        data: {},
        wasFound: false,
      } satisfies VaultRecordResult;
    }

    throw new Error(
      "Vault token is required. Set VAULT_TOKEN or place a token in ~/.vault-token.",
    );
  }

  if (vaultAddress.length === 0) {
    throw new Error(
      "VAULT_ADDR is required to read the local runtime environment from Vault.",
    );
  }

  const response = await fetch(buildVaultApiUrl(vaultAddress, vaultPath), {
    headers: {
      "X-Vault-Token": token,
    },
  });

  if (response.status === 404 && input?.allowMissingSecret === true) {
    return {
      data: {},
      ...(source !== undefined ? { tokenSource: source } : {}),
      wasFound: false,
    } satisfies VaultRecordResult;
  }

  if (!response.ok) {
    throw new Error(
      `Vault read failed for ${vaultPath}: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as {
    readonly data?: {
      readonly data?: Record<string, unknown>;
    };
  };

  const record = payload.data?.data ?? {};

  return {
    data: Object.fromEntries(
      Object.entries(record).flatMap(([key, value]) =>
        typeof value === "string" ? [[key, value]] : [],
      ),
    ),
    ...(source !== undefined ? { tokenSource: source } : {}),
    wasFound: true,
  } satisfies VaultRecordResult;
};

export const writeVaultKvRecord = async (input: {
  readonly data: Readonly<Record<string, string>>;
  readonly vaultAddress?: string;
  readonly vaultPath?: string;
}) => {
  const vaultAddress =
    input.vaultAddress?.trim() || process.env.VAULT_ADDR?.trim() || "";
  const vaultPath = input.vaultPath ?? localRuntimeVaultPath;
  const { token } = await resolveVaultToken();

  if (token === undefined || token.length === 0) {
    throw new Error(
      "Vault token is required. Set VAULT_TOKEN or place a token in ~/.vault-token.",
    );
  }

  if (vaultAddress.length === 0) {
    throw new Error(
      "VAULT_ADDR is required to write the local runtime environment to Vault.",
    );
  }

  const response = await fetch(buildVaultApiUrl(vaultAddress, vaultPath), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Vault-Token": token,
    },
    body: JSON.stringify({
      data: input.data,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Vault write failed for ${vaultPath}: ${response.status} ${response.statusText}`,
    );
  }
};

export const buildEnvFileContents = (
  values: Readonly<Record<string, string>>,
) =>
  `${sortObjectEntries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;

export const resolveLocalRuntimeEnvironment = async (input?: {
  readonly envFile?: string;
  readonly allowMissingVault?: boolean;
  readonly includeLegacyDotEnv?: boolean;
  readonly requireManagedKeys?: boolean;
  readonly shellValues?: Readonly<Record<string, string | undefined>>;
}) => {
  const baseValues = await readEnvFile(envExampleFilePath);
  const explicitEnvFilePath =
    input?.envFile !== undefined
      ? resolveWorkspaceFilePath(input.envFile)
      : undefined;
  const envOverrideFilePath =
    explicitEnvFilePath ??
    ((await fileExists(envLocalFilePath)) ? envLocalFilePath : undefined);
  const envOverrideValues =
    envOverrideFilePath !== undefined
      ? await readEnvFile(envOverrideFilePath)
      : {};
  const legacyDotEnvValues =
    input?.includeLegacyDotEnv === true
      ? await readOptionalEnvFile(legacyEnvFilePath)
      : {};

  if (
    envOverrideFilePath !== undefined &&
    envOverrideFilePath !== envExampleFilePath
  ) {
    assertEnvFileDoesNotStoreConcreteSecrets({
      filePath: envOverrideFilePath,
      values: envOverrideValues,
      baseValues,
    });
  }

  const vaultAddress =
    envOverrideValues.VAULT_ADDR?.trim() ||
    legacyDotEnvValues.VAULT_ADDR?.trim() ||
    baseValues.VAULT_ADDR?.trim() ||
    process.env.VAULT_ADDR?.trim() ||
    "";

  const vaultRecord = await readVaultKvRecord({
    vaultAddress,
    allowMissingToken: input?.allowMissingVault === true,
    allowMissingSecret: input?.allowMissingVault === true,
  });

  const normalizedValues = syncHostPostgresUrlWithEffectivePort(
    mergeResolvedLocalRuntimeEnvironmentValues({
      baseValues,
      legacyDotEnvValues,
      envOverrideValues,
      vaultValues: vaultRecord.data,
    }),
  );

  const values = overlayShellValuesOntoPlaceholders({
    values: normalizedValues,
    shellValues: input?.shellValues ?? process.env,
  });

  const missingManagedKeys = vaultManagedEnvironmentKeys.filter((key) => {
    const value = values[key]?.trim();

    return (
      value === undefined || value.length === 0 || isPlaceholderValue(value)
    );
  });

  if (input?.requireManagedKeys === true && missingManagedKeys.length > 0) {
    throw new Error(
      `Local runtime environment is missing Vault-backed managed values: ${missingManagedKeys.join(", ")}`,
    );
  }

  return {
    values,
    baseValues,
    envFileSources: [
      ...new Set([
        toWorkspaceRelativePath(envExampleFilePath),
        ...(envOverrideFilePath !== undefined
          ? [toWorkspaceRelativePath(envOverrideFilePath)]
          : []),
      ]),
    ],
    vaultData: vaultRecord.data,
    ...(vaultRecord.tokenSource !== undefined
      ? { vaultTokenSource: vaultRecord.tokenSource }
      : {}),
    vaultWasFound: vaultRecord.wasFound,
    missingManagedKeys,
    legacyEnvWasRead:
      input?.includeLegacyDotEnv === true &&
      Object.keys(legacyDotEnvValues).length > 0,
  } satisfies LocalRuntimeEnvironmentResult;
};

export const withTemporaryLocalRuntimeEnvironmentFile = async <Result>(
  input: {
    readonly envFile?: string;
    readonly allowMissingVault?: boolean;
    readonly includeLegacyDotEnv?: boolean;
    readonly requireManagedKeys?: boolean;
  },
  run: (input: {
    readonly envFilePath: string;
    readonly environment: Readonly<Record<string, string>>;
    readonly resolution: LocalRuntimeEnvironmentResult;
  }) => Promise<Result>,
) => {
  const resolution = await resolveLocalRuntimeEnvironment(input);
  const temporaryDirectoryPath = await mkdtemp(
    join(tmpdir(), "comvestec-local-runtime-env-"),
  );
  const envFilePath = join(temporaryDirectoryPath, ".env.runtime");

  await writeFile(envFilePath, buildEnvFileContents(resolution.values));

  try {
    return await run({
      envFilePath,
      environment: resolution.values,
      resolution,
    });
  } finally {
    await rm(temporaryDirectoryPath, {
      force: true,
      recursive: true,
    });
  }
};
