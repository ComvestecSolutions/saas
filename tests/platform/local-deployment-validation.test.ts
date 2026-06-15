import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "child_process";
import { identityClaimKey } from "@comvestec/contracts";
import { keycloakActorTypeProtocolMapperName } from "../../tooling/scripts/subscriber-journey/common";

const workspaceRootDirectory = process.cwd();

const localDeploymentValidationScriptPath = resolve(
  workspaceRootDirectory,
  "tooling/scripts/ops/validate-local-deployment.ts",
);

const trackedDeploymentFiles = [
  ".env.example",
  "ops/docker/analytics/compose.yml",
  "ops/docker/compose.yml",
  "ops/docker/feature-flags/compose.yml",
  "ops/docker/identity/compose.yml",
  "ops/docker/identity/keycloak/realm-export.json",
  "ops/docker/messaging/compose.yml",
  "ops/docker/metering/compose.yml",
  "ops/docker/observability/compose.yml",
  "ops/docker/search/compose.yml",
  "ops/docker/security/compose.yml",
  "ops/docker/security/kong.yml",
] as const;

const bannedTrackedDeploymentFragments = [
  "POSTGRES_PASSWORD=comvestec",
  "POSTGRES_URL=postgresql://comvestec:comvestec@localhost:5432/comvestec",
  "POSTGRES_URL_INTERNAL=postgresql://comvestec:comvestec@postgres:5432/comvestec",
  "CONVEX_POSTGRES_URL=postgresql://comvestec:comvestec@postgres:5432",
  "KEYCLOAK_ADMIN=admin",
  "KEYCLOAK_ADMIN_PASSWORD=admin",
  "KEYCLOAK_CLIENT_SECRET=change-me",
  "KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD=Passw0rd!",
  "SUBSCRIBER_JOURNEY_SMOKE_USER_PASSWORD=Passw0rd!",
  "GRAFANA_ADMIN_PASSWORD=admin",
  "GLITCHTIP_SECRET_KEY=glitchtip-local-dev-secret-change-before-sharing",
  "GLITCHTIP_DATABASE_URL=postgres://comvestec:comvestec@postgres:5432/glitchtip",
  "KETO_DSN=postgres://comvestec:comvestec@postgres:5432/keto?sslmode=disable",
  "UNLEASH_API_KEY=default:development.unleash-insecure-api-token",
  "UNLEASH_API_TOKEN=default:development.unleash-insecure-api-token",
  "UNLEASH_DATABASE_URL=postgres://comvestec:comvestec@postgres:5432/unleash?sslmode=disable",
  "MEILISEARCH_MASTER_KEY=meili-master-key",
  "MEILISEARCH_API_KEY=meili-master-key",
  "NOVU_MONGO_INITDB_ROOT_PASSWORD=secret",
  "NOVU_MONGO_URL=mongodb://root:secret@mongodb:27017/novu-db?authSource=admin",
  "NOVU_JWT_SECRET=your-secret",
  "NOVU_STORE_ENCRYPTION_KEY=<ENCRYPTION_KEY_MUST_BE_32_LONG>",
  "OPENMETER_POSTGRES_URL=postgres://comvestec:comvestec@postgres:5432/openmeter?sslmode=disable",
  "OPENMETER_API_KEY=openmeter-api-key",
  "POSTAL_MARIADB_PASSWORD=postal",
  "POSTAL_RAILS_SECRET_KEY=change-me",
  "POSTAL_SIGNING_KEY_BASE64=change-me",
  "OPENPANEL_DATABASE_URL=postgresql://postgres:postgres@op-db:5432/postgres?schema=public",
  "OPENPANEL_DATABASE_URL_DIRECT=postgresql://postgres:postgres@op-db:5432/postgres?schema=public",
  "OPENPANEL_COOKIE_SECRET=openpanel-local-dev-secret-change-before-sharing",
  "${KEYCLOAK_ADMIN:-admin}",
  "${KEYCLOAK_ADMIN_PASSWORD:-admin}",
  "${KEYCLOAK_CLIENT_SECRET:-change-me}",
  "${GRAFANA_ADMIN_PASSWORD:-admin}",
  "${UNLEASH_API_TOKEN:-default:development.unleash-insecure-api-token}",
  "${MEILISEARCH_MASTER_KEY:-meili-master-key}",
  "postgresql://comvestec:comvestec@postgres:5432",
  "postgres://comvestec:comvestec@postgres:5432",
  "postgresql://postgres:postgres@op-db:5432",
  '"secret": "change-me"',
] as const;

const expectedComposeServices = [
  "convex-backend",
  "convex-dashboard",
  "glitchtip",
  "grafana",
  "keycloak",
  "kong",
  "loki",
  "meilisearch",
  "novu-mongo",
  "novu",
  "novu-dashboard",
  "novu-worker",
  "novu-ws",
  "openmeter",
  "openmeter-clickhouse",
  "openmeter-kafka",
  "openmeter-sink-worker",
  "op-api",
  "op-ch",
  "op-dashboard",
  "op-db",
  "op-kv",
  "op-proxy",
  "op-worker-a",
  "op-worker-b",
  "ory-keto",
  "postal",
  "postal-bootstrap",
  "postal-config-bootstrap",
  "postal-db-grants",
  "postal-mariadb",
  "postal-worker",
  "postgres",
  "postgres-bootstrap",
  "prometheus",
  "tempo",
  "unleash",
  "valkey",
  "vault",
  "otel-collector",
] as const;

type StartedContainerStatusStub = {
  readonly Service: string;
  readonly State: string;
  readonly Status: string;
  readonly Health?: string;
  readonly ExitCode?: number;
};

const oneShotComposeServices = new Set([
  "postal-db-grants",
  "postal-bootstrap",
  "postal-config-bootstrap",
  "postgres-bootstrap",
]);

const buildStartedContainerStatuses = (
  overrides: Readonly<Record<string, StartedContainerStatusStub>> = {},
) =>
  expectedComposeServices.map(
    (serviceName) =>
      overrides[serviceName] ??
      (oneShotComposeServices.has(serviceName)
        ? {
            Service: serviceName,
            State: "exited",
            Status: "Exited (0) 5 seconds ago",
            ExitCode: 0,
          }
        : {
            Service: serviceName,
            State: "running",
            Status: "Up 10 seconds",
            Health: "healthy",
            ExitCode: 0,
          }),
  );

const createDockerStub = (input: {
  readonly tempDirectoryPath: string;
  readonly logFilePath: string;
  readonly serviceNames: readonly string[];
  readonly startedContainerStatuses?: readonly StartedContainerStatusStub[];
}) => {
  const startedContainerStatusFilePath =
    input.startedContainerStatuses !== undefined
      ? join(input.tempDirectoryPath, "docker-compose-ps.json")
      : undefined;

  if (startedContainerStatusFilePath !== undefined) {
    writeFileSync(
      startedContainerStatusFilePath,
      JSON.stringify(input.startedContainerStatuses),
    );
  }

  if (process.platform === "win32") {
    const scriptPath = join(input.tempDirectoryPath, "docker.cmd");
    const serviceEchoLines = input.serviceNames
      .map((serviceName) => `  echo ${serviceName}`)
      .join("\r\n");

    writeFileSync(
      scriptPath,
      [
        "@echo off",
        "setlocal",
        'if not "%DOCKER_LOG_FILE%"=="" echo %*>>"%DOCKER_LOG_FILE%"',
        'echo %* | findstr /C:"config --quiet" >nul',
        "if %errorlevel% EQU 0 exit /b 0",
        'echo %* | findstr /C:"config --services" >nul',
        "if %errorlevel% EQU 0 (",
        serviceEchoLines,
        "  exit /b 0",
        ")",
        'echo %* | findstr /C:"ps --all --format json" >nul',
        "if %errorlevel% EQU 0 (",
        ...(startedContainerStatusFilePath !== undefined
          ? [`  type "${startedContainerStatusFilePath}"`, "  exit /b 0"]
          : [
              "  echo Docker ps fixture was not configured for this test. 1>&2",
              "  exit /b 1",
            ]),
        ")",
        "echo Unexpected docker args: %* 1>&2",
        "exit /b 1",
        "",
      ].join("\r\n"),
    );

    return scriptPath;
  }

  const scriptPath = join(input.tempDirectoryPath, "docker");
  const serviceOutput = input.serviceNames.join("\n");

  writeFileSync(
    scriptPath,
    `#!/usr/bin/env sh
if [ -n "$DOCKER_LOG_FILE" ]; then
  printf '%s\n' "$*" >> "$DOCKER_LOG_FILE"
fi
case "$*" in
  *"config --quiet"*)
    exit 0
    ;;
  *"config --services"*)
    cat <<'EOF'
${serviceOutput}
EOF
    exit 0
    ;;
  *"ps --all --format json"*)
    ${
      startedContainerStatusFilePath !== undefined
        ? `cat <<'EOF'
${JSON.stringify(input.startedContainerStatuses)}
EOF
    exit 0`
        : `printf 'Docker ps fixture was not configured for this test.\n' >&2
    exit 1`
    }
    ;;
esac
printf 'Unexpected docker args: %s\n' "$*" >&2
exit 1
`,
  );
  chmodSync(scriptPath, 0o755);

  return scriptPath;
};

const runLocalDeploymentValidation = (input: {
  readonly envFilePath: string;
  readonly pathPrefix: string;
  readonly logFilePath: string;
  readonly envOverrides?: Readonly<Record<string, string | undefined>>;
  readonly cliArgs?: readonly string[];
}) => {
  const prefixedPath = `${input.pathPrefix}${delimiter}${process.env.PATH ?? ""}`;

  return spawnSync(
    "bun",
    [
      "run",
      localDeploymentValidationScriptPath,
      ...(input.cliArgs ?? []),
      "--env-file",
      input.envFilePath,
    ],
    {
      cwd: workspaceRootDirectory,
      env: {
        ...process.env,
        ...input.envOverrides,
        PATH: prefixedPath,
        ...(process.platform === "win32" ? { Path: prefixedPath } : {}),
        DOCKER_LOG_FILE: input.logFilePath,
      },
    },
  );
};

describe("local deployment validation tooling", () => {
  it("keeps tracked deployment assets free of weak default secrets", () => {
    for (const relativeFilePath of trackedDeploymentFiles) {
      const fileContents = readFileSync(
        resolve(workspaceRootDirectory, relativeFilePath),
        "utf8",
      );

      for (const bannedFragment of bannedTrackedDeploymentFragments) {
        expect(fileContents).not.toContain(bannedFragment);
      }
    }
  });

  it("keeps the Keycloak realm export aligned with the platform actor-type claim contract", () => {
    const realmExport = JSON.parse(
      readFileSync(
        resolve(
          workspaceRootDirectory,
          "ops/docker/identity/keycloak/realm-export.json",
        ),
        "utf8",
      ),
    ) as {
      readonly clients?: readonly {
        readonly clientId?: string;
        readonly protocolMappers?: readonly {
          readonly name?: string;
          readonly protocol?: string;
          readonly protocolMapper?: string;
          readonly config?: Readonly<Record<string, string>>;
        }[];
      }[];
    };
    const saasPlatformClient = realmExport.clients?.find(
      (client) => client.clientId === "saas-platform",
    );

    expect(saasPlatformClient?.protocolMappers).toContainEqual(
      expect.objectContaining({
        name: keycloakActorTypeProtocolMapperName,
        protocol: "openid-connect",
        protocolMapper: "oidc-usermodel-attribute-mapper",
        config: expect.objectContaining({
          "claim.name": identityClaimKey.actorType,
          "user.attribute": identityClaimKey.actorType,
          "id.token.claim": "true",
          "access.token.claim": "true",
        }),
      }),
    );
  });

  it("keeps local Keycloak legacy token exchange enabled for platform impersonation flows", () => {
    const composeConfig = readFileSync(
      resolve(workspaceRootDirectory, "ops/docker/compose.yml"),
      "utf8",
    );
    const realmExport = JSON.parse(
      readFileSync(
        resolve(
          workspaceRootDirectory,
          "ops/docker/identity/keycloak/realm-export.json",
        ),
        "utf8",
      ),
    ) as {
      readonly users?: readonly {
        readonly username?: string;
        readonly serviceAccountClientId?: string;
        readonly clientRoles?: Readonly<Record<string, readonly string[]>>;
      }[];
    };
    const platformServiceAccount = realmExport.users?.find(
      (user) =>
        user.serviceAccountClientId === "saas-platform" &&
        user.username === "service-account-saas-platform",
    );

    expect(composeConfig).toContain("--features=token-exchange");
    expect(platformServiceAccount?.clientRoles?.["realm-management"]).toEqual(
      expect.arrayContaining(["realm-admin", "impersonation"]),
    );
  });

  it("keeps the Kong db-less config pointed at the backend-owned API surface", () => {
    const kongConfig = readFileSync(
      resolve(workspaceRootDirectory, "ops/docker/security/kong.yml"),
      "utf8",
    );

    expect(kongConfig).toContain("name: backend-api");
    expect(kongConfig).toContain("host: __KONG_BACKEND_API_UPSTREAM_HOST__");
    expect(kongConfig).toContain("port: __KONG_BACKEND_API_UPSTREAM_PORT__");
    expect(kongConfig).toContain("- /api");
  });

  it("validates the rendered compose inventory and concern-owned service groups", () => {
    const tempDirectoryPath = mkdtempSync(
      join(tmpdir(), "comvestec-local-deployment-validation-"),
    );
    const logFilePath = join(tempDirectoryPath, "docker.log");

    try {
      createDockerStub({
        tempDirectoryPath,
        logFilePath,
        serviceNames: expectedComposeServices,
      });

      const result = runLocalDeploymentValidation({
        envFilePath: ".env.example",
        pathPrefix: tempDirectoryPath,
        logFilePath,
        envOverrides: {
          LOKI_PORT: "",
          NOVU_PORT: "",
        },
      });
      const stdout = Buffer.from(result.stdout ?? "").toString("utf8");

      expect(result.status).toBe(0);
      expect(stdout).toContain(
        "Validated the local deployment Compose model with",
      );
      expect(stdout).toContain("Analytics service group: op-api");
      expect(stdout).toContain(
        "Messaging service group: novu, novu-dashboard, novu-mongo, novu-worker, novu-ws, postal, postal-bootstrap, postal-config-bootstrap, postal-db-grants, postal-mariadb, postal-worker",
      );
      expect(stdout).toContain(
        "Metering service group: openmeter, openmeter-clickhouse, openmeter-kafka, openmeter-sink-worker",
      );
      expect(stdout).toContain("Security service group: kong, vault");

      const dockerLog = readFileSync(logFilePath, "utf8");

      expect(dockerLog).toContain("config --quiet");
      expect(dockerLog).toContain("config --services");
    } finally {
      rmSync(tempDirectoryPath, { recursive: true, force: true });
    }
  }, 90_000);

  it("fails before invoking docker when the env file resolves duplicate published ports", () => {
    const tempDirectoryPath = mkdtempSync(
      join(tmpdir(), "comvestec-local-deployment-duplicate-port-"),
    );
    const logFilePath = join(tempDirectoryPath, "docker.log");
    const envFilePath = join(tempDirectoryPath, "duplicate-ports.env");

    try {
      createDockerStub({
        tempDirectoryPath,
        logFilePath,
        serviceNames: expectedComposeServices,
      });
      writeFileSync(envFilePath, "LOKI_PORT=3100\nNOVU_PORT=3100\n");

      const result = runLocalDeploymentValidation({
        envFilePath,
        pathPrefix: tempDirectoryPath,
        logFilePath,
        envOverrides: {
          LOKI_PORT: "",
          NOVU_PORT: "",
        },
      });
      const stderr = Buffer.from(result.stderr ?? "").toString("utf8");

      expect(result.status).toBe(1);
      expect(stderr).toContain("Duplicate published ports detected");

      if (existsSync(logFilePath)) {
        expect(readFileSync(logFilePath, "utf8").trim()).toBe("");
      }
    } finally {
      rmSync(tempDirectoryPath, { recursive: true, force: true });
    }
  }, 90_000);

  it("ignores shell overrides when the resolved runtime env already defines the published ports", () => {
    const tempDirectoryPath = mkdtempSync(
      join(tmpdir(), "comvestec-local-deployment-shell-override-"),
    );
    const logFilePath = join(tempDirectoryPath, "docker.log");

    try {
      createDockerStub({
        tempDirectoryPath,
        logFilePath,
        serviceNames: expectedComposeServices,
      });

      const result = runLocalDeploymentValidation({
        envFilePath: ".env.example",
        pathPrefix: tempDirectoryPath,
        logFilePath,
        envOverrides: {
          LOKI_PORT: "3101",
          NOVU_PORT: "3101",
        },
      });
      const stdout = Buffer.from(result.stdout ?? "").toString("utf8");

      expect(result.status).toBe(0);
      expect(stdout).toContain("3100, 3101");

      const dockerLog = readFileSync(logFilePath, "utf8");

      expect(dockerLog).toContain("config --quiet");
      expect(dockerLog).toContain("config --services");
    } finally {
      rmSync(tempDirectoryPath, { recursive: true, force: true });
    }
  }, 90_000);

  it("falls back to compose defaults when an env file sets an empty port value", () => {
    const tempDirectoryPath = mkdtempSync(
      join(tmpdir(), "comvestec-local-deployment-empty-port-"),
    );
    const logFilePath = join(tempDirectoryPath, "docker.log");
    const envFilePath = join(tempDirectoryPath, "empty-port.env");

    try {
      createDockerStub({
        tempDirectoryPath,
        logFilePath,
        serviceNames: expectedComposeServices,
      });
      writeFileSync(envFilePath, "NOVU_PORT=\n");

      const result = runLocalDeploymentValidation({
        envFilePath,
        pathPrefix: tempDirectoryPath,
        logFilePath,
        envOverrides: {
          NOVU_PORT: "",
        },
      });
      const stdout = Buffer.from(result.stdout ?? "").toString("utf8");

      expect(result.status).toBe(0);
      expect(stdout).toContain(
        "Validated the local deployment Compose model with",
      );

      const dockerLog = readFileSync(logFilePath, "utf8");

      expect(dockerLog).toContain("config --quiet");
      expect(dockerLog).toContain("config --services");
    } finally {
      rmSync(tempDirectoryPath, { recursive: true, force: true });
    }
  }, 90_000);

  it("prefers a non-default env-file port when the shell override is present but empty", () => {
    const tempDirectoryPath = mkdtempSync(
      join(tmpdir(), "comvestec-local-deployment-empty-shell-override-"),
    );
    const logFilePath = join(tempDirectoryPath, "docker.log");
    const envFilePath = join(tempDirectoryPath, "env-file-port-wins.env");

    try {
      createDockerStub({
        tempDirectoryPath,
        logFilePath,
        serviceNames: expectedComposeServices,
      });
      writeFileSync(envFilePath, "NOVU_PORT=3199\n");

      const result = runLocalDeploymentValidation({
        envFilePath,
        pathPrefix: tempDirectoryPath,
        logFilePath,
        envOverrides: {
          NOVU_PORT: "",
        },
      });
      const stdout = Buffer.from(result.stdout ?? "").toString("utf8");

      expect(result.status).toBe(0);
      expect(stdout).toContain("3199");

      const dockerLog = readFileSync(logFilePath, "utf8");

      expect(dockerLog).toContain("config --quiet");
      expect(dockerLog).toContain("config --services");
    } finally {
      rmSync(tempDirectoryPath, { recursive: true, force: true });
    }
  }, 90_000);

  it("validates started-container status for the full local stack when requested", () => {
    const tempDirectoryPath = mkdtempSync(
      join(tmpdir(), "comvestec-local-deployment-started-containers-"),
    );
    const logFilePath = join(tempDirectoryPath, "docker.log");

    try {
      createDockerStub({
        tempDirectoryPath,
        logFilePath,
        serviceNames: expectedComposeServices,
        startedContainerStatuses: buildStartedContainerStatuses(),
      });

      const result = runLocalDeploymentValidation({
        envFilePath: ".env.example",
        pathPrefix: tempDirectoryPath,
        logFilePath,
        cliArgs: ["--started-containers"],
        envOverrides: {
          LOKI_PORT: "",
          NOVU_PORT: "",
        },
      });
      const stdout = Buffer.from(result.stdout ?? "").toString("utf8");

      expect(result.status).toBe(0);
      expect(stdout).toContain("Started-container status");
      expect(stdout).toContain("postal-bootstrap/exited/exit=0");
      expect(stdout).toContain("postal-config-bootstrap/exited/exit=0");
      expect(stdout).toContain("postal-db-grants/exited/exit=0");
      expect(stdout).toContain("postgres-bootstrap/exited/exit=0");

      const dockerLog = readFileSync(logFilePath, "utf8");

      expect(dockerLog).toContain("config --quiet");
      expect(dockerLog).toContain("config --services");
      expect(dockerLog).toContain("ps --all --format json");
    } finally {
      rmSync(tempDirectoryPath, { recursive: true, force: true });
    }
  }, 90_000);

  it("fails started-container validation when a long-running service reports unhealthy status", () => {
    const tempDirectoryPath = mkdtempSync(
      join(tmpdir(), "comvestec-local-deployment-unhealthy-service-"),
    );
    const logFilePath = join(tempDirectoryPath, "docker.log");

    try {
      createDockerStub({
        tempDirectoryPath,
        logFilePath,
        serviceNames: expectedComposeServices,
        startedContainerStatuses: buildStartedContainerStatuses({
          "op-api": {
            Service: "op-api",
            State: "running",
            Status: "Up 10 seconds (unhealthy)",
            Health: "unhealthy",
            ExitCode: 0,
          },
        }),
      });

      const result = runLocalDeploymentValidation({
        envFilePath: ".env.example",
        pathPrefix: tempDirectoryPath,
        logFilePath,
        cliArgs: ["--started-containers"],
        envOverrides: {
          LOKI_PORT: "",
          NOVU_PORT: "",
        },
      });
      const stderr = Buffer.from(result.stderr ?? "").toString("utf8");

      expect(result.status).toBe(1);
      expect(stderr).toContain("Configuration error for started containers");
      expect(stderr).toContain("op-api is not healthy");

      const dockerLog = readFileSync(logFilePath, "utf8");

      expect(dockerLog).toContain("ps --all --format json");
    } finally {
      rmSync(tempDirectoryPath, { recursive: true, force: true });
    }
  }, 90_000);

  it("fails started-container validation when the postgres bootstrap one-shot service does not exit successfully", () => {
    const tempDirectoryPath = mkdtempSync(
      join(tmpdir(), "comvestec-local-deployment-bootstrap-failure-"),
    );
    const logFilePath = join(tempDirectoryPath, "docker.log");

    try {
      createDockerStub({
        tempDirectoryPath,
        logFilePath,
        serviceNames: expectedComposeServices,
        startedContainerStatuses: buildStartedContainerStatuses({
          "postgres-bootstrap": {
            Service: "postgres-bootstrap",
            State: "exited",
            Status: "Exited (1) 5 seconds ago",
            ExitCode: 1,
          },
        }),
      });

      const result = runLocalDeploymentValidation({
        envFilePath: ".env.example",
        pathPrefix: tempDirectoryPath,
        logFilePath,
        cliArgs: ["--started-containers"],
        envOverrides: {
          LOKI_PORT: "",
          NOVU_PORT: "",
        },
      });
      const stderr = Buffer.from(result.stderr ?? "").toString("utf8");

      expect(result.status).toBe(1);
      expect(stderr).toContain("Configuration error for started containers");
      expect(stderr).toContain("postgres-bootstrap must finish");

      const dockerLog = readFileSync(logFilePath, "utf8");

      expect(dockerLog).toContain("ps --all --format json");
    } finally {
      rmSync(tempDirectoryPath, { recursive: true, force: true });
    }
  }, 90_000);
});
