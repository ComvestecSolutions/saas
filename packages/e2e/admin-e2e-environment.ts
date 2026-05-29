const localRuntimePlaceholderPrefixes = [
  "set-in-local-env__",
  "generate-after-",
  "set-from-",
  "set-when-",
] as const;

const localAdminHosts = new Set(["127.0.0.1", "localhost"]);

export const defaultLocalAdminE2EBaseUrl = "http://127.0.0.1:3004";

export type AdminE2EEnvironment = Record<string, string | undefined>;

export type AdminTrustedSession = {
  readonly baseURL: string;
  readonly tenantId: string;
  readonly inviteEmail: string;
  readonly tokenLabel: string;
} & (
  | {
      readonly authMode: "cookie";
      readonly cookieName: string;
      readonly cookieValue: string;
    }
  | {
      readonly authMode: "operator";
      readonly operatorUsername: string;
      readonly operatorPassword: string;
    }
);

export const isPlaceholderValue = (value: string | undefined) =>
  value === undefined ||
  value.trim().length === 0 ||
  localRuntimePlaceholderPrefixes.some((prefix) => value.includes(prefix));

export const readConfiguredAdminE2EEnvironmentValue = (
  environment: AdminE2EEnvironment,
  key: string,
) => {
  const trimmedValue = environment[key]?.trim();

  if (isPlaceholderValue(trimmedValue)) {
    return undefined;
  }

  return trimmedValue;
};

export const resolveAdminE2EBaseUrl = (
  environment: AdminE2EEnvironment = process.env,
) =>
  readConfiguredAdminE2EEnvironmentValue(environment, "ADMIN_E2E_BASE_URL") ??
  defaultLocalAdminE2EBaseUrl;

export const usesLocalAdminTarget = (baseURL: string) => {
  try {
    return localAdminHosts.has(new URL(baseURL).hostname);
  } catch {
    return false;
  }
};

export const shouldUseLocalAdminWebServer = (
  environment: AdminE2EEnvironment = process.env,
) => usesLocalAdminTarget(resolveAdminE2EBaseUrl(environment));

export const resolveAdminTrustedSession = (
  environment: AdminE2EEnvironment = process.env,
): AdminTrustedSession | undefined => {
  const baseURL = readConfiguredAdminE2EEnvironmentValue(
    environment,
    "ADMIN_E2E_BASE_URL",
  );
  const cookieName = readConfiguredAdminE2EEnvironmentValue(
    environment,
    "ADMIN_E2E_TRUSTED_SESSION_COOKIE_NAME",
  );
  const cookieValue = readConfiguredAdminE2EEnvironmentValue(
    environment,
    "ADMIN_E2E_TRUSTED_SESSION_COOKIE_VALUE",
  );
  const operatorUsername = readConfiguredAdminE2EEnvironmentValue(
    environment,
    "ADMIN_E2E_OPERATOR_USERNAME",
  );
  const operatorPassword = readConfiguredAdminE2EEnvironmentValue(
    environment,
    "ADMIN_E2E_OPERATOR_PASSWORD",
  );
  const tenantId = readConfiguredAdminE2EEnvironmentValue(
    environment,
    "ADMIN_E2E_TENANT_ID",
  );
  const inviteEmail = readConfiguredAdminE2EEnvironmentValue(
    environment,
    "ADMIN_E2E_INVITE_EMAIL",
  );
  const tokenLabel = readConfiguredAdminE2EEnvironmentValue(
    environment,
    "ADMIN_E2E_TOKEN_LABEL",
  );
  const hasTrustedCookie =
    cookieName !== undefined && cookieValue !== undefined;
  const hasOperatorCredentials =
    operatorUsername !== undefined && operatorPassword !== undefined;

  if (hasTrustedCookie && hasOperatorCredentials) {
    throw new TypeError(
      "Configure exactly one ADMIN_E2E auth mode: either trusted session cookie values or operator credentials, not both.",
    );
  }

  if (
    baseURL === undefined ||
    tenantId === undefined ||
    inviteEmail === undefined ||
    tokenLabel === undefined ||
    (!hasTrustedCookie && !hasOperatorCredentials)
  ) {
    return undefined;
  }

  if (hasOperatorCredentials) {
    return {
      authMode: "operator",
      baseURL,
      tenantId,
      inviteEmail,
      tokenLabel,
      operatorUsername,
      operatorPassword,
    };
  }

  if (!hasTrustedCookie) {
    throw new TypeError(
      "Trusted session cookie values must be present when operator credentials are absent.",
    );
  }

  return {
    authMode: "cookie",
    baseURL,
    tenantId,
    inviteEmail,
    tokenLabel,
    cookieName,
    cookieValue,
  };
};
