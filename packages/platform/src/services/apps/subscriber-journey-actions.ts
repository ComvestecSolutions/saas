import { Effect, ParseResult, Schema } from "effect";
import {
  type BillingCheckoutSessionInput,
  platformScope,
} from "@comvestec/contracts";
import {
  IdentitySessionCompletionInput,
  IdentitySessionRequestContextLookup,
  IdentitySessionStartResult,
  IdentitySessionStartInput,
} from "@comvestec/modules";
import type {
  SubscriberJourneyBootstrapInput,
  SubscriberJourneyService,
} from "../domains/subscriber-journey";
import {
  createProductAppAuthCallbackStateFromEnvironment,
  type ProductAppAuthCallbackRedirectNotAllowedError,
  type ProductAppAuthCallbackStateInvalidError,
  resolveProductAppAuthCallbackRedirectUriFromEnvironment,
  validateProductAppAuthCallbackRedirectUriFromEnvironment,
} from "../access/first-party-auth";

const PublicWebAuthStartTenantScopeHintSchema = Schema.Literal(
  platformScope.organization,
  platformScope.individual,
);

const PublicWebAuthStartInputSchema = Schema.Struct({
  host: Schema.NonEmptyString,
  tenantHint: Schema.optional(Schema.NonEmptyString),
  tenantScopeHint: Schema.optional(PublicWebAuthStartTenantScopeHintSchema),
});

export type PublicWebAuthStartInput = Schema.Schema.Type<
  typeof PublicWebAuthStartInputSchema
>;

export type SubscriberJourneyRuntimeLoadError = {
  readonly _tag: "SubscriberJourneyRuntimeLoadError";
  readonly cause: unknown;
};

export const preparePublicAuthStartFromEnvironment = (
  input: Pick<PublicWebAuthStartInput, "host" | "tenantScopeHint">,
) =>
  loadSubscriberJourneyRuntime().pipe(
    Effect.flatMap(({ preparePublicAuthStart }) =>
      preparePublicAuthStart(input),
    ),
  );

export const buildPublicWebAuthStartInputFromEnvironment = (
  environment: unknown,
  input: PublicWebAuthStartInput,
): Effect.Effect<
  IdentitySessionStartInput,
  | ParseResult.ParseError
  | ProductAppAuthCallbackRedirectNotAllowedError
  | ProductAppAuthCallbackStateInvalidError
  | SubscriberJourneyRuntimeLoadError
> =>
  Schema.decodeUnknown(PublicWebAuthStartInputSchema)(input).pipe(
    Effect.flatMap((decodedInput) => {
      const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();

      return Effect.all({
        redirectUri:
          resolveProductAppAuthCallbackRedirectUriFromEnvironment(environment),
        authStartPreparation: preparePublicAuthStartFromEnvironment({
          host: decodedInput.host,
          ...(decodedInput.tenantScopeHint !== undefined
            ? {
                tenantScopeHint: decodedInput.tenantScopeHint,
              }
            : {}),
        }),
      }).pipe(
        Effect.flatMap(({ redirectUri, authStartPreparation }) =>
          createProductAppAuthCallbackStateFromEnvironment(environment, {
            correlationId: authStartPreparation.correlationId,
            redirectUri,
            tenant: authStartPreparation.tenant,
            enabledModules: [...authStartPreparation.enabledModules],
            expiresAt,
          }).pipe(
            Effect.map((state) => ({
              requestContext: authStartPreparation.requestContext,
              redirectUri,
              state,
              ...(decodedInput.tenantHint !== undefined
                ? { tenantHint: decodedInput.tenantHint }
                : {}),
            })),
          ),
        ),
      );
    }),
  );

const loadSubscriberJourneyRuntime = () =>
  Effect.tryPromise({
    try: () => import("../domains/subscriber-journey"),
    catch: (cause) =>
      ({
        _tag: "SubscriberJourneyRuntimeLoadError",
        cause,
      }) satisfies SubscriberJourneyRuntimeLoadError,
  });

export const listPublicBillingPlansFromEnvironment = (environment: unknown) =>
  loadSubscriberJourneyRuntime().pipe(
    Effect.flatMap(({ runSubscriberJourneyFromEnvironment }) =>
      runSubscriberJourneyFromEnvironment(
        environment,
        (service) => service.listPublicPlans,
      ),
    ),
  );

export const resolveSubscriberRequestContextFromEnvironment = (
  environment: unknown,
  input: IdentitySessionRequestContextLookup,
) =>
  loadSubscriberJourneyRuntime().pipe(
    Effect.flatMap(({ runSubscriberJourneyFromEnvironment }) =>
      runSubscriberJourneyFromEnvironment(environment, (service) =>
        service.resolveRequestContext(input),
      ),
    ),
  );

export const startSubscriberAuthenticationFromEnvironment = (
  environment: unknown,
  input: IdentitySessionStartInput,
): Effect.Effect<
  IdentitySessionStartResult,
  | ParseResult.ParseError
  | ProductAppAuthCallbackRedirectNotAllowedError
  | SubscriberJourneyRuntimeLoadError
> =>
  validateProductAppAuthCallbackRedirectUriFromEnvironment(
    environment,
    input.redirectUri,
  ).pipe(
    Effect.flatMap(() =>
      loadSubscriberJourneyRuntime().pipe(
        Effect.flatMap(({ runSubscriberJourneyFromEnvironment }) =>
          runSubscriberJourneyFromEnvironment(environment, (service) =>
            service.startAuthentication(input),
          ),
        ),
      ),
    ),
  );

export const startPublicWebAuthenticationFromEnvironment = (
  environment: unknown,
  input: PublicWebAuthStartInput,
): Effect.Effect<
  IdentitySessionStartResult,
  | ParseResult.ParseError
  | ProductAppAuthCallbackRedirectNotAllowedError
  | ProductAppAuthCallbackStateInvalidError
  | SubscriberJourneyRuntimeLoadError
> =>
  buildPublicWebAuthStartInputFromEnvironment(environment, input).pipe(
    Effect.flatMap((authStartInput) =>
      startSubscriberAuthenticationFromEnvironment(environment, authStartInput),
    ),
  );

export const completeSubscriberAuthenticationFromEnvironment = (
  environment: unknown,
  input: IdentitySessionCompletionInput,
) =>
  loadSubscriberJourneyRuntime().pipe(
    Effect.flatMap(({ runSubscriberJourneyFromEnvironment }) =>
      runSubscriberJourneyFromEnvironment(environment, (service) =>
        service.completeAuthentication(input),
      ),
    ),
  );

export const createSubscriberCheckoutSessionFromEnvironment = (
  environment: unknown,
  input: BillingCheckoutSessionInput,
) =>
  loadSubscriberJourneyRuntime().pipe(
    Effect.flatMap(({ runSubscriberJourneyFromEnvironment }) =>
      runSubscriberJourneyFromEnvironment(environment, (service) =>
        service.createCheckoutSession(input),
      ),
    ),
  );

export const buildProductBootstrapFromEnvironment = (
  environment: unknown,
  input: SubscriberJourneyBootstrapInput,
) =>
  loadSubscriberJourneyRuntime().pipe(
    Effect.flatMap(({ runSubscriberJourneyFromEnvironment }) =>
      runSubscriberJourneyFromEnvironment(environment, (service) =>
        service.buildProductBootstrap(input),
      ),
    ),
  );
