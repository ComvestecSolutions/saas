import {
  withTemporaryLocalRuntimeEnvironmentFile,
  workspaceRootDirectory,
} from "./local-runtime-environment";

const removeLeadingDoubleDash = (argv: readonly string[]) =>
  argv[0] === "--" ? argv.slice(1) : argv;

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
    "Usage: bun run ops:local:command -- <command> [args...]; bun invocations automatically disable root dotenv loading, and bun or bunx commands inherit the resolved Vault-backed environment directly.",
  );
};

if (import.meta.main) {
  const args = removeLeadingDoubleDash(Bun.argv.slice(2));

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
  } else {
    const [commandName, ...commandArgs] = args;

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
              cwd: workspaceRootDirectory,
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
