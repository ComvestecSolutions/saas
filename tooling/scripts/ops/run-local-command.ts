import { resolve } from "node:path";
import {
  withTemporaryLocalRuntimeEnvironmentFile,
  workspaceRootDirectory,
} from "./local-runtime-environment";

const removeLeadingDoubleDash = (argv: readonly string[]) =>
  argv[0] === "--" ? argv.slice(1) : argv;

const extractInDirectoryPrefix = (
  args: readonly string[],
): {
  readonly inDirectory: string | undefined;
  readonly rest: readonly string[];
} => {
  if (args[0] === "--in" && args[1] !== undefined) {
    return { inDirectory: args[1], rest: args.slice(2) };
  }
  return { inDirectory: undefined, rest: args };
};

const normalizeCommand = (
  commandName: string,
  commandArgs: readonly string[],
) => {
  const lowercaseCommandName = commandName.toLowerCase();

  if (lowercaseCommandName === "bun" || lowercaseCommandName === "bun.exe") {
    return [commandName, "--no-env-file", ...commandArgs];
  }

  if (lowercaseCommandName === "bunx" || lowercaseCommandName === "bunx.exe") {
    return [commandName, ...commandArgs];
  }

  return [commandName, ...commandArgs];
};

const printUsage = () => {
  console.log(
    "Usage: bun run ops:local:command -- [--in <relative-dir>] <command> [args...];\n" +
      "  --in <dir>  run command from <workspace-root>/<dir> instead of workspace root;\n" +
      "  bun invocations automatically disable root dotenv loading, and bun or bunx commands inherit the resolved Vault-backed environment directly.",
  );
};

if (import.meta.main) {
  const args = removeLeadingDoubleDash(Bun.argv.slice(2));

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
  } else {
    const { inDirectory, rest } = extractInDirectoryPrefix(args);
    const spawnCwd = inDirectory
      ? resolve(workspaceRootDirectory, inDirectory)
      : workspaceRootDirectory;
    const [commandName, ...commandArgs] = rest;

    if (commandName === undefined) {
      printUsage();
      process.exitCode = 1;
    } else {
      await withTemporaryLocalRuntimeEnvironmentFile(
        {
          requireManagedKeys: true,
        },
        async ({ environment }) => {
          const processHandle = Bun.spawn(
            normalizeCommand(commandName, commandArgs),
            {
              cwd: spawnCwd,
              env: {
                ...Bun.env,
                ...environment,
              } satisfies NodeJS.ProcessEnv,
              stdin: "inherit",
              stdout: "inherit",
              stderr: "inherit",
            },
          );
          const exitCode = await processHandle.exited;

          if (exitCode !== 0) {
            process.exitCode = exitCode;
          }
        },
      );
    }
  }
}
