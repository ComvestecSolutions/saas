import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRootDirectory = fileURLToPath(
  new URL("../../../", import.meta.url),
).replace(/[/\\]$/, "");

const selectiveTestCacheVersion = 1;
const selectiveTestCacheFilePath = resolve(
  repoRootDirectory,
  ".turbo",
  "selective-test-cache.json",
);
const pushRefsFileEnvironmentVariableName = "COMVESTEC_TEST_PUSH_REFS_FILE";
const zeroObjectIdPattern = /^0+$/;
const ignoredDirectoryNames = new Set([
  ".git",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

export const selectiveTestSuiteId = {
  backend: "backend",
  uiBrowser: "ui-browser",
  adminBrowser: "admin-browser",
  productBrowser: "product-browser",
  publicWebBrowser: "public-web-browser",
} as const;

export type SelectiveTestSuiteId =
  (typeof selectiveTestSuiteId)[keyof typeof selectiveTestSuiteId];

type SelectiveTestSuite = {
  readonly id: SelectiveTestSuiteId;
  readonly label: string;
  readonly projectName: string;
  readonly passWithNoTests?: boolean;
  readonly supportsRelatedMode?: boolean;
  readonly includePatterns: readonly RegExp[];
  readonly fullRunPatterns: readonly RegExp[];
  readonly relatedFallbacks?: Readonly<Record<string, readonly string[]>>;
  readonly excludePatterns?: readonly RegExp[];
};

type SelectiveTestCacheEntry = {
  readonly fingerprint: string;
  readonly updatedAt: string;
};

type SelectiveTestCache = {
  readonly version: number;
  readonly suites: Partial<
    Record<SelectiveTestSuiteId, SelectiveTestCacheEntry>
  >;
};

type PushRef = {
  readonly localRef: string;
  readonly localSha: string;
  readonly remoteRef: string;
  readonly remoteSha: string;
};

type SelectiveTestRunOptions = {
  readonly all: boolean;
  readonly force: boolean;
  readonly dryRun: boolean;
  readonly help: boolean;
  readonly base: string | undefined;
  readonly head: string | undefined;
  readonly pushRefsFilePath: string | undefined;
};

type ChangeDetectionResult = {
  readonly changedFiles: readonly string[];
  readonly sourceLabel: string;
};

const sharedRootPatterns = [
  /^package\.json$/,
  /^bun\.lock$/,
  /^vitest\.config\.ts$/,
  /^tsconfig\.json$/,
  /^tsconfig\.base\.json$/,
  /^vendor\/tanstack-start-server-core\/.+/,
] as const;

const sharedFullRunPatterns = [...sharedRootPatterns] as const;

const sharedBrowserDependencyPatterns = [
  /^packages\/config\/.+/,
  /^packages\/contracts\/.+/,
  /^packages\/platform\/.+/,
] as const;

const backendIncludePatterns = [
  ...sharedRootPatterns,
  /^package\.json$/,
  /^\.githooks\/pre-push$/,
  /^tsconfig\.convex\.json$/,
  /^tsconfig\.test\.json$/,
  /^tsconfig\.tooling\.json$/,
  /^drizzle\.config\.ts$/,
  /^convex\/.+/,
  /^packages\/(?:config|contracts|modules|platform)\/.+/,
  /^tests\/.+/,
  /^tooling\/.+/,
  /^apps\/admin-app\/src\/(?:auth|lib)\/.+/,
  /^apps\/product-app\/src\/(?:auth|billing|lib)\/.+/,
  /^apps\/public-web\/src\/(?:auth|billing|lib)\/.+/,
  /^apps\/[^/]+\/src\/file-route(?:\.typecheck)?\.ts$/,
  /^apps\/[^/]+\/package\.json$/,
  /^apps\/[^/]+\/tsconfig\.json$/,
] as const;

const backendExcludePatterns = [/^tests\/platform\/backend-e2e\/.+/] as const;

export const selectiveTestSuites = [
  {
    id: selectiveTestSuiteId.backend,
    label: "backend",
    projectName: "backend",
    supportsRelatedMode: false,
    includePatterns: backendIncludePatterns,
    fullRunPatterns: [
      ...sharedFullRunPatterns,
      /^tsconfig\.convex\.json$/,
      /^tsconfig\.test\.json$/,
      /^tsconfig\.tooling\.json$/,
      /^drizzle\.config\.ts$/,
      /^apps\/[^/]+\/package\.json$/,
      /^apps\/[^/]+\/tsconfig\.json$/,
    ],
    relatedFallbacks: {
      ".githooks/pre-push": ["tests/platform/pre-push-validation.test.ts"],
      "package.json": [
        "tests/platform/pre-push-validation.test.ts",
        "tests/platform/selective-test-runner.test.ts",
      ],
    },
    excludePatterns: backendExcludePatterns,
  },
  {
    id: selectiveTestSuiteId.uiBrowser,
    label: "ui-browser",
    projectName: "ui-browser",
    passWithNoTests: true,
    includePatterns: [...sharedRootPatterns, /^packages\/ui\/.+/],
    fullRunPatterns: [
      ...sharedFullRunPatterns,
      /^packages\/ui\/package\.json$/,
      /^packages\/ui\/tsconfig\.json$/,
      /^packages\/ui\/vite\.config\.ts$/,
    ],
  },
  {
    id: selectiveTestSuiteId.adminBrowser,
    label: "admin-browser",
    projectName: "admin-browser",
    passWithNoTests: true,
    includePatterns: [
      ...sharedRootPatterns,
      ...sharedBrowserDependencyPatterns,
      /^packages\/ui\/.+/,
      /^apps\/admin-app\/.+/,
    ],
    fullRunPatterns: [
      ...sharedFullRunPatterns,
      /^apps\/admin-app\/package\.json$/,
      /^apps\/admin-app\/tsconfig\.json$/,
      /^apps\/admin-app\/vite\.config\.ts$/,
    ],
  },
  {
    id: selectiveTestSuiteId.productBrowser,
    label: "product-browser",
    projectName: "product-browser",
    passWithNoTests: true,
    includePatterns: [
      ...sharedRootPatterns,
      ...sharedBrowserDependencyPatterns,
      /^apps\/product-app\/.+/,
    ],
    fullRunPatterns: [
      ...sharedFullRunPatterns,
      /^apps\/product-app\/package\.json$/,
      /^apps\/product-app\/tsconfig\.json$/,
      /^apps\/product-app\/vite\.config\.ts$/,
    ],
  },
  {
    id: selectiveTestSuiteId.publicWebBrowser,
    label: "public-web-browser",
    projectName: "public-web-browser",
    passWithNoTests: true,
    includePatterns: [
      ...sharedRootPatterns,
      ...sharedBrowserDependencyPatterns,
      /^apps\/public-web\/.+/,
    ],
    fullRunPatterns: [
      ...sharedFullRunPatterns,
      /^apps\/public-web\/package\.json$/,
      /^apps\/public-web\/tsconfig\.json$/,
      /^apps\/public-web\/vite\.config\.ts$/,
    ],
  },
] as const satisfies readonly SelectiveTestSuite[];

const normalizeRelativePath = (value: string) =>
  value.replaceAll("\\", "/").replace(/^\.\//, "");

const uniqueSorted = (values: readonly string[]) =>
  [...new Set(values.map(normalizeRelativePath).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );

const shouldIgnoreDirectory = (directoryName: string) =>
  ignoredDirectoryNames.has(directoryName);

const collectRepoFiles = (relativeDirectory = ""): string[] => {
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

const suiteMatchesPath = (suite: SelectiveTestSuite, relativePath: string) =>
  suite.includePatterns.some((pattern) => pattern.test(relativePath)) &&
  !(
    suite.excludePatterns?.some((pattern) => pattern.test(relativePath)) ??
    false
  );

export const selectAffectedTestSuites = (
  changedFiles: readonly string[],
  suites: readonly SelectiveTestSuite[] = selectiveTestSuites,
) => {
  const normalizedChangedFiles = uniqueSorted(changedFiles);

  return suites.filter((suite) =>
    normalizedChangedFiles.some((relativePath) =>
      suiteMatchesPath(suite, relativePath),
    ),
  );
};

export const shouldSkipSuiteFromCache = (input: {
  readonly force: boolean;
  readonly cachedFingerprint: string | undefined;
  readonly currentFingerprint: string;
}) =>
  input.force !== true && input.cachedFingerprint === input.currentFingerprint;

export const suiteRequiresFullRun = (
  suite: SelectiveTestSuite,
  changedFiles: readonly string[],
) => {
  const normalizedChangedFiles = uniqueSorted(
    changedFiles.filter((relativePath) =>
      suiteMatchesPath(suite, relativePath),
    ),
  );

  if (normalizedChangedFiles.length === 0) {
    return true;
  }

  return normalizedChangedFiles.some((relativePath) =>
    suite.fullRunPatterns.some((pattern) => pattern.test(relativePath)),
  );
};

export const resolveSuiteRelatedFiles = (
  suite: SelectiveTestSuite,
  changedFiles: readonly string[],
) => {
  const normalizedChangedFiles = uniqueSorted(
    changedFiles.filter((relativePath) =>
      suiteMatchesPath(suite, relativePath),
    ),
  );
  const directRelatedFiles = normalizedChangedFiles.filter((relativePath) =>
    /\.(?:ts|tsx)$/.test(relativePath),
  );
  const fallbackRelatedFiles = normalizedChangedFiles.flatMap(
    (relativePath) => suite.relatedFallbacks?.[relativePath] ?? [],
  );

  return uniqueSorted([...directRelatedFiles, ...fallbackRelatedFiles]);
};

export const shouldRunFullSuiteForSuiteChanges = (
  suite: SelectiveTestSuite,
  changedFiles: readonly string[],
  repoFileExists: (relativePath: string) => boolean = (relativePath) =>
    existsSync(resolve(repoRootDirectory, relativePath)),
) => {
  const normalizedChangedFiles = uniqueSorted(changedFiles);
  const relatedFiles = resolveSuiteRelatedFiles(suite, normalizedChangedFiles);

  return (
    suite.supportsRelatedMode === false ||
    suiteRequiresFullRun(suite, normalizedChangedFiles) ||
    relatedFiles.length === 0 ||
    normalizedChangedFiles.some(
      (relativePath) => repoFileExists(relativePath) !== true,
    )
  );
};

export const shouldUseSelectiveCache = (input: {
  readonly base: string | undefined;
  readonly pushRefsFilePath: string | undefined;
}) => input.base === undefined && input.pushRefsFilePath === undefined;

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

const readSelectiveTestCache = (): SelectiveTestCache => {
  if (!existsSync(selectiveTestCacheFilePath)) {
    return {
      version: selectiveTestCacheVersion,
      suites: {},
    };
  }

  try {
    const parsed = JSON.parse(
      readFileSync(selectiveTestCacheFilePath, "utf8"),
    ) as SelectiveTestCache;

    if (parsed.version !== selectiveTestCacheVersion) {
      return {
        version: selectiveTestCacheVersion,
        suites: {},
      };
    }

    return parsed;
  } catch {
    return {
      version: selectiveTestCacheVersion,
      suites: {},
    };
  }
};

const writeSelectiveTestCache = (cache: SelectiveTestCache) => {
  mkdirSync(resolve(repoRootDirectory, ".turbo"), { recursive: true });
  writeFileSync(
    selectiveTestCacheFilePath,
    `${JSON.stringify(cache, null, 2)}\n`,
  );
};

const buildSuiteFingerprint = (
  suite: SelectiveTestSuite,
  matchingFiles: readonly string[],
) => {
  const hasher = createHash("sha256");

  hasher.update(`version:${selectiveTestCacheVersion}\n`);
  hasher.update(`suite:${suite.id}\n`);
  hasher.update(`project:${suite.projectName}\n`);
  hasher.update(`passWithNoTests:${suite.passWithNoTests === true}\n`);

  for (const pattern of suite.includePatterns) {
    hasher.update(`include:${pattern.source}\n`);
  }

  for (const pattern of suite.fullRunPatterns) {
    hasher.update(`full:${pattern.source}\n`);
  }

  for (const [sourcePath, fallbackPaths] of Object.entries(
    suite.relatedFallbacks ?? {},
  )) {
    hasher.update(`fallback:${sourcePath}\n`);

    for (const fallbackPath of fallbackPaths) {
      hasher.update(`fallback-file:${fallbackPath}\n`);
    }
  }

  for (const pattern of suite.excludePatterns ?? []) {
    hasher.update(`exclude:${pattern.source}\n`);
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
      "Usage: bun run test [-- --all] [--force] [--dry-run] [--base <ref> [--head <ref>]]",
      "",
      "Default behavior:",
      "  - detects working-tree changes and runs only affected suites",
      `  - honors ${pushRefsFileEnvironmentVariableName} during pre-push validation`,
      "  - skips suites whose last successful fingerprint still matches",
      "",
      "Flags:",
      "  --all      run every suite and bypass the selective cache",
      "  --force    rerun affected suites even if their fingerprint is cached",
      "  --dry-run  print the selected suites without executing them",
      "  --base     compare changes from the merge-base of <base> to <head|HEAD>",
      "  --head     optional head ref used together with --base",
    ].join("\n"),
  );
};

const parseRunOptions = (
  argv: readonly string[],
  environment: NodeJS.ProcessEnv,
): SelectiveTestRunOptions => {
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
    pushRefsFilePath: environment[pushRefsFileEnvironmentVariableName],
  };
};

const resolveChangedFiles = (
  options: SelectiveTestRunOptions,
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

const buildFullSuiteCommand = (suite: SelectiveTestSuite) =>
  [
    "bunx",
    "vitest",
    "run",
    "--config",
    "vitest.config.ts",
    "--project",
    suite.projectName,
    ...(suite.passWithNoTests === true ? ["--passWithNoTests"] : []),
  ] as const;

const buildRelatedSuiteCommand = (
  suite: SelectiveTestSuite,
  changedFiles: readonly string[],
) =>
  [
    "bunx",
    "vitest",
    "related",
    "--run",
    "--config",
    "vitest.config.ts",
    "--project",
    suite.projectName,
    ...(suite.passWithNoTests === true ? ["--passWithNoTests"] : []),
    ...changedFiles,
  ] as const;

const runSuite = async (command: readonly [string, ...string[]]) => {
  const processHandle = Bun.spawn(command, {
    cwd: repoRootDirectory,
    env: Bun.env satisfies NodeJS.ProcessEnv,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  return processHandle.exited;
};

const runSelectiveTests = async () => {
  const options = parseRunOptions(Bun.argv.slice(2), Bun.env);

  if (options.help) {
    printUsage();
    return;
  }

  const canUseSelectiveCache = shouldUseSelectiveCache({
    base: options.base,
    pushRefsFilePath: options.pushRefsFilePath,
  });
  const cache = readSelectiveTestCache();
  const repoFiles = collectRepoFiles().sort((left, right) =>
    left.localeCompare(right),
  );
  const changedFilesResult = options.all
    ? {
        changedFiles: [] as readonly string[],
        sourceLabel: "the full suite request",
      }
    : resolveChangedFiles(options);
  const candidateSuites = options.all
    ? [...selectiveTestSuites]
    : selectAffectedTestSuites(changedFilesResult.changedFiles);

  if (!options.all && changedFilesResult.changedFiles.length === 0) {
    console.log(
      "No working-tree changes detected. Skipping tests. Use `bun run test:all` to force the full sweep.",
    );
    return;
  }

  if (candidateSuites.length === 0) {
    console.log(
      `No test-relevant changes were detected in ${changedFilesResult.sourceLabel}. Skipping tests. Use \`bun run test:all\` to force the full sweep.`,
    );
    return;
  }

  if (options.all) {
    console.log("Running the full test sweep.");
  } else {
    console.log(
      `Running ${candidateSuites.length} affected test suite(s) from ${changedFilesResult.sourceLabel}.`,
    );
  }

  let executedSuites = 0;
  let cachedSuites = 0;

  for (const suite of candidateSuites) {
    const suiteChangedFiles = options.all
      ? ([] as readonly string[])
      : uniqueSorted(
          changedFilesResult.changedFiles.filter((relativePath) =>
            suiteMatchesPath(suite, relativePath),
          ),
        );
    const matchingFiles = repoFiles.filter((relativePath) =>
      suiteMatchesPath(suite, relativePath),
    );
    const fingerprint = buildSuiteFingerprint(suite, matchingFiles);
    const cachedFingerprint = cache.suites[suite.id]?.fingerprint;

    if (
      shouldSkipSuiteFromCache({
        force: options.force || canUseSelectiveCache !== true,
        cachedFingerprint,
        currentFingerprint: fingerprint,
      })
    ) {
      console.log(`Skipping ${suite.label}; cached fingerprint still matches.`);
      cachedSuites += 1;
      continue;
    }

    const relatedFiles = resolveSuiteRelatedFiles(suite, suiteChangedFiles);
    if (options.dryRun) {
      const shouldRunFullSuite =
        options.all ||
        shouldRunFullSuiteForSuiteChanges(suite, suiteChangedFiles);

      console.log(
        `[dry-run] Would run ${suite.label} (${shouldRunFullSuite ? "full suite" : "related tests"}).`,
      );
      executedSuites += 1;
      continue;
    }

    const shouldRunFullSuite =
      options.all ||
      shouldRunFullSuiteForSuiteChanges(suite, suiteChangedFiles);
    const command = shouldRunFullSuite
      ? buildFullSuiteCommand(suite)
      : buildRelatedSuiteCommand(suite, relatedFiles);

    console.log(
      `Running ${suite.label} (${shouldRunFullSuite ? "full suite" : "related tests"})...`,
    );
    const exitCode = await runSuite(command);

    if (exitCode !== 0) {
      throw new Error(`${suite.label} failed with exit code ${exitCode}.`);
    }

    cache.suites[suite.id] = {
      fingerprint,
      updatedAt: new Date().toISOString(),
    };
    writeSelectiveTestCache(cache);
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
      `All ${cachedSuites} affected suite(s) were already cached. Nothing ran.`,
    );
    return;
  }

  console.log(
    `Selective tests complete: ran ${executedSuites} suite(s), skipped ${cachedSuites} cached suite(s).`,
  );
};

if (import.meta.main) {
  try {
    await runSelectiveTests();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Selective test runner failed.";

    console.error(message);
    process.exitCode = 1;
  }
}
