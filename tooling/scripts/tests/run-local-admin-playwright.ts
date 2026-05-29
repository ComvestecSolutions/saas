import { Effect, ParseResult, Schema } from "effect";

type BunWithWhich = typeof Bun & {
  readonly which?: (executable: string) => string | null | undefined;
};

type LocalAdminPlaywrightProcessError = {
  readonly _tag: "LocalAdminPlaywrightProcessError";
  readonly command: readonly string[];
  readonly exitCode: number;
};

type LocalAdminPlaywrightUsageError = {
  readonly _tag: "LocalAdminPlaywrightUsageError";
  readonly message: string;
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

const LocalAdminPlaywrightEnvironmentSchema = Schema.Struct({
  ADMIN_APP_BASE_URL: Schema.NonEmptyString,
});

const LocalAdminPlaywrightModeSchema = Schema.Literal(
  "e2e",
  "a11y",
  "visual",
  "all",
);

type LocalAdminPlaywrightEnvironment = Schema.Schema.Type<
  typeof LocalAdminPlaywrightEnvironmentSchema
>;

type LocalAdminPlaywrightMode = Schema.Schema.Type<
  typeof LocalAdminPlaywrightModeSchema
>;

type LocalAdminPlaywrightInput = {
  readonly mode: LocalAdminPlaywrightMode;
  readonly passthroughArguments: readonly string[];
};

const deterministicLocalAdminOperator = {
  name: "Admin E2E Operator",
  email: "admin.e2e@local.test",
  username: "admin.e2e@local.test",
  password: "AdminE2E!Local2026",
  tenantId: "org_smoke",
} as const;

const decodeEnvironment = Schema.decodeUnknown(
  LocalAdminPlaywrightEnvironmentSchema,
);

const decodeMode = Schema.decodeUnknown(LocalAdminPlaywrightModeSchema);

const buildLocalAdminPlaywrightProcessError = (
  command: readonly string[],
  exitCode: number,
): LocalAdminPlaywrightProcessError => ({
  _tag: "LocalAdminPlaywrightProcessError",
  command,
  exitCode,
});

const isLocalAdminPlaywrightProcessError = (
  error: unknown,
): error is LocalAdminPlaywrightProcessError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "LocalAdminPlaywrightProcessError";

const isLocalAdminPlaywrightUsageError = (
  error: unknown,
): error is LocalAdminPlaywrightUsageError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "LocalAdminPlaywrightUsageError" &&
  "message" in error &&
  typeof error.message === "string";

const removeLeadingDoubleDash = (argv: readonly string[]) =>
  argv[0] === "--" ? argv.slice(1) : argv;

const parseInput = (
  argv: readonly string[],
): Effect.Effect<
  LocalAdminPlaywrightInput,
  LocalAdminPlaywrightUsageError | ParseResult.ParseError
> => {
  const argumentsWithoutSeparator = removeLeadingDoubleDash(argv);
  const [mode, ...passthroughArguments] = argumentsWithoutSeparator;

  if (mode === undefined) {
    return Effect.fail({
      _tag: "LocalAdminPlaywrightUsageError",
      message:
        "Usage: bun run tooling/scripts/tests/run-local-admin-playwright.ts <e2e|a11y|visual|all> [playwright args]",
    } as const);
  }

  if (mode === "all" && passthroughArguments.length > 0) {
    return Effect.fail({
      _tag: "LocalAdminPlaywrightUsageError",
      message:
        "The 'all' mode does not accept extra Playwright arguments; run an individual local suite when passing through custom flags.",
    } as const);
  }

  return decodeMode(mode).pipe(
    Effect.map((resolvedMode) => ({
      mode: resolvedMode,
      passthroughArguments,
    })),
  );
};

const runCommand = (input: {
  readonly command: readonly string[];
  readonly env?: Record<string, string>;
}) =>
  Effect.tryPromise({
    try: async () => {
      const childProcess = Bun.spawn(input.command, {
        cwd: workspaceRootDirectory,
        env: {
          ...Bun.env,
          ...(input.env ?? {}),
        },
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      const exitCode = await childProcess.exited;

      if (exitCode !== 0) {
        throw buildLocalAdminPlaywrightProcessError(input.command, exitCode);
      }
    },
    catch: (cause) => {
      if (isLocalAdminPlaywrightProcessError(cause)) {
        return cause;
      }

      return buildLocalAdminPlaywrightProcessError(input.command, -1);
    },
  });

const buildPerRunPlaywrightEnvironment = (
  environment: LocalAdminPlaywrightEnvironment,
) => {
  const runId = crypto.randomUUID().replace(/-/g, "");

  return {
    ADMIN_E2E_BASE_URL: environment.ADMIN_APP_BASE_URL,
    ADMIN_E2E_TRUSTED_SESSION_COOKIE_NAME: "",
    ADMIN_E2E_TRUSTED_SESSION_COOKIE_VALUE: "",
    ADMIN_E2E_OPERATOR_USERNAME: deterministicLocalAdminOperator.username,
    ADMIN_E2E_OPERATOR_PASSWORD: deterministicLocalAdminOperator.password,
    ADMIN_E2E_TENANT_ID: deterministicLocalAdminOperator.tenantId,
    ADMIN_E2E_INVITE_EMAIL: `admin.invite.${runId}@local.test`,
    ADMIN_E2E_TOKEN_LABEL: `admin-e2e-token-${runId}`,
  } as const;
};

const localPlaywrightScriptsByMode = {
  e2e: "test:e2e",
  a11y: "test:a11y",
  visual: "test:visual",
} as const satisfies Record<Exclude<LocalAdminPlaywrightMode, "all">, string>;

const resolvePlaywrightScriptSequence = (
  mode: LocalAdminPlaywrightMode,
): readonly Exclude<LocalAdminPlaywrightMode, "all">[] =>
  mode === "all" ? ["e2e", "a11y", "visual"] : [mode];

const runLocalAdminPlaywrightSuites = Effect.gen(function* () {
  const environment = yield* decodeEnvironment(Bun.env);
  const input = yield* parseInput(process.argv.slice(2));

  yield* runCommand({
    command: [
      bunExecutablePath,
      "run",
      "tooling/scripts/convex/deploy-self-hosted.ts",
    ],
  });

  yield* runCommand({
    command: [
      bunExecutablePath,
      "run",
      "tooling/scripts/ops/provision-admin-operator.ts",
      "--",
      "--name",
      deterministicLocalAdminOperator.name,
      "--email",
      deterministicLocalAdminOperator.email,
      "--username",
      deterministicLocalAdminOperator.username,
      "--password",
      deterministicLocalAdminOperator.password,
    ],
  });

  for (const mode of resolvePlaywrightScriptSequence(input.mode)) {
    yield* runCommand({
      command: [
        bunExecutablePath,
        "run",
        "--cwd",
        "packages/e2e",
        localPlaywrightScriptsByMode[mode],
        ...(input.mode === mode ? input.passthroughArguments : []),
      ],
      env: buildPerRunPlaywrightEnvironment(environment),
    });
  }
});

try {
  await Effect.runPromise(runLocalAdminPlaywrightSuites);
} catch (error) {
  if (isLocalAdminPlaywrightUsageError(error)) {
    console.error(error.message);
  } else if (isLocalAdminPlaywrightProcessError(error)) {
    console.error(
      `Command failed: ${error.command.join(" ")} exited with code ${error.exitCode}.`,
    );
  } else if (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === "ParseError"
  ) {
    console.error(String(error));
  } else {
    console.error(error);
  }

  process.exitCode = 1;
}
