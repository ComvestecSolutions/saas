import { Effect, ParseResult, Schema } from "effect";
import { AbsoluteRedirectUriSchema } from "@comvestec/contracts";
import {
  createJsonResponse,
  decodeProductBillingCheckoutHandoffTokenFromEnvironment,
  createObservedPlatformRequestBoundary,
  createSubscriberCheckoutSessionFromRequest,
  isTaggedError,
  matchHttpEffect,
  readOptionalSearchParam,
  validatePublicWebBillingReturnUrlFromEnvironment,
} from "@comvestec/platform";

const productBillingCheckoutTelemetryServiceName =
  "product-app-billing-checkout";

const ProductBillingCheckoutQuerySchema = Schema.Struct({
  handoff: Schema.optional(Schema.NonEmptyString),
  planId: Schema.optional(Schema.NonEmptyString),
  priceId: Schema.optional(Schema.NonEmptyString),
  successUrl: Schema.optional(AbsoluteRedirectUriSchema),
  cancelUrl: Schema.optional(AbsoluteRedirectUriSchema),
});

type ProductBillingCheckoutQuery = Schema.Schema.Type<
  typeof ProductBillingCheckoutQuerySchema
>;

type ProductBillingCheckoutQueryParseError = {
  readonly _tag: "ProductBillingCheckoutQueryParseError";
};

type ProductBillingCheckoutReturnUrlsInvalidError = {
  readonly _tag: "ProductBillingCheckoutReturnUrlsInvalidError";
};

type ProductBillingCheckoutReturnInput =
  | {
      readonly planId: string;
      readonly priceId: string;
      readonly successPath: "/billing/success";
      readonly cancelPath: "/billing/cancel";
    }
  | {
      readonly planId: string;
      readonly priceId: string;
      readonly successUrl: string;
      readonly cancelUrl: string;
    };

type StartSubscriberCheckout = (
  input: Parameters<typeof createSubscriberCheckoutSessionFromRequest>[1],
) => ReturnType<typeof createSubscriberCheckoutSessionFromRequest>;

const decodeProductBillingCheckoutQuery = (url: URL) =>
  Schema.decodeUnknown(ProductBillingCheckoutQuerySchema)({
    handoff: readOptionalSearchParam(url, "handoff"),
    planId: readOptionalSearchParam(url, "planId"),
    priceId: readOptionalSearchParam(url, "priceId"),
    successUrl: readOptionalSearchParam(url, "successUrl"),
    cancelUrl: readOptionalSearchParam(url, "cancelUrl"),
  }).pipe(
    Effect.flatMap((query) => {
      const usesHandoff = query.handoff !== undefined;
      const hasDirectPlanSelection =
        query.planId !== undefined || query.priceId !== undefined;
      const hasDirectReturnOverrides =
        query.successUrl !== undefined || query.cancelUrl !== undefined;

      if (usesHandoff) {
        return hasDirectPlanSelection || hasDirectReturnOverrides
          ? Effect.fail({
              _tag: "ProductBillingCheckoutQueryParseError",
            } as const)
          : Effect.succeed(query);
      }

      return query.planId !== undefined && query.priceId !== undefined
        ? Effect.succeed(query)
        : Effect.fail({
            _tag: "ProductBillingCheckoutQueryParseError",
          } as const);
    }),
  ) as Effect.Effect<
    ProductBillingCheckoutQuery,
    ParseResult.ParseError | ProductBillingCheckoutQueryParseError
  >;

const resolveProductBillingCheckoutReturnInput = (
  environment: unknown,
  query: ProductBillingCheckoutQuery,
): Effect.Effect<
  ProductBillingCheckoutReturnInput,
  | ParseResult.ParseError
  | ProductBillingCheckoutQueryParseError
  | {
      readonly _tag: "ProductBillingCheckoutHandoffInvalidError";
      readonly reason: string;
    }
  | {
      readonly _tag: "ProductBillingCheckoutHandoffExpiredError";
      readonly expiresAt: string;
    }
  | ProductBillingCheckoutReturnUrlsInvalidError
  | {
      readonly _tag: "PublicWebBillingReturnUrlMismatchError";
    }
> => {
  if (query.handoff !== undefined) {
    return decodeProductBillingCheckoutHandoffTokenFromEnvironment(
      environment,
      query.handoff,
    ).pipe(
      Effect.flatMap((handoffPayload) =>
        Effect.all({
          successUrl: validatePublicWebBillingReturnUrlFromEnvironment(
            environment,
            {
              returnKind: "success",
              returnUrl: handoffPayload.successUrl,
            },
          ),
          cancelUrl: validatePublicWebBillingReturnUrlFromEnvironment(
            environment,
            {
              returnKind: "cancel",
              returnUrl: handoffPayload.cancelUrl,
            },
          ),
        }).pipe(
          Effect.map(({ successUrl, cancelUrl }) => ({
            planId: handoffPayload.planId,
            priceId: handoffPayload.priceId,
            successUrl,
            cancelUrl,
          })),
        ),
      ),
    );
  }

  const planId = query.planId;
  const priceId = query.priceId;

  if (planId === undefined || priceId === undefined) {
    return Effect.fail({
      _tag: "ProductBillingCheckoutQueryParseError",
    } as const);
  }

  if (query.successUrl === undefined && query.cancelUrl === undefined) {
    return Effect.succeed({
      planId,
      priceId,
      successPath: "/billing/success",
      cancelPath: "/billing/cancel",
    } as const);
  }

  if (query.successUrl === undefined || query.cancelUrl === undefined) {
    return Effect.fail({
      _tag: "ProductBillingCheckoutReturnUrlsInvalidError",
    } as const);
  }

  return Effect.all({
    successUrl: validatePublicWebBillingReturnUrlFromEnvironment(environment, {
      returnKind: "success",
      returnUrl: query.successUrl,
    }),
    cancelUrl: validatePublicWebBillingReturnUrlFromEnvironment(environment, {
      returnKind: "cancel",
      returnUrl: query.cancelUrl,
    }),
  }).pipe(
    Effect.map(({ successUrl, cancelUrl }) => ({
      planId,
      priceId,
      successUrl,
      cancelUrl,
    })),
  );
};

const buildBillingCheckoutRouteErrorResponse = (error: unknown) => {
  if (isTaggedError(error)) {
    switch (error._tag) {
      case "ProductBillingCheckoutQueryParseError":
      case "ProductBillingCheckoutHandoffInvalidError":
      case "ProductBillingCheckoutHandoffExpiredError":
      case "ProductBillingCheckoutReturnUrlsInvalidError":
      case "PublicWebBillingReturnUrlMismatchError":
        return createJsonResponse(
          {
            error:
              "Checkout query or return URLs did not match the expected contract.",
          },
          400,
        );
      case "ParseError":
        return createJsonResponse(
          {
            error:
              "Product billing checkout is misconfigured or failed validation at the backend boundary.",
          },
          500,
        );
      case "SubscriberJourneySessionIdMissingError":
      case "IdentitySessionRequestContextNotFoundError":
        return createJsonResponse(
          {
            error:
              "An authenticated subscriber session is required before checkout can start.",
          },
          401,
        );
      case "PolarPlanNotFoundError":
      case "PolarPriceNotFoundError":
        return createJsonResponse(
          {
            error:
              "The requested plan or price was not found in the billing catalog.",
          },
          404,
        );
      case "PolarCatalogMetadataError":
        return createJsonResponse(
          {
            error:
              "The requested billing catalog entry could not be mapped to the shared contract.",
          },
          422,
        );
      case "ConvexAdapterRequestError":
      case "KeycloakAdapterRequestError":
      case "OryKetoAdapterRequestError":
      case "PolarAdapterRequestError":
      case "PostgresAdapterConnectionError":
      case "SubscriberJourneyRuntimeLoadError":
      case "ValkeyAdapterOperationError":
      case "WorkflowJobsPostgresRepositoryQueryError":
        return createJsonResponse(
          {
            error:
              "A backend dependency request failed while starting checkout.",
          },
          502,
        );
    }
  }

  return createJsonResponse({ error: "Product billing checkout failed." }, 500);
};

const buildBillingCheckoutUnhandledErrorResponse = (input: {
  readonly correlationHeaderName: string;
  readonly correlationId: string;
}) =>
  Response.json(
    { error: "Product billing checkout failed." },
    {
      status: 500,
      headers: {
        [input.correlationHeaderName]: input.correlationId,
      },
    },
  );

export const handleProductBillingCheckoutRequest = (
  environment: unknown,
  request: Request,
  startSubscriberCheckout: StartSubscriberCheckout = (input) =>
    createSubscriberCheckoutSessionFromRequest(environment, input),
) => {
  const requestBoundary = createObservedPlatformRequestBoundary({
    environment,
    serviceName: productBillingCheckoutTelemetryServiceName,
    buildUnhandledErrorResponse: buildBillingCheckoutUnhandledErrorResponse,
  });

  return requestBoundary.wrap((currentRequest) => {
    const requestUrl = new URL(currentRequest.url);

    return Effect.runPromise(
      matchHttpEffect({
        effect: decodeProductBillingCheckoutQuery(requestUrl).pipe(
          Effect.mapError(
            (): ProductBillingCheckoutQueryParseError => ({
              _tag: "ProductBillingCheckoutQueryParseError",
            }),
          ),
          Effect.flatMap((query) =>
            resolveProductBillingCheckoutReturnInput(environment, query).pipe(
              Effect.flatMap((returnInput) =>
                startSubscriberCheckout(
                  "successPath" in returnInput
                    ? {
                        request: currentRequest,
                        planId: returnInput.planId,
                        priceId: returnInput.priceId,
                        successPath: returnInput.successPath,
                        cancelPath: returnInput.cancelPath,
                      }
                    : {
                        request: currentRequest,
                        planId: returnInput.planId,
                        priceId: returnInput.priceId,
                        successUrl: returnInput.successUrl,
                        cancelUrl: returnInput.cancelUrl,
                      },
                ),
              ),
            ),
          ),
        ),
        onFailure: buildBillingCheckoutRouteErrorResponse,
        onSuccess: (checkoutSession) =>
          Response.redirect(checkoutSession.checkoutUrl, 302),
      }),
    );
  })(request);
};
