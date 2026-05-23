import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  collectRepoFiles,
  parseSelectiveRunOptions,
  readCacheJson,
  repoRootDirectory,
  resolveChangedFiles,
  shouldUseSelectiveCache,
  uniqueSorted,
  writeCacheJson,
} from "./shared";

const typecheckCacheVersion = 1;
const typecheckCacheFileName = "selective-typecheck-cache.json";

type TypecheckCacheEntry = {
  readonly fingerprint: string;
  readonly updatedAt: string;
};

type TypecheckCache = {
  readonly version: number;
  readonly suites: Partial<Record<TypecheckSuiteId, TypecheckCacheEntry>>;
};

type TypecheckSuite = {
  readonly id: TypecheckSuiteId;
  readonly label: string;
  readonly command: readonly [string, ...string[]];
  readonly includePatterns: readonly RegExp[];
};

export const typecheckSuiteId = {
  coverage: "typecheck-coverage",
  workspace: "workspace-typecheck",
  convex: "convex-typecheck",
  tooling: "tooling-typecheck",
  tests: "tests-typecheck",
} as const;

export type TypecheckSuiteId =
  (typeof typecheckSuiteId)[keyof typeof typecheckSuiteId];

const sharedRootPatterns = [
  /^package\.json$/,
  /^bun\.lock$/,
  /^tsconfig\.base\.json$/,
] as const;

const coverageIncludePatterns = [
  ...sharedRootPatterns,
  /^tsconfig\.json$/,
  /^tsconfig\.convex\.json$/,
  /^tsconfig\.test\.json$/,
  /^tsconfig\.tooling\.json$/,
  /^drizzle\.config\.ts$/,
  /^apps\/.+/,
  /^convex\/.+/,
  /^packages\/.+/,
  /^tests\/.+/,
  /^tooling\/.+/,
] as const;

export const typecheckSuites = [
  {
    id: typecheckSuiteId.coverage,
    label: "typecheck-coverage",
    command: ["bun", "run", "check:typecheck-coverage"],
    includePatterns: coverageIncludePatterns,
  },
  {
    id: typecheckSuiteId.workspace,
    label: "workspace-typecheck",
    command: ["bun", "run", "typecheck:workspace"],
    includePatterns: [
      ...sharedRootPatterns,
      /^turbo\.json$/,
      /^tsconfig\.json$/,
      /^apps\/.+/,
      /^packages\/.+/,
    ],
  },
  {
    id: typecheckSuiteId.convex,
    label: "convex-typecheck",
    command: ["bun", "run", "typecheck:convex"],
    includePatterns: [
      ...sharedRootPatterns,
      /^tsconfig\.convex\.json$/,
      /^convex\/.+/,
      /^packages\/(?:config|contracts|platform)\/.+/,
    ],
  },
  {
    id: typecheckSuiteId.tooling,
    label: "tooling-typecheck",
    command: ["bun", "run", "typecheck:tooling"],
    includePatterns: [
      ...sharedRootPatterns,
      /^tsconfig\.tooling\.json$/,
      /^vitest\.config\.ts$/,
      /^drizzle\.config\.ts$/,
      /^tooling\/.+/,
      /^packages\/(?:config|contracts|modules|platform)\/.+/,
    ],
  },
  {
    id: typecheckSuiteId.tests,
    label: "tests-typecheck",
    command: ["bun", "run", "typecheck:tests"],
    includePatterns: [
      ...sharedRootPatterns,
      /^tsconfig\.test\.json$/,
      /^apps\/.+/,
      /^convex\/.+/,
      /^packages\/.+/,
      /^tests\/.+/,
      /^tooling\/.+/,
    ],
  },
] as const satisfies readonly TypecheckSuite[];

const typecheckCacheFallback: TypecheckCache = {
  version: typecheckCacheVersion,
  suites: {},
};

const suiteMatchesPath = (suite: TypecheckSuite, relativePath: string) =>
  suite.includePatterns.some((pattern) => pattern.test(relativePath));

export const selectAffectedTypecheckSuites = (
  changedFiles: readonly string[],
  suites: readonly TypecheckSuite[] = typecheckSuites,
) => {
  const normalizedChangedFiles = uniqueSorted(changedFiles);

  return suites.filter((suite) =>
    normalizedChangedFiles.some((relativePath) =>
      suiteMatchesPath(suite, relativePath),
    ),
  );
};

export const shouldSkipTypecheckSuite = (input: {
  readonly force: boolean;
  readonly cachedFingerprint: string | undefined;
  readonly currentFingerprint: string;
}) =>
  input.force !== true && input.cachedFingerprint === input.currentFingerprint;

const buildTypecheckSuiteFingerprint = (
  suite: TypecheckSuite,
  matchingFiles: readonly string[],
) => {
  const hasher = createHash("sha256");

  hasher.update(`version:${typecheckCacheVersion}\n`);
  hasher.update(`suite:${suite.id}\n`);
  hasher.update(`command:${suite.command.join(" ")}\n`);

  for (const pattern of suite.includePatterns) {
    hasher.update(`include:${pattern.source}\n`);
  }

  for (const relativePath of matchingFiles) {
    hasher.update(`file:${relativePath}\n`);
    hasher.update(readFileSync(resolve(repoRootDirectory, relativePath)));
    hasher.update("\n");
  }

  return hasher.digest("hex");
};

const printUsage = () => {
  console.log(
    [
      "Usage: bun run typecheck [-- --all] [--force] [--dry-run] [--base <ref> [--head <ref>]]",
      "",
      "Default behavior:",
      "  - detects working-tree changes and runs only affected typecheck suites",
      "  - skips suites whose last successful fingerprint still matches",
      "  - bypasses the local cache when push refs or explicit base refs are provided",
      "",
      "Flags:",
      "  --all      run every typecheck suite and bypass the selective cache",
      "  --force    rerun affected suites even if their fingerprint is cached",
      "  --dry-run  print the selected suites without executing them",
      "  --base     compare changes from the merge-base of <base> to <head|HEAD>",
      "  --head     optional head ref used together with --base",
    ].join("\n"),
  );
};

const runTypecheckSuite = async (suite: TypecheckSuite) => {
  const processHandle = Bun.spawn(suite.command, {
    cwd: repoRootDirectory,
    env: Bun.env satisfies NodeJS.ProcessEnv,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  return processHandle.exited;
};

const runSelectiveTypecheck = async () => {
  const options = parseSelectiveRunOptions(Bun.argv.slice(2), Bun.env);

  if (options.help) {
    printUsage();
    return;
  }

  const canUseSelectiveCache = shouldUseSelectiveCache({
    base: options.base,
    pushRefsFilePath: options.pushRefsFilePath,
  });
  const cache = readCacheJson(typecheckCacheFileName, typecheckCacheFallback);
  const normalizedCache =
    cache.version === typecheckCacheVersion ? cache : typecheckCacheFallback;
  const repoFiles = collectRepoFiles().sort((left, right) =>
    left.localeCompare(right),
  );
  const changedFilesResult = options.all
    ? {
        changedFiles: [] as readonly string[],
        sourceLabel: "the full typecheck request",
      }
    : resolveChangedFiles(options);
  const candidateSuites = options.all
    ? [...typecheckSuites]
    : selectAffectedTypecheckSuites(changedFilesResult.changedFiles);

  if (!options.all && changedFilesResult.changedFiles.length === 0) {
    console.log(
      "No working-tree changes detected. Skipping typecheck. Use `bun run typecheck:all` to force the full sweep.",
    );
    return;
  }

  if (candidateSuites.length === 0) {
    console.log(
      `No typecheck-relevant changes were detected in ${changedFilesResult.sourceLabel}. Skipping typecheck. Use \`bun run typecheck:all\` to force the full sweep.`,
    );
    return;
  }

  if (options.all) {
    console.log("Running the full typecheck sweep.");
  } else {
    console.log(
      `Running ${candidateSuites.length} affected typecheck suite(s) from ${changedFilesResult.sourceLabel}.`,
    );
  }

  let executedSuites = 0;
  let cachedSuites = 0;
  const nextCache: TypecheckCache = {
    version: typecheckCacheVersion,
    suites: { ...normalizedCache.suites },
  };

  for (const suite of candidateSuites) {
    const matchingFiles = repoFiles.filter((relativePath) =>
      suiteMatchesPath(suite, relativePath),
    );
    const fingerprint = buildTypecheckSuiteFingerprint(suite, matchingFiles);
    const cachedFingerprint = normalizedCache.suites[suite.id]?.fingerprint;

    if (
      shouldSkipTypecheckSuite({
        force: options.force || canUseSelectiveCache !== true,
        cachedFingerprint,
        currentFingerprint: fingerprint,
      })
    ) {
      console.log(`Skipping ${suite.label}; cached fingerprint still matches.`);
      cachedSuites += 1;
      continue;
    }

    if (options.dryRun) {
      console.log(`[dry-run] Would run ${suite.label}.`);
      executedSuites += 1;
      continue;
    }

    console.log(`Running ${suite.label}...`);
    const exitCode = await runTypecheckSuite(suite);

    if (exitCode !== 0) {
      throw new Error(`${suite.label} failed with exit code ${exitCode}.`);
    }

    nextCache.suites[suite.id] = {
      fingerprint,
      updatedAt: new Date().toISOString(),
    };
    writeCacheJson(typecheckCacheFileName, nextCache);
    executedSuites += 1;
  }

  if (options.dryRun) {
    console.log(
      `Dry run complete: ${executedSuites} suite(s) selected, ${cachedSuites} suite(s) already cached.`,
    );
    return;
  }

  if (executedSuites === 0) {
    console.log(
      `All ${cachedSuites} affected typecheck suite(s) were already cached. Nothing ran.`,
    );
    return;
  }

  console.log(
    `Selective typecheck complete: ran ${executedSuites} suite(s), skipped ${cachedSuites} cached suite(s).`,
  );
};

if (import.meta.main) {
  try {
    await runSelectiveTypecheck();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Selective typecheck failed.";

    console.error(message);
    process.exitCode = 1;
  }
}
