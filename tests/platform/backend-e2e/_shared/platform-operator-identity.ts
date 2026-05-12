import { Effect } from "effect";
import { actorType, identityClaimKey } from "@comvestec/contracts";
import { makeKeycloakAdapter } from "../../../../packages/platform/src/adapters/identity/keycloak";
import { issueKeycloakPasswordGrant } from "../../../../tooling/scripts/subscriber-journey/common";

type PlatformOperatorIdentityRequest = {
  readonly baseUrl: string;
  readonly realm: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly adminUsername: string;
  readonly adminPassword: string;
  readonly username: string;
  readonly password: string;
  readonly email: string;
};

const runPlatformOperatorIdentityStep = async <T>(
  label: string,
  operation: Promise<T>,
  timeoutMs = 30_000,
) => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
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

const decodeJwtPayload = (token: string) =>
  JSON.parse(
    Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
  ) as Record<string, unknown>;

const requestJson = async (url: URL, init?: RequestInit) => {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);

  return {
    status: response.status,
    body,
  };
};

const buildExactMatchUrl = (
  baseUrl: string,
  pathname: string,
  key: string,
  value: string,
) => {
  const url = new URL(pathname, baseUrl);
  url.searchParams.set(key, value);
  url.searchParams.set("exact", "true");
  return url;
};

const sleep = (delayMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });

export const ensurePlatformOperatorIdentity = async (
  input: PlatformOperatorIdentityRequest,
) => {
  const adminToken = await Effect.runPromise(
    issueKeycloakPasswordGrant({
      baseUrl: input.baseUrl,
      realm: "master",
      clientId: "admin-cli",
      username: input.adminUsername,
      password: input.adminPassword,
    }),
  );
  const headers = {
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  };
  const lookupUrl = buildExactMatchUrl(
    input.baseUrl,
    `/admin/realms/${input.realm}/users`,
    "username",
    input.username,
  );

  await runPlatformOperatorIdentityStep(
    "create platform-operator keycloak user",
    fetch(new URL(`/admin/realms/${input.realm}/users`, input.baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({
        username: input.username,
        email: input.email,
        firstName: "Backend",
        lastName: "Workflow Operator",
        enabled: true,
        emailVerified: true,
      }),
    }),
  );

  const ensuredUsers = await runPlatformOperatorIdentityStep(
    "lookup platform-operator keycloak user",
    requestJson(lookupUrl, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    }),
  );
  const user = Array.isArray(ensuredUsers.body)
    ? ensuredUsers.body[0]
    : undefined;

  if (user?.id === undefined) {
    throw new Error(
      "Failed to resolve the temporary platform-operator Keycloak user.",
    );
  }

  await runPlatformOperatorIdentityStep(
    "update platform-operator keycloak user attributes",
    fetch(
      new URL(`/admin/realms/${input.realm}/users/${user.id}`, input.baseUrl),
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          id: user.id,
          username: input.username,
          email: input.email,
          firstName: "Backend",
          lastName: "Workflow Operator",
          attributes: {
            [identityClaimKey.actorType]: [actorType.platformOperator],
          },
          enabled: true,
          emailVerified: true,
        }),
      },
    ),
  );

  await runPlatformOperatorIdentityStep(
    "reset platform-operator keycloak password",
    fetch(
      new URL(
        `/admin/realms/${input.realm}/users/${user.id}/reset-password`,
        input.baseUrl,
      ),
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          temporary: false,
          type: "password",
          value: input.password,
        }),
      },
    ),
  );

  const keycloak = await Effect.runPromise(
    makeKeycloakAdapter({
      baseUrl: input.baseUrl,
      realm: input.realm,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
    }),
  );
  let token: string | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      token = await Effect.runPromise(
        keycloak.issueIdTokenWithPasswordGrant({
          username: input.username,
          password: input.password,
        }),
      );
      break;
    } catch (error) {
      lastError = error;
      await sleep(1000);
    }
  }

  if (token === undefined) {
    throw (
      lastError ??
      new Error("Failed to issue platform-operator Keycloak token.")
    );
  }

  const payload = decodeJwtPayload(token);

  if (payload[identityClaimKey.actorType] !== actorType.platformOperator) {
    throw new Error(
      "Expected platform-operator Keycloak token to carry the platform-operator actor-type claim.",
    );
  }

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error(
      "Expected platform-operator Keycloak token to include a subject.",
    );
  }

  return {
    actorId: payload.sub,
    token,
  };
};
