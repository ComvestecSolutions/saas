import { createConnection } from "node:net";
import { Effect, Schema } from "effect";
import { backendApiHealthPath } from "@comvestec/platform/http";
import {
  bunExecutablePath,
  printToolingScriptError,
  requestEmpty,
  runBunScript,
  workspaceRootDirectory,
} from "./common";

const SubscriberJourneyReadyEnvironmentSchema = Schema.Struct({
  SUBSCRIBER_JOURNEY_API_PORT: Schema.NonEmptyString,
});

const decodeReadyEnvironment = Schema.decodeUnknown(
  SubscriberJourneyReadyEnvironmentSchema,
);

const resolveApiPort = (value: string) =>
  Effect.try({
    try: () => {
      const port = Number.parseInt(value, 10);

      if (!Number.isInteger(port) || port <= 0) {
        throw new Error(
          "SUBSCRIBER_JOURNEY_API_PORT must be a positive integer.",
        );
      }

      return port;
    },
    catch: () =>
      ({
        _tag: "ToolingScriptConfigurationError",
        key: "SUBSCRIBER_JOURNEY_API_PORT",
        message: "SUBSCRIBER_JOURNEY_API_PORT must be a positive integer.",
      }) as const,
  });

const ensureApiPortAvailable = (apiPort: number) =>
  Effect.tryPromise({
    try: async () => {
      await new Promise<void>((resolve, reject) => {
        const socket = createConnection({
          host: "127.0.0.1",
          port: apiPort,
        });

        const cleanup = () => {
          socket.removeAllListeners();
          socket.destroy();
        };

        socket.once("connect", () => {
          cleanup();
          reject({
            _tag: "ToolingScriptConfigurationError",
            key: "SUBSCRIBER_JOURNEY_API_PORT",
            message: `Port ${apiPort} is already in use. Stop the existing subscriber journey API process before running the readiness command.`,
          } as const);
        });

        socket.once("error", () => {
          cleanup();
          resolve();
        });
      });
    },
    catch: (cause) => cause,
  });

const startSubscriberJourneyApi = () =>
  Bun.spawn([bunExecutablePath, "run", "backend:subscriber-journey"], {
    cwd: workspaceRootDirectory,
    env: Bun.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }) as SubscriberJourneyApiProcess;

type SubscriberJourneyApiProcess = {
  readonly exited: Promise<number>;
  readonly exitCode: number | null;
  kill(signal?: NodeJS.Signals | number): void;
};

const waitForApiReady = (
  apiBaseUrl: string,
  apiProcess: SubscriberJourneyApiProcess,
) =>
  Effect.gen(function* () {
    const probeUrl = new URL(backendApiHealthPath.live, apiBaseUrl).toString();

    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (apiProcess.exitCode !== null) {
        return yield* Effect.fail({
          _tag: "ToolingScriptProcessError",
          script: "backend:subscriber-journey",
          exitCode: apiProcess.exitCode,
        } as const);
      }

      const readinessResult = yield* Effect.either(
        requestEmpty({
          operation: "subscriberJourneyApi.readyProbe",
          url: probeUrl,
        }),
      );

      if (readinessResult._tag === "Right") {
        return;
      }

      if (readinessResult.left.status !== undefined) {
        return yield* Effect.fail(readinessResult.left);
      }

      if (attempt < 29) {
        yield* Effect.sleep(1_000);
      }
    }

    return yield* Effect.fail({
      _tag: "ToolingScriptConfigurationError",
      key: "SUBSCRIBER_JOURNEY_API_PORT",
      message:
        "Subscriber journey API did not become ready before the readiness timeout expired.",
    } as const);
  });

const terminateServer = (apiProcess: SubscriberJourneyApiProcess) =>
  Effect.tryPromise({
    try: async () => {
      if (apiProcess.exitCode !== null) {
        return;
      }

      apiProcess.kill("SIGTERM");

      if (apiProcess.exitCode === null) {
        await apiProcess.exited;
      }
    },
    catch: () =>
      ({
        _tag: "ToolingScriptProcessError",
        script: "backend:subscriber-journey",
        exitCode: -1,
      }) as const,
  });

const waitForManualShutdown = (apiProcess: SubscriberJourneyApiProcess) =>
  Effect.tryPromise({
    try: async () => {
      await new Promise<void>((resolve, reject) => {
        let operatorInitiatedShutdown = false;
        let settled = false;

        const cleanup = () => {
          globalThis.process.off("SIGINT", onSigint);
          globalThis.process.off("SIGTERM", onSigterm);
        };

        const settleResolve = () => {
          if (settled) {
            return;
          }

          settled = true;
          cleanup();
          resolve();
        };

        const settleReject = (cause: unknown) => {
          if (settled) {
            return;
          }

          settled = true;
          cleanup();
          reject(cause);
        };

        void apiProcess.exited.then(
          (exitCode) => {
            setTimeout(() => {
              if (operatorInitiatedShutdown) {
                settleResolve();
                return;
              }

              settleReject({
                _tag: "ToolingScriptProcessError",
                script: "backend:subscriber-journey",
                exitCode,
              } as const);
            }, 0);
          },
          (cause) => {
            settleReject(cause);
          },
        );

        const onSigint = () => {
          operatorInitiatedShutdown = true;

          if (apiProcess.exitCode === null) {
            apiProcess.kill("SIGINT");
            return;
          }

          settleResolve();
        };

        const onSigterm = () => {
          operatorInitiatedShutdown = true;

          if (apiProcess.exitCode === null) {
            apiProcess.kill("SIGTERM");
            return;
          }

          settleResolve();
        };

        globalThis.process.once("SIGINT", onSigint);
        globalThis.process.once("SIGTERM", onSigterm);
      });
    },
    catch: (cause) => cause,
  });

const main = Effect.gen(function* () {
  const environment = yield* decodeReadyEnvironment(Bun.env);
  const apiPort = yield* resolveApiPort(
    environment.SUBSCRIBER_JOURNEY_API_PORT,
  );
  const apiBaseUrl = `http://127.0.0.1:${apiPort}`;

  yield* ensureApiPortAvailable(apiPort);

  console.log("Bootstrapping the subscriber journey backend...");
  yield* runBunScript("backend:subscriber-journey:bootstrap");

  console.log("Starting the subscriber journey backend API...");
  const apiProcess = startSubscriberJourneyApi();

  const readinessResult = yield* Effect.exit(
    waitForApiReady(apiBaseUrl, apiProcess).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          console.log("Running the backend completion live smoke kickoff...");
        }),
      ),
      Effect.flatMap(() =>
        runBunScript("backend:subscriber-journey:live-smoke"),
      ),
    ),
  );

  if (readinessResult._tag === "Failure") {
    console.log("Stopping the subscriber journey backend API...");
    yield* terminateServer(apiProcess);
    return yield* Effect.failCause(readinessResult.cause);
  }

  console.log(
    "Subscriber journey backend is still running so hosted checkout, return handling, and webhook reconciliation can complete.",
  );
  console.log("Press Ctrl+C after verification to stop the local API process.");
  yield* waitForManualShutdown(apiProcess);
});

try {
  await Effect.runPromise(main);
} catch (error) {
  printToolingScriptError(error);
  process.exitCode = 1;
}
