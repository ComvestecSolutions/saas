import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseSelectiveRunOptions,
  readCacheJson,
  repoRootDirectory,
  resolveChangedFiles,
  shouldUseSelectiveCache,
  uniqueSorted,
  writeCacheJson,
} from "./shared";

const formatCheckCacheVersion = 1;
const formatCheckCacheFileName = "selective-format-check-cache.json";
const fullFormatCheckTriggerPatterns = [
  /^\.editorconfig$/,
  /^\.prettierignore$/,
  /^\.prettierrc(?:\..+)?$/,
  /^prettier\.config\..+$/,
];

type FormatCheckCache = {
  readonly version: number;
  readonly fingerprint: string | undefined;
  readonly updatedAt: string | undefined;
};

const formatCheckCacheFallback: FormatCheckCache = {
  version: formatCheckCacheVersion,
  fingerprint: undefined,
  updatedAt: undefined,
};

export const selectChangedFilesForFormatCheck = (
  changedFiles: readonly string[],
  fileExists: (relativePath: string) => boolean = (relativePath) => {
    const absolutePath = resolve(repoRootDirectory, relativePath);
    return existsSync(absolutePath) && statSync(absolutePath).isFile();
  },
) =>
  uniqueSorted(changedFiles.filter((relativePath) => fileExists(relativePath)));

export const shouldSkipFormatCheck = (input: {
  readonly force: boolean;
  readonly cachedFingerprint: string | undefined;
  readonly currentFingerprint: string;
}) =>
  input.force !== true && input.cachedFingerprint === input.currentFingerprint;

export const shouldRunFullFormatCheck = (changedFiles: readonly string[]) =>
  changedFiles.some((relativePath) =>
    fullFormatCheckTriggerPatterns.some((pattern) =>
      pattern.test(relativePath),
    ),
  );

const buildFormatCheckFingerprint = (files: readonly string[]) => {
  const hasher = createHash("sha256");

  hasher.update(`version:${formatCheckCacheVersion}\n`);

  for (const relativePath of files) {
    hasher.update(`file:${relativePath}\n`);
    hasher.update(readFileSync(resolve(repoRootDirectory, relativePath)));
  }

  return hasher.digest("hex");
};

const printUsage = () => {
  console.log(
    [
      "Usage: bun run format:check [-- --all] [--force] [--dry-run] [--base <ref> [--head <ref>]]",
      "",
      "Default behavior:",
      "  - checks only changed files with Prettier using --ignore-unknown",
      "  - runs the full sweep when explicit formatting rules change",
      "  - skips clean reruns using a local fingerprint cache",
      "  - bypasses the local cache when push refs or explicit base refs are provided",
    ].join("\n"),
  );
};

const runFullFormatCheck = async () => {
  const processHandle = Bun.spawn(["bun", "run", "format:check:all"], {
    cwd: repoRootDirectory,
    env: Bun.env satisfies NodeJS.ProcessEnv,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await processHandle.exited;

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
};

const runSelectiveFormatCheck = async () => {
  const options = parseSelectiveRunOptions(Bun.argv.slice(2), Bun.env);

  if (options.help) {
    printUsage();
    return;
  }

  if (options.all) {
    await runFullFormatCheck();
    return;
  }

  const canUseSelectiveCache = shouldUseSelectiveCache({
    base: options.base,
    pushRefsFilePath: options.pushRefsFilePath,
  });
  const changedFilesResult = resolveChangedFiles(options);

  if (changedFilesResult.changedFiles.length === 0) {
    console.log(
      "No working-tree changes detected. Skipping format check. Use `bun run format:check:all` to force the full sweep.",
    );
    return;
  }

  if (shouldRunFullFormatCheck(changedFilesResult.changedFiles)) {
    if (options.dryRun) {
      console.log(
        `[dry-run] Would run full format check because formatter-affecting files changed in ${changedFilesResult.sourceLabel}.`,
      );
      return;
    }

    console.log(
      `Running full format check because formatter-affecting files changed in ${changedFilesResult.sourceLabel}.`,
    );
    await runFullFormatCheck();
    return;
  }

  const selectedFiles = selectChangedFilesForFormatCheck(
    changedFilesResult.changedFiles,
  );

  if (selectedFiles.length === 0) {
    console.log(
      `No existing changed files required formatting checks in ${changedFilesResult.sourceLabel}. Skipping format check.`,
    );
    return;
  }

  const cache = readCacheJson(
    formatCheckCacheFileName,
    formatCheckCacheFallback,
  );
  const normalizedCache =
    cache.version === formatCheckCacheVersion
      ? cache
      : formatCheckCacheFallback;
  const fingerprint = buildFormatCheckFingerprint(selectedFiles);

  if (
    shouldSkipFormatCheck({
      force: options.force || canUseSelectiveCache !== true,
      cachedFingerprint: normalizedCache.fingerprint,
      currentFingerprint: fingerprint,
    })
  ) {
    console.log(
      `Skipping format check; cached fingerprint still matches ${selectedFiles.length} changed file(s).`,
    );
    return;
  }

  if (options.dryRun) {
    console.log(
      `[dry-run] Would run Prettier against ${selectedFiles.length} changed file(s).`,
    );
    return;
  }

  const processHandle = Bun.spawn(
    ["bunx", "prettier", "--check", "--ignore-unknown", ...selectedFiles],
    {
      cwd: repoRootDirectory,
      env: Bun.env satisfies NodeJS.ProcessEnv,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const exitCode = await processHandle.exited;

  if (exitCode !== 0) {
    process.exitCode = exitCode;
    return;
  }

  writeCacheJson(formatCheckCacheFileName, {
    version: formatCheckCacheVersion,
    fingerprint,
    updatedAt: new Date().toISOString(),
  } satisfies FormatCheckCache);

  console.log(
    `Selective format check complete for ${selectedFiles.length} file(s).`,
  );
};

if (import.meta.main) {
  try {
    await runSelectiveFormatCheck();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Selective format check failed.",
    );
    process.exitCode = 1;
  }
}
