import { rm, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import {
  ConvexDeploymentManagedEnvironmentSchema,
  type ConvexDeploymentManagedEnvironment,
  convexDeploymentManagedEnvironmentVariableNames,
} from "./environment-variables";

const workspaceRootDirectory = Bun.resolveSync(
  "../../../package.json",
  import.meta.dir,
).replace(/[/\\]package\.json$/, "");

const decodeConvexDeploymentEnvironment = Schema.decodeUnknown(
  ConvexDeploymentManagedEnvironmentSchema,
);

type ConvexEnvironmentSyncProcessError = {
  readonly _tag: "ConvexEnvironmentSyncProcessError";
  readonly command: readonly string[];
  readonly exitCode: number;
};

const buildConvexEnvironmentSyncProcessError = (
  command: readonly string[],
  exitCode: number,
): ConvexEnvironmentSyncProcessError => ({
  _tag: "ConvexEnvironmentSyncProcessError",
  command,
  exitCode,
});

const buildConvexEnvironmentFileContents = (
  environment: ConvexDeploymentManagedEnvironment,
) =>
  convexDeploymentManagedEnvironmentVariableNames
    .map((name) => `${name}=${environment[name]}`)
    .join("\n")
    .concat("\n");

const runConvexEnvSetFromFile = (filePath: string) =>
  Effect.tryPromise({
    try: async () => {
      const command = [
        process.execPath,
        "x",
        "convex",
        "env",
        "set",
        "--from-file",
        filePath,
      ] as const;
      const childProcess = Bun.spawn(command, {
        cwd: workspaceRootDirectory,
        env: Bun.env,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      const exitCode = await childProcess.exited;

      if (exitCode !== 0) {
        throw buildConvexEnvironmentSyncProcessError(command, exitCode);
      }
    },
    catch: (cause) => {
      if (
        typeof cause === "object" &&
        cause !== null &&
        "_tag" in cause &&
        cause._tag === "ConvexEnvironmentSyncProcessError"
      ) {
        return cause;
      }

      return buildConvexEnvironmentSyncProcessError(
        [
          process.execPath,
          "x",
          "convex",
          "env",
          "set",
          "--from-file",
          filePath,
        ],
        -1,
      );
    },
  });

const syncConvexDeploymentEnvironment = Effect.gen(function* () {
  const environment = yield* decodeConvexDeploymentEnvironment(Bun.env);
  const temporaryDirectory = yield* Effect.tryPromise(() =>
    mkdtemp(join(tmpdir(), "comvestec-convex-env-")),
  );
  const environmentFilePath = join(temporaryDirectory, ".env.convex");

  try {
    yield* Effect.tryPromise(() =>
      writeFile(
        environmentFilePath,
        buildConvexEnvironmentFileContents(environment),
      ),
    );

    console.log(
      `Syncing ${convexDeploymentManagedEnvironmentVariableNames.length} required deployment-managed Convex worker environment variables...`,
    );

    yield* runConvexEnvSetFromFile(environmentFilePath);

    console.log("Convex deployment environment sync completed.");
  } finally {
    yield* Effect.tryPromise(() =>
      rm(temporaryDirectory, {
        recursive: true,
        force: true,
      }),
    );
  }
});

await Effect.runPromise(syncConvexDeploymentEnvironment);
