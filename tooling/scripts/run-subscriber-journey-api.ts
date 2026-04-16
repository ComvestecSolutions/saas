import { Effect, Schema } from "effect";
import {
  adminBillingApiBasePath,
  handleAdminBillingHttpRequest,
  handleSubscriberJourneyHttpRequest,
  subscriberJourneyApiBasePath,
} from "@comvestec/platform";

const SubscriberJourneyApiServerEnvironmentSchema = Schema.Struct({
  SUBSCRIBER_JOURNEY_API_PORT: Schema.NonEmptyString,
});

const resolveServerPort = (environment: unknown) =>
  Schema.decodeUnknown(SubscriberJourneyApiServerEnvironmentSchema)(
    environment,
  ).pipe(
    Effect.flatMap((resolvedEnvironment) =>
      Effect.try({
        try: () => {
          const port = Number.parseInt(
            resolvedEnvironment.SUBSCRIBER_JOURNEY_API_PORT,
            10,
          );

          if (!Number.isInteger(port) || port <= 0) {
            throw new Error(
              "SUBSCRIBER_JOURNEY_API_PORT must be a positive integer.",
            );
          }

          return port;
        },
        catch: (cause) => cause,
      }),
    ),
  );

const port = await Effect.runPromise(resolveServerPort(process.env));

const server = Bun.serve({
  port,
  fetch: (request) => {
    const pathname = new URL(request.url).pathname;

    return Effect.runPromise(
      pathname.startsWith(adminBillingApiBasePath)
        ? handleAdminBillingHttpRequest(process.env, request)
        : handleSubscriberJourneyHttpRequest(process.env, request),
    );
  },
});

console.log(
  `Subscriber journey API listening on http://localhost:${server.port}${subscriberJourneyApiBasePath} and http://localhost:${server.port}${adminBillingApiBasePath}`,
);
