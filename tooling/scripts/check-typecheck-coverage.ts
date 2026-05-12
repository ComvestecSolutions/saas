import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  usesAppLocalTypedFileRouteHelperCall,
  usesDisallowedCreateFileRouteCall,
} from "./typecheck-coverage-route-audit";

type PackageJson = {
  readonly workspaces?: readonly string[];
  readonly scripts?: Record<string, string | undefined>;
};

type CoverageBucket = {
  readonly name: string;
  readonly configPath: string;
  readonly filePattern: RegExp;
};

const repoRootDirectory = Bun.resolveSync(
  "../../package.json",
  import.meta.dir,
).replace(/[/\\]package\.json$/, "");

const explicitIgnoreLabels = [
  ".git",
  ".turbo",
  "node_modules",
  "vendor",
  "root build",
  "root coverage",
  "root dist",
  "apps/*/build",
  "apps/*/dist",
  "packages/*/build",
  "packages/*/dist",
] as const;

const explicitIgnorePathPatterns = [
  /^\.git(?:\/|$)/,
  /^\.turbo(?:\/|$)/,
  /^build(?:\/|$)/,
  /^coverage(?:\/|$)/,
  /^dist(?:\/|$)/,
  /^vendor(?:\/|$)/,
  /(?:^|\/)node_modules(?:\/|$)/,
  /^apps\/[^/]+\/(?:build|dist)(?:\/|$)/,
  /^packages\/[^/]+\/(?:build|dist)(?:\/|$)/,
] as const;

const typeScriptFilePattern = /\.(?:d\.)?(?:ts|tsx|cts|mts)$/;
const ownedAppRoutePathPattern =
  /^apps\/[^/]+\/src\/routes\/(?!__root\.(?:ts|tsx)$).+\.(?:ts|tsx)$/;

const rootCoverageBuckets = [
  {
    name: "convex",
    configPath: "tsconfig.convex.json",
    filePattern: /^convex\/.+\.(?:d\.)?(?:ts|cts|mts)$/,
  },
  {
    name: "tooling",
    configPath: "tsconfig.tooling.json",
    filePattern:
      /^(?:drizzle\.config\.ts|vitest\.config\.ts|tooling\/.+\.(?:d\.)?(?:ts|cts|mts))$/,
  },
  {
    name: "tests",
    configPath: "tsconfig.test.json",
    filePattern: /^tests\/.+\.(?:d\.)?(?:ts|cts|mts)$/,
  },
] as const satisfies ReadonlyArray<CoverageBucket>;

const normalizePath = (value: string) => value.replaceAll("\\", "/");

const isExplicitlyIgnoredPath = (relativePath: string) =>
  explicitIgnorePathPatterns.some((pattern) => pattern.test(relativePath));

const collectTypeScriptFiles = (relativeDirectory = ""): string[] => {
  const directoryPath = path.resolve(repoRootDirectory, relativeDirectory);
  const entries = readdirSync(directoryPath, {
    withFileTypes: true,
  });

  return entries.flatMap((entry) => {
    const relativePath = normalizePath(
      path.join(relativeDirectory, entry.name),
    );

    if (isExplicitlyIgnoredPath(relativePath)) {
      return [];
    }

    if (entry.isDirectory()) {
      return collectTypeScriptFiles(relativePath);
    }

    return typeScriptFilePattern.test(relativePath) ? [relativePath] : [];
  });
};

const getWorkspaceDirectory = (relativePath: string) => {
  const segments = relativePath.split("/");

  if (
    segments.length >= 2 &&
    (segments[0] === "apps" || segments[0] === "packages")
  ) {
    return `${segments[0]}/${segments[1]}`;
  }

  return undefined;
};

const readPackageJson = (relativePath: string): PackageJson =>
  JSON.parse(
    readFileSync(path.resolve(repoRootDirectory, relativePath), "utf8"),
  ) as PackageJson;

const rootPackageJson = readPackageJson("package.json");

const resolveWorkspaceDirectories = (workspaceGlobs: readonly string[]) =>
  workspaceGlobs.flatMap((workspaceGlob) => {
    if (!workspaceGlob.endsWith("/*")) {
      return [];
    }

    const workspaceParent = workspaceGlob.slice(0, -2);
    const absoluteWorkspaceParent = path.resolve(
      repoRootDirectory,
      workspaceParent,
    );

    if (!existsSync(absoluteWorkspaceParent)) {
      return [];
    }

    return readdirSync(absoluteWorkspaceParent, {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => normalizePath(path.join(workspaceParent, entry.name)))
      .filter((workspaceDirectory) =>
        existsSync(
          path.resolve(repoRootDirectory, workspaceDirectory, "package.json"),
        ),
      );
  });

const readCoveredTypeScriptFilesFromTsConfig = (configPath: string) => {
  const absoluteConfigPath = path.resolve(repoRootDirectory, configPath);
  const configFile = ts.readConfigFile(absoluteConfigPath, ts.sys.readFile);

  if (configFile.error !== undefined) {
    return {
      errors: [
        ts.formatDiagnostic(configFile.error, ts.createCompilerHost({})),
      ],
      files: [] as string[],
    };
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(absoluteConfigPath),
    undefined,
    absoluteConfigPath,
  );

  if (parsedConfig.errors.length > 0) {
    return {
      errors: parsedConfig.errors.map((error) =>
        ts.formatDiagnostic(error, ts.createCompilerHost({})),
      ),
      files: [] as string[],
    };
  }

  return {
    errors: [] as string[],
    files: parsedConfig.fileNames
      .map((fileName) =>
        normalizePath(path.relative(repoRootDirectory, fileName)),
      )
      .filter(
        (relativePath) =>
          !relativePath.startsWith("..") &&
          typeScriptFilePattern.test(relativePath) &&
          !isExplicitlyIgnoredPath(relativePath),
      ),
  };
};

const workspaceTypeScriptFiles = collectTypeScriptFiles().sort((left, right) =>
  left.localeCompare(right),
);

const workspaceDirectories = [
  ...new Set(workspaceTypeScriptFiles.map(getWorkspaceDirectory)),
]
  .filter(
    (workspaceDirectory): workspaceDirectory is string =>
      workspaceDirectory !== undefined,
  )
  .sort((left, right) => left.localeCompare(right));

const declaredWorkspaceDirectories = [
  ...new Set(resolveWorkspaceDirectories(rootPackageJson.workspaces ?? [])),
].sort((left, right) => left.localeCompare(right));

const workspaceDeclarationIssues = workspaceDirectories.flatMap(
  (workspaceDirectory) =>
    declaredWorkspaceDirectories.includes(workspaceDirectory)
      ? []
      : [
          `- ${workspaceDirectory}: contains first-party TypeScript files but is not declared in the root workspaces list, so turbo root typecheck paths would skip it.`,
        ],
);

const workspaceScriptIssues = workspaceDirectories.flatMap(
  (workspaceDirectory) => {
    const packageJsonPath = `${workspaceDirectory}/package.json`;
    const tsConfigPath = `${workspaceDirectory}/tsconfig.json`;

    if (!existsSync(path.resolve(repoRootDirectory, packageJsonPath))) {
      return [
        `- ${workspaceDirectory}: missing package.json for workspace typecheck wiring.`,
      ];
    }

    if (!existsSync(path.resolve(repoRootDirectory, tsConfigPath))) {
      return [
        `- ${workspaceDirectory}: missing tsconfig.json for workspace typecheck coverage.`,
      ];
    }

    const packageJson = readPackageJson(packageJsonPath);
    const typecheckScript = packageJson.scripts?.typecheck?.trim();
    const checkScript = packageJson.scripts?.check?.trim();
    const issues: string[] = [];

    if (typecheckScript === undefined || typecheckScript.length === 0) {
      issues.push(`- ${workspaceDirectory}: missing scripts.typecheck.`);
    } else if (!/^tsc --noEmit -p tsconfig\.json$/.test(typecheckScript)) {
      issues.push(
        `- ${workspaceDirectory}: scripts.typecheck must run \`tsc --noEmit -p tsconfig.json\` so the root typecheck path has a stable coverage contract.`,
      );
    }

    if (checkScript === undefined || checkScript.length === 0) {
      issues.push(`- ${workspaceDirectory}: missing scripts.check.`);
    } else if (
      checkScript !== "bun run typecheck" &&
      checkScript !== "tsc --noEmit -p tsconfig.json"
    ) {
      issues.push(
        `- ${workspaceDirectory}: scripts.check must delegate to typecheck coverage via \`bun run typecheck\` or \`tsc --noEmit -p tsconfig.json\`.`,
      );
    }

    return issues;
  },
);

const categorizedFiles = workspaceTypeScriptFiles.filter(
  (relativePath) =>
    getWorkspaceDirectory(relativePath) !== undefined ||
    rootCoverageBuckets.some((bucket) => bucket.filePattern.test(relativePath)),
);

const uncategorizedFiles = workspaceTypeScriptFiles.filter(
  (relativePath) => !categorizedFiles.includes(relativePath),
);

const rootBucketCoverage = rootCoverageBuckets.map((bucket) => {
  const expectedFiles = workspaceTypeScriptFiles.filter((relativePath) =>
    bucket.filePattern.test(relativePath),
  );
  const covered = readCoveredTypeScriptFilesFromTsConfig(bucket.configPath);
  const coveredFileSet = new Set(covered.files);

  return {
    ...bucket,
    expectedFiles,
    missingFiles: expectedFiles.filter(
      (relativePath) => !coveredFileSet.has(relativePath),
    ),
    errors: covered.errors,
  };
});

const workspaceCoverage = workspaceDirectories.map((workspaceDirectory) => {
  const configPath = `${workspaceDirectory}/tsconfig.json`;
  const expectedFiles = workspaceTypeScriptFiles.filter((relativePath) =>
    relativePath.startsWith(`${workspaceDirectory}/`),
  );
  const covered = readCoveredTypeScriptFilesFromTsConfig(configPath);
  const coveredFileSet = new Set(covered.files);

  return {
    name: workspaceDirectory,
    configPath,
    expectedFiles,
    missingFiles: expectedFiles.filter(
      (relativePath) => !coveredFileSet.has(relativePath),
    ),
    errors: covered.errors,
  };
});

const configCoverageIssues = [
  ...rootBucketCoverage,
  ...workspaceCoverage,
].flatMap((bucket) => {
  const issues = bucket.errors.map(
    (error) =>
      `- ${bucket.configPath}: failed to read TypeScript coverage.\n${error.trimEnd()}`,
  );

  if (bucket.missingFiles.length > 0) {
    issues.push(
      `- ${bucket.configPath}: does not include ${bucket.missingFiles.length} expected TypeScript file(s):`,
      ...bucket.missingFiles.map((relativePath) => `  - ${relativePath}`),
    );
  }

  return issues;
});

const ownedAppRouteTypingIssues = workspaceTypeScriptFiles.flatMap(
  (relativePath) => {
    if (!ownedAppRoutePathPattern.test(relativePath)) {
      return [];
    }

    const contents = readFileSync(
      path.resolve(repoRootDirectory, relativePath),
      "utf8",
    );

    const usesDisallowedCreateFileRoute = usesDisallowedCreateFileRouteCall(
      contents,
      relativePath,
    );
    const usesAppLocalTypedFileRouteHelper =
      usesAppLocalTypedFileRouteHelperCall(contents, relativePath);
    const issues: string[] = [];

    if (usesDisallowedCreateFileRoute) {
      issues.push(
        `- ${relativePath}: owned app route files must not call \`createFileRoute(...)\` directly. Use the app-local typed file-route helper so generated route path mismatches fail under \`bun run typecheck\`.`,
      );
    }

    if (!usesAppLocalTypedFileRouteHelper) {
      issues.push(
        `- ${relativePath}: owned app route files must define routes through the app-local typed helper imported from the app's \`src/file-route\` module. Indirection through sibling wrappers bypasses the generated route-path union and is not allowed.`,
      );
    }

    return issues;
  },
);

if (
  uncategorizedFiles.length === 0 &&
  workspaceDeclarationIssues.length === 0 &&
  workspaceScriptIssues.length === 0 &&
  configCoverageIssues.length === 0 &&
  ownedAppRouteTypingIssues.length === 0
) {
  console.log(
    `Typecheck coverage verified for ${workspaceTypeScriptFiles.length} first-party TypeScript files. Explicitly excluded surfaces remain outside this audit: ${explicitIgnoreLabels.join(", ")}.`,
  );
} else {
  const lines = [
    "Typecheck coverage drift detected.",
    "",
    "First-party TypeScript files must be covered by the root typecheck path unless they are explicitly excluded.",
    "Current coverage buckets: workspace tsconfig.json files under apps/* and packages/*, plus tsconfig.convex.json, tsconfig.tooling.json, and tsconfig.test.json.",
    `Explicit exclusions: ${explicitIgnoreLabels.join(", ")}.`,
  ];

  if (uncategorizedFiles.length > 0) {
    lines.push(
      "",
      "Uncategorized TypeScript files:",
      ...uncategorizedFiles.map((file) => `- ${file}`),
    );
  }

  if (workspaceScriptIssues.length > 0) {
    lines.push("", "Workspace script issues:", ...workspaceScriptIssues);
  }

  if (workspaceDeclarationIssues.length > 0) {
    lines.push(
      "",
      "Workspace declaration issues:",
      ...workspaceDeclarationIssues,
    );
  }

  if (configCoverageIssues.length > 0) {
    lines.push(
      "",
      "TypeScript config coverage issues:",
      ...configCoverageIssues,
    );
  }

  if (ownedAppRouteTypingIssues.length > 0) {
    lines.push(
      "",
      "Owned app route typing issues:",
      ...ownedAppRouteTypingIssues,
    );
  }

  console.error(lines.join("\n"));
  process.exitCode = 1;
}
