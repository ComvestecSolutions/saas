import { Effect, ParseResult, Schema } from "effect";
import {
  AbsoluteRedirectUriSchema,
  type BillingCheckoutSessionInput,
  platformScope,
} from "@comvestec/contracts";
import {
  IdentitySessionCompletionInput,
  IdentitySessionInvalidationInput,
  type IdentitySessionInvalidationReason,
  IdentitySessionRequestContextLookup,
  IdentitySessionStartResult,
  IdentitySessionStartInput,
} from "@comvestec/modules";
import type {
  PublicAuthStartPreparation,
  PublicAuthStartPreparationError,
  SubscriberJourneyBootstrapInput,
} from "../domains/subscriber-journey";
import {
  ProductAppPostAuthRedirectPathSchema,
  createProductAppAuthCallbackStateFromEnvironment,
  decodeProductAppAuthCallbackStateFromEnvironment,
  decodeProductAppAuthCallbackStatePayloadFromEnvironment,
  type ProductAppAuthCallbackRedirectNotAllowedError,
  type ProductAppAuthCallbackStateExpiredError,
  type ProductAppAuthCallbackStateInvalidError,
  resolveProductAppAuthCallbackRedirectUriFromEnvironment,
  validateProductAppAuthCallbackRedirectUriFromEnvironment,
} from "../access/first-party-auth";
import {
  extractRequiredSubscriberJourneySessionId,
  extractSubscriberJourneySessionId,
} from "../access/request-context-transport";
import { loadRuntimeModule } from "./runtime-loader";

const PublicWebAuthStartTenantScopeHintSchema = Schema.Literal(
  platformScope.organization,
  platformScope.individual,
);

const PublicWebAuthStartInputSchema = Schema.Struct({
  correlationId: Schema.optional(Schema.NonEmptyString),
  host: Schema.NonEmptyString,
  tenantHint: Schema.optional(Schema.NonEmptyString),
  tenantScopeHint: Schema.optional(PublicWebAuthStartTenantScopeHintSchema),
  postAuthRedirectPath: Schema.optional(ProductAppPostAuthRedirectPathSchema),
});

export type PublicWebAuthStartInput = Schema.Schema.Type<
  typeof PublicWebAuthStartInputSchema
>;

const ProductAuthCallbackCompletionInputSchema = Schema.Struct({
  authorizationCode: Schema.NonEmptyString,
  state: Schema.NonEmptyString,
  callbackRequestUri: AbsoluteRedirectUriSchema,
  host: Schema.NonEmptyString,
  correlationId: Schema.optional(Schema.NonEmptyString),
});

type ProductAuthCallbackCompletionInput = Schema.Schema.Type<
  typeof ProductAuthCallbackCompletionInputSchema
>;

export type SubscriberJourneyRuntimeLoadError = {
  readonly _tag: "SubscriberJourneyRuntimeLoadError";
  readonly cause: unknown;
};

type SubscriberJourneyDomainRuntimeError = {
  readonly _tag: "SubscriberJourneyRuntimeError";
  readonly cause: unknown;
};

type SubscriberJourneyRuntimeModule = Pick<
  typeof import("../domains/subscriber-journey"),
  "runSubscriberJourneyFromEnvironment"
>;

export const preparePublicAuthStartFromEnvironment = (
  environment: unknown,
  input: Pick<
    PublicWebAuthStartInput,
    "correlationId" | "host" | "tenantHint" | "tenantScopeHint"
  >,
): Effect.Effect<
  PublicAuthStartPreparation,
  PublicAuthStartPreparationError | SubscriberJourneyRuntimeLoadError
> =>
  loadSubscriberJourneyRuntime().pipe(
    Effect.flatMap(({ runSubscriberJourneyFromEnvironment }) =>
      mapUnleashInitializationToRuntimeLoad(
        runSubscriberJourneyFromEnvironment(environment, (service) =>
          service.preparePublicAuthStart(input),
        ),
      ),
    ),
  );

type PreparePublicAuthStart = (
  input: Pick<
    PublicWebAuthStartInput,
    "correlationId" | "host" | "tenantHint" | "tenantScopeHint"
  >,
) => Effect.Effect<
  PublicAuthStartPreparation,
  PublicAuthStartPreparationError | SubscriberJourneyRuntimeLoadError
>;

export const buildPublicWebAuthStartInputFromEnvironment = (
  environment: unknown,
  input: PublicWebAuthStartInput,
  preparePublicAuthStart?: PreparePublicAuthStart,
): Effect.Effect<
  IdentitySessionStartInput,
  | PublicAuthStartPreparationError
  | ProductAppAuthCallbackRedirectNotAllowedError
  | ProductAppAuthCallbackStateInvalidError
  | SubscriberJourneyRuntimeLoadError
> =>
  Schema.decodeUnknown(PublicWebAuthStartInputSchema)(input).pipe(
    Effect.flatMap((decodedInput) => {
      const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
      const prepareAuthStart =
        preparePublicAuthStart ??
        ((prepareInput) =>
          preparePublicAuthStartFromEnvironment(environment, prepareInput));

      return Effect.all({
        redirectUri:
          resolveProductAppAuthCallbackRedirectUriFromEnvironment(environment),
        authStartPreparation: prepareAuthStart({
          ...(decodedInput.correlationId !== undefined
            ? { correlationId: decodedInput.correlationId }
            : {}),
          host: decodedInput.host,
          ...(decodedInput.tenantHint !== undefined
            ? { tenantHint: decodedInput.tenantHint }
            : {}),
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
            ...(decodedInput.postAuthRedirectPath !== undefined
              ? {
                  postAuthRedirectPath: decodedInput.postAuthRedirectPath,
                }
              : {}),
            tenant: authStartPreparation.tenant,
            enabledModules: [...authStartPreparation.enabledModules],
            expiresAt,
          }).pipe(
            Effect.map((state) => ({
              requestContext: authStartPreparation.requestContext,
              redirectUri,
              state,
              displayNameHint:
                authStartPreparation.snapshot.branding.companyName,
              themeHint:
                authStartPreparation.snapshot.branding.projection.themeTokens
                  .primary,
              ...(decodedInput.tenantHint !== undefined
                ? { tenantHint: decodedInput.tenantHint }
                : {}),
            })),
          ),
        ),
      );
    }),
  );

export const resolveProductAuthCallbackCorrelationIdFromEnvironment = (
  environment: unknown,
  state: string | undefined,
) => {
  if (state === undefined) {
    return Promise.resolve(undefined);
  }

  return Effect.runPromise(
    decodeProductAppAuthCallbackStatePayloadFromEnvironment(
      environment,
      state,
    ).pipe(
      Effect.match({
        onFailure: () => undefined,
        onSuccess: (statePayload) => statePayload.correlationId,
      }),
    ),
  );
};

export const buildSubscriberAuthenticationCompletionInputFromEnvironment = (
  environment: unknown,
  input: ProductAuthCallbackCompletionInput,
): Effect.Effect<
  {
    readonly completionInput: IdentitySessionCompletionInput;
    readonly postAuthRedirectPath?: string;
  },
  | ParseResult.ParseError
  | ProductAppAuthCallbackRedirectNotAllowedError
  | ProductAppAuthCallbackStateExpiredError
  | ProductAppAuthCallbackStateInvalidError
> =>
  Schema.decodeUnknown(ProductAuthCallbackCompletionInputSchema)(input).pipe(
    Effect.flatMap((decodedInput) =>
      decodeProductAppAuthCallbackStateFromEnvironment(
        environment,
        decodedInput.state,
      ).pipe(
        Effect.flatMap((statePayload) =>
          statePayload.redirectUri === decodedInput.callbackRequestUri
            ? Effect.succeed({
                completionInput: {
                  session: {
                    authorizationCode: decodedInput.authorizationCode,
                    redirectUri: statePayload.redirectUri,
                  },
                  correlationId:
                    decodedInput.correlationId ?? statePayload.correlationId,
                  host: decodedInput.host,
                  tenant: statePayload.tenant,
                  enabledModules: [...statePayload.enabledModules],
                },
                ...(statePayload.postAuthRedirectPath !== undefined
                  ? {
                      postAuthRedirectPath: statePayload.postAuthRedirectPath,
                    }
                  : {}),
              })
            : Effect.fail({
                _tag: "ProductAppAuthCallbackStateInvalidError",
                reason:
                  "State redirect URI did not match the callback request.",
              } as const),
        ),
      ),
    ),
  );

const loadSubscriberJourneyRuntime = () =>
  loadRuntimeModule<
    SubscriberJourneyRuntimeModule,
    SubscriberJourneyRuntimeLoadError
  >({
    load: () => import("../domains/subscriber-journey"),
    mapError: (cause): SubscriberJourneyRuntimeLoadError =>
      ({
        _tag: "SubscriberJourneyRuntimeLoadError",
        cause,
      }) satisfies SubscriberJourneyRuntimeLoadError,
  });

const mapUnleashInitializationToRuntimeLoad = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  | Exclude<E, SubscriberJourneyDomainRuntimeError>
  | SubscriberJourneyRuntimeLoadError
> =>
  effect.pipe(
    Effect.mapError((cause) =>
      typeof cause === "object" &&
      cause !== null &&
      "_tag" in cause &&
      cause._tag === "SubscriberJourneyRuntimeError"
        ? ({
            _tag: "SubscriberJourneyRuntimeLoadError",
            cause,
          } satisfies SubscriberJourneyRuntimeLoadError)
        : (cause as Exclude<E, SubscriberJourneyDomainRuntimeError>),
    ),
  ) as Effect.Effect<
    A,
    | Exclude<E, SubscriberJourneyDomainRuntimeError>
    | SubscriberJourneyRuntimeLoadError
  >;

export const listPublicBillingPlansFromEnvironment = (environment: unknown) =>
  loadSubscriberJourneyRuntime().pipe(
    Effect.flatMap(({ runSubscriberJourneyFromEnvironment }) =>
      mapUnleashInitializationToRuntimeLoad(
        runSubscriberJourneyFromEnvironment(
          environment,
          (service) => service.listPublicPlans,
        ),
      ),
    ),
  );

export const resolveSubscriberRequestContextFromEnvironment = (
  environment: unknown,
  input: IdentitySessionRequestContextLookup,
) =>
  loadSubscriberJourneyRuntime().pipe(
    Effect.flatMap(({ runSubscriberJourneyFromEnvironment }) =>
      mapUnleashInitializationToRuntimeLoad(
        runSubscriberJourneyFromEnvironment(environment, (service) =>
          service.resolveRequestContext(input),
        ),
      ),
    ),
  );

type ResolveSubscriberRequestContext = (
  input: IdentitySessionRequestContextLookup,
) => ReturnType<typeof resolveSubscriberRequestContextFromEnvironment>;

export const resolveSubscriberRequestContextFromSessionId = (
  environment: unknown,
  input: IdentitySessionRequestContextLookup,
  resolveSubscriberRequestContext: ResolveSubscriberRequestContext = (input) =>
    resolveSubscriberRequestContextFromEnvironment(environment, input),
) => resolveSubscriberRequestContext(input);

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
          mapUnleashInitializationToRuntimeLoad(
            runSubscriberJourneyFromEnvironment(environment, (service) =>
              service.startAuthentication(input),
            ),
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
  | PublicAuthStartPreparationError
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
      mapUnleashInitializationToRuntimeLoad(
        runSubscriberJourneyFromEnvironment(environment, (service) =>
          service.completeAuthentication(input),
        ),
      ),
    ),
  );

export const invalidateSubscriberSessionFromEnvironment = (
  environment: unknown,
  input: IdentitySessionInvalidationInput,
) =>
  loadSubscriberJourneyRuntime().pipe(
    Effect.flatMap(({ runSubscriberJourneyFromEnvironment }) =>
      mapUnleashInitializationToRuntimeLoad(
        runSubscriberJourneyFromEnvironment(environment, (service) =>
          service.invalidateSession(input),
        ),
      ),
    ),
  );

export type InvalidateSubscriberSessionFromRequestInput = {
  readonly request: Request;
  readonly correlationId: string;
  readonly reason: IdentitySessionInvalidationReason;
};

type InvalidateSubscriberSession = (
  input: IdentitySessionInvalidationInput,
) => ReturnType<typeof invalidateSubscriberSessionFromEnvironment>;

export const invalidateSubscriberSessionFromRequest = (
  environment: unknown,
  input: InvalidateSubscriberSessionFromRequestInput,
  invalidateSubscriberSession: InvalidateSubscriberSession = (
    invalidationInput,
  ) =>
    invalidateSubscriberSessionFromEnvironment(environment, invalidationInput),
) =>
  extractSubscriberJourneySessionId(input.request).pipe(
    Effect.flatMap((sessionId) =>
      sessionId === undefined
        ? Effect.succeed(undefined)
        : invalidateSubscriberSession({
            sessionId,
            correlationId: input.correlationId,
            reason: input.reason,
          }),
    ),
  );

export const createSubscriberCheckoutSessionFromEnvironment = (
  environment: unknown,
  input: BillingCheckoutSessionInput,
) =>
  loadSubscriberJourneyRuntime().pipe(
    Effect.flatMap(({ runSubscriberJourneyFromEnvironment }) =>
      mapUnleashInitializationToRuntimeLoad(
        runSubscriberJourneyFromEnvironment(environment, (service) =>
          service.createCheckoutSession(input),
        ),
      ),
    ),
  );

export type SubscriberCheckoutSessionFromRequestInput = {
  readonly request: Request;
  readonly planId: string;
  readonly priceId: string;
} & (
  | {
      readonly successPath: string;
      readonly cancelPath: string;
    }
  | {
      readonly successUrl: string;
      readonly cancelUrl: string;
    }
);

type CreateSubscriberCheckoutSession = (
  input: BillingCheckoutSessionInput,
) => ReturnType<typeof createSubscriberCheckoutSessionFromEnvironment>;

const decodeFirstPartyCheckoutReturnPath = Schema.decodeUnknown(
  ProductAppPostAuthRedirectPathSchema,
);

export const createSubscriberCheckoutSessionFromRequest = (
  environment: unknown,
  input: SubscriberCheckoutSessionFromRequestInput,
  resolveSubscriberRequestContext: ResolveSubscriberRequestContext = (
    requestContextInput,
  ) =>
    resolveSubscriberRequestContextFromEnvironment(
      environment,
      requestContextInput,
    ),
  createSubscriberCheckoutSession: CreateSubscriberCheckoutSession = (
    checkoutInput,
  ) =>
    createSubscriberCheckoutSessionFromEnvironment(environment, checkoutInput),
) =>
  extractRequiredSubscriberJourneySessionId(input.request).pipe(
    Effect.flatMap((sessionId) =>
      resolveSubscriberRequestContext({ sessionId }),
    ),
    Effect.flatMap((requestContext) =>
      "successPath" in input
        ? Effect.all({
            successPath: decodeFirstPartyCheckoutReturnPath(input.successPath),
            cancelPath: decodeFirstPartyCheckoutReturnPath(input.cancelPath),
          }).pipe(
            Effect.map(({ successPath, cancelPath }) => ({
              requestContext,
              successUrl: new URL(successPath, input.request.url).toString(),
              cancelUrl: new URL(cancelPath, input.request.url).toString(),
            })),
          )
        : Effect.succeed({
            requestContext,
            successUrl: input.successUrl,
            cancelUrl: input.cancelUrl,
          }),
    ),
    Effect.flatMap(({ requestContext, successUrl, cancelUrl }) =>
      createSubscriberCheckoutSession({
        planId: input.planId,
        priceId: input.priceId,
        successUrl,
        cancelUrl,
        tenantScope: requestContext.tenant.scope,
        tenantScopeId: requestContext.tenant.scopeId,
        ...(requestContext.tenant.enterpriseId !== undefined
          ? { enterpriseId: requestContext.tenant.enterpriseId }
          : {}),
        ...(requestContext.tenant.organizationId !== undefined
          ? { organizationId: requestContext.tenant.organizationId }
          : {}),
        ...(requestContext.tenant.individualId !== undefined
          ? { individualId: requestContext.tenant.individualId }
          : {}),
      }),
    ),
  );

export const buildProductBootstrapFromEnvironment = (
  environment: unknown,
  input: SubscriberJourneyBootstrapInput,
) =>
  loadSubscriberJourneyRuntime().pipe(
    Effect.flatMap(({ runSubscriberJourneyFromEnvironment }) =>
      mapUnleashInitializationToRuntimeLoad(
        runSubscriberJourneyFromEnvironment(environment, (service) =>
          service.buildProductBootstrap(input),
        ),
      ),
    ),
  );

type BuildProductBootstrap = (
  input: SubscriberJourneyBootstrapInput,
) => ReturnType<typeof buildProductBootstrapFromEnvironment>;

export const buildProductBootstrapFromSessionId = (
  environment: unknown,
  input: SubscriberJourneyBootstrapInput,
  buildProductBootstrap: BuildProductBootstrap = (input) =>
    buildProductBootstrapFromEnvironment(environment, input),
) => buildProductBootstrap(input);
