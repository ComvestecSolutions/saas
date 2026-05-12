import { Effect, Schema } from "effect";
import {
  backendApiDocsPath,
  backendApiOpenApiPath,
  createBackendApiRequestHandler,
} from "@comvestec/platform/http";
import {
  adminBillingApiBasePath,
  subscriberJourneyApiBasePath,
} from "@comvestec/platform";
import {
  resolveOptionalOverride,
  subscriberJourneyConvexServiceActorDefaults,
} from "./subscriber-journey/common";

const SubscriberJourneyApiServerEnvironmentSchema = Schema.Struct({
  SUBSCRIBER_JOURNEY_API_PORT: Schema.NonEmptyString,
  KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: Schema.optional(
    Schema.NonEmptyString,
  ),
  KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: Schema.optional(
    Schema.NonEmptyString,
  ),
});

const resolveServerEnvironment = (environment: NodeJS.ProcessEnv) =>
  Schema.decodeUnknown(SubscriberJourneyApiServerEnvironmentSchema)(
    environment,
  ).pipe(
    Effect.map((resolvedEnvironment) => ({
      portValue: resolvedEnvironment.SUBSCRIBER_JOURNEY_API_PORT,
      runtimeEnvironment: {
        ...environment,
        KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: resolveOptionalOverride(
          resolvedEnvironment.KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME,
          subscriberJourneyConvexServiceActorDefaults.username,
        ),
        KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: resolveOptionalOverride(
          resolvedEnvironment.KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD,
          subscriberJourneyConvexServiceActorDefaults.password,
        ),
      } satisfies NodeJS.ProcessEnv,
    })),
  );

const resolveServerPort = (portValue: string) =>
  Effect.try({
    try: () => {
      const port = Number.parseInt(portValue, 10);

      if (!Number.isInteger(port) || port <= 0) {
        throw new Error(
          "SUBSCRIBER_JOURNEY_API_PORT must be a positive integer.",
        );
      }

      return port;
    },
    catch: (cause) => cause,
  });

const { portValue, runtimeEnvironment } = await Effect.runPromise(
  resolveServerEnvironment(process.env),
);
const port = await Effect.runPromise(resolveServerPort(portValue));
const handleRequest = createBackendApiRequestHandler(runtimeEnvironment);

const server = Bun.serve({
  port,
  fetch: handleRequest,
});

console.log(
  `Subscriber journey API listening on http://localhost:${server.port}${subscriberJourneyApiBasePath}, http://localhost:${server.port}${adminBillingApiBasePath}, docs at http://localhost:${server.port}${backendApiDocsPath}, and OpenAPI at http://localhost:${server.port}${backendApiOpenApiPath}`,
);
