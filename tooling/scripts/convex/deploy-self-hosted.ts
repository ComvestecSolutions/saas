import { Effect } from "effect";

type BunWithWhich = typeof Bun & {
  readonly which?: (executable: string) => string | null | undefined;
};

type ConvexSelfHostedDeployProcessError = {
  readonly _tag: "ConvexSelfHostedDeployProcessError";
  readonly command: readonly string[];
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

const bunExecutableFromPath = (Bun as BunWithWhich).which?.("bun");

const workspaceRootDirectory = Bun.resolveSync(
  "../../../package.json",
  import.meta.dir,
).replace(/[/\\]package\.json$/, "");

const bunExecutablePath =
  process.execPath.length > 0
    ? process.execPath
    : (bunExecutableFromPath ?? "bun");

const deploySuccessMarker = "Deployed Convex functions to";
const deployAnalyzeTimeoutMarker =
  "Function execution timed out (maximum duration: 2s)";
const deployRetryAttempts = 3;
const deployRetryDelayMs = 5_000;

const buildConvexSelfHostedDeployProcessError = (
  command: readonly string[],
  exitCode: number,
  stdout: string,
  stderr: string,
): ConvexSelfHostedDeployProcessError => ({
  _tag: "ConvexSelfHostedDeployProcessError",
  command,
  exitCode,
  stdout,
  stderr,
});

const isConvexSelfHostedDeployProcessError = (
  error: unknown,
): error is ConvexSelfHostedDeployProcessError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "ConvexSelfHostedDeployProcessError";

const sleep = (delayMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });

const shouldRetryDeploy = (
  error: ConvexSelfHostedDeployProcessError,
): boolean => {
  const combinedOutput = `${error.stdout}\n${error.stderr}`;
  return combinedOutput.includes(deployAnalyzeTimeoutMarker);
};

const deployCurrentSelfHostedConvexFunctions = Effect.tryPromise({
  try: async () => {
    const command = [
      bunExecutablePath,
      "x",
      "convex@1.19.2",
      "deploy",
      "-y",
      "--typecheck",
      "disable",
    ] as const;

    console.log(
      "Deploying the current self-hosted Convex functions with the pinned compatible CLI...",
    );

    for (let attempt = 1; attempt <= deployRetryAttempts; attempt += 1) {
      const result = Bun.spawnSync(command, {
        cwd: workspaceRootDirectory,
        env: Bun.env,
        stdin: "inherit",
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = result.exitCode;
      const stdout = new TextDecoder().decode(result.stdout);
      const stderr = new TextDecoder().decode(result.stderr);

      if (stdout.length > 0) {
        process.stdout.write(stdout);
      }

      if (stderr.length > 0) {
        process.stderr.write(stderr);
      }

      const combinedOutput = `${stdout}\n${stderr}`;
      const deploymentCompleted =
        exitCode === 0 || combinedOutput.includes(deploySuccessMarker);

      if (deploymentCompleted) {
        if (exitCode !== 0) {
          console.warn(
            "Convex deploy completed before a Windows-specific post-success assertion; treating the deployment as successful because the success banner was emitted.",
          );
        }

        return;
      }

      const error = buildConvexSelfHostedDeployProcessError(
        command,
        exitCode,
        stdout,
        stderr,
      );

      if (!shouldRetryDeploy(error) || attempt === deployRetryAttempts) {
        throw error;
      }

      console.warn(
        `Convex deploy hit the self-hosted analyze timeout on attempt ${attempt}/${deployRetryAttempts}; retrying in ${deployRetryDelayMs / 1_000}s...`,
      );
      await sleep(deployRetryDelayMs);
    }
  },
  catch: (cause) => {
    if (isConvexSelfHostedDeployProcessError(cause)) {
      return cause;
    }

    return buildConvexSelfHostedDeployProcessError(
      [
        bunExecutablePath,
        "x",
        "convex@1.19.2",
        "deploy",
        "-y",
        "--typecheck",
        "disable",
      ],
      -1,
      "",
      String(cause),
    );
  },
});

try {
  await Effect.runPromise(deployCurrentSelfHostedConvexFunctions);
} catch (error) {
  if (isConvexSelfHostedDeployProcessError(error)) {
    console.error(
      `Convex self-hosted deploy failed: ${error.command.join(" ")} exited with code ${error.exitCode}.`,
    );
  } else {
    console.error(error);
  }

  process.exitCode = 1;
}
