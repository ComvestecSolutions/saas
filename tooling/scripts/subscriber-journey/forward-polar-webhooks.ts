import { Effect, Schema } from "effect";
import { subscriberJourneyApiPath } from "@comvestec/platform";
import {
  printToolingScriptError,
  requireConfiguredValue,
  type ToolingScriptConfigurationError,
} from "./common";

const PolarWebhookForwarderEnvironmentSchema = Schema.Struct({
  POLAR_ACCESS_TOKEN: Schema.NonEmptyString,
  POLAR_API_URL: Schema.NonEmptyString,
  POLAR_WEBHOOK_SECRET: Schema.NonEmptyString,
  SUBSCRIBER_JOURNEY_API_PORT: Schema.NonEmptyString,
});

const OrganizationAccessTokenListSchema = Schema.Struct({
  items: Schema.Array(
    Schema.Struct({
      organization_id: Schema.NonEmptyString,
    }),
  ),
});

type PolarWebhookForwarderEnvironment = Schema.Schema.Type<
  typeof PolarWebhookForwarderEnvironmentSchema
>;

type ParsedForwarderOptions = {
  readonly dryRun: boolean;
  readonly once: boolean;
};

type ConnectedListenerEvent = {
  readonly key: "connected";
  readonly secret: string;
  readonly ts?: string;
};

type ReconnectListenerEvent = {
  readonly type: "reconnect";
};

type WebhookCreatedListenerEvent = {
  readonly key: "webhook.created";
  readonly headers: Record<string, string>;
  readonly payload: {
    readonly webhook_event_id: string;
    readonly payload: unknown;
  };
};

type ListenerLoopAction = "continue" | "reconnect" | "stop";

const decodeForwarderEnvironment = Schema.decodeUnknown(
  PolarWebhookForwarderEnvironmentSchema,
);

const decodeOrganizationAccessTokenList = Schema.decodeUnknown(
  OrganizationAccessTokenListSchema,
);

const parseForwarderOptions = (): ParsedForwarderOptions => ({
  dryRun: Bun.argv.includes("--dry-run"),
  once: Bun.argv.includes("--once"),
});

const createPolarApiUrl = (apiBaseUrl: string, pathname: string) =>
  new URL(
    pathname,
    apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`,
  ).toString();

const createLocalWebhookUrl = (port: string) =>
  new URL(
    subscriberJourneyApiPath.processBillingWebhook,
    `http://127.0.0.1:${port}`,
  ).toString();

const resolvePort = (value: string) =>
  Effect.try({
    try: () => {
      if (!/^\d+$/.test(value)) {
        throw new Error(
          "SUBSCRIBER_JOURNEY_API_PORT must be a positive integer.",
        );
      }

      const port = Number(value);

      if (!Number.isInteger(port) || port <= 0) {
        throw new Error(
          "SUBSCRIBER_JOURNEY_API_PORT must be a positive integer.",
        );
      }

      return `${port}`;
    },
    catch: () =>
      ({
        _tag: "ToolingScriptConfigurationError",
        key: "SUBSCRIBER_JOURNEY_API_PORT",
        message: "SUBSCRIBER_JOURNEY_API_PORT must be a positive integer.",
      }) satisfies ToolingScriptConfigurationError,
  });

const safeParseJson = (value: string) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const toError = (cause: unknown) =>
  cause instanceof Error ? cause : new Error(String(cause));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) &&
  Object.values(value).every((entry) => typeof entry === "string");

const isConnectedListenerEvent = (
  value: unknown,
): value is ConnectedListenerEvent =>
  isRecord(value) &&
  value.key === "connected" &&
  typeof value.secret === "string";

const isReconnectListenerEvent = (
  value: unknown,
): value is ReconnectListenerEvent =>
  isRecord(value) && value.type === "reconnect";

const isWebhookCreatedListenerEvent = (
  value: unknown,
): value is WebhookCreatedListenerEvent => {
  if (!isRecord(value) || value.key !== "webhook.created") {
    return false;
  }

  if (!isStringRecord(value.headers) || !isRecord(value.payload)) {
    return false;
  }

  return (
    typeof value.payload.webhook_event_id === "string" &&
    "payload" in value.payload
  );
};

const describeWebhookPayload = (payload: unknown) => {
  if (isRecord(payload) && typeof payload.type === "string") {
    return payload.type;
  }

  return "unknown";
};

const readEventStream = async (
  response: Response,
  onEvent: (payload: string) => Promise<ListenerLoopAction>,
): Promise<ListenerLoopAction> => {
  if (response.body === null) {
    throw new Error("Polar listen response did not include a readable body.");
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      return "reconnect";
    }

    buffer += value;

    while (true) {
      const separatorMatch = /\r?\n\r?\n/.exec(buffer);

      if (separatorMatch === null || separatorMatch.index === undefined) {
        break;
      }

      const rawEvent = buffer.slice(0, separatorMatch.index).replace(/\r/g, "");
      buffer = buffer.slice(separatorMatch.index + separatorMatch[0].length);

      const dataLines = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart());

      if (dataLines.length === 0) {
        continue;
      }

      const action = await onEvent(dataLines.join("\n"));

      if (action !== "continue") {
        return action;
      }
    }
  }
};

const getOrganizationId = (environment: PolarWebhookForwarderEnvironment) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(
        createPolarApiUrl(
          environment.POLAR_API_URL,
          "organization-access-tokens/?limit=10",
        ),
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${environment.POLAR_ACCESS_TOKEN}`,
          },
        },
      );
      const body = await response.text();

      if (!response.ok) {
        throw new Error(
          `Polar organization access token lookup failed with ${response.status}: ${body}`,
        );
      }

      const payload = body.length === 0 ? {} : JSON.parse(body);
      const decoded = await Effect.runPromise(
        decodeOrganizationAccessTokenList(payload),
      );
      const organizationId = decoded.items[0]?.organization_id;

      if (organizationId === undefined) {
        throw new Error(
          "Polar organization access token lookup returned no organization_id values.",
        );
      }

      return organizationId;
    },
    catch: toError,
  });

const forwardWebhookEvent = (options: {
  readonly localWebhookUrl: string;
  readonly listenerEvent: WebhookCreatedListenerEvent;
}) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(options.localWebhookUrl, {
        method: "POST",
        headers: options.listenerEvent.headers,
        body: JSON.stringify(options.listenerEvent.payload.payload),
      });
      const body = await response.text();

      if (!response.ok) {
        throw new Error(
          `Local webhook endpoint rejected ${options.listenerEvent.payload.webhook_event_id} with ${response.status}: ${body}`,
        );
      }

      return {
        status: response.status,
        body: body.length === 0 ? null : safeParseJson(body),
      };
    },
    catch: toError,
  });

const main = Effect.gen(function* () {
  const environment = yield* decodeForwarderEnvironment(Bun.env);
  const options = parseForwarderOptions();
  const apiPort = yield* resolvePort(environment.SUBSCRIBER_JOURNEY_API_PORT);

  yield* requireConfiguredValue(
    "POLAR_ACCESS_TOKEN",
    environment.POLAR_ACCESS_TOKEN,
  );
  yield* requireConfiguredValue("POLAR_API_URL", environment.POLAR_API_URL);
  yield* requireConfiguredValue(
    "POLAR_WEBHOOK_SECRET",
    environment.POLAR_WEBHOOK_SECRET,
  );
  yield* requireConfiguredValue(
    "SUBSCRIBER_JOURNEY_API_PORT",
    environment.SUBSCRIBER_JOURNEY_API_PORT,
  );

  const organizationId = yield* getOrganizationId(environment);
  const listenUrl = createPolarApiUrl(
    environment.POLAR_API_URL,
    `cli/listen/${organizationId}`,
  );
  const localWebhookUrl = createLocalWebhookUrl(apiPort);

  console.log(`Polar organization: ${organizationId}`);
  console.log(`Forwarding to: ${localWebhookUrl}`);
  console.log(`Listen URL: ${listenUrl}`);

  while (true) {
    const shouldStop = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(listenUrl, {
          headers: {
            Accept: "text/event-stream",
            Authorization: `Bearer ${environment.POLAR_ACCESS_TOKEN}`,
          },
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(
            `Polar listen request failed with ${response.status}: ${body}`,
          );
        }

        return readEventStream(response, async (payloadText) => {
          const payload = safeParseJson(payloadText);

          if (isConnectedListenerEvent(payload)) {
            console.log(
              `Connected at ${payload.ts ?? "unknown time"}. Secret: ${payload.secret}`,
            );

            if (payload.secret !== environment.POLAR_WEBHOOK_SECRET) {
              throw new Error(
                `POLAR_WEBHOOK_SECRET does not match the listen stream secret. Expected ${payload.secret}.`,
              );
            }

            if (options.dryRun) {
              console.log("Dry run complete.");
              return "stop";
            }

            return "continue";
          }

          if (isReconnectListenerEvent(payload)) {
            console.log(
              "Polar requested a reconnect. Re-opening the listen stream...",
            );
            return "reconnect";
          }

          if (!isWebhookCreatedListenerEvent(payload)) {
            console.log(`Ignoring listen payload: ${payloadText}`);
            return "continue";
          }

          const eventType = describeWebhookPayload(payload.payload.payload);
          console.log(
            `Forwarding ${eventType} (${payload.payload.webhook_event_id}) to the local webhook endpoint...`,
          );

          const forwarded = await Effect.runPromise(
            forwardWebhookEvent({
              localWebhookUrl,
              listenerEvent: payload,
            }),
          );

          console.log(`Local webhook status: ${forwarded.status}`);

          if (forwarded.body !== null) {
            console.log(JSON.stringify(forwarded.body, null, 2));
          }

          return options.once ? "stop" : "continue";
        });
      },
      catch: toError,
    }).pipe(Effect.map((result) => result === "stop"));

    if (shouldStop) {
      return;
    }
  }
});

Effect.runPromise(main).catch((error) => {
  printToolingScriptError(error);
  process.exit(1);
});
