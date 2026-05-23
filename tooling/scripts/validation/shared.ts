import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRootDirectory = fileURLToPath(
  new URL("../../../", import.meta.url),
).replace(/[/\\]$/, "");

export const selectiveValidationPushRefsFileEnvironmentVariableName =
  "COMVESTEC_TEST_PUSH_REFS_FILE";

const zeroObjectIdPattern = /^0+$/;
const ignoredDirectoryNames = new Set([
  ".git",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

export type SelectiveRunOptions = {
  readonly all: boolean;
  readonly force: boolean;
  readonly dryRun: boolean;
  readonly help: boolean;
  readonly base: string | undefined;
  readonly head: string | undefined;
  readonly pushRefsFilePath: string | undefined;
};

export type ChangeDetectionResult = {
  readonly changedFiles: readonly string[];
  readonly sourceLabel: string;
};

export type PushRef = {
  readonly localRef: string;
  readonly localSha: string;
  readonly remoteRef: string;
  readonly remoteSha: string;
};

export const normalizeRelativePath = (value: string) =>
  value.replaceAll("\\", "/").replace(/^\.\//, "");

export const uniqueSorted = (values: readonly string[]) =>
  [...new Set(values.map(normalizeRelativePath).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );

const decodeText = (value: Uint8Array<ArrayBufferLike>) =>
  new TextDecoder().decode(value);

const runGit = (args: readonly string[]) => {
  const result = Bun.spawnSync(["git", ...args], {
    cwd: repoRootDirectory,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = decodeText(result.stdout).trim();
  const stderr = decodeText(result.stderr).trim();

  if (result.exitCode !== 0) {
    throw new Error(
      [
        `git ${args.join(" ")} failed.`,
        stderr || stdout || "No output returned.",
      ].join("\n"),
    );
  }

  return stdout;
};

const runGitLines = (args: readonly string[]) =>
  uniqueSorted(
    runGit(args)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );

const isZeroObjectId = (value: string) => zeroObjectIdPattern.test(value);

const isBranchRef = (value: string) => value.startsWith("refs/heads/");

const collectWorkingTreeChangedFiles = () =>
  uniqueSorted([
    ...runGitLines(["diff", "--name-only", "--relative", "HEAD"]),
    ...runGitLines(["ls-files", "--others", "--exclude-standard"]),
  ]);

const collectChangedFilesBetweenRefs = (baseRef: string, headRef: string) => {
  const mergeBase = runGit(["merge-base", baseRef, headRef]);

  return runGitLines([
    "diff",
    "--name-only",
    "--relative",
    `${mergeBase}..${headRef}`,
  ]);
};

export const parsePushRefs = (contents: string): readonly PushRef[] =>
  contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);

      return localRef !== undefined &&
        localSha !== undefined &&
        remoteRef !== undefined &&
        remoteSha !== undefined
        ? [{ localRef, localSha, remoteRef, remoteSha }]
        : [];
    });

const collectOutgoingCommitIds = (pushRefs: readonly PushRef[]) => {
  const commitIds: string[] = [];
  const seenCommitIds = new Set<string>();

  for (const pushRef of pushRefs) {
    if (isZeroObjectId(pushRef.localSha)) {
      continue;
    }

    if (!isBranchRef(pushRef.localRef) && !isBranchRef(pushRef.remoteRef)) {
      continue;
    }

    const revListArgs = isZeroObjectId(pushRef.remoteSha)
      ? ["rev-list", "--reverse", pushRef.localSha, "--not", "--remotes"]
      : ["rev-list", "--reverse", `${pushRef.remoteSha}..${pushRef.localSha}`];

    for (const commitId of runGitLines(revListArgs)) {
      if (seenCommitIds.has(commitId)) {
        continue;
      }

      seenCommitIds.add(commitId);
      commitIds.push(commitId);
    }
  }

  return commitIds;
};

const collectChangedFilesFromPushRefs = (pushRefs: readonly PushRef[]) => {
  const changedFiles = new Set<string>();

  for (const commitId of collectOutgoingCommitIds(pushRefs)) {
    for (const relativePath of runGitLines([
      "show",
      "--pretty=format:",
      "--name-only",
      "--no-renames",
      commitId,
    ])) {
      changedFiles.add(relativePath);
    }
  }

  return [...changedFiles].sort((left, right) => left.localeCompare(right));
};

export const shouldUseSelectiveCache = (input: {
  readonly base: string | undefined;
  readonly pushRefsFilePath: string | undefined;
}) => input.base === undefined && input.pushRefsFilePath === undefined;

export const parseSelectiveRunOptions = (
  argv: readonly string[],
  environment: NodeJS.ProcessEnv,
): SelectiveRunOptions => {
  let all = false;
  let force = false;
  let dryRun = false;
  let help = false;
  let base: string | undefined;
  let head: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === undefined) {
      continue;
    }

    switch (argument) {
      case "--all":
        all = true;
        force = true;
        break;
      case "--force":
        force = true;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--help":
      case "-h":
        help = true;
        break;
      case "--base": {
        const value = argv[index + 1];

        if (value === undefined) {
          throw new Error("--base requires a git ref value.");
        }

        base = value;
        index += 1;
        break;
      }
      case "--head": {
        const value = argv[index + 1];

        if (value === undefined) {
          throw new Error("--head requires a git ref value.");
        }

        head = value;
        index += 1;
        break;
      }
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (head !== undefined && base === undefined) {
    throw new Error("--head can only be used together with --base.");
  }

  return {
    all,
    force,
    dryRun,
    help,
    base,
    head,
    pushRefsFilePath:
      environment[selectiveValidationPushRefsFileEnvironmentVariableName],
  };
};

export const resolveChangedFiles = (
  options: SelectiveRunOptions,
): ChangeDetectionResult => {
  if (options.base !== undefined) {
    return {
      changedFiles: collectChangedFilesBetweenRefs(
        options.base,
        options.head ?? "HEAD",
      ),
      sourceLabel: `merge-base diff from ${options.base} to ${options.head ?? "HEAD"}`,
    };
  }

  if (options.pushRefsFilePath !== undefined) {
    if (!existsSync(options.pushRefsFilePath)) {
      throw new Error(
        `Push refs file was not found at ${options.pushRefsFilePath}.`,
      );
    }

    return {
      changedFiles: collectChangedFilesFromPushRefs(
        parsePushRefs(readFileSync(options.pushRefsFilePath, "utf8")),
      ),
      sourceLabel: "outbound push refs",
    };
  }

  return {
    changedFiles: collectWorkingTreeChangedFiles(),
    sourceLabel: "working tree changes",
  };
};

const shouldIgnoreDirectory = (directoryName: string) =>
  ignoredDirectoryNames.has(directoryName);

export const collectRepoFiles = (relativeDirectory = ""): string[] => {
  const directoryPath =
    relativeDirectory.length === 0
      ? repoRootDirectory
      : resolve(repoRootDirectory, relativeDirectory);

  return readdirSync(directoryPath, { withFileTypes: true }).flatMap(
    (entry) => {
      const relativePath = normalizeRelativePath(
        relativeDirectory.length === 0
          ? entry.name
          : `${relativeDirectory}/${entry.name}`,
      );

      if (entry.isDirectory()) {
        return shouldIgnoreDirectory(entry.name)
          ? []
          : collectRepoFiles(relativePath);
      }

      return [relativePath];
    },
  );
};

const resolveCacheFilePath = (fileName: string) =>
  resolve(repoRootDirectory, ".turbo", fileName);

export const readCacheJson = <T>(fileName: string, fallback: T): T => {
  const cacheFilePath = resolveCacheFilePath(fileName);

  if (!existsSync(cacheFilePath)) {
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(cacheFilePath, "utf8")) as T;
  } catch {
    return fallback;
  }
};

export const writeCacheJson = <T>(fileName: string, value: T) => {
  mkdirSync(resolve(repoRootDirectory, ".turbo"), { recursive: true });
  writeFileSync(
    resolveCacheFilePath(fileName),
    `${JSON.stringify(value, null, 2)}\n`,
  );
};
