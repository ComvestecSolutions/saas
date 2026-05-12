import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import {
  buildEnvFileContents,
  isPlaceholderValue,
  localRuntimeVaultPath,
  resolveLocalRuntimeEnvironment,
  workspaceRootDirectory,
  writeVaultKvRecord,
} from "./local-runtime-environment";
import {
  buildUnleashClientFeaturesEndpoint,
  buildUnleashValidationHeaders,
  unleashBackendClientName,
} from "../../../packages/platform/src/adapters/features-billing/unleash-shared";
import { makeGlitchtipAdapter } from "../../../packages/platform/src/adapters/observability/glitchtip";
import { makeOpenPanelAdapter } from "../../../packages/platform/src/adapters/observability/openpanel";

const rootComposeFilePath = resolve(
  workspaceRootDirectory,
  "ops/docker/compose.yml",
);
const novuRegistrationToggleEnvKey = "NOVU_DISABLE_USER_REGISTRATION";
const novuHealthcheckPath = "/v1/health-check";
const novuAuthenticatedEnvironmentPath = "/v1/environments/me";
const novuEnvironmentListPath = "/v1/environments";
const postalSendMessagePath = "/api/v1/send/message";
const unleashHealthcheckPath = "/health";
const postalBootstrapOrganizationName = "Local Postal";
const postalBootstrapServerName = "Local Backend";
const postalBootstrapCredentialName = "backend-api";
const openpanelBootstrapOrganizationId = "comvestec-local";
const openpanelBootstrapOrganizationName = "Comvestec Local";
const openpanelBootstrapProjectName = "Comvestec SaaS Foundation";
const openpanelBootstrapClientName = "Comvestec SaaS Foundation Backend";
const openpanelOperatorFirstName = "OpenPanel";
const openpanelOperatorLastName = "Operator";
const glitchtipBootstrapOrganizationSlug = "comvestec-local";
const glitchtipBootstrapOrganizationName = "Comvestec Local";
const glitchtipBootstrapTeamSlug = "platform";
const glitchtipBootstrapProjectSlug = "comvestec-saas-foundation";
const glitchtipBootstrapProjectName = "Comvestec SaaS Foundation";
const glitchtipBootstrapProjectKeyName = "Comvestec SaaS Foundation Backend";
const glitchtipOrganizationOwnerRole = 3;
const glitchtipOperatorName = "GlitchTip Operator";
const unleashOperatorName = "Unleash Operator";
const unleashAdminRoleName = "Admin";
const unleashDefaultProject = "default";
const novuRegistrationOrigin = "cli";
const novuRegistrationJobTitle = "engineer";
const novuRegistrationProductUseCases = ["notifications"] as const;
const invalidPostalAuthCodes = new Set([
  "AccessDenied",
  "InvalidServerAPIKey",
  "ServerSuspended",
]);

type RuntimeEnvironment = Readonly<Record<string, string>>;

type BunPasswordApi = {
  readonly hash: (
    password: string,
    algorithm: "bcrypt" | "argon2id",
  ) => Promise<string>;
  readonly verify: (password: string, hash: string) => Promise<boolean>;
};

const getBunPassword = (): BunPasswordApi => {
  const runtime = globalThis as typeof globalThis & {
    readonly Bun?: {
      readonly password?: BunPasswordApi;
    };
  };
  const bunPassword = runtime.Bun?.password;

  if (bunPassword === undefined) {
    throw new Error(
      "Bun.password is required for vendor operator password hashing.",
    );
  }

  return bunPassword;
};

const bootstrapRuntimeEnvironmentKeys = [
  "NOVU_API_URL",
  "NOVU_EMAIL",
  "NOVU_PASSWORD",
  "NOVU_FNAME",
  "NOVU_LNAME",
  "NOVU_ORGANIZATION_NAME",
  "POSTAL_API_URL",
  "POSTAL_EMAIL",
  "POSTAL_PASSWORD",
  "POSTAL_FNAME",
  "POSTAL_LNAME",
  "GLITCHTIP_OPERATOR_EMAIL",
  "GLITCHTIP_OPERATOR_PASSWORD",
  "UNLEASH_URL",
  "UNLEASH_API_KEY",
  "UNLEASH_API_TOKEN",
  "UNLEASH_OPERATOR_USERNAME",
  "UNLEASH_OPERATOR_EMAIL",
  "UNLEASH_OPERATOR_PASSWORD",
  "OPENPANEL_API_URL",
  "OPENPANEL_OPERATOR_EMAIL",
  "OPENPANEL_OPERATOR_PASSWORD",
] as const;

type BootstrapRuntimeEnvironmentKey =
  (typeof bootstrapRuntimeEnvironmentKeys)[number];

type BootstrapRuntimeEnvironment = RuntimeEnvironment &
  Readonly<Record<BootstrapRuntimeEnvironmentKey, string>>;

type CommandResult = {
  readonly stdout: string;
  readonly stderr: string;
};

type HttpJsonResult = {
  readonly response: Response;
  readonly bodyText: string;
  readonly body?: unknown;
};

export type PostalBootstrapResult = {
  readonly apiKey: string;
  readonly email: string;
  readonly serverName: string;
};

export type OpenPanelBootstrapResult = {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly organizationId: string;
  readonly projectId: string;
};

export type GlitchtipBootstrapResult = {
  readonly dsn: string;
  readonly operatorEmail: string;
  readonly organizationSlug: string;
  readonly projectSlug: string;
  readonly teamSlug: string;
};

export type OpenPanelOperatorAuthState = {
  readonly email: string;
  readonly passwordHash: string;
  readonly accountProvider: string;
  readonly memberRole: string;
  readonly organizationId: string;
};

export type UnleashOperatorAuthState = {
  readonly email: string;
  readonly username: string;
  readonly passwordHash: string;
  readonly hasAdminRole: boolean;
};

export type PostalOperatorLoginState = {
  readonly email: string;
  readonly authenticated: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const sleep = (delayMs: number) =>
  new Promise((resolveDelay) => {
    setTimeout(resolveDelay, delayMs);
  });

const buildUrl = (baseUrl: string, path: string) =>
  new URL(path, baseUrl).toString();

export const shouldBootstrapRuntimeCredential = (value: string | undefined) => {
  const normalizedValue = value?.trim();

  return (
    normalizedValue === undefined ||
    normalizedValue.length === 0 ||
    isPlaceholderValue(normalizedValue)
  );
};

const normalizeBearerToken = (token: string) => {
  const normalizedToken = token.trim();

  return normalizedToken.toLowerCase().startsWith("bearer ")
    ? normalizedToken
    : `Bearer ${normalizedToken}`;
};

const escapePostgresLiteral = (value: string) => value.replaceAll("'", "''");

const escapePythonSingleQuotedString = (value: string) =>
  value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");

const normalizeConfiguredRuntimeCredential = (value: string | undefined) => {
  const normalizedValue = value?.trim();

  if (
    normalizedValue === undefined ||
    normalizedValue.length === 0 ||
    shouldBootstrapRuntimeCredential(normalizedValue)
  ) {
    return undefined;
  }

  return normalizedValue;
};

export const selectUnleashBackendApiToken = (input: {
  readonly configuredApiKey: string | undefined;
  readonly configuredBootstrapToken: string | undefined;
}) => {
  const configuredBootstrapToken = normalizeConfiguredRuntimeCredential(
    input.configuredBootstrapToken,
  );

  if (configuredBootstrapToken !== undefined) {
    return configuredBootstrapToken;
  }

  const configuredApiKey = normalizeConfiguredRuntimeCredential(
    input.configuredApiKey,
  );

  if (configuredApiKey !== undefined) {
    return configuredApiKey;
  }

  throw new Error(
    "Local runtime environment is missing a usable Unleash backend API token.",
  );
};

export const buildUnleashBackendTokenReconcileSql = (apiToken: string) => {
  const escapedToken = escapePostgresLiteral(apiToken);
  const escapedTokenName = escapePostgresLiteral(unleashBackendClientName);

  return [
    "BEGIN;",
    `DELETE FROM api_token_project WHERE secret IN (SELECT secret FROM api_tokens WHERE type = 'backend' AND environment = 'development' AND token_name = '${escapedTokenName}');`,
    `DELETE FROM api_tokens WHERE type = 'backend' AND environment = 'development' AND token_name = '${escapedTokenName}';`,
    `INSERT INTO api_tokens (secret, username, type, environment, token_name) VALUES ('${escapedToken}', '${escapedTokenName}', 'backend', 'development', '${escapedTokenName}') ON CONFLICT (secret) DO UPDATE SET username = EXCLUDED.username, type = EXCLUDED.type, environment = EXCLUDED.environment, token_name = EXCLUDED.token_name, expires_at = NULL;`,
    "COMMIT;",
  ].join("\n");
};

const assertBootstrapRuntimeEnvironment: (
  environment: RuntimeEnvironment,
) => asserts environment is BootstrapRuntimeEnvironment = (
  environment: RuntimeEnvironment,
) => {
  const missingKeys = bootstrapRuntimeEnvironmentKeys.filter((key) => {
    const value = environment[key]?.trim();

    return value === undefined || value.length === 0;
  });

  if (missingKeys.length > 0) {
    throw new Error(
      `Local runtime environment is missing bootstrap credentials: ${missingKeys.join(", ")}`,
    );
  }
};

const runProcess = async (input: {
  readonly command: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly stdinText?: string;
}) => {
  const processHandle = spawnSync(input.command[0]!, input.command.slice(1), {
    cwd: workspaceRootDirectory,
    env: input.env,
    ...(input.stdinText !== undefined ? { input: input.stdinText } : {}),
    encoding: "utf8",
  });
  const stdout = processHandle.stdout ?? "";
  const stderr = processHandle.stderr ?? "";
  const exitCode = processHandle.status ?? processHandle.signal ?? -1;

  if (exitCode !== 0) {
    throw new Error(
      `Command failed (${exitCode}): ${input.command.join(" ")}\n${stderr.trim() || stdout.trim() || "(no output)"}`,
    );
  }

  return {
    stdout,
    stderr,
  } satisfies CommandResult;
};

const withTemporaryRuntimeEnvFile = async <Result>(input: {
  readonly environment: RuntimeEnvironment;
  readonly overrides?: Readonly<Record<string, string>>;
  readonly run: (input: {
    readonly envFilePath: string;
    readonly processEnvironment: NodeJS.ProcessEnv;
  }) => Promise<Result>;
}) => {
  const temporaryDirectoryPath = await mkdtemp(
    join(tmpdir(), "comvestec-runtime-bootstrap-"),
  );
  const envFilePath = join(temporaryDirectoryPath, ".env.runtime");
  const effectiveEnvironment = {
    ...input.environment,
    ...(input.overrides ?? {}),
  };

  await writeFile(envFilePath, buildEnvFileContents(effectiveEnvironment));

  try {
    return await input.run({
      envFilePath,
      processEnvironment: {
        ...Bun.env,
        ...effectiveEnvironment,
      } satisfies NodeJS.ProcessEnv,
    });
  } finally {
    await rm(temporaryDirectoryPath, {
      force: true,
      recursive: true,
    });
  }
};

const runDockerComposeCommand = async (input: {
  readonly environment: RuntimeEnvironment;
  readonly args: readonly string[];
  readonly overrides?: Readonly<Record<string, string>>;
}) =>
  withTemporaryRuntimeEnvFile({
    environment: input.environment,
    ...(input.overrides !== undefined ? { overrides: input.overrides } : {}),
    run: async ({ envFilePath, processEnvironment }) =>
      await runProcess({
        command: [
          "docker",
          "compose",
          "--env-file",
          envFilePath,
          "-f",
          rootComposeFilePath,
          ...input.args,
        ],
        env: processEnvironment,
      }),
  });

const requestJson = async (input: {
  readonly url: string;
  readonly method?: string;
  readonly headers?: HeadersInit;
  readonly body?: unknown;
}) => {
  const response = await fetch(input.url, {
    method: input.method ?? "GET",
    ...(input.headers !== undefined ? { headers: input.headers } : {}),
    ...(input.body !== undefined
      ? {
          body:
            typeof input.body === "string"
              ? input.body
              : JSON.stringify(input.body),
        }
      : {}),
  });
  const bodyText = await response.text();
  const trimmedBodyText = bodyText.trim();

  if (trimmedBodyText.length === 0) {
    return {
      response,
      bodyText,
    } satisfies HttpJsonResult;
  }

  try {
    return {
      response,
      bodyText,
      body: JSON.parse(trimmedBodyText),
    } satisfies HttpJsonResult;
  } catch {
    return {
      response,
      bodyText,
    } satisfies HttpJsonResult;
  }
};

const waitForEndpoint = async (input: {
  readonly description: string;
  readonly url: string;
  readonly method?: string;
  readonly headers?: HeadersInit;
  readonly body?: unknown;
  readonly attempts?: number;
  readonly delayMs?: number;
  readonly isReady: (input: {
    readonly response: Response;
    readonly bodyText: string;
    readonly body?: unknown;
  }) => boolean;
}) => {
  const attempts = input.attempts ?? 30;
  const delayMs = input.delayMs ?? 2_000;
  let lastFailure = "No request was attempted.";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await requestJson({
        url: input.url,
        ...(input.method !== undefined ? { method: input.method } : {}),
        ...(input.headers !== undefined ? { headers: input.headers } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
      });

      if (
        input.isReady({
          response: result.response,
          bodyText: result.bodyText,
          ...(result.body !== undefined ? { body: result.body } : {}),
        })
      ) {
        return;
      }

      lastFailure = `${result.response.status} ${result.response.statusText}: ${result.bodyText.trim() || "(empty body)"}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  throw new Error(
    `${input.description} did not become ready after ${attempts} attempts. Last failure: ${lastFailure}`,
  );
};

const waitForValidatedRuntimeCredential = async (input: {
  readonly description: string;
  readonly validate: () => Promise<void>;
  readonly attempts?: number;
  readonly delayMs?: number;
}) => {
  const attempts = input.attempts ?? 30;
  const delayMs = input.delayMs ?? 2_000;
  let lastFailure = "No validation was attempted.";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await input.validate();
      return;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  throw new Error(
    `${input.description} did not validate after ${attempts} attempts. Last failure: ${lastFailure}`,
  );
};

export const extractNovuSessionToken = (value: unknown): string => {
  if (!isRecord(value)) {
    throw new Error("Novu auth response was not an object.");
  }

  if (typeof value.token === "string" && value.token.trim().length > 0) {
    return normalizeBearerToken(value.token);
  }

  const data = value.data;

  if (isRecord(data) && typeof data.token === "string" && data.token.trim()) {
    return normalizeBearerToken(data.token);
  }

  throw new Error("Novu auth response did not include a session token.");
};

const extractLastJsonLine = (input: {
  readonly stdout: string;
  readonly description: string;
}) => {
  const jsonLine = input.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .reverse()
    .find((line) => line.startsWith("{") && line.endsWith("}"));

  if (jsonLine === undefined) {
    throw new Error(`${input.description} did not contain a JSON result line.`);
  }

  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(jsonLine);
  } catch (error) {
    throw new Error(
      `${input.description} did not end with valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!isRecord(parsedValue)) {
    throw new Error(`${input.description} did not decode to an object.`);
  }

  return parsedValue;
};

export const extractNovuApiKey = (value: unknown): string => {
  if (Array.isArray(value)) {
    for (const item of value) {
      try {
        return extractNovuApiKey(item);
      } catch {
        continue;
      }
    }

    throw new Error("Novu API key response array did not include a key value.");
  }

  if (!isRecord(value)) {
    throw new Error("Novu API key response was not an object or array.");
  }

  if (typeof value.key === "string" && value.key.trim().length > 0) {
    return value.key;
  }

  if ("apiKeys" in value) {
    return extractNovuApiKey(value.apiKeys);
  }

  if ("data" in value) {
    return extractNovuApiKey(value.data);
  }

  throw new Error("Novu API key response did not include a key value.");
};

export const extractPostalBootstrapResult = (
  stdout: string,
): PostalBootstrapResult => {
  const parsedValue = extractLastJsonLine({
    stdout,
    description:
      "Postal bootstrap output with the generated backend API credential",
  });

  if (
    typeof parsedValue.apiKey !== "string" ||
    parsedValue.apiKey.trim().length === 0 ||
    typeof parsedValue.email !== "string" ||
    parsedValue.email.trim().length === 0 ||
    typeof parsedValue.serverName !== "string" ||
    parsedValue.serverName.trim().length === 0
  ) {
    throw new Error(
      "Postal bootstrap JSON did not include the expected email, serverName, and apiKey fields.",
    );
  }

  return {
    apiKey: parsedValue.apiKey,
    email: parsedValue.email,
    serverName: parsedValue.serverName,
  };
};

export const extractOpenPanelBootstrapResult = (
  stdout: string,
): OpenPanelBootstrapResult => {
  const parsedValue = extractLastJsonLine({
    stdout,
    description: "OpenPanel bootstrap output",
  });

  if (
    typeof parsedValue.clientId !== "string" ||
    parsedValue.clientId.trim().length === 0 ||
    typeof parsedValue.clientSecret !== "string" ||
    parsedValue.clientSecret.trim().length === 0 ||
    typeof parsedValue.organizationId !== "string" ||
    parsedValue.organizationId.trim().length === 0 ||
    typeof parsedValue.projectId !== "string" ||
    parsedValue.projectId.trim().length === 0
  ) {
    throw new Error(
      "OpenPanel bootstrap JSON did not include the expected clientId, clientSecret, organizationId, and projectId fields.",
    );
  }

  return {
    clientId: parsedValue.clientId,
    clientSecret: parsedValue.clientSecret,
    organizationId: parsedValue.organizationId,
    projectId: parsedValue.projectId,
  };
};

export const extractGlitchtipBootstrapResult = (
  stdout: string,
): GlitchtipBootstrapResult => {
  const parsedValue = extractLastJsonLine({
    stdout,
    description: "GlitchTip bootstrap output",
  });

  if (
    typeof parsedValue.dsn !== "string" ||
    parsedValue.dsn.trim().length === 0 ||
    typeof parsedValue.operatorEmail !== "string" ||
    parsedValue.operatorEmail.trim().length === 0 ||
    typeof parsedValue.organizationSlug !== "string" ||
    parsedValue.organizationSlug.trim().length === 0 ||
    typeof parsedValue.projectSlug !== "string" ||
    parsedValue.projectSlug.trim().length === 0 ||
    typeof parsedValue.teamSlug !== "string" ||
    parsedValue.teamSlug.trim().length === 0
  ) {
    throw new Error(
      "GlitchTip bootstrap JSON did not include the expected dsn, operatorEmail, organizationSlug, projectSlug, and teamSlug fields.",
    );
  }

  return {
    dsn: parsedValue.dsn,
    operatorEmail: parsedValue.operatorEmail,
    organizationSlug: parsedValue.organizationSlug,
    projectSlug: parsedValue.projectSlug,
    teamSlug: parsedValue.teamSlug,
  };
};

export const extractOpenPanelOperatorAuthState = (
  stdout: string,
): OpenPanelOperatorAuthState => {
  const parsedValue = extractLastJsonLine({
    stdout,
    description: "OpenPanel operator auth state output",
  });

  if (
    typeof parsedValue.email !== "string" ||
    parsedValue.email.trim().length === 0 ||
    typeof parsedValue.passwordHash !== "string" ||
    parsedValue.passwordHash.trim().length === 0 ||
    typeof parsedValue.accountProvider !== "string" ||
    parsedValue.accountProvider.trim().length === 0 ||
    typeof parsedValue.memberRole !== "string" ||
    parsedValue.memberRole.trim().length === 0 ||
    typeof parsedValue.organizationId !== "string" ||
    parsedValue.organizationId.trim().length === 0
  ) {
    throw new Error(
      "OpenPanel operator auth JSON did not include the expected email, passwordHash, accountProvider, memberRole, and organizationId fields.",
    );
  }

  return {
    email: parsedValue.email,
    passwordHash: parsedValue.passwordHash,
    accountProvider: parsedValue.accountProvider,
    memberRole: parsedValue.memberRole,
    organizationId: parsedValue.organizationId,
  };
};

export const extractUnleashOperatorAuthState = (
  stdout: string,
): UnleashOperatorAuthState => {
  const parsedValue = extractLastJsonLine({
    stdout,
    description: "Unleash operator auth state output",
  });

  if (
    typeof parsedValue.email !== "string" ||
    parsedValue.email.trim().length === 0 ||
    typeof parsedValue.username !== "string" ||
    parsedValue.username.trim().length === 0 ||
    typeof parsedValue.passwordHash !== "string" ||
    parsedValue.passwordHash.trim().length === 0 ||
    typeof parsedValue.hasAdminRole !== "boolean"
  ) {
    throw new Error(
      "Unleash operator auth JSON did not include the expected email, username, passwordHash, and hasAdminRole fields.",
    );
  }

  return {
    email: parsedValue.email,
    username: parsedValue.username,
    passwordHash: parsedValue.passwordHash,
    hasAdminRole: parsedValue.hasAdminRole,
  };
};

export const extractPostalOperatorLoginState = (
  stdout: string,
): PostalOperatorLoginState => {
  const parsedValue = extractLastJsonLine({
    stdout,
    description: "Postal operator login state output",
  });

  if (
    typeof parsedValue.email !== "string" ||
    parsedValue.email.trim().length === 0 ||
    typeof parsedValue.authenticated !== "boolean"
  ) {
    throw new Error(
      "Postal operator auth JSON did not include the expected email and authenticated fields.",
    );
  }

  return {
    email: parsedValue.email,
    authenticated: parsedValue.authenticated,
  };
};

const escapeRubySingleQuotedString = (value: string) =>
  value.replaceAll("\\", "\\\\").replaceAll("'", "\\\\'");

export const buildPostalBootstrapScript = (input: {
  readonly email: string;
  readonly password: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly organizationName: string;
  readonly serverName: string;
  readonly credentialName: string;
}) => {
  const encodedConfiguration = escapeRubySingleQuotedString(
    JSON.stringify(input),
  );

  return [
    'require "json"',
    "",
    `config = JSON.parse('${encodedConfiguration}')`,
    'email = config.fetch("email")',
    'password = config.fetch("password")',
    'first_name = config.fetch("firstName")',
    'last_name = config.fetch("lastName")',
    'organization_name = config.fetch("organizationName")',
    'server_name = config.fetch("serverName")',
    'credential_name = config.fetch("credentialName")',
    "",
    "user = User.find_by(email_address: email)",
    "if user.nil?",
    "  user = User.create!(",
    "    email_address: email,",
    "    first_name: first_name,",
    "    last_name: last_name,",
    "    password: password,",
    "    password_confirmation: password",
    "  )",
    "else",
    "  user.update!(",
    "    first_name: first_name,",
    "    last_name: last_name,",
    "    password: password,",
    "    password_confirmation: password",
    "  )",
    "end",
    "",
    "organization = user.organizations.first || Organization.find_by(name: organization_name)",
    "if organization.nil?",
    "  organization = Organization.create!(",
    "    name: organization_name,",
    "    owner: user",
    "  )",
    "elsif organization.owner.nil?",
    "  organization.update!(owner: user)",
    "end",
    "",
    "assignment = OrganizationUser.find_or_initialize_by(organization: organization, user: user)",
    "assignment.admin = true",
    "assignment.all_servers = true",
    "assignment.save!",
    "",
    "server = organization.servers.find_by(name: server_name)",
    "if server.nil?",
    '  server = organization.servers.create!(name: server_name, mode: "Live")',
    "end",
    "",
    'credential = server.credentials.find_by(name: credential_name, type: "API")',
    "if credential.nil?",
    '  credential = server.credentials.create!(name: credential_name, type: "API")',
    "end",
    "",
    "puts JSON.generate({",
    "  email: user.email_address,",
    "  serverName: server.name,",
    "  apiKey: credential.key",
    "})",
    "",
  ].join("\n");
};

export const buildPostalOperatorValidationScript = (input: {
  readonly email: string;
  readonly password: string;
}) => {
  const encodedConfiguration = escapeRubySingleQuotedString(
    JSON.stringify(input),
  );

  return [
    'require "json"',
    "",
    `config = JSON.parse('${encodedConfiguration}')`,
    'email = config.fetch("email")',
    'password = config.fetch("password")',
    "",
    "user = User.find_by(email_address: email)",
    "puts JSON.generate({",
    "  email: email,",
    "  authenticated: !user.nil? && !user.authenticate(password).nil?",
    "})",
    "",
  ].join("\n");
};

export const buildOpenPanelBootstrapSql = (input: {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly projectName: string;
  readonly clientName: string;
  readonly operatorEmail: string;
  readonly operatorPasswordHash: string;
  readonly operatorFirstName: string;
  readonly operatorLastName: string;
}) => {
  const organizationId = escapePostgresLiteral(input.organizationId);
  const organizationName = escapePostgresLiteral(input.organizationName);
  const projectName = escapePostgresLiteral(input.projectName);
  const clientName = escapePostgresLiteral(input.clientName);
  const operatorEmail = escapePostgresLiteral(input.operatorEmail);
  const operatorPasswordHash = escapePostgresLiteral(
    input.operatorPasswordHash,
  );
  const operatorFirstName = escapePostgresLiteral(input.operatorFirstName);
  const operatorLastName = escapePostgresLiteral(input.operatorLastName);
  const generatedSecretSql =
    "replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')";

  return [
    "WITH repo_user AS (",
    `  SELECT id, email FROM users WHERE LOWER(email) = LOWER('${operatorEmail}') LIMIT 1`,
    "),",
    "inserted_user AS (",
    '  INSERT INTO users (id, email, "firstName", "lastName")',
    `  SELECT 'user_' || replace(gen_random_uuid()::text, '-', ''), '${operatorEmail}', '${operatorFirstName}', '${operatorLastName}'`,
    "  WHERE NOT EXISTS (SELECT 1 FROM repo_user)",
    "  RETURNING id, email",
    "),",
    "chosen_user AS (",
    "  SELECT id, email FROM repo_user",
    "  UNION ALL",
    "  SELECT id, email FROM inserted_user",
    "  LIMIT 1",
    "),",
    "updated_user AS (",
    `  UPDATE users AS u SET email = '${operatorEmail}', "firstName" = '${operatorFirstName}', "lastName" = '${operatorLastName}', "deletedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE u.id = (SELECT id FROM chosen_user)`,
    "  RETURNING u.id",
    "),",
    "repo_org AS (",
    `  SELECT id FROM organizations WHERE id = '${organizationId}' LIMIT 1`,
    "),",
    "first_org AS (",
    "  SELECT id FROM organizations ORDER BY id LIMIT 1",
    "),",
    "inserted_org AS (",
    '  INSERT INTO organizations (id, name, "createdByUserId")',
    `  SELECT '${organizationId}', '${organizationName}', (SELECT id FROM chosen_user)`,
    "  WHERE NOT EXISTS (SELECT 1 FROM repo_org)",
    "    AND NOT EXISTS (SELECT 1 FROM first_org)",
    "  RETURNING id",
    "),",
    "chosen_org AS (",
    "  SELECT id FROM repo_org",
    "  UNION ALL",
    "  SELECT id FROM first_org WHERE NOT EXISTS (SELECT 1 FROM repo_org)",
    "  UNION ALL",
    "  SELECT id FROM inserted_org",
    "  LIMIT 1",
    "),",
    "email_account AS (",
    `  SELECT id FROM accounts WHERE "userId" = (SELECT id FROM chosen_user) AND provider = 'email' LIMIT 1`,
    "),",
    "inserted_account AS (",
    '  INSERT INTO accounts (id, "userId", provider, "providerId", email, password)',
    `  SELECT gen_random_uuid()::text, (SELECT id FROM chosen_user), 'email', 'email', '${operatorEmail}', '${operatorPasswordHash}'`,
    "  WHERE NOT EXISTS (SELECT 1 FROM email_account)",
    "  RETURNING id",
    "),",
    "updated_account AS (",
    `  UPDATE accounts AS a SET provider = 'email', "providerId" = 'email', email = '${operatorEmail}', password = '${operatorPasswordHash}', "updatedAt" = CURRENT_TIMESTAMP WHERE a.id = (SELECT id FROM email_account)`,
    "  RETURNING a.id",
    "),",
    "named_project AS (",
    '  SELECT id FROM projects WHERE "organizationId" = (SELECT id FROM chosen_org) AND name = ' +
      `'${projectName}' LIMIT 1`,
    "),",
    "first_project AS (",
    '  SELECT id FROM projects WHERE "organizationId" = (SELECT id FROM chosen_org) ORDER BY id LIMIT 1',
    "),",
    "inserted_project AS (",
    '  INSERT INTO projects (name, "organizationId")',
    `  SELECT '${projectName}', (SELECT id FROM chosen_org)`,
    "  WHERE NOT EXISTS (SELECT 1 FROM named_project)",
    "    AND NOT EXISTS (SELECT 1 FROM first_project)",
    "  RETURNING id",
    "),",
    "chosen_project AS (",
    "  SELECT id FROM named_project",
    "  UNION ALL",
    "  SELECT id FROM first_project WHERE NOT EXISTS (SELECT 1 FROM named_project)",
    "  UNION ALL",
    "  SELECT id FROM inserted_project",
    "  LIMIT 1",
    "),",
    "existing_member AS (",
    `  SELECT m.id FROM members m WHERE m."organizationId" = (SELECT id FROM chosen_org) AND ((m."userId" = (SELECT id FROM chosen_user)) OR (LOWER(m.email) = LOWER('${operatorEmail}'))) ORDER BY m.email LIMIT 1`,
    "),",
    "inserted_member AS (",
    '  INSERT INTO members ("organizationId", "userId", email, role)',
    `  SELECT (SELECT id FROM chosen_org), (SELECT id FROM chosen_user), '${operatorEmail}', 'org:admin'`,
    "  WHERE NOT EXISTS (SELECT 1 FROM existing_member)",
    "  RETURNING email",
    "),",
    "updated_member AS (",
    `  UPDATE members AS m SET role = 'org:admin', email = '${operatorEmail}', "userId" = (SELECT id FROM chosen_user), "updatedAt" = CURRENT_TIMESTAMP WHERE m.id = (SELECT id FROM existing_member) AND (m.role IS DISTINCT FROM 'org:admin' OR m.email IS DISTINCT FROM '${operatorEmail}' OR m."userId" IS DISTINCT FROM (SELECT id FROM chosen_user))`,
    "  RETURNING m.email",
    "),",
    "named_client AS (",
    '  SELECT id::text AS id, secret FROM clients WHERE "organizationId" = (SELECT id FROM chosen_org) AND "projectId" = (SELECT id FROM chosen_project) AND name = ' +
      `'${clientName}' LIMIT 1`,
    "),",
    "first_client AS (",
    '  SELECT id::text AS id, secret FROM clients WHERE "organizationId" = (SELECT id FROM chosen_org) AND "projectId" = (SELECT id FROM chosen_project) ORDER BY id LIMIT 1',
    "),",
    "inserted_client AS (",
    '  INSERT INTO clients (name, secret, "projectId", "organizationId", type, "ignoreCorsAndSecret")',
    `  SELECT '${clientName}', ${generatedSecretSql}, (SELECT id FROM chosen_project), (SELECT id FROM chosen_org), 'write', false`,
    "  WHERE NOT EXISTS (SELECT 1 FROM named_client)",
    "    AND NOT EXISTS (SELECT 1 FROM first_client)",
    "  RETURNING id::text AS id, secret",
    "),",
    "chosen_client_seed AS (",
    "  SELECT id, secret FROM named_client",
    "  UNION ALL",
    "  SELECT id, secret FROM first_client WHERE NOT EXISTS (SELECT 1 FROM named_client)",
    "  UNION ALL",
    "  SELECT id, secret FROM inserted_client",
    "  LIMIT 1",
    "),",
    "updated_client AS (",
    `  UPDATE clients AS c SET secret = ${generatedSecretSql} WHERE c.id::text = (SELECT id FROM chosen_client_seed) AND (c.secret IS NULL OR LENGTH(TRIM(c.secret)) = 0) RETURNING c.id::text AS id, c.secret`,
    "),",
    "chosen_client AS (",
    "  SELECT id, secret FROM updated_client",
    "  UNION ALL",
    "  SELECT id, secret FROM chosen_client_seed WHERE secret IS NOT NULL AND LENGTH(TRIM(secret)) > 0 AND NOT EXISTS (SELECT 1 FROM updated_client)",
    "  LIMIT 1",
    ")",
    "SELECT json_build_object(",
    "  'clientId', (SELECT id FROM chosen_client),",
    "  'clientSecret', (SELECT secret FROM chosen_client),",
    "  'organizationId', (SELECT id FROM chosen_org),",
    "  'projectId', (SELECT id FROM chosen_project)",
    ")::text;",
  ].join("\n");
};

export const buildOpenPanelOperatorStateSql = (operatorEmail: string) => {
  const escapedOperatorEmail = escapePostgresLiteral(operatorEmail);

  return [
    "WITH repo_user AS (",
    `  SELECT id, email FROM users WHERE LOWER(email) = LOWER('${escapedOperatorEmail}') LIMIT 1`,
    "),",
    "email_account AS (",
    `  SELECT provider, password FROM accounts WHERE "userId" = (SELECT id FROM repo_user) AND provider = 'email' LIMIT 1`,
    "),",
    "admin_member AS (",
    `  SELECT role, "organizationId" FROM members WHERE "userId" = (SELECT id FROM repo_user) AND LOWER(email) = LOWER('${escapedOperatorEmail}') ORDER BY "createdAt" LIMIT 1`,
    ")",
    "SELECT json_build_object(",
    "  'email', (SELECT email FROM repo_user),",
    "  'passwordHash', (SELECT password FROM email_account),",
    "  'accountProvider', (SELECT provider FROM email_account),",
    "  'memberRole', (SELECT role FROM admin_member),",
    "  'organizationId', (SELECT \"organizationId\" FROM admin_member)",
    ")::text;",
  ].join("\n");
};

export const buildGlitchtipBootstrapScript = (input: {
  readonly operatorEmail: string;
  readonly operatorPassword: string;
  readonly operatorName: string;
  readonly organizationSlug: string;
  readonly organizationName: string;
  readonly teamSlug: string;
  readonly projectSlug: string;
  readonly projectName: string;
  readonly projectKeyName: string;
}) => {
  const encodedConfiguration = escapePythonSingleQuotedString(
    JSON.stringify(input),
  );

  return [
    "import json",
    "from django.apps import apps",
    "from django.contrib.auth import authenticate",
    "",
    `config = json.loads('${encodedConfiguration}')`,
    "User = apps.get_model('users', 'User')",
    "EmailAddress = apps.get_model('account', 'EmailAddress')",
    "Organization = apps.get_model('organizations_ext', 'Organization')",
    "OrganizationUser = apps.get_model('organizations_ext', 'OrganizationUser')",
    "OrganizationOwner = apps.get_model('organizations_ext', 'OrganizationOwner')",
    "Team = apps.get_model('teams', 'Team')",
    "Project = apps.get_model('projects', 'Project')",
    "ProjectKey = apps.get_model('projects', 'ProjectKey')",
    "",
    "user = User.objects.filter(email__iexact=config['operatorEmail']).first()",
    "if user is None:",
    "    user = User(",
    "        email=config['operatorEmail'],",
    "        name=config['operatorName'],",
    "        is_superuser=True,",
    "        is_staff=True,",
    "        is_active=True,",
    "        subscribe_by_default=False,",
    "        options={},",
    "    )",
    "    user.set_password(config['operatorPassword'])",
    "    user.save()",
    "else:",
    "    user_changed = False",
    "    if user.email != config['operatorEmail']:",
    "        user.email = config['operatorEmail']",
    "        user_changed = True",
    "    if user.name != config['operatorName']:",
    "        user.name = config['operatorName']",
    "        user_changed = True",
    "    if not user.is_superuser:",
    "        user.is_superuser = True",
    "        user_changed = True",
    "    if not user.is_staff:",
    "        user.is_staff = True",
    "        user_changed = True",
    "    if not user.is_active:",
    "        user.is_active = True",
    "        user_changed = True",
    "    if not user.check_password(config['operatorPassword']):",
    "        user.set_password(config['operatorPassword'])",
    "        user_changed = True",
    "    if user_changed:",
    "        user.save()",
    "",
    "email_address, _ = EmailAddress.objects.get_or_create(",
    "    user=user,",
    "    email=config['operatorEmail'],",
    "    defaults={'verified': True, 'primary': True},",
    ")",
    "email_address_changed = False",
    "if not email_address.verified:",
    "    email_address.verified = True",
    "    email_address_changed = True",
    "if not email_address.primary:",
    "    email_address.primary = True",
    "    email_address_changed = True",
    "if email_address_changed:",
    "    email_address.save()",
    "EmailAddress.objects.filter(user=user).exclude(id=email_address.id).update(primary=False)",
    "",
    "validated_user = authenticate(email=config['operatorEmail'], password=config['operatorPassword'])",
    "if validated_user is None or validated_user.id != user.id:",
    "    raise SystemExit('GlitchTip operator authentication failed after reconciliation.')",
    "",
    "org, _ = Organization.objects.get_or_create(",
    "    slug=config['organizationSlug'],",
    "    defaults={",
    "        'name': config['organizationName'],",
    "        'stripe_customer_id': '',",
    "    },",
    ")",
    "org_changed = False",
    "if org.name != config['organizationName']:",
    "    org.name = config['organizationName']",
    "    org_changed = True",
    "if getattr(org, 'stripe_customer_id', '') != '':",
    "    org.stripe_customer_id = ''",
    "    org_changed = True",
    "if org_changed:",
    "    org.save()",
    "",
    "org_user, _ = OrganizationUser.objects.get_or_create(",
    "    organization=org,",
    "    user=user,",
    `    defaults={'role': ${glitchtipOrganizationOwnerRole}, 'email': user.email},`,
    ")",
    `if org_user.role != ${glitchtipOrganizationOwnerRole} or org_user.email != user.email:`,
    `    org_user.role = ${glitchtipOrganizationOwnerRole}`,
    "    org_user.email = user.email",
    "    org_user.save()",
    "",
    "org_owner, _ = OrganizationOwner.objects.get_or_create(",
    "    organization=org,",
    "    defaults={'organization_user': org_user},",
    ")",
    "if org_owner.organization_user_id != org_user.id:",
    "    org_owner.organization_user = org_user",
    "    org_owner.save()",
    "",
    "team, _ = Team.objects.get_or_create(",
    "    organization=org,",
    "    slug=config['teamSlug'],",
    ")",
    "team.members.add(org_user)",
    "",
    "project, _ = Project.objects.get_or_create(",
    "    organization=org,",
    "    slug=config['projectSlug'],",
    "    defaults={'name': config['projectName']},",
    ")",
    "if project.name != config['projectName']:",
    "    project.name = config['projectName']",
    "    project.save()",
    "team.projects.add(project)",
    "",
    "project_key, _ = ProjectKey.objects.get_or_create(",
    "    project=project,",
    "    name=config['projectKeyName'],",
    ")",
    "",
    "print(json.dumps({",
    "    'dsn': project_key.get_dsn(),",
    "    'operatorEmail': user.email,",
    "    'organizationSlug': org.slug,",
    "    'teamSlug': team.slug,",
    "    'projectSlug': project.slug,",
    "}))",
    "",
  ].join("\n");
};

export const buildUnleashOperatorBootstrapSql = (input: {
  readonly operatorName: string;
  readonly operatorEmail: string;
  readonly operatorUsername: string;
  readonly operatorPasswordHash: string;
}) => {
  const operatorName = escapePostgresLiteral(input.operatorName);
  const operatorEmail = escapePostgresLiteral(input.operatorEmail);
  const operatorUsername = escapePostgresLiteral(input.operatorUsername);
  const operatorPasswordHash = escapePostgresLiteral(
    input.operatorPasswordHash,
  );
  const adminRoleName = escapePostgresLiteral(unleashAdminRoleName);
  const defaultProject = escapePostgresLiteral(unleashDefaultProject);

  return [
    "WITH repo_user AS (",
    `  SELECT id FROM users WHERE LOWER(email) = LOWER('${operatorEmail}') OR username = '${operatorUsername}' ORDER BY id LIMIT 1`,
    "),",
    "inserted_user AS (",
    "  INSERT INTO users (name, email, username, password_hash, created_at, updated_at, seen_at, login_attempts)",
    `  SELECT '${operatorName}', '${operatorEmail}', '${operatorUsername}', '${operatorPasswordHash}', NOW(), NOW(), NOW(), 0`,
    "  WHERE NOT EXISTS (SELECT 1 FROM repo_user)",
    "  RETURNING id",
    "),",
    "chosen_user AS (",
    "  SELECT id FROM repo_user",
    "  UNION ALL",
    "  SELECT id FROM inserted_user",
    "  LIMIT 1",
    "),",
    "updated_user AS (",
    `  UPDATE users AS u SET name = '${operatorName}', email = '${operatorEmail}', username = '${operatorUsername}', password_hash = '${operatorPasswordHash}', updated_at = NOW() WHERE u.id = (SELECT id FROM chosen_user)`,
    "  RETURNING u.id",
    "),",
    "admin_role AS (",
    `  SELECT id FROM roles WHERE name = '${adminRoleName}' AND type = 'root' LIMIT 1`,
    "),",
    "inserted_role AS (",
    "  INSERT INTO role_user (role_id, user_id, project)",
    `  SELECT (SELECT id FROM admin_role), (SELECT id FROM chosen_user), '${defaultProject}'`,
    "  WHERE NOT EXISTS (",
    "    SELECT 1 FROM role_user WHERE role_id = (SELECT id FROM admin_role) AND user_id = (SELECT id FROM chosen_user) AND project = 'default'",
    "  )",
    "  RETURNING user_id",
    ")",
    "SELECT json_build_object(",
    "  'email', (SELECT email FROM users WHERE id = (SELECT id FROM chosen_user)),",
    "  'username', (SELECT username FROM users WHERE id = (SELECT id FROM chosen_user)),",
    "  'passwordHash', (SELECT password_hash FROM users WHERE id = (SELECT id FROM chosen_user)),",
    "  'hasAdminRole', EXISTS (SELECT 1 FROM role_user WHERE role_id = (SELECT id FROM admin_role) AND user_id = (SELECT id FROM chosen_user) AND project = 'default')",
    ")::text;",
  ].join("\n");
};

export const buildUnleashOperatorStateSql = (input: {
  readonly operatorEmail: string;
  readonly operatorUsername: string;
}) => {
  const operatorEmail = escapePostgresLiteral(input.operatorEmail);
  const operatorUsername = escapePostgresLiteral(input.operatorUsername);
  const adminRoleName = escapePostgresLiteral(unleashAdminRoleName);

  return [
    "WITH repo_user AS (",
    `  SELECT id, email, username, password_hash FROM users WHERE LOWER(email) = LOWER('${operatorEmail}') OR username = '${operatorUsername}' ORDER BY id LIMIT 1`,
    "),",
    "admin_role AS (",
    `  SELECT id FROM roles WHERE name = '${adminRoleName}' AND type = 'root' LIMIT 1`,
    ")",
    "SELECT json_build_object(",
    "  'email', (SELECT email FROM repo_user),",
    "  'username', (SELECT username FROM repo_user),",
    "  'passwordHash', (SELECT password_hash FROM repo_user),",
    "  'hasAdminRole', EXISTS (SELECT 1 FROM role_user WHERE role_id = (SELECT id FROM admin_role) AND user_id = (SELECT id FROM repo_user) AND project = 'default')",
    ")::text;",
  ].join("\n");
};

const buildNovuRegistrationBody = (
  environment: BootstrapRuntimeEnvironment,
) => ({
  email: environment.NOVU_EMAIL,
  password: environment.NOVU_PASSWORD,
  firstName: environment.NOVU_FNAME,
  lastName: environment.NOVU_LNAME,
  organizationName: environment.NOVU_ORGANIZATION_NAME,
  origin: novuRegistrationOrigin,
  jobTitle: novuRegistrationJobTitle,
  domain: environment.NOVU_EMAIL.split("@")[1] ?? "local.test",
  productUseCases: [...novuRegistrationProductUseCases],
});

const isNovuApiKeyValid = async (input: {
  readonly apiUrl: string;
  readonly apiKey: string;
}) => {
  const result = await requestJson({
    url: buildUrl(input.apiUrl, novuAuthenticatedEnvironmentPath),
    headers: {
      Accept: "application/json",
      Authorization: `ApiKey ${input.apiKey}`,
    },
  });

  return result.response.ok;
};

const waitForNovuRuntime = async (apiUrl: string) =>
  await waitForEndpoint({
    description: "Novu API",
    url: buildUrl(apiUrl, novuHealthcheckPath),
    isReady: ({ response }) => response.ok,
    attempts: 90,
    delayMs: 2_000,
  });

const waitForPostalRuntime = async (apiUrl: string) =>
  await waitForEndpoint({
    description: "Postal web runtime",
    url: apiUrl,
    isReady: ({ response }) =>
      response.ok ||
      response.status === 403 ||
      (response.status >= 300 && response.status < 400),
    attempts: 45,
    delayMs: 2_000,
  });

const waitForUnleashRuntime = async (apiUrl: string) =>
  await waitForEndpoint({
    description: "Unleash API",
    url: buildUrl(apiUrl, unleashHealthcheckPath),
    isReady: ({ response }) => response.ok,
    attempts: 45,
    delayMs: 2_000,
  });

const validateOpenPanelClientCredentials = async (input: {
  readonly apiUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
}) => {
  const openpanel = await Effect.runPromise(
    makeOpenPanelAdapter({
      apiUrl: input.apiUrl,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
    }),
  );

  await Effect.runPromise(openpanel.healthcheck);
};

const validateGlitchtipDsn = async (dsn: string) => {
  const glitchtip = await Effect.runPromise(
    makeGlitchtipAdapter({
      dsn,
    }),
  );

  await Effect.runPromise(glitchtip.healthcheck);
};

const validateGlitchtipOperatorLogin = async (input: {
  readonly email: string;
  readonly password: string;
}) => {
  const script = [
    "import json",
    "from django.contrib.auth import authenticate",
    "",
    `user = authenticate(email='${escapePythonSingleQuotedString(input.email)}', password='${escapePythonSingleQuotedString(input.password)}')`,
    "print(json.dumps({",
    `    'email': '${escapePythonSingleQuotedString(input.email)}',`,
    "    'authenticated': user is not None,",
    "}))",
    "",
  ].join("\n");
  const result = await runProcess({
    command: [
      "docker",
      "exec",
      "glitchtip",
      "python",
      "manage.py",
      "shell",
      "--no-imports",
      "-c",
      script,
    ],
    env: Bun.env satisfies NodeJS.ProcessEnv,
  });
  const loginState = extractPostalOperatorLoginState(result.stdout);

  if (!loginState.authenticated) {
    throw new Error(
      `GlitchTip operator login validation failed for ${input.email}.`,
    );
  }
};

const readOpenPanelOperatorAuthState = async (operatorEmail: string) =>
  extractOpenPanelOperatorAuthState(
    (
      await runProcess({
        command: [
          "docker",
          "exec",
          "op-db",
          "psql",
          "-v",
          "ON_ERROR_STOP=1",
          "-U",
          "openpanel",
          "-d",
          "openpanel",
          "-t",
          "-A",
          "-c",
          buildOpenPanelOperatorStateSql(operatorEmail),
        ],
        env: Bun.env satisfies NodeJS.ProcessEnv,
      })
    ).stdout,
  );

const validateOpenPanelOperatorLogin = async (input: {
  readonly email: string;
  readonly password: string;
}) => {
  const state = readOpenPanelOperatorAuthState(input.email);
  const loginState = await state;

  if (
    loginState.accountProvider !== "email" ||
    loginState.memberRole !== "org:admin" ||
    loginState.organizationId.trim().length === 0 ||
    !(await getBunPassword().verify(input.password, loginState.passwordHash))
  ) {
    throw new Error(
      `OpenPanel operator login validation failed for ${input.email}.`,
    );
  }
};

const readUnleashOperatorAuthState = async (input: {
  readonly email: string;
  readonly username: string;
}) =>
  extractUnleashOperatorAuthState(
    (
      await runProcess({
        command: [
          "docker",
          "exec",
          "postgres",
          "psql",
          "-v",
          "ON_ERROR_STOP=1",
          "-U",
          "comvestec",
          "-d",
          "unleash",
          "-t",
          "-A",
          "-c",
          buildUnleashOperatorStateSql({
            operatorEmail: input.email,
            operatorUsername: input.username,
          }),
        ],
        env: Bun.env satisfies NodeJS.ProcessEnv,
      })
    ).stdout,
  );

const validateUnleashOperatorLogin = async (input: {
  readonly email: string;
  readonly username: string;
  readonly password: string;
}) => {
  const loginState = await readUnleashOperatorAuthState({
    email: input.email,
    username: input.username,
  });

  if (
    !loginState.hasAdminRole ||
    loginState.email.toLowerCase() !== input.email.toLowerCase() ||
    loginState.username !== input.username ||
    !(await getBunPassword().verify(input.password, loginState.passwordHash))
  ) {
    throw new Error(
      `Unleash operator login validation failed for ${input.username}.`,
    );
  }
};

const isUnleashApiKeyValid = async (input: {
  readonly apiUrl: string;
  readonly apiKey: string;
}) => {
  const result = await requestJson({
    url: buildUnleashClientFeaturesEndpoint(input.apiUrl),
    headers: buildUnleashValidationHeaders(input.apiKey),
  });

  return result.response.ok;
};

const reconcileUnleashBackendToken = async (apiToken: string) => {
  await runProcess({
    command: [
      "docker",
      "exec",
      "postgres",
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "comvestec",
      "-d",
      "unleash",
      "-c",
      buildUnleashBackendTokenReconcileSql(apiToken),
    ],
    env: Bun.env satisfies NodeJS.ProcessEnv,
  });
};

const isPostalApiKeyValid = async (input: {
  readonly apiUrl: string;
  readonly apiKey: string;
}) => {
  const result = await requestJson({
    url: buildUrl(input.apiUrl, postalSendMessagePath),
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Server-API-Key": input.apiKey,
    },
    body: {},
  });

  if (
    !result.response.ok ||
    result.body === undefined ||
    !isRecord(result.body)
  ) {
    return false;
  }

  const data = result.body.data;
  const code =
    isRecord(data) && typeof data.code === "string" ? data.code : undefined;

  return code === undefined || !invalidPostalAuthCodes.has(code);
};

const validatePostalOperatorLogin = async (input: {
  readonly email: string;
  readonly password: string;
}) => {
  const result = await runProcess({
    command: [
      "docker",
      "exec",
      "-i",
      "postal",
      "/opt/postal/app/bin/postal",
      "console",
    ],
    env: Bun.env satisfies NodeJS.ProcessEnv,
    stdinText: buildPostalOperatorValidationScript({
      email: input.email,
      password: input.password,
    }),
  });
  const loginState = extractPostalOperatorLoginState(result.stdout);

  if (!loginState.authenticated) {
    throw new Error(
      `Postal operator login validation failed for ${input.email}.`,
    );
  }
};

const recreateNovuRuntime = async (input: {
  readonly environment: BootstrapRuntimeEnvironment;
  readonly disableUserRegistration: boolean;
}) => {
  const disableUserRegistration = input.disableUserRegistration
    ? "true"
    : "false";

  await runDockerComposeCommand({
    environment: input.environment,
    overrides: {
      [novuRegistrationToggleEnvKey]: disableUserRegistration,
    },
    args: ["up", "-d", "--force-recreate", "novu", "novu-worker"],
  });
  await waitForNovuRuntime(input.environment.NOVU_API_URL);
};

const loginNovuOperator = async (environment: BootstrapRuntimeEnvironment) => {
  const result = await requestJson({
    url: buildUrl(environment.NOVU_API_URL, "/v1/auth/login"),
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: {
      email: environment.NOVU_EMAIL,
      password: environment.NOVU_PASSWORD,
    },
  });

  if (result.response.ok) {
    return extractNovuSessionToken(result.body);
  }

  if (result.response.status === 401) {
    return undefined;
  }

  throw new Error(
    `Novu login failed with ${result.response.status}: ${result.bodyText.trim() || "(empty body)"}`,
  );
};

const registerNovuOperator = async (
  environment: BootstrapRuntimeEnvironment,
) => {
  const result = await requestJson({
    url: buildUrl(environment.NOVU_API_URL, "/v1/auth/register"),
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: buildNovuRegistrationBody(environment),
  });

  if (result.response.ok) {
    return extractNovuSessionToken(result.body);
  }

  if (
    result.response.status === 400 &&
    /already exists/iu.test(result.bodyText)
  ) {
    return undefined;
  }

  throw new Error(
    `Novu registration failed with ${result.response.status}: ${result.bodyText.trim() || "(empty body)"}`,
  );
};

const listNovuApiKey = async (input: {
  readonly apiUrl: string;
  readonly sessionToken: string;
}) => {
  const result = await requestJson({
    url: buildUrl(input.apiUrl, novuEnvironmentListPath),
    headers: {
      Accept: "application/json",
      Authorization: input.sessionToken,
    },
  });

  if (!result.response.ok) {
    throw new Error(
      `Novu API key listing failed with ${result.response.status}: ${result.bodyText.trim() || "(empty body)"}`,
    );
  }

  try {
    return extractNovuApiKey(result.body);
  } catch {
    return undefined;
  }
};

const ensureNovuApiKey = async (environment: BootstrapRuntimeEnvironment) => {
  await waitForNovuRuntime(environment.NOVU_API_URL);
  const configuredApiKey = environment.NOVU_API_KEY?.trim();

  if (
    configuredApiKey !== undefined &&
    !shouldBootstrapRuntimeCredential(configuredApiKey) &&
    (await isNovuApiKeyValid({
      apiUrl: environment.NOVU_API_URL,
      apiKey: configuredApiKey,
    }))
  ) {
    return {
      apiKey: configuredApiKey,
      operatorEmail: environment.NOVU_EMAIL,
      wasUpdated: false,
    };
  }

  let shouldRestoreRegistrationLock = false;
  let apiKey: string | undefined;
  let sessionToken = await loginNovuOperator(environment);

  try {
    if (sessionToken === undefined) {
      shouldRestoreRegistrationLock = true;
      await recreateNovuRuntime({
        environment,
        disableUserRegistration: false,
      });
      sessionToken = await registerNovuOperator(environment);

      if (sessionToken === undefined) {
        sessionToken = await loginNovuOperator(environment);
      }

      if (sessionToken === undefined) {
        throw new Error(
          `Unable to log into the local Novu runtime as ${environment.NOVU_EMAIL}. The operator may already exist with a password that does not match NOVU_PASSWORD in Vault.`,
        );
      }
    }

    apiKey = await listNovuApiKey({
      apiUrl: environment.NOVU_API_URL,
      sessionToken,
    });
  } finally {
    if (shouldRestoreRegistrationLock) {
      await recreateNovuRuntime({
        environment,
        disableUserRegistration:
          environment[novuRegistrationToggleEnvKey]?.trim() !== "false",
      });
    }
  }

  if (apiKey === undefined || apiKey.trim().length === 0) {
    throw new Error("Novu bootstrap did not yield a usable API key.");
  }

  if (
    !(await isNovuApiKeyValid({
      apiUrl: environment.NOVU_API_URL,
      apiKey,
    }))
  ) {
    throw new Error(
      "Novu bootstrap generated an API key, but the authenticated environment probe still rejected it.",
    );
  }

  return {
    apiKey,
    operatorEmail: environment.NOVU_EMAIL,
    wasUpdated: true,
  };
};

const ensurePostalApiKey = async (environment: BootstrapRuntimeEnvironment) => {
  await waitForPostalRuntime(environment.POSTAL_API_URL);
  const configuredApiKey = environment.POSTAL_API_KEY?.trim();
  let operatorWasUpdated = false;
  let postalBootstrapResult: PostalBootstrapResult | undefined;

  try {
    await validatePostalOperatorLogin({
      email: environment.POSTAL_EMAIL,
      password: environment.POSTAL_PASSWORD,
    });
  } catch {
    operatorWasUpdated = true;
  }

  if (
    !operatorWasUpdated &&
    configuredApiKey !== undefined &&
    !shouldBootstrapRuntimeCredential(configuredApiKey) &&
    (await isPostalApiKeyValid({
      apiUrl: environment.POSTAL_API_URL,
      apiKey: configuredApiKey,
    }))
  ) {
    return {
      apiKey: configuredApiKey,
      operatorEmail: environment.POSTAL_EMAIL,
      serverName: postalBootstrapServerName,
      wasUpdated: operatorWasUpdated,
    };
  }

  if (postalBootstrapResult === undefined) {
    const postalBootstrapScript = buildPostalBootstrapScript({
      email: environment.POSTAL_EMAIL,
      password: environment.POSTAL_PASSWORD,
      firstName: environment.POSTAL_FNAME,
      lastName: environment.POSTAL_LNAME,
      organizationName: postalBootstrapOrganizationName,
      serverName: postalBootstrapServerName,
      credentialName: postalBootstrapCredentialName,
    });
    const result = await runProcess({
      command: [
        "docker",
        "exec",
        "-i",
        "postal",
        "/opt/postal/app/bin/postal",
        "console",
      ],
      env: Bun.env satisfies NodeJS.ProcessEnv,
      stdinText: postalBootstrapScript,
    });
    postalBootstrapResult = extractPostalBootstrapResult(result.stdout);
  }

  await validatePostalOperatorLogin({
    email: environment.POSTAL_EMAIL,
    password: environment.POSTAL_PASSWORD,
  });

  if (
    !(await isPostalApiKeyValid({
      apiUrl: environment.POSTAL_API_URL,
      apiKey: postalBootstrapResult.apiKey,
    }))
  ) {
    throw new Error(
      "Postal bootstrap generated an API key, but the legacy send API still rejected it.",
    );
  }

  return {
    apiKey: postalBootstrapResult.apiKey,
    operatorEmail: postalBootstrapResult.email,
    serverName: postalBootstrapResult.serverName,
    wasUpdated: true,
  };
};

const ensureUnleashBackendApiKey = async (
  environment: BootstrapRuntimeEnvironment,
) => {
  await waitForUnleashRuntime(environment.UNLEASH_URL);
  let operatorWasUpdated = false;

  try {
    await validateUnleashOperatorLogin({
      email: environment.UNLEASH_OPERATOR_EMAIL,
      username: environment.UNLEASH_OPERATOR_USERNAME,
      password: environment.UNLEASH_OPERATOR_PASSWORD,
    });
  } catch {
    operatorWasUpdated = true;
    const operatorPasswordHash = await getBunPassword().hash(
      environment.UNLEASH_OPERATOR_PASSWORD,
      "bcrypt",
    );
    await runProcess({
      command: [
        "docker",
        "exec",
        "postgres",
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "comvestec",
        "-d",
        "unleash",
        "-t",
        "-A",
        "-c",
        buildUnleashOperatorBootstrapSql({
          operatorName: unleashOperatorName,
          operatorEmail: environment.UNLEASH_OPERATOR_EMAIL,
          operatorUsername: environment.UNLEASH_OPERATOR_USERNAME,
          operatorPasswordHash,
        }),
      ],
      env: Bun.env satisfies NodeJS.ProcessEnv,
    });
    await validateUnleashOperatorLogin({
      email: environment.UNLEASH_OPERATOR_EMAIL,
      username: environment.UNLEASH_OPERATOR_USERNAME,
      password: environment.UNLEASH_OPERATOR_PASSWORD,
    });
  }

  const apiKey = selectUnleashBackendApiToken({
    configuredApiKey: environment.UNLEASH_API_KEY,
    configuredBootstrapToken: environment.UNLEASH_API_TOKEN,
  });
  const wasVaultDrifted =
    environment.UNLEASH_API_KEY.trim() !== apiKey ||
    environment.UNLEASH_API_TOKEN.trim() !== apiKey;

  if (
    await isUnleashApiKeyValid({
      apiUrl: environment.UNLEASH_URL,
      apiKey,
    })
  ) {
    return {
      apiKey,
      wasUpdated: operatorWasUpdated || wasVaultDrifted,
    };
  }

  await reconcileUnleashBackendToken(apiKey);

  if (
    !(await isUnleashApiKeyValid({
      apiUrl: environment.UNLEASH_URL,
      apiKey,
    }))
  ) {
    await runDockerComposeCommand({
      environment,
      args: ["restart", "unleash"],
    });
    await waitForUnleashRuntime(environment.UNLEASH_URL);

    if (
      !(await isUnleashApiKeyValid({
        apiUrl: environment.UNLEASH_URL,
        apiKey,
      }))
    ) {
      throw new Error(
        "Unleash bootstrap did not yield a usable backend API token.",
      );
    }
  }

  return {
    apiKey,
    wasUpdated: true,
  };
};

const ensureOpenPanelClientCredentials = async (
  environment: BootstrapRuntimeEnvironment,
) => {
  let operatorWasUpdated = false;
  const configuredClientId = environment.OPENPANEL_CLIENT_ID?.trim();
  const configuredClientSecret = environment.OPENPANEL_CLIENT_SECRET?.trim();

  try {
    await validateOpenPanelOperatorLogin({
      email: environment.OPENPANEL_OPERATOR_EMAIL,
      password: environment.OPENPANEL_OPERATOR_PASSWORD,
    });
  } catch {
    operatorWasUpdated = true;
  }

  if (
    !operatorWasUpdated &&
    configuredClientId !== undefined &&
    configuredClientSecret !== undefined &&
    !shouldBootstrapRuntimeCredential(configuredClientId) &&
    !shouldBootstrapRuntimeCredential(configuredClientSecret)
  ) {
    try {
      await waitForValidatedRuntimeCredential({
        description: "OpenPanel backend client credentials",
        validate: async () =>
          await validateOpenPanelClientCredentials({
            apiUrl: environment.OPENPANEL_API_URL,
            clientId: configuredClientId,
            clientSecret: configuredClientSecret,
          }),
      });

      return {
        clientId: configuredClientId,
        clientSecret: configuredClientSecret,
        wasUpdated: operatorWasUpdated,
      };
    } catch {
      // Fall through to DB-backed reconciliation below.
    }
  }

  const operatorPasswordHash = await getBunPassword().hash(
    environment.OPENPANEL_OPERATOR_PASSWORD,
    "argon2id",
  );
  const result = await runProcess({
    command: [
      "docker",
      "exec",
      "op-db",
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "openpanel",
      "-d",
      "openpanel",
      "-t",
      "-A",
      "-c",
      buildOpenPanelBootstrapSql({
        organizationId: openpanelBootstrapOrganizationId,
        organizationName: openpanelBootstrapOrganizationName,
        projectName: openpanelBootstrapProjectName,
        clientName: openpanelBootstrapClientName,
        operatorEmail: environment.OPENPANEL_OPERATOR_EMAIL,
        operatorPasswordHash,
        operatorFirstName: openpanelOperatorFirstName,
        operatorLastName: openpanelOperatorLastName,
      }),
    ],
    env: Bun.env satisfies NodeJS.ProcessEnv,
  });
  const openpanelBootstrapResult = extractOpenPanelBootstrapResult(
    result.stdout,
  );

  await validateOpenPanelOperatorLogin({
    email: environment.OPENPANEL_OPERATOR_EMAIL,
    password: environment.OPENPANEL_OPERATOR_PASSWORD,
  });
  await waitForValidatedRuntimeCredential({
    description: "OpenPanel backend client credentials",
    validate: async () =>
      await validateOpenPanelClientCredentials({
        apiUrl: environment.OPENPANEL_API_URL,
        clientId: openpanelBootstrapResult.clientId,
        clientSecret: openpanelBootstrapResult.clientSecret,
      }),
    attempts: 45,
  });

  return {
    clientId: openpanelBootstrapResult.clientId,
    clientSecret: openpanelBootstrapResult.clientSecret,
    organizationId: openpanelBootstrapResult.organizationId,
    projectId: openpanelBootstrapResult.projectId,
    wasUpdated: true,
  };
};

const ensureGlitchtipDsn = async (environment: BootstrapRuntimeEnvironment) => {
  const configuredDsn = environment.ERROR_TRACKING_DSN?.trim();
  let operatorWasUpdated = false;
  let configuredDsnWasValid = false;

  try {
    await validateGlitchtipOperatorLogin({
      email: environment.GLITCHTIP_OPERATOR_EMAIL,
      password: environment.GLITCHTIP_OPERATOR_PASSWORD,
    });
  } catch {
    operatorWasUpdated = true;
  }

  if (
    configuredDsn !== undefined &&
    !shouldBootstrapRuntimeCredential(configuredDsn)
  ) {
    try {
      configuredDsnWasValid = true;
      await waitForValidatedRuntimeCredential({
        description: "GlitchTip DSN",
        validate: async () => await validateGlitchtipDsn(configuredDsn),
      });
    } catch {
      // Fall through to runtime reconciliation below.
      configuredDsnWasValid = false;
    }
  }

  if (
    !operatorWasUpdated &&
    configuredDsnWasValid &&
    configuredDsn !== undefined
  ) {
    return {
      dsn: configuredDsn,
      wasUpdated: false,
    };
  }

  const result = await runProcess({
    command: [
      "docker",
      "exec",
      "glitchtip",
      "python",
      "manage.py",
      "shell",
      "--no-imports",
      "-c",
      buildGlitchtipBootstrapScript({
        operatorEmail: environment.GLITCHTIP_OPERATOR_EMAIL,
        operatorPassword: environment.GLITCHTIP_OPERATOR_PASSWORD,
        operatorName: glitchtipOperatorName,
        organizationSlug: glitchtipBootstrapOrganizationSlug,
        organizationName: glitchtipBootstrapOrganizationName,
        teamSlug: glitchtipBootstrapTeamSlug,
        projectSlug: glitchtipBootstrapProjectSlug,
        projectName: glitchtipBootstrapProjectName,
        projectKeyName: glitchtipBootstrapProjectKeyName,
      }),
    ],
    env: Bun.env satisfies NodeJS.ProcessEnv,
  });
  const glitchtipBootstrapResult = extractGlitchtipBootstrapResult(
    result.stdout,
  );

  await validateGlitchtipOperatorLogin({
    email: environment.GLITCHTIP_OPERATOR_EMAIL,
    password: environment.GLITCHTIP_OPERATOR_PASSWORD,
  });
  await waitForValidatedRuntimeCredential({
    description: "GlitchTip DSN",
    validate: async () =>
      await validateGlitchtipDsn(glitchtipBootstrapResult.dsn),
    attempts: 45,
  });

  return {
    dsn: glitchtipBootstrapResult.dsn,
    operatorEmail: glitchtipBootstrapResult.operatorEmail,
    organizationSlug: glitchtipBootstrapResult.organizationSlug,
    projectSlug: glitchtipBootstrapResult.projectSlug,
    teamSlug: glitchtipBootstrapResult.teamSlug,
    wasUpdated: true,
  };
};

const main = async () => {
  const resolution = await resolveLocalRuntimeEnvironment({
    requireManagedKeys: true,
  });
  const environment: RuntimeEnvironment = resolution.values;
  assertBootstrapRuntimeEnvironment(environment);
  const glitchtipResult = await ensureGlitchtipDsn(environment);
  const openpanelResult = await ensureOpenPanelClientCredentials(environment);
  const unleashResult = await ensureUnleashBackendApiKey(environment);
  const postalResult = await ensurePostalApiKey(environment);
  const novuResult = await ensureNovuApiKey(environment);
  const updatedValues = {
    ...resolution.vaultData,
    ERROR_TRACKING_DSN: glitchtipResult.dsn,
    OPENPANEL_CLIENT_ID: openpanelResult.clientId,
    OPENPANEL_CLIENT_SECRET: openpanelResult.clientSecret,
    UNLEASH_API_KEY: unleashResult.apiKey,
    UNLEASH_API_TOKEN: unleashResult.apiKey,
    POSTAL_API_KEY: postalResult.apiKey,
    NOVU_API_KEY: novuResult.apiKey,
  } satisfies Record<string, string>;

  await writeVaultKvRecord({
    data: updatedValues,
    ...(environment.VAULT_ADDR !== undefined
      ? { vaultAddress: environment.VAULT_ADDR }
      : {}),
  });

  console.log(
    `Stored runtime-generated and reconciled local service credentials in Vault at ${localRuntimeVaultPath}.`,
  );
  if ("operatorEmail" in glitchtipResult) {
    console.log(`GlitchTip operator email: ${glitchtipResult.operatorEmail}`);
    console.log(`GlitchTip organization: ${glitchtipResult.organizationSlug}`);
    console.log(`GlitchTip team: ${glitchtipResult.teamSlug}`);
    console.log(`GlitchTip project: ${glitchtipResult.projectSlug}`);
  }
  if ("organizationId" in openpanelResult) {
    console.log(`OpenPanel organization id: ${openpanelResult.organizationId}`);
    console.log(`OpenPanel project id: ${openpanelResult.projectId}`);
  }
  console.log(`Novu operator email: ${novuResult.operatorEmail}`);
  console.log(`Postal operator email: ${postalResult.operatorEmail}`);
  console.log(`Postal server credential: ${postalResult.serverName}`);
  console.log(
    `Updated values: ${
      [
        ...(glitchtipResult.wasUpdated ? ["ERROR_TRACKING_DSN"] : []),
        ...(openpanelResult.wasUpdated
          ? ["OPENPANEL_CLIENT_ID", "OPENPANEL_CLIENT_SECRET"]
          : []),
        ...(unleashResult.wasUpdated
          ? ["UNLEASH_API_KEY", "UNLEASH_API_TOKEN"]
          : []),
        ...(novuResult.wasUpdated ? ["NOVU_API_KEY"] : []),
        ...(postalResult.wasUpdated ? ["POSTAL_API_KEY"] : []),
      ].join(", ") ||
      "none; existing Vault-backed credentials were already valid"
    }`,
  );
  console.log(
    "Next step: rerun the local deployment validator or any backend-local command so the current Vault-backed runtime picks up the bootstrapped credentials.",
  );
};

if (import.meta.main) {
  await main();
}
