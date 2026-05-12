import { resolve } from "node:path";
import {
  withTemporaryLocalRuntimeEnvironmentFile,
  workspaceRootDirectory,
} from "./local-runtime-environment";

const rootComposeFilePath = resolve(
  workspaceRootDirectory,
  "ops/docker/compose.yml",
);

const removeLeadingDoubleDash = (argv: readonly string[]) =>
  argv[0] === "--" ? argv.slice(1) : argv;

const printUsage = () => {
  console.log(
    "Usage: bun run ops:docker:compose -- <docker compose args>; start Vault itself with raw docker compose before relying on Vault-backed env resolution.",
  );
};

if (import.meta.main) {
  const args = removeLeadingDoubleDash(Bun.argv.slice(2));

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
  } else if (args.includes("--env-file") || args.includes("-f")) {
    console.error(
      "ops:docker:compose owns the root compose file and transient env-file wiring. Omit --env-file and -f from the forwarded arguments.",
    );
    process.exitCode = 1;
  } else {
    await withTemporaryLocalRuntimeEnvironmentFile(
      {
        requireManagedKeys: true,
      },
      async ({ envFilePath, environment }) => {
        const processHandle = Bun.spawn(
          [
            "docker",
            "compose",
            "--env-file",
            envFilePath,
            "-f",
            rootComposeFilePath,
            ...args,
          ],
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
