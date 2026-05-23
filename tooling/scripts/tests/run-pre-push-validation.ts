import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { selectiveValidationPushRefsFileEnvironmentVariableName } from "../validation/shared";

const repoRootDirectory = fileURLToPath(
  new URL("../../../", import.meta.url),
).replace(/[/\\]$/, "");

export const pushRefsFileEnvironmentVariableName =
  selectiveValidationPushRefsFileEnvironmentVariableName;

type PrePushValidationCommand = {
  readonly command: readonly [string, ...string[]];
  readonly environmentOverrides?: NodeJS.ProcessEnv;
  readonly input?: string;
};

const readPushRefsFromStdin = async () => {
  let input = "";

  for await (const chunk of process.stdin) {
    input += chunk;
  }

  return input;
};

export const withTemporaryPushRefsFile = async <T>(
  pushRefs: string,
  callback: (pushRefsFilePath: string) => Promise<T>,
  temporaryRootDirectory = tmpdir(),
) => {
  const tempDirectoryPath = mkdtempSync(
    join(temporaryRootDirectory, "comvestec-pre-push-"),
  );
  const pushRefsFilePath = join(tempDirectoryPath, "push-refs.txt");

  writeFileSync(pushRefsFilePath, pushRefs);

  try {
    return await callback(pushRefsFilePath);
  } finally {
    rmSync(tempDirectoryPath, {
      recursive: true,
      force: true,
    });
  }
};

export const buildPrePushValidationCommands = (input: {
  readonly pushRefs: string;
  readonly pushRefsFilePath: string;
}): readonly PrePushValidationCommand[] => [
  {
    command: ["bun", "run", "tooling/scripts/validate-pre-push.mjs"],
    input: input.pushRefs,
  },
  {
    command: ["bun", "run", "format:check"],
    environmentOverrides: {
      [pushRefsFileEnvironmentVariableName]: input.pushRefsFilePath,
    },
  },
  {
    command: ["bun", "run", "typecheck"],
    environmentOverrides: {
      [pushRefsFileEnvironmentVariableName]: input.pushRefsFilePath,
    },
  },
  {
    command: ["bun", "run", "test"],
    environmentOverrides: {
      [pushRefsFileEnvironmentVariableName]: input.pushRefsFilePath,
    },
  },
];

const runPrePushValidationCommands = async (
  commands: readonly PrePushValidationCommand[],
  baseEnvironment: NodeJS.ProcessEnv = Bun.env,
) => {
  for (const command of commands) {
    const result = spawnSync(command.command[0], command.command.slice(1), {
      cwd: repoRootDirectory,
      env: {
        ...baseEnvironment,
        ...command.environmentOverrides,
      } satisfies NodeJS.ProcessEnv,
      stdio:
        command.input !== undefined
          ? ["pipe", "inherit", "inherit"]
          : "inherit",
      input: command.input,
    });
    const exitCode = result.status ?? 1;

    if (exitCode !== 0) {
      return exitCode;
    }
  }

  return 0;
};

if (import.meta.main) {
  const pushRefs = await readPushRefsFromStdin();

  const exitCode = await withTemporaryPushRefsFile(
    pushRefs,
    (pushRefsFilePath) =>
      runPrePushValidationCommands(
        buildPrePushValidationCommands({
          pushRefs,
          pushRefsFilePath,
        }),
      ),
  );

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}
