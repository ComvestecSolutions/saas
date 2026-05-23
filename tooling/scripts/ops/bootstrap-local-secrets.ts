import { generateKeyPairSync } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import {
  buildPostgresUrl,
  collectConcreteEnvFileSecretEntries,
  ensureLocalRuntimeVaultToken,
  legacyEnvFilePath,
  localRuntimeVaultPath,
  parseEnvFileContents,
  resolveHostPostgresPort,
  resolveLocalRuntimeEnvironment,
  scrubConcreteSecretValuesFromEnvFileContents,
  toWorkspaceRelativePath,
  writeVaultKvRecord,
  isPlaceholderValue,
} from "./local-runtime-environment";

const isWeakPasswordValue = (value: string) =>
  isPlaceholderValue(value) ||
  value.includes("$") ||
  ["admin", "change-me", "comvestec", "postgres", "Passw0rd!"].includes(value);

const isWeakUsernameValue = (value: string) =>
  value.trim().length === 0 || ["admin", "postgres"].includes(value);

const isWeakSecretValue = (value: string) =>
  isPlaceholderValue(value) ||
  [
    "admin",
    "change-me",
    "change-me-in-local-env",
    "meili-master-key",
    "glitchtip-local-dev-secret-change-before-sharing",
    "openpanel-local-dev-secret-change-before-sharing",
  ].includes(value);

const isWeakUnleashTokenValue = (value: string) =>
  isPlaceholderValue(value) ||
  value === "default:development.unleash-insecure-api-token" ||
  !value.startsWith("default:development.");

type EnvState = Readonly<Record<string, string>>;

const randomByteBuffer = (byteLength: number) => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes);
};

const generateToken = (byteLength = 32) =>
  randomByteBuffer(byteLength).toString("base64url");

const shuffleCharacters = (characters: string[]) => {
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const randomIndex = randomByteBuffer(1)[0]! % (index + 1);
    const swapValue = characters[index]!;

    characters[index] = characters[randomIndex]!;
    characters[randomIndex] = swapValue;
  }

  return characters;
};

const generatePassword = (length = 32) => {
  const lowercaseAlphabet = "abcdefghijkmnopqrstuvwxyz";
  const uppercaseAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#%^*-_";
  const allCharacters =
    lowercaseAlphabet + uppercaseAlphabet + digits + symbols;

  const requiredCharacters = [
    lowercaseAlphabet,
    uppercaseAlphabet,
    digits,
    symbols,
  ].map((alphabet) => alphabet[randomByteBuffer(1)[0]! % alphabet.length]!);

  while (requiredCharacters.length < length) {
    requiredCharacters.push(
      allCharacters[randomByteBuffer(1)[0]! % allCharacters.length]!,
    );
  }

  return shuffleCharacters(requiredCharacters).join("");
};

const generatePostalSigningKeyBase64 = () =>
  Buffer.from(
    generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: {
        format: "pem",
        type: "pkcs1",
      },
      privateKeyEncoding: {
        format: "pem",
        type: "pkcs1",
      },
    }).privateKey,
    "utf8",
  ).toString("base64");

const isWeakPostalSigningKeyValue = (value: string) => {
  if (isWeakSecretValue(value)) {
    return true;
  }

  return !Buffer.from(value, "base64")
    .toString("utf8")
    .includes("BEGIN RSA PRIVATE KEY");
};

const currentValue = (state: EnvState, key: string) => state[key]?.trim();

const resolveStableValue = (input: {
  readonly state: EnvState;
  readonly key: string;
  readonly nextValue: string;
  readonly isWeakValue: (value: string) => boolean;
}) => {
  const existingValue = currentValue(input.state, input.key);

  return existingValue !== undefined && !input.isWeakValue(existingValue)
    ? existingValue
    : input.nextValue;
};

export const buildBootstrapManagedValues = (input: {
  readonly state: EnvState;
  readonly existingVaultData?: Readonly<Record<string, string>>;
}) => {
  const state = input.state;
  const hostPostgresPort = resolveHostPostgresPort(state);

  const postgresDatabase = resolveStableValue({
    state,
    key: "POSTGRES_DB",
    nextValue: "comvestec",
    isWeakValue: (value) => value.trim().length === 0,
  });
  const postgresUser = resolveStableValue({
    state,
    key: "POSTGRES_USER",
    nextValue: "comvestec",
    isWeakValue: (value) => value.trim().length === 0,
  });
  const postgresPassword = resolveStableValue({
    state,
    key: "POSTGRES_PASSWORD",
    nextValue: generatePassword(),
    isWeakValue: isWeakPasswordValue,
  });

  const keycloakAdminUser = resolveStableValue({
    state,
    key: "KEYCLOAK_ADMIN",
    nextValue: "keycloak.operator.local",
    isWeakValue: isWeakUsernameValue,
  });
  const keycloakAdminPassword = resolveStableValue({
    state,
    key: "KEYCLOAK_ADMIN_PASSWORD",
    nextValue: generatePassword(),
    isWeakValue: isWeakPasswordValue,
  });
  const keycloakClientSecret = resolveStableValue({
    state,
    key: "KEYCLOAK_CLIENT_SECRET",
    nextValue: generateToken(),
    isWeakValue: isWeakSecretValue,
  });
  const keycloakConvexServiceActorPassword = resolveStableValue({
    state,
    key: "KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD",
    nextValue: generatePassword(),
    isWeakValue: isWeakPasswordValue,
  });
  const subscriberJourneySmokePassword = resolveStableValue({
    state,
    key: "SUBSCRIBER_JOURNEY_SMOKE_USER_PASSWORD",
    nextValue: generatePassword(),
    isWeakValue: isWeakPasswordValue,
  });

  const grafanaAdminUser = resolveStableValue({
    state,
    key: "GRAFANA_ADMIN_USER",
    nextValue: "grafana.operator.local",
    isWeakValue: isWeakUsernameValue,
  });
  const grafanaAdminPassword = resolveStableValue({
    state,
    key: "GRAFANA_ADMIN_PASSWORD",
    nextValue: generatePassword(),
    isWeakValue: isWeakPasswordValue,
  });

  const glitchtipSecretKey = resolveStableValue({
    state,
    key: "GLITCHTIP_SECRET_KEY",
    nextValue: randomByteBuffer(32).toString("hex"),
    isWeakValue: isWeakSecretValue,
  });
  const glitchtipOperatorEmail = resolveStableValue({
    state,
    key: "GLITCHTIP_OPERATOR_EMAIL",
    nextValue: "glitchtip.operator@example.com",
    isWeakValue: (value) =>
      value.trim().length === 0 ||
      value.trim().toLowerCase() === "glitchtip.operator@local.test",
  });
  const glitchtipOperatorPassword = resolveStableValue({
    state,
    key: "GLITCHTIP_OPERATOR_PASSWORD",
    nextValue: generatePassword(),
    isWeakValue: isWeakPasswordValue,
  });

  const unleashToken = resolveStableValue({
    state,
    key: "UNLEASH_API_TOKEN",
    nextValue: `default:development.${generateToken(24)}`,
    isWeakValue: isWeakUnleashTokenValue,
  });
  const unleashOperatorUsername = resolveStableValue({
    state,
    key: "UNLEASH_OPERATOR_USERNAME",
    nextValue: "unleash.operator.local",
    isWeakValue: isWeakUsernameValue,
  });
  const unleashOperatorEmail = resolveStableValue({
    state,
    key: "UNLEASH_OPERATOR_EMAIL",
    nextValue: "unleash.operator@example.com",
    isWeakValue: (value) => value.trim().length === 0,
  });
  const unleashOperatorPassword = resolveStableValue({
    state,
    key: "UNLEASH_OPERATOR_PASSWORD",
    nextValue: generatePassword(),
    isWeakValue: isWeakPasswordValue,
  });

  const meilisearchMasterKey = resolveStableValue({
    state,
    key: "MEILISEARCH_MASTER_KEY",
    nextValue: generateToken(),
    isWeakValue: isWeakSecretValue,
  });
  const meilisearchApiKey = resolveStableValue({
    state,
    key: "MEILISEARCH_API_KEY",
    nextValue: meilisearchMasterKey,
    isWeakValue: isWeakSecretValue,
  });

  const novuMongoRootPassword = resolveStableValue({
    state,
    key: "NOVU_MONGO_INITDB_ROOT_PASSWORD",
    nextValue: generatePassword(),
    isWeakValue: isWeakPasswordValue,
  });
  const novuJwtSecret = resolveStableValue({
    state,
    key: "NOVU_JWT_SECRET",
    nextValue: generateToken(),
    isWeakValue: isWeakSecretValue,
  });
  const novuStoreEncryptionKey = resolveStableValue({
    state,
    key: "NOVU_STORE_ENCRYPTION_KEY",
    nextValue: generateToken(24),
    isWeakValue: (value) => isWeakSecretValue(value) || value.length !== 32,
  });
  const novuFirstName = resolveStableValue({
    state,
    key: "NOVU_FNAME",
    nextValue: "Novu",
    isWeakValue: (value) => value.trim().length === 0 || value === "Admin",
  });
  const novuLastName = resolveStableValue({
    state,
    key: "NOVU_LNAME",
    nextValue: "Operator",
    isWeakValue: (value) => value.trim().length === 0 || value === "User",
  });
  const novuEmail = resolveStableValue({
    state,
    key: "NOVU_EMAIL",
    nextValue: "novu.operator@local.test",
    isWeakValue: (value) =>
      value.trim().length === 0 || value === "admin@localhost",
  });
  const novuOrganizationName = resolveStableValue({
    state,
    key: "NOVU_ORGANIZATION_NAME",
    nextValue: "Comvestec Local",
    isWeakValue: (value) => value.trim().length === 0,
  });
  const novuPassword = resolveStableValue({
    state,
    key: "NOVU_PASSWORD",
    nextValue: generatePassword(),
    isWeakValue: isWeakPasswordValue,
  });
  const openmeterApiKey = resolveStableValue({
    state,
    key: "OPENMETER_API_KEY",
    nextValue: generateToken(),
    isWeakValue: isWeakSecretValue,
  });
  const postalMariadbPassword = resolveStableValue({
    state,
    key: "POSTAL_MARIADB_PASSWORD",
    nextValue: generatePassword(),
    isWeakValue: isWeakPasswordValue,
  });
  const postalRailsSecretKey = resolveStableValue({
    state,
    key: "POSTAL_RAILS_SECRET_KEY",
    nextValue: randomByteBuffer(64).toString("hex"),
    isWeakValue: isWeakSecretValue,
  });
  const postalSigningKeyBase64 = resolveStableValue({
    state,
    key: "POSTAL_SIGNING_KEY_BASE64",
    nextValue: generatePostalSigningKeyBase64(),
    isWeakValue: isWeakPostalSigningKeyValue,
  });

  const openpanelPostgresUser = resolveStableValue({
    state,
    key: "OPENPANEL_POSTGRES_USER",
    nextValue: "openpanel",
    isWeakValue: isWeakUsernameValue,
  });
  const openpanelPostgresPassword = resolveStableValue({
    state,
    key: "OPENPANEL_POSTGRES_PASSWORD",
    nextValue: generatePassword(),
    isWeakValue: isWeakPasswordValue,
  });
  const openpanelPostgresDatabase = resolveStableValue({
    state,
    key: "OPENPANEL_POSTGRES_DB",
    nextValue: "openpanel",
    isWeakValue: (value) => value.trim().length === 0 || value === "postgres",
  });
  const openpanelCookieSecret = resolveStableValue({
    state,
    key: "OPENPANEL_COOKIE_SECRET",
    nextValue: randomByteBuffer(32).toString("hex"),
    isWeakValue: isWeakSecretValue,
  });
  const openpanelOperatorEmail = resolveStableValue({
    state,
    key: "OPENPANEL_OPERATOR_EMAIL",
    nextValue: "openpanel.operator@local.test",
    isWeakValue: (value) => value.trim().length === 0,
  });
  const openpanelOperatorPassword = resolveStableValue({
    state,
    key: "OPENPANEL_OPERATOR_PASSWORD",
    nextValue: generatePassword(),
    isWeakValue: isWeakPasswordValue,
  });

  const postalFirstName = resolveStableValue({
    state,
    key: "POSTAL_FNAME",
    nextValue: "Postal",
    isWeakValue: (value) => value.trim().length === 0 || value === "Admin",
  });
  const postalLastName = resolveStableValue({
    state,
    key: "POSTAL_LNAME",
    nextValue: "Operator",
    isWeakValue: (value) => value.trim().length === 0 || value === "User",
  });
  const postalEmail = resolveStableValue({
    state,
    key: "POSTAL_EMAIL",
    nextValue: "postal.operator@local.test",
    isWeakValue: (value) =>
      value.trim().length === 0 || value === "admin@localhost",
  });
  const postalPassword = resolveStableValue({
    state,
    key: "POSTAL_PASSWORD",
    nextValue: generatePassword(),
    isWeakValue: isWeakPasswordValue,
  });

  const nextValues = {
    ...(input.existingVaultData ?? {}),
    POSTGRES_DB: postgresDatabase,
    POSTGRES_USER: postgresUser,
    POSTGRES_PASSWORD: postgresPassword,
    POSTGRES_URL: buildPostgresUrl({
      scheme: "postgresql",
      host: "localhost",
      port: hostPostgresPort,
      user: postgresUser,
      password: postgresPassword,
      database: postgresDatabase,
    }),
    POSTGRES_URL_INTERNAL: buildPostgresUrl({
      scheme: "postgresql",
      host: "postgres",
      port: 5432,
      user: postgresUser,
      password: postgresPassword,
      database: postgresDatabase,
    }),
    CONVEX_POSTGRES_URL: buildPostgresUrl({
      scheme: "postgresql",
      host: "postgres",
      port: 5432,
      user: postgresUser,
      password: postgresPassword,
    }),
    KEYCLOAK_ADMIN: keycloakAdminUser,
    KEYCLOAK_ADMIN_PASSWORD: keycloakAdminPassword,
    KEYCLOAK_CLIENT_SECRET: keycloakClientSecret,
    KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: keycloakConvexServiceActorPassword,
    SUBSCRIBER_JOURNEY_SMOKE_USER_PASSWORD: subscriberJourneySmokePassword,
    GRAFANA_ADMIN_USER: grafanaAdminUser,
    GRAFANA_ADMIN_PASSWORD: grafanaAdminPassword,
    GLITCHTIP_SECRET_KEY: glitchtipSecretKey,
    GLITCHTIP_DATABASE_URL: buildPostgresUrl({
      scheme: "postgres",
      host: "postgres",
      port: 5432,
      user: postgresUser,
      password: postgresPassword,
      database: "glitchtip",
    }),
    GLITCHTIP_OPERATOR_EMAIL: glitchtipOperatorEmail,
    GLITCHTIP_OPERATOR_PASSWORD: glitchtipOperatorPassword,
    KETO_DSN: buildPostgresUrl({
      scheme: "postgres",
      host: "postgres",
      port: 5432,
      user: postgresUser,
      password: postgresPassword,
      database: "keto",
      query: "sslmode=disable",
    }),
    UNLEASH_API_KEY: unleashToken,
    UNLEASH_API_TOKEN: unleashToken,
    UNLEASH_DATABASE_URL: buildPostgresUrl({
      scheme: "postgres",
      host: "postgres",
      port: 5432,
      user: postgresUser,
      password: postgresPassword,
      database: "unleash",
      query: "sslmode=disable",
    }),
    UNLEASH_OPERATOR_USERNAME: unleashOperatorUsername,
    UNLEASH_OPERATOR_EMAIL: unleashOperatorEmail,
    UNLEASH_OPERATOR_PASSWORD: unleashOperatorPassword,
    MEILISEARCH_MASTER_KEY: meilisearchMasterKey,
    MEILISEARCH_API_KEY: meilisearchApiKey,
    NOVU_MONGO_INITDB_ROOT_PASSWORD: novuMongoRootPassword,
    NOVU_MONGO_URL: `mongodb://${encodeURIComponent(
      currentValue(state, "NOVU_MONGO_INITDB_ROOT_USERNAME") ?? "novu",
    )}:${encodeURIComponent(novuMongoRootPassword)}@novu-mongo:27017/novu-db?authSource=admin`,
    NOVU_JWT_SECRET: novuJwtSecret,
    NOVU_STORE_ENCRYPTION_KEY: novuStoreEncryptionKey,
    NOVU_FNAME: novuFirstName,
    NOVU_LNAME: novuLastName,
    NOVU_EMAIL: novuEmail,
    NOVU_ORGANIZATION_NAME: novuOrganizationName,
    NOVU_PASSWORD: novuPassword,
    OPENMETER_POSTGRES_URL: buildPostgresUrl({
      scheme: "postgres",
      host: "postgres",
      port: 5432,
      user: postgresUser,
      password: postgresPassword,
      database: "openmeter",
      query: "sslmode=disable",
    }),
    OPENMETER_API_KEY: openmeterApiKey,
    POSTAL_MARIADB_PASSWORD: postalMariadbPassword,
    POSTAL_RAILS_SECRET_KEY: postalRailsSecretKey,
    POSTAL_SIGNING_KEY_BASE64: postalSigningKeyBase64,
    POSTAL_FNAME: postalFirstName,
    POSTAL_LNAME: postalLastName,
    POSTAL_EMAIL: postalEmail,
    POSTAL_PASSWORD: postalPassword,
    OPENPANEL_POSTGRES_USER: openpanelPostgresUser,
    OPENPANEL_POSTGRES_PASSWORD: openpanelPostgresPassword,
    OPENPANEL_POSTGRES_DB: openpanelPostgresDatabase,
    OPENPANEL_DATABASE_URL: buildPostgresUrl({
      scheme: "postgresql",
      host: "op-db",
      port: 5432,
      user: openpanelPostgresUser,
      password: openpanelPostgresPassword,
      database: openpanelPostgresDatabase,
      query: "schema=public",
    }),
    OPENPANEL_DATABASE_URL_DIRECT: buildPostgresUrl({
      scheme: "postgresql",
      host: "op-db",
      port: 5432,
      user: openpanelPostgresUser,
      password: openpanelPostgresPassword,
      database: openpanelPostgresDatabase,
      query: "schema=public",
    }),
    OPENPANEL_COOKIE_SECRET: openpanelCookieSecret,
    OPENPANEL_OPERATOR_EMAIL: openpanelOperatorEmail,
    OPENPANEL_OPERATOR_PASSWORD: openpanelOperatorPassword,
  } satisfies Record<string, string>;

  return {
    nextValues,
    keycloakAdminUser,
    grafanaAdminUser,
    glitchtipOperatorEmail,
    openpanelOperatorEmail,
    postalEmail,
    novuEmail,
    unleashOperatorUsername,
    unleashOperatorEmail,
  } as const;
};

export const selectLegacyEnvSecretEntriesToMigrate = (input: {
  readonly existingVaultData: Readonly<Record<string, string>>;
  readonly legacySecretEntries: Readonly<Record<string, string>>;
}) =>
  Object.fromEntries(
    Object.entries(input.legacySecretEntries).flatMap(([key, value]) => {
      const existingVaultValue = input.existingVaultData[key]?.trim();

      return existingVaultValue !== undefined &&
        existingVaultValue.length > 0 &&
        !isPlaceholderValue(existingVaultValue)
        ? []
        : [[key, value]];
    }),
  ) satisfies Record<string, string>;

export const mergeLegacyEnvSecretEntriesIntoVaultData = (input: {
  readonly existingVaultData: Readonly<Record<string, string>>;
  readonly legacySecretEntries: Readonly<Record<string, string>>;
  readonly normalizedBootstrapValues: Readonly<Record<string, string>>;
}) => {
  const migratedLegacySecretEntries = selectLegacyEnvSecretEntriesToMigrate({
    existingVaultData: input.existingVaultData,
    legacySecretEntries: input.legacySecretEntries,
  });

  return {
    ...input.existingVaultData,
    ...migratedLegacySecretEntries,
    ...input.normalizedBootstrapValues,
  } satisfies Record<string, string>;
};

export const buildBootstrapState = (input: {
  readonly resolvedValues: Readonly<Record<string, string>>;
  readonly existingVaultData: Readonly<Record<string, string>>;
  readonly legacySecretEntries: Readonly<Record<string, string>>;
}) =>
  ({
    ...input.resolvedValues,
    ...selectLegacyEnvSecretEntriesToMigrate({
      existingVaultData: input.existingVaultData,
      legacySecretEntries: input.legacySecretEntries,
    }),
  }) satisfies Record<string, string>;

const main = async () => {
  const resolution = await resolveLocalRuntimeEnvironment({
    allowMissingVault: true,
    vaultTokenMode: "bootstrap",
  });
  const legacyEnvFileContents = existsSync(legacyEnvFilePath)
    ? await readFile(legacyEnvFilePath, "utf8")
    : undefined;
  const legacyEnvValues =
    legacyEnvFileContents !== undefined
      ? parseEnvFileContents(legacyEnvFileContents)
      : {};
  const legacyEnvWasRead = Object.keys(legacyEnvValues).length > 0;
  const discoveredLegacySecretEntries = legacyEnvWasRead
    ? collectConcreteEnvFileSecretEntries({
        values: legacyEnvValues,
        baseValues: resolution.baseValues,
      })
    : {};
  const state = buildBootstrapState({
    resolvedValues: resolution.values,
    existingVaultData: resolution.vaultData,
    legacySecretEntries: discoveredLegacySecretEntries,
  });
  const {
    nextValues,
    keycloakAdminUser,
    grafanaAdminUser,
    glitchtipOperatorEmail,
    openpanelOperatorEmail,
    postalEmail,
    novuEmail,
    unleashOperatorUsername,
    unleashOperatorEmail,
  } = buildBootstrapManagedValues({
    state,
    existingVaultData: resolution.vaultData,
  });
  const vaultData = mergeLegacyEnvSecretEntriesIntoVaultData({
    existingVaultData: resolution.vaultData,
    legacySecretEntries: discoveredLegacySecretEntries,
    normalizedBootstrapValues: nextValues,
  });

  await writeVaultKvRecord({
    data: vaultData,
    tokenMode: "bootstrap",
    ...(state.VAULT_ADDR !== undefined
      ? { vaultAddress: state.VAULT_ADDR }
      : {}),
  });

  try {
    const scopedVaultToken = await ensureLocalRuntimeVaultToken({
      ...(state.VAULT_ADDR !== undefined
        ? { vaultAddress: state.VAULT_ADDR }
        : {}),
    });
    console.log(
      `Refreshed the scoped non-root Vault token at ${scopedVaultToken.tokenFilePath}.`,
    );
  } catch (error) {
    const details =
      error instanceof Error ? ` ${error.message}` : " Unknown error.";
    console.warn(
      `Skipped refreshing the scoped non-root Vault token. Keep ~/.vault-token available for break-glass recovery and rerun \`bun run ops:secrets:bootstrap\` after Vault reinitialization.${details}`,
    );
  }

  console.log(
    `Stored ${Object.keys(vaultData).length} normalized local secret and access values in Vault at ${localRuntimeVaultPath}.`,
  );
  console.log(`Keycloak operator username: ${keycloakAdminUser}`);
  console.log(`Grafana operator username: ${grafanaAdminUser}`);
  console.log(`GlitchTip operator email: ${glitchtipOperatorEmail}`);
  console.log(`Novu operator email: ${novuEmail}`);
  console.log(`OpenPanel operator email: ${openpanelOperatorEmail}`);
  console.log(`Postal operator email: ${postalEmail}`);
  console.log(`Unleash operator username: ${unleashOperatorUsername}`);
  console.log(`Unleash operator email: ${unleashOperatorEmail}`);
  if (legacyEnvWasRead) {
    const scrubbedLegacyEnv = scrubConcreteSecretValuesFromEnvFileContents({
      fileContents: legacyEnvFileContents ?? "",
      baseValues: resolution.baseValues,
    });

    if (scrubbedLegacyEnv.removedKeys.length > 0) {
      if (scrubbedLegacyEnv.hasRetainedEntries) {
        await writeFile(legacyEnvFilePath, scrubbedLegacyEnv.contents);
        console.log(
          `Migrated ${scrubbedLegacyEnv.removedKeys.length} placeholder-backed secret values from ${toWorkspaceRelativePath(legacyEnvFilePath)} into Vault and scrubbed them from the file.`,
        );
      } else {
        await rm(legacyEnvFilePath, { force: true });
        console.log(
          `Migrated ${scrubbedLegacyEnv.removedKeys.length} placeholder-backed secret values from ${toWorkspaceRelativePath(legacyEnvFilePath)} into Vault and removed the now-empty legacy file.`,
        );
      }
    }

    console.log(
      `Legacy ${toWorkspaceRelativePath(legacyEnvFilePath)} is migration input only. Keep future non-secret local overrides in .env.local and do not store concrete secret values in .env.`,
    );
  }
  console.log(
    "Next step: use the Vault-backed local runtime wrappers so the vendor-infrastructure stack reads transient env materialized from Vault instead of a persistent .env file.",
  );
};

if (import.meta.main) {
  await main();
}
