import { access, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { Cause, Effect } from "effect";
import {
  buildEnvFileContents,
  localRuntimeVaultPath,
  resolveLocalRuntimeEnvironment,
} from "./local-runtime-environment";

type LocalDeploymentConfigurationError = {
  readonly _tag: "LocalDeploymentConfigurationError";
  readonly key: string;
  readonly message: string;
};

type LocalDeploymentCommandError = {
  readonly _tag: "LocalDeploymentCommandError";
  readonly command: string;
  readonly exitCode: number;
  readonly stderr: string;
};

type StartedContainerStatus = {
  readonly service: string;
  readonly state: string;
  readonly status: string;
  readonly health?: string;
  readonly exitCode?: number;
};

type LocalDeploymentValidationResult = {
  readonly envFilePath: string;
  readonly composeFilePaths: readonly string[];
  readonly actualServices: readonly string[];
  readonly analyticsServices: readonly string[];
  readonly messagingServices: readonly string[];
  readonly meteringServices: readonly string[];
  readonly securityServices: readonly string[];
  readonly publishedPorts: readonly PublishedPortBinding[];
  readonly startedContainerStatuses: readonly StartedContainerStatus[];
};

type PublishedPortBinding = {
  readonly sourceFilePath: string;
  readonly lineNumber: number;
  readonly containerPort: number;
  readonly publishedPort: number;
  readonly envKey?: string;
};

type ParsedCliOptions = {
  readonly envFile?: string;
  readonly startedContainers: boolean;
};

const workspaceRootDirectory = Bun.resolveSync(
  "../../../package.json",
  import.meta.dir,
).replace(/[/\\]package\.json$/, "");

const rootComposeFilePath = resolve(
  workspaceRootDirectory,
  "ops/docker/compose.yml",
);

const concernOwnedComposeFiles = {
  analytics: resolve(
    workspaceRootDirectory,
    "ops/docker/analytics/compose.yml",
  ),
  messaging: resolve(
    workspaceRootDirectory,
    "ops/docker/messaging/compose.yml",
  ),
  metering: resolve(workspaceRootDirectory, "ops/docker/metering/compose.yml"),
  security: resolve(workspaceRootDirectory, "ops/docker/security/compose.yml"),
} as const;

const dockerExecutablePath = "docker";
const oneShotComposeServices = new Set([
  "postal-db-grants",
  "postal-bootstrap",
  "postal-config-bootstrap",
  "postgres-bootstrap",
]);

const isTaggedError = (error: unknown): error is { readonly _tag: string } =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  typeof (error as Record<string, unknown>)._tag === "string";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toWorkspaceRelativePath = (filePath: string) =>
  relative(workspaceRootDirectory, filePath).replace(/\\/g, "/");

const sortStrings = (values: Iterable<string>) =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const fileExists = async (filePath: string) => {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const buildConfigurationError = (
  key: string,
  message: string,
): LocalDeploymentConfigurationError => ({
  _tag: "LocalDeploymentConfigurationError",
  key,
  message,
});

const buildCommandError = (
  command: string,
  exitCode: number,
  stderr: string,
): LocalDeploymentCommandError => ({
  _tag: "LocalDeploymentCommandError",
  command,
  exitCode,
  stderr,
});

const readTextFile = (filePath: string) =>
  Effect.tryPromise({
    try: async () => await Bun.file(filePath).text(),
    catch: () =>
      buildConfigurationError(
        toWorkspaceRelativePath(filePath),
        "Required deployment file is missing or unreadable.",
      ),
  });

const parseCliOptions = (argv: readonly string[]) =>
  Effect.try({
    try: () => {
      let envFile: string | undefined;
      let startedContainers = false;

      for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];

        if (argument === "--started-containers") {
          startedContainers = true;
          continue;
        }

        if (argument === "--env-file") {
          const nextValue = argv[index + 1];

          if (nextValue === undefined || nextValue.startsWith("--")) {
            throw buildConfigurationError(
              "--env-file",
              "Expected a file path after --env-file.",
            );
          }

          envFile = nextValue;
          index += 1;
          continue;
        }

        throw buildConfigurationError("argv", `Unknown argument: ${argument}`);
      }

      return {
        startedContainers,
        ...(envFile !== undefined ? { envFile } : {}),
      } satisfies ParsedCliOptions;
    },
    catch: (cause) =>
      isTaggedError(cause) && cause._tag === "LocalDeploymentConfigurationError"
        ? cause
        : buildConfigurationError("argv", "Failed to parse CLI arguments."),
  });

const resolveComposeVariableValue = (input: {
  readonly envKey: string;
  readonly defaultValue: string;
  readonly envFileValues: Readonly<Record<string, string>>;
}) => {
  const envFileValue = input.envFileValues[input.envKey]?.trim();

  if (envFileValue !== undefined && envFileValue.length > 0) {
    return envFileValue;
  }

  return input.defaultValue;
};

const collectComposeFilePaths = () =>
  Effect.tryPromise({
    try: async () => {
      const composeFilePaths: string[] = [];

      const collectComposeFilesRecursively = async (directoryPath: string) => {
        const entries = await readdir(directoryPath, { withFileTypes: true });

        for (const entry of entries) {
          const entryPath = resolve(directoryPath, entry.name);

          if (entry.isDirectory()) {
            await collectComposeFilesRecursively(entryPath);
            continue;
          }

          if (entry.isFile() && entry.name === "compose.yml") {
            composeFilePaths.push(entryPath);
          }
        }
      };

      await collectComposeFilesRecursively(
        resolve(workspaceRootDirectory, "ops/docker"),
      );

      return sortStrings(composeFilePaths);
    },
    catch: () =>
      buildConfigurationError(
        "ops/docker",
        "Failed to collect Compose files for the local deployment surface.",
      ),
  });

const parseComposeServiceNames = (fileContents: string) => {
  const serviceNames: string[] = [];
  let inServicesBlock = false;

  for (const line of fileContents.split(/\r?\n/u)) {
    if (!inServicesBlock) {
      if (line.trim() === "services:") {
        inServicesBlock = true;
      }

      continue;
    }

    if (/^[A-Za-z0-9_-]+:\s*$/u.test(line)) {
      break;
    }

    const serviceMatch = line.match(/^  ([a-z0-9-]+):\s*$/u);

    if (serviceMatch !== null) {
      serviceNames.push(serviceMatch[1]!);
    }
  }

  return sortStrings(serviceNames);
};

const parsePublishedPorts = (
  filePath: string,
  fileContents: string,
  envValues: Readonly<Record<string, string>>,
) => {
  const publishedPorts: PublishedPortBinding[] = [];
  const lines = fileContents.split(/\r?\n/u);
  const hostBindingPattern =
    "(?:(?:localhost|[0-9]{1,3}(?:\\.[0-9]{1,3}){3}):)?";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const envPortMatch = line.match(
      new RegExp(
        `^\\s*-\\s+${hostBindingPattern}\\$\\{([A-Z0-9_]+):-([0-9]+)\\}:([0-9]+)(?:\\/(tcp|udp))?\\s*$`,
        "u",
      ),
    );

    if (envPortMatch !== null) {
      const envKey = envPortMatch[1]!;
      const resolvedPublishedPort = resolveComposeVariableValue({
        envKey,
        defaultValue: envPortMatch[2]!,
        envFileValues: envValues,
      });
      const publishedPort = Number.parseInt(resolvedPublishedPort, 10);
      const containerPort = Number.parseInt(envPortMatch[3]!, 10);

      if (!Number.isInteger(publishedPort) || publishedPort <= 0) {
        throw buildConfigurationError(
          envKey,
          `${envKey} must resolve to a positive integer port.`,
        );
      }

      publishedPorts.push({
        sourceFilePath: filePath,
        lineNumber: index + 1,
        containerPort,
        publishedPort,
        ...(envKey.length > 0 ? { envKey } : {}),
      });
      continue;
    }

    const literalPortMatch = line.match(
      new RegExp(
        `^\\s*-\\s+${hostBindingPattern}([0-9]+):([0-9]+)(?:\\/(tcp|udp))?\\s*$`,
        "u",
      ),
    );

    if (literalPortMatch !== null) {
      publishedPorts.push({
        sourceFilePath: filePath,
        lineNumber: index + 1,
        publishedPort: Number.parseInt(literalPortMatch[1]!, 10),
        containerPort: Number.parseInt(literalPortMatch[2]!, 10),
      });
    }
  }

  return publishedPorts;
};

const ensureUniquePublishedPorts = (
  publishedPorts: readonly PublishedPortBinding[],
) =>
  Effect.try({
    try: () => {
      const bindingsByPort = new Map<number, PublishedPortBinding[]>();

      for (const binding of publishedPorts) {
        const currentBindings = bindingsByPort.get(binding.publishedPort) ?? [];
        currentBindings.push(binding);
        bindingsByPort.set(binding.publishedPort, currentBindings);
      }

      const duplicates = [...bindingsByPort.entries()].filter(
        ([, bindings]) => bindings.length > 1,
      );

      if (duplicates.length === 0) {
        return;
      }

      const details = duplicates
        .map(([publishedPort, bindings]) => {
          const references = bindings
            .map((binding) => {
              const envReference =
                binding.envKey !== undefined ? ` via ${binding.envKey}` : "";

              return `${toWorkspaceRelativePath(binding.sourceFilePath)}:${binding.lineNumber}${envReference}`;
            })
            .join(", ");

          return `${publishedPort} (${references})`;
        })
        .join("; ");

      throw buildConfigurationError(
        "published ports",
        `Duplicate published ports detected in the local deployment surface: ${details}`,
      );
    },
    catch: (cause) =>
      isTaggedError(cause) && cause._tag === "LocalDeploymentConfigurationError"
        ? cause
        : buildConfigurationError(
            "published ports",
            "Failed to validate local deployment port bindings.",
          ),
  });

const runDockerComposeCommand = (input: {
  readonly envFilePath: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly args: readonly string[];
}) =>
  Effect.try({
    try: () => {
      const command = [
        dockerExecutablePath,
        "compose",
        "--env-file",
        input.envFilePath,
        "-f",
        rootComposeFilePath,
        ...input.args,
      ];

      const processHandle = Bun.spawnSync(command, {
        cwd: workspaceRootDirectory,
        env: input.environment,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = Buffer.from(processHandle.stdout).toString("utf8");
      const stderr = Buffer.from(processHandle.stderr).toString("utf8");
      const exitCode = processHandle.exitCode;

      if (exitCode !== 0) {
        throw buildCommandError(command.join(" "), exitCode, stderr);
      }

      return stdout;
    },
    catch: (cause) => {
      if (
        isTaggedError(cause) &&
        cause._tag === "LocalDeploymentCommandError"
      ) {
        return cause;
      }

      return buildCommandError(
        `${dockerExecutablePath} compose --env-file ${input.envFilePath} -f ${rootComposeFilePath} ${input.args.join(" ")}`,
        -1,
        String(cause),
      );
    },
  });

const parseStartedContainerStatuses = (composePsOutput: string) =>
  Effect.try({
    try: () => {
      const trimmedOutput = composePsOutput.trim();

      if (trimmedOutput.length === 0) {
        throw buildConfigurationError(
          "started containers",
          "Docker Compose returned no container status output for --started-containers validation.",
        );
      }

      const parseStatusEntry = (value: unknown, index: number) => {
        if (!isRecord(value)) {
          throw buildConfigurationError(
            "started containers",
            `Docker Compose returned a non-object status entry at index ${index}.`,
          );
        }

        const service = value.Service;
        const state = value.State;
        const status = value.Status;
        const health = value.Health;
        const exitCode = value.ExitCode;

        if (
          typeof service !== "string" ||
          service.trim().length === 0 ||
          typeof state !== "string" ||
          state.trim().length === 0 ||
          typeof status !== "string" ||
          status.trim().length === 0
        ) {
          throw buildConfigurationError(
            "started containers",
            `Docker Compose returned an invalid status entry for service index ${index}.`,
          );
        }

        const normalizedHealth =
          typeof health === "string" && health.trim().length > 0
            ? health.trim()
            : undefined;
        const normalizedExitCode =
          typeof exitCode === "number" && Number.isInteger(exitCode)
            ? exitCode
            : typeof exitCode === "string" &&
                /^-?[0-9]+$/u.test(exitCode.trim())
              ? Number.parseInt(exitCode, 10)
              : undefined;

        return {
          service: service.trim(),
          state: state.trim(),
          status: status.trim(),
          ...(normalizedHealth !== undefined
            ? { health: normalizedHealth }
            : {}),
          ...(normalizedExitCode !== undefined
            ? { exitCode: normalizedExitCode }
            : {}),
        } satisfies StartedContainerStatus;
      };

      const parseEntriesFromValue = (value: unknown) => {
        if (Array.isArray(value)) {
          return value.map(parseStatusEntry);
        }

        return [parseStatusEntry(value, 0)];
      };

      try {
        return parseEntriesFromValue(JSON.parse(trimmedOutput)).sort(
          (left, right) => left.service.localeCompare(right.service),
        );
      } catch {
        return trimmedOutput
          .split(/\r?\n/u)
          .filter((line) => line.trim().length > 0)
          .map((line, index) => parseStatusEntry(JSON.parse(line), index))
          .sort((left, right) => left.service.localeCompare(right.service));
      }
    },
    catch: (cause) =>
      isTaggedError(cause) && cause._tag === "LocalDeploymentConfigurationError"
        ? cause
        : buildConfigurationError(
            "started containers",
            "Failed to parse Docker Compose started-container status output.",
          ),
  });

const ensureExpectedServices = (input: {
  readonly actualServices: readonly string[];
  readonly expectedServices: readonly string[];
}) =>
  Effect.try({
    try: () => {
      const actualServiceSet = new Set(input.actualServices);
      const expectedServiceSet = new Set(input.expectedServices);
      const missingServices = input.expectedServices.filter(
        (service) => !actualServiceSet.has(service),
      );
      const unexpectedServices = input.actualServices.filter(
        (service) => !expectedServiceSet.has(service),
      );

      if (missingServices.length === 0 && unexpectedServices.length === 0) {
        return;
      }

      const messageParts: string[] = [];

      if (missingServices.length > 0) {
        messageParts.push(`missing services: ${missingServices.join(", ")}`);
      }

      if (unexpectedServices.length > 0) {
        messageParts.push(
          `unexpected services: ${unexpectedServices.join(", ")}`,
        );
      }

      throw buildConfigurationError(
        "compose service inventory",
        `Rendered Docker service inventory drifted from the checked-in Compose files (${messageParts.join("; ")}).`,
      );
    },
    catch: (cause) =>
      isTaggedError(cause) && cause._tag === "LocalDeploymentConfigurationError"
        ? cause
        : buildConfigurationError(
            "compose service inventory",
            "Failed to validate the rendered Docker service inventory.",
          ),
  });

const validateStartedContainerStatuses = (input: {
  readonly expectedServices: readonly string[];
  readonly startedContainerStatuses: readonly StartedContainerStatus[];
}) =>
  Effect.gen(function* () {
    const actualServices = sortStrings(
      input.startedContainerStatuses.map((status) => status.service),
    );

    yield* ensureExpectedServices({
      actualServices,
      expectedServices: input.expectedServices,
    });

    yield* Effect.try({
      try: () => {
        const failures = input.startedContainerStatuses.flatMap((status) => {
          const normalizedState = status.state.toLowerCase();
          const normalizedHealth = status.health?.toLowerCase();
          const exitedSuccessfully =
            status.exitCode === 0 || /\bexited\s*\(0\)/iu.test(status.status);

          if (oneShotComposeServices.has(status.service)) {
            return normalizedState === "exited" && exitedSuccessfully
              ? []
              : [
                  `${status.service} must finish as a successful one-shot container (state=${status.state}, exitCode=${status.exitCode ?? "unknown"}, status=${status.status})`,
                ];
          }

          const serviceFailures: string[] = [];

          if (normalizedState !== "running") {
            serviceFailures.push(
              `${status.service} is not running (state=${status.state}, status=${status.status})`,
            );
          }

          if (status.exitCode !== undefined && status.exitCode !== 0) {
            serviceFailures.push(
              `${status.service} reported a non-zero exit code (${status.exitCode}) while validating started containers`,
            );
          }

          if (
            normalizedHealth !== undefined &&
            normalizedHealth !== "healthy"
          ) {
            serviceFailures.push(
              `${status.service} is not healthy (health=${status.health})`,
            );
          }

          return serviceFailures;
        });

        if (failures.length === 0) {
          return;
        }

        throw buildConfigurationError(
          "started containers",
          `Started-container validation failed: ${failures.join("; ")}`,
        );
      },
      catch: (cause) =>
        isTaggedError(cause) &&
        cause._tag === "LocalDeploymentConfigurationError"
          ? cause
          : buildConfigurationError(
              "started containers",
              "Failed to validate Docker Compose started-container status output.",
            ),
    });
  });

const validateLocalDeployment = (argv: readonly string[]) =>
  Effect.gen(function* () {
    const options = yield* parseCliOptions(argv);
    const runtimeEnvironmentResolution = yield* Effect.tryPromise({
      try: async () =>
        await resolveLocalRuntimeEnvironment({
          ...(options.envFile !== undefined
            ? { envFile: options.envFile }
            : {}),
          allowMissingVault: options.envFile !== undefined,
          requireManagedKeys: options.envFile === undefined,
        }),
      catch: (cause) =>
        buildConfigurationError(
          options.envFile ?? localRuntimeVaultPath,
          cause instanceof Error
            ? cause.message
            : "Failed to resolve the local runtime environment.",
        ),
    });
    const envValues = runtimeEnvironmentResolution.values;
    const composeFilePaths = yield* collectComposeFilePaths();
    const composeFileEntries = yield* Effect.forEach(
      composeFilePaths,
      (filePath) =>
        Effect.map(readTextFile(filePath), (fileContents) => ({
          filePath,
          fileContents,
        })),
    );

    const composeFileContents = new Map(
      composeFileEntries.map((entry) => [entry.filePath, entry.fileContents]),
    );

    const publishedPorts = composeFileEntries.flatMap((entry) =>
      parsePublishedPorts(entry.filePath, entry.fileContents, envValues),
    );

    yield* ensureUniquePublishedPorts(publishedPorts);
    const temporaryDirectoryPath = yield* Effect.tryPromise({
      try: async () =>
        await mkdtemp(join(tmpdir(), "comvestec-local-deployment-env-")),
      catch: () =>
        buildConfigurationError(
          "temporary env",
          "Failed to create a temporary runtime env file for validation.",
        ),
    });
    const envFilePath = join(temporaryDirectoryPath, ".env.runtime");
    const dockerEnvironment = {
      ...Bun.env,
      ...runtimeEnvironmentResolution.values,
    } satisfies NodeJS.ProcessEnv;

    yield* Effect.tryPromise({
      try: async () =>
        await writeFile(envFilePath, buildEnvFileContents(envValues)),
      catch: () =>
        buildConfigurationError(
          "temporary env",
          "Failed to write the temporary runtime env file for validation.",
        ),
    });

    let actualServices: readonly string[] = [];
    let startedContainerStatuses: readonly StartedContainerStatus[] = [];

    try {
      yield* runDockerComposeCommand({
        envFilePath,
        environment: dockerEnvironment,
        args: ["config", "--quiet"],
      });

      actualServices = sortStrings(
        (yield* runDockerComposeCommand({
          envFilePath,
          environment: dockerEnvironment,
          args: ["config", "--services"],
        }))
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .filter((line) => line.length > 0),
      );

      if (options.startedContainers) {
        startedContainerStatuses = yield* parseStartedContainerStatuses(
          yield* runDockerComposeCommand({
            envFilePath,
            environment: dockerEnvironment,
            args: ["ps", "--all", "--format", "json"],
          }),
        );
      }
    } finally {
      yield* Effect.tryPromise({
        try: async () =>
          await rm(temporaryDirectoryPath, {
            force: true,
            recursive: true,
          }),
        catch: () =>
          buildConfigurationError(
            "temporary env",
            "Failed to clean up the temporary runtime env file after validation.",
          ),
      });
    }

    const expectedServices = sortStrings(
      composeFileEntries.flatMap((entry) =>
        parseComposeServiceNames(entry.fileContents),
      ),
    );

    yield* ensureExpectedServices({
      actualServices,
      expectedServices,
    });

    if (options.startedContainers) {
      yield* validateStartedContainerStatuses({
        expectedServices,
        startedContainerStatuses,
      });
    }

    const analyticsServices = parseComposeServiceNames(
      composeFileContents.get(concernOwnedComposeFiles.analytics) ?? "",
    );
    const messagingServices = parseComposeServiceNames(
      composeFileContents.get(concernOwnedComposeFiles.messaging) ?? "",
    );
    const meteringServices = parseComposeServiceNames(
      composeFileContents.get(concernOwnedComposeFiles.metering) ?? "",
    );
    const securityServices = parseComposeServiceNames(
      composeFileContents.get(concernOwnedComposeFiles.security) ?? "",
    );

    return {
      envFilePath: [
        runtimeEnvironmentResolution.envFileSources.join(" + "),
        ...(runtimeEnvironmentResolution.vaultWasFound
          ? [`Vault:${localRuntimeVaultPath}`]
          : []),
      ].join(" + "),
      composeFilePaths,
      actualServices,
      analyticsServices,
      messagingServices,
      meteringServices,
      securityServices,
      publishedPorts,
      startedContainerStatuses,
    } satisfies LocalDeploymentValidationResult;
  });

const printValidationSummary = (result: LocalDeploymentValidationResult) => {
  console.log(
    `Validated the local deployment Compose model with ${toWorkspaceRelativePath(result.envFilePath)}.`,
  );
  console.log(
    `Compose files: ${result.composeFilePaths.map(toWorkspaceRelativePath).join(", ")}`,
  );
  console.log(
    `Rendered services (${result.actualServices.length}): ${result.actualServices.join(", ")}`,
  );
  console.log(
    `Analytics service group: ${result.analyticsServices.join(", ")}`,
  );
  console.log(
    `Messaging service group: ${result.messagingServices.join(", ")}`,
  );
  console.log(`Metering service group: ${result.meteringServices.join(", ")}`);
  console.log(`Security service group: ${result.securityServices.join(", ")}`);
  console.log(
    `Published host ports (${result.publishedPorts.length}): ${sortStrings(
      result.publishedPorts.map((binding) => String(binding.publishedPort)),
    ).join(", ")}`,
  );

  if (result.startedContainerStatuses.length > 0) {
    console.log(
      `Started-container status (${result.startedContainerStatuses.length}): ${result.startedContainerStatuses
        .map((status) =>
          [
            status.service,
            status.state,
            ...(status.health !== undefined ? [status.health] : []),
            ...(status.exitCode !== undefined
              ? [`exit=${status.exitCode}`]
              : []),
          ].join("/"),
        )
        .join(", ")}`,
    );
  }
};

const printValidationError = (error: unknown) => {
  const isLocalDeploymentConfigurationError = (
    value: unknown,
  ): value is LocalDeploymentConfigurationError =>
    isTaggedError(value) && value._tag === "LocalDeploymentConfigurationError";

  const isLocalDeploymentCommandError = (
    value: unknown,
  ): value is LocalDeploymentCommandError =>
    isTaggedError(value) && value._tag === "LocalDeploymentCommandError";

  if (isLocalDeploymentConfigurationError(error)) {
    console.error(`Configuration error for ${error.key}: ${error.message}`);
    return;
  }

  if (isLocalDeploymentCommandError(error)) {
    console.error(`Command failed: ${error.command}`);
    console.error(`Exit code: ${error.exitCode}`);

    if (error.stderr.trim().length > 0) {
      console.error(error.stderr.trim());
    }

    return;
  }

  console.error(error);
};

const printUsage = () => {
  console.log(
    "Usage: bun run tooling/scripts/ops/validate-local-deployment.ts [--env-file path/to/.env.local] [--started-containers]",
  );
};

if (import.meta.main) {
  const argv = Bun.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
  } else {
    const exit = await Effect.runPromiseExit(validateLocalDeployment(argv));

    if (exit._tag === "Success") {
      printValidationSummary(exit.value);
    } else {
      printValidationError(Cause.squash(exit.cause));
      process.exitCode = 1;
    }
  }
}
