import { HTTPClient, Polar } from "@polar-sh/sdk";
import {
  validateEvent,
  WebhookVerificationError,
} from "@polar-sh/sdk/webhooks";
import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  BillingCheckoutSessionInputSchema,
  BillingCheckoutSessionSchema,
  BillingEntitlementItemSchema,
  BillingPlanCreateInputSchema,
  BillingPlanCreateResultSchema,
  billingPlanIntervals,
  billingPlanVisibility,
  billingPlanVisibilities,
  BillingPlanSchema,
  billingSubscriptionStatus,
  billingWebhookEventType,
  billingWebhookReconciliationAction,
  BillingProviderWebhookInputSchema,
  BillingWebhookReconciliationSchema,
  PlatformScopeSchema,
  PublicBillingPlanCatalogSchema,
} from "@comvestec/contracts";
import type {
  BillingCheckoutSession,
  BillingCheckoutSessionInput,
  BillingPlan,
  BillingPlanCreateInput,
  BillingPlanCreateResult,
  BillingPlanInterval,
  BillingPlanVisibility,
  BillingProviderWebhookInput,
  BillingSubscriptionStatus,
  BillingWebhookEventType,
  BillingWebhookReconciliation,
  PublicBillingPlanCatalog,
} from "@comvestec/contracts";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";
import {
  buildPolarCatalogProductMetadata,
  buildPolarCheckoutMetadata,
  polarMetadataKey,
  polarWebhookMetadataField,
  readPolarCatalogProductEntitlements,
  type PolarCatalogMetadataField,
  type PolarCatalogProductMetadataLookup,
  type PolarCheckoutMetadata,
  type PolarCheckoutMetadataLookup,
  type PolarMetadataKey,
} from "./polar-metadata";

const PolarAdapterRuntimeOptionsSchema = Schema.Struct({
  apiKey: Schema.NonEmptyString,
  apiUrl: Schema.NonEmptyString,
});

type PolarAdapterRuntimeOptions = Schema.Schema.Type<
  typeof PolarAdapterRuntimeOptionsSchema
>;

export type PolarAdapterOptions = PolarAdapterRuntimeOptions & {
  readonly fetch?: typeof fetch;
  readonly sdkClient?: PolarAdapterSdkClient;
};

type PolarSdkPrice = {
  readonly id: string;
  readonly priceCurrency?: string;
  readonly priceAmount?: number;
  readonly recurringInterval?: string | null;
  readonly isArchived: boolean;
};

type PolarSdkProduct = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly recurringInterval?: string | null;
  readonly recurringIntervalCount?: number | null;
  readonly visibility?: PolarSdkProductVisibility;
  readonly isArchived: boolean;
  readonly metadata?: PolarCatalogProductMetadataLookup;
  readonly prices: readonly PolarSdkPrice[];
};

type PolarSdkProductListPage = {
  readonly result: {
    readonly items: readonly PolarSdkProduct[];
  };
};

type PolarSdkCheckout = {
  readonly id: string;
  readonly url: string;
  readonly expiresAt: Date | string;
};

type PolarSdkProductVisibility = string;

type PolarSdkListProductsRequest = {
  readonly isArchived?: boolean | null;
  readonly isRecurring?: boolean | null;
  readonly visibility?: PolarSdkProductVisibility[] | null;
  readonly limit?: number;
};

type PolarSdkCreateCheckoutRequest = {
  readonly products: string[];
  readonly successUrl?: string | null;
  readonly returnUrl?: string | null;
  readonly externalCustomerId?: string | null;
  readonly metadata?: PolarCheckoutMetadata;
};

type PolarSdkCreateProductPriceRequest = {
  readonly amountType: "fixed";
  readonly priceCurrency?: string;
  readonly priceAmount: number;
};

type PolarSdkCreateProductRequest = {
  readonly metadata?: PolarCatalogProductMetadataLookup;
  readonly name: string;
  readonly description?: string | null;
  readonly visibility?: PolarSdkProductVisibility;
  readonly prices: PolarSdkCreateProductPriceRequest[];
  readonly organizationId?: string | null;
  readonly recurringInterval: string;
  readonly recurringIntervalCount?: number;
};

type PolarSdkUpdateProductPriceRequest =
  | PolarSdkCreateProductPriceRequest
  | {
      readonly id: string;
    };

type PolarSdkUpdateProductRequest = {
  readonly id: string;
  readonly productUpdate: {
    readonly metadata?: PolarCatalogProductMetadataLookup;
    readonly name?: string | null;
    readonly description?: string | null;
    readonly visibility?: PolarSdkProductVisibility | null;
    readonly prices?: PolarSdkUpdateProductPriceRequest[] | null;
    readonly recurringInterval?: string | null;
    readonly recurringIntervalCount?: number | null;
    readonly isArchived?: boolean | null;
  };
};

type PolarSdkProductListResult = AsyncIterable<PolarSdkProductListPage>;

type PolarSdkCustomer = {
  readonly id: string;
  readonly externalId: string | null;
  readonly email: string | null;
};

type PolarSdkSubscription = {
  readonly id: string;
  readonly productId: string;
  readonly customerId: string;
  readonly status: string;
  readonly currentPeriodEnd: Date | string | null;
  readonly endsAt: Date | string | null;
  readonly canceledAt: Date | string | null;
  readonly prices: readonly {
    readonly id: string;
    readonly isArchived?: boolean;
  }[];
};

type PolarSdkSubscriptionListPage = {
  readonly result: {
    readonly items: readonly PolarSdkSubscription[];
  };
};

type PolarSdkSubscriptionListResult =
  AsyncIterable<PolarSdkSubscriptionListPage>;

export type PolarActiveSubscriptionLookup = {
  readonly customerId: string;
  readonly subscriptionId: string;
  readonly planId: string;
  readonly priceId: string;
  readonly status: BillingSubscriptionStatus;
  readonly currentPeriodEnd: string | undefined;
};

export type PolarAdapterSdkClient = {
  readonly products: {
    readonly list: (
      request: PolarSdkListProductsRequest,
    ) => Promise<PolarSdkProductListResult>;
    readonly create: (
      request: PolarSdkCreateProductRequest,
    ) => Promise<PolarSdkProduct>;
    readonly update: (
      request: PolarSdkUpdateProductRequest,
    ) => Promise<PolarSdkProduct>;
  };
  readonly checkouts: {
    readonly create: (
      request: PolarSdkCreateCheckoutRequest,
    ) => Promise<PolarSdkCheckout>;
  };
  readonly customers: {
    readonly getExternal: (externalId: string) => Promise<PolarSdkCustomer>;
  };
  readonly subscriptions: {
    readonly list: (request: {
      readonly customerId?: string;
      readonly active?: boolean;
      readonly limit?: number;
    }) => Promise<PolarSdkSubscriptionListResult>;
  };
};

export type PolarAdapterRequestError = {
  readonly _tag: "PolarAdapterRequestError";
  readonly operation:
    | "healthcheck"
    | "listPlans"
    | "createManagedBillingPlan"
    | "updateManagedBillingPlan"
    | "archiveManagedBillingPlan"
    | "createCheckoutSession"
    | "reconcileWebhookEvent"
    | "lookupActiveSubscriptionByExternalCustomerId";
  readonly cause: unknown;
  readonly status?: number;
  readonly body?: string;
};

export type PolarCatalogMetadataError = {
  readonly _tag: "PolarCatalogMetadataError";
  readonly productId: BillingPlan["planId"];
  readonly field: PolarCatalogMetadataField;
  readonly cause: unknown;
};

export type PolarAdapterError =
  | ParseResult.ParseError
  | PolarAdapterRequestError
  | PolarCatalogMetadataError
  | PolarPlanNotFoundError
  | PolarPriceNotFoundError
  | PolarWebhookSignatureError;

export type PolarCatalogError =
  | ParseResult.ParseError
  | PolarAdapterRequestError
  | PolarCatalogMetadataError;

export type PolarManagedBillingPlanError =
  | ParseResult.ParseError
  | PolarAdapterRequestError
  | PolarCatalogMetadataError;

export type PolarCheckoutSessionError =
  | PolarCatalogError
  | PolarPlanNotFoundError
  | PolarPriceNotFoundError;

export type PolarWebhookReconciliationError =
  | PolarCatalogError
  | PolarWebhookSignatureError
  | PolarPlanNotFoundError
  | PolarPriceNotFoundError;

type PolarRequestFailure = {
  readonly cause: unknown;
  readonly status?: number;
  readonly body?: string;
};

const decodeBillingPlan = Schema.decodeUnknown(BillingPlanSchema);

const decodeBillingPlanCreateInput = Schema.decodeUnknown(
  BillingPlanCreateInputSchema,
);

const decodeBillingPlanCreateResult = Schema.decodeUnknown(
  BillingPlanCreateResultSchema,
);

const decodePublicBillingPlanCatalog = Schema.decodeUnknown(
  PublicBillingPlanCatalogSchema,
);

const decodeBillingEntitlements = Schema.decodeUnknown(
  Schema.Array(BillingEntitlementItemSchema),
);

const decodeBillingPlanId = Schema.decodeUnknown(Schema.NonEmptyString);

const buildPolarRequestError = (
  operation: PolarAdapterRequestError["operation"],
  failure: PolarRequestFailure,
): PolarAdapterRequestError => ({
  _tag: "PolarAdapterRequestError",
  operation,
  cause: failure.cause,
  ...(failure.status !== undefined ? { status: failure.status } : {}),
  ...(failure.body !== undefined ? { body: failure.body } : {}),
});

const buildPolarRequestFailure = (cause: unknown): PolarRequestFailure => {
  if (typeof cause !== "object" || cause === null) {
    return { cause };
  }

  const status =
    "statusCode" in cause && typeof cause.statusCode === "number"
      ? cause.statusCode
      : "status" in cause && typeof cause.status === "number"
        ? cause.status
        : undefined;

  const body =
    "body" in cause && typeof cause.body === "string" ? cause.body : undefined;

  return {
    cause,
    ...(status !== undefined ? { status } : {}),
    ...(body !== undefined ? { body } : {}),
  };
};

const normalizePolarSdkServerUrl = (apiUrl: string) => {
  try {
    const parsedUrl = new URL(apiUrl);
    const normalizedPath = parsedUrl.pathname.replace(/\/+$/, "");

    return normalizedPath === "/v1" ? parsedUrl.origin : apiUrl;
  } catch {
    return apiUrl;
  }
};

const createPolarSdkClient = (
  options: PolarAdapterRuntimeOptions,
  input: PolarAdapterOptions,
): PolarAdapterSdkClient => {
  if (input.sdkClient !== undefined) {
    return input.sdkClient;
  }

  const sdk = new Polar({
    accessToken: options.apiKey,
    serverURL: normalizePolarSdkServerUrl(options.apiUrl),
    ...(input.fetch !== undefined
      ? {
          httpClient: new HTTPClient({
            fetcher: input.fetch,
          }),
        }
      : {}),
  });

  return {
    products: {
      list: (request) =>
        sdk.products.list(
          request as never,
        ) as Promise<PolarSdkProductListResult>,
      create: (request) =>
        sdk.products.create(request as never) as Promise<PolarSdkProduct>,
      update: (request) =>
        sdk.products.update(request as never) as Promise<PolarSdkProduct>,
    },
    checkouts: {
      create: (request) => sdk.checkouts.create(request),
    },
    customers: {
      getExternal: (externalId) =>
        sdk.customers.getExternal({ externalId }) as Promise<PolarSdkCustomer>,
    },
    subscriptions: {
      list: (request) =>
        sdk.subscriptions.list(
          request as never,
        ) as Promise<PolarSdkSubscriptionListResult>,
    },
  };
};

const normalizeDescription = (description: unknown) =>
  typeof description === "string" && description.length > 0
    ? description
    : undefined;

const isBillingPlanInterval = (value: unknown): value is BillingPlanInterval =>
  typeof value === "string" &&
  billingPlanIntervals.includes(value as BillingPlanInterval);

const isBillingPlanVisibility = (
  value: unknown,
): value is BillingPlanVisibility =>
  typeof value === "string" &&
  billingPlanVisibilities.includes(value as BillingPlanVisibility);

const buildPolarCatalogMetadataError = (
  productId: BillingPlan["planId"],
  field: PolarCatalogMetadataError["field"],
  cause: unknown,
): PolarCatalogMetadataError => ({
  _tag: "PolarCatalogMetadataError",
  productId,
  field,
  cause,
});

const resolvePriceInterval = (
  product: PolarSdkProduct,
  price: PolarSdkPrice,
): BillingPlanInterval | undefined => {
  if (isBillingPlanInterval(price.recurringInterval)) {
    return price.recurringInterval;
  }

  if (isBillingPlanInterval(product.recurringInterval)) {
    return product.recurringInterval;
  }

  return undefined;
};

const buildBillingPlanPrices = (product: PolarSdkProduct) =>
  product.prices.flatMap((price) => {
    const interval = resolvePriceInterval(product, price);

    if (
      price.isArchived ||
      interval === undefined ||
      typeof price.priceCurrency !== "string" ||
      typeof price.priceAmount !== "number"
    ) {
      return [];
    }

    return [
      {
        priceId: price.id,
        interval,
        currency: price.priceCurrency.toUpperCase(),
        amountMinor: price.priceAmount,
        active: true,
        providerPriceId: price.id,
      },
    ];
  });

const parsePolarEntitlements = (
  productId: BillingPlan["planId"],
  serializedEntitlements: string,
) =>
  Effect.try({
    try: () => JSON.parse(serializedEntitlements),
    catch: (cause) =>
      buildPolarCatalogMetadataError(
        productId,
        polarMetadataKey.entitlements,
        cause,
      ),
  }).pipe(Effect.flatMap(decodeBillingEntitlements));

const buildBillingPlanFromProduct = (product: PolarSdkProduct) => {
  const metadata: PolarCatalogProductMetadataLookup = product.metadata ?? {};
  const planKeyValue = metadata[polarMetadataKey.planKey];
  const entitlementsValue = readPolarCatalogProductEntitlements(metadata);

  if (typeof planKeyValue !== "string" || planKeyValue.length === 0) {
    return Effect.fail(
      buildPolarCatalogMetadataError(
        product.id,
        polarMetadataKey.planKey,
        planKeyValue,
      ),
    );
  }

  if (typeof entitlementsValue !== "string" || entitlementsValue.length === 0) {
    return Effect.fail(
      buildPolarCatalogMetadataError(
        product.id,
        polarMetadataKey.entitlements,
        entitlementsValue,
      ),
    );
  }

  return parsePolarEntitlements(product.id, entitlementsValue).pipe(
    Effect.flatMap((entitlements) =>
      decodeBillingPlan({
        planId: product.id,
        planKey: planKeyValue,
        displayName: product.name,
        ...(normalizeDescription(product.description) !== undefined
          ? { description: normalizeDescription(product.description) }
          : {}),
        active: !product.isArchived,
        prices: buildBillingPlanPrices(product),
        entitlements,
      }),
    ),
  );
};

const matchesManagedPlanCreateInput = (
  product: PolarSdkProduct,
  input: BillingPlanCreateInput,
) => {
  const metadata: PolarCatalogProductMetadataLookup = product.metadata ?? {};
  const productVisibility = isBillingPlanVisibility(product.visibility)
    ? product.visibility
    : billingPlanVisibility.public;

  return (
    !product.isArchived &&
    metadata[polarMetadataKey.planKey] === input.planKey &&
    productVisibility === input.visibility
  );
};

const buildManagedProductMetadata = (input: BillingPlanCreateInput) =>
  buildPolarCatalogProductMetadata({
    planKey: input.planKey,
    entitlements: JSON.stringify(input.entitlements),
  });

const buildManagedProductPriceRequest = (input: BillingPlanCreateInput) => ({
  amountType: "fixed" as const,
  priceCurrency: input.price.currency.toLowerCase(),
  priceAmount: input.price.amountMinor,
});

const buildManagedProductCreateRequest = (input: BillingPlanCreateInput) => ({
  metadata: buildManagedProductMetadata(input),
  name: input.displayName,
  ...(input.description !== undefined
    ? { description: input.description }
    : {}),
  visibility: input.visibility,
  prices: [buildManagedProductPriceRequest(input)],
  ...(input.organizationId !== undefined
    ? { organizationId: input.organizationId }
    : {}),
  recurringInterval: input.price.interval,
  ...(input.recurringIntervalCount !== undefined
    ? { recurringIntervalCount: input.recurringIntervalCount }
    : {}),
});

const buildManagedProductUpdateRequest = (input: BillingPlanCreateInput) => ({
  metadata: buildManagedProductMetadata(input),
  name: input.displayName,
  ...(input.description !== undefined
    ? { description: input.description }
    : {}),
  visibility: input.visibility,
  prices: [buildManagedProductPriceRequest(input)],
});

const buildBillingPlanCreateResult = (
  product: PolarSdkProduct,
  fallbackVisibility: BillingPlanVisibility,
) =>
  buildBillingPlanFromProduct(product).pipe(
    Effect.flatMap((plan) =>
      decodeBillingPlanCreateResult({
        plan,
        visibility: product.visibility ?? fallbackVisibility,
        provider: platformAdapterServiceName.polar,
      }),
    ),
  );

export type PolarPlanNotFoundError = {
  readonly _tag: "PolarPlanNotFoundError";
  readonly planId: BillingPlan["planId"];
};

export type PolarPriceNotFoundError = {
  readonly _tag: "PolarPriceNotFoundError";
  readonly planId: BillingPlan["planId"];
  readonly priceId: BillingPlan["prices"][number]["priceId"];
};

export type PolarWebhookSignatureError = {
  readonly _tag: "PolarWebhookSignatureError";
  readonly deliveryId: BillingProviderWebhookInput["deliveryId"];
};

export type PolarWebhookPayloadMappingError = {
  readonly _tag: "PolarWebhookPayloadMappingError";
  readonly deliveryId: string;
  readonly eventType: string;
  readonly field: string;
  readonly cause: unknown;
};

type PolarWebhookMetadata = PolarCheckoutMetadataLookup;

type PolarWebhookCustomer = {
  readonly externalId?: string | null;
};

type PolarWebhookOrderSubscription = {
  readonly id: string;
  readonly currentPeriodEnd: Date;
  readonly endsAt: Date | null;
  readonly canceledAt: Date | null;
};

type PolarWebhookOrderItem = {
  readonly productPriceId: string | null;
};

export type PolarWebhookOrderPaidPayload = {
  readonly type: "order.paid";
  readonly timestamp: Date;
  readonly data: {
    readonly id: string;
    readonly billingReason: string;
    readonly subscriptionId: string | null;
    readonly productId: string | null;
    readonly customerId: string;
    readonly metadata: PolarWebhookMetadata;
    readonly customer: PolarWebhookCustomer;
    readonly subscription: PolarWebhookOrderSubscription | null;
    readonly items: readonly PolarWebhookOrderItem[];
  };
};

type PolarWebhookSubscriptionPrice = {
  readonly id: string;
  readonly isArchived?: boolean;
};

export type PolarWebhookSubscriptionPayload = {
  readonly type:
    | "subscription.active"
    | "subscription.canceled"
    | "subscription.past_due"
    | "subscription.revoked"
    | "subscription.uncanceled"
    | "subscription.updated";
  readonly timestamp: Date;
  readonly data: {
    readonly id: string;
    readonly productId: string;
    readonly customerId: string;
    readonly currentPeriodEnd: Date;
    readonly endsAt: Date | null;
    readonly canceledAt: Date | null;
    readonly metadata: PolarWebhookMetadata;
    readonly customer: PolarWebhookCustomer;
    readonly prices: readonly PolarWebhookSubscriptionPrice[];
  };
};

export type PolarWebhookPayload =
  | PolarWebhookOrderPaidPayload
  | PolarWebhookSubscriptionPayload
  | {
      readonly type: string;
      readonly timestamp: Date;
      readonly data: {
        readonly metadata?: PolarWebhookMetadata;
      };
    };

export type PolarWebhookValidationError =
  | ParseResult.ParseError
  | PolarWebhookSignatureError
  | PolarWebhookPayloadMappingError;

const isOrderPaidWebhookPayload = (
  payload: PolarWebhookPayload,
): payload is PolarWebhookOrderPaidPayload => payload.type === "order.paid";

const isSubscriptionWebhookPayload = (
  payload: PolarWebhookPayload,
): payload is PolarWebhookSubscriptionPayload => {
  switch (payload.type) {
    case "subscription.active":
    case "subscription.canceled":
    case "subscription.past_due":
    case "subscription.revoked":
    case "subscription.uncanceled":
    case "subscription.updated":
      return true;
    default:
      return false;
  }
};

const decodePlatformScope = Schema.decodeUnknown(PlatformScopeSchema);

const buildPolarWebhookPayloadMappingError = (
  deliveryId: string,
  eventType: string,
  field: string,
  cause: unknown,
): PolarWebhookPayloadMappingError => ({
  _tag: "PolarWebhookPayloadMappingError",
  deliveryId,
  eventType,
  field,
  cause,
});

const getWebhookMetadataString = (
  metadata: PolarWebhookMetadata,
  key: PolarMetadataKey,
) => {
  const value = metadata[key];

  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const requireWebhookField = (
  value: string | undefined,
  deliveryId: string,
  eventType: string,
  field: string,
) =>
  value !== undefined
    ? Effect.succeed(value)
    : Effect.fail(
        buildPolarWebhookPayloadMappingError(
          deliveryId,
          eventType,
          field,
          "Missing or empty webhook field.",
        ),
      );

const buildSubscriptionWebhookEventId = (
  eventType: string,
  subscriptionId: string,
  timestamp: Date,
) => `${eventType}:${subscriptionId}:${timestamp.toISOString()}`;

const resolveOrderWebhookEventType = (
  billingReason: string,
): BillingWebhookEventType | null => {
  switch (billingReason) {
    case "subscription_create":
      return billingWebhookEventType.checkoutCompleted;
    case "subscription_cycle":
      return billingWebhookEventType.subscriptionRenewed;
    case "subscription_update":
      return billingWebhookEventType.entitlementUpdated;
    default:
      return null;
  }
};

const resolveSubscriptionWebhookEventType = (
  eventType: PolarWebhookSubscriptionPayload["type"],
): BillingWebhookEventType => {
  switch (eventType) {
    case "subscription.canceled":
    case "subscription.revoked":
      return billingWebhookEventType.subscriptionCanceled;
    case "subscription.past_due":
      return billingWebhookEventType.paymentFailed;
    case "subscription.active":
    case "subscription.uncanceled":
    case "subscription.updated":
      return billingWebhookEventType.entitlementUpdated;
  }
};

const resolveOrderWebhookPriceId = (payload: PolarWebhookOrderPaidPayload) =>
  getWebhookMetadataString(payload.data.metadata, polarMetadataKey.priceId) ??
  payload.data.items.find(
    (item) =>
      typeof item.productPriceId === "string" && item.productPriceId.length > 0,
  )?.productPriceId ??
  undefined;

const resolveSubscriptionWebhookPriceId = (
  payload: PolarWebhookSubscriptionPayload,
) =>
  getWebhookMetadataString(payload.data.metadata, polarMetadataKey.priceId) ??
  payload.data.prices.find((price) => !price.isArchived)?.id ??
  payload.data.prices[0]?.id ??
  undefined;

export const normalizeValidatedPolarWebhookPayload = (
  payload: PolarWebhookPayload,
  deliveryId: string,
) =>
  Effect.gen(function* () {
    if (isOrderPaidWebhookPayload(payload)) {
      const internalEventType = resolveOrderWebhookEventType(
        payload.data.billingReason,
      );

      if (internalEventType === null) {
        return null;
      }

      const tenantScope = yield* requireWebhookField(
        getWebhookMetadataString(
          payload.data.metadata,
          polarMetadataKey.tenantScope,
        ),
        deliveryId,
        payload.type,
        polarWebhookMetadataField.tenantScope,
      ).pipe(Effect.flatMap(decodePlatformScope));
      const tenantScopeId = yield* requireWebhookField(
        getWebhookMetadataString(
          payload.data.metadata,
          polarMetadataKey.tenantScopeId,
        ) ??
          payload.data.customer.externalId ??
          undefined,
        deliveryId,
        payload.type,
        polarWebhookMetadataField.tenantScopeId,
      );
      const subscriptionId = yield* requireWebhookField(
        payload.data.subscriptionId ??
          payload.data.subscription?.id ??
          undefined,
        deliveryId,
        payload.type,
        "data.subscriptionId",
      );
      const planId = yield* requireWebhookField(
        getWebhookMetadataString(
          payload.data.metadata,
          polarMetadataKey.planId,
        ) ??
          payload.data.productId ??
          undefined,
        deliveryId,
        payload.type,
        "data.productId",
      );
      const priceId = yield* requireWebhookField(
        resolveOrderWebhookPriceId(payload),
        deliveryId,
        payload.type,
        "data.items[].productPriceId",
      );

      return yield* Schema.decodeUnknown(BillingProviderWebhookInputSchema)({
        provider: platformAdapterServiceName.polar,
        deliveryId,
        eventId: payload.data.id,
        eventType: internalEventType,
        occurredAt: payload.timestamp.toISOString(),
        verifiedSignature: true,
        subscriptionId,
        tenantScope,
        tenantScopeId,
        planId,
        priceId,
        customerId: payload.data.customerId,
        ...(payload.data.subscription !== null
          ? {
              currentPeriodEnd:
                payload.data.subscription.currentPeriodEnd.toISOString(),
            }
          : {}),
        ...(payload.data.subscription?.endsAt !== null &&
        payload.data.subscription?.endsAt !== undefined
          ? { cancelAt: payload.data.subscription.endsAt.toISOString() }
          : {}),
      });
    }

    if (isSubscriptionWebhookPayload(payload)) {
      const tenantScope = yield* requireWebhookField(
        getWebhookMetadataString(
          payload.data.metadata,
          polarMetadataKey.tenantScope,
        ),
        deliveryId,
        payload.type,
        polarWebhookMetadataField.tenantScope,
      ).pipe(Effect.flatMap(decodePlatformScope));
      const tenantScopeId = yield* requireWebhookField(
        getWebhookMetadataString(
          payload.data.metadata,
          polarMetadataKey.tenantScopeId,
        ) ??
          payload.data.customer.externalId ??
          undefined,
        deliveryId,
        payload.type,
        polarWebhookMetadataField.tenantScopeId,
      );
      const planId = yield* requireWebhookField(
        getWebhookMetadataString(
          payload.data.metadata,
          polarMetadataKey.planId,
        ) ?? payload.data.productId,
        deliveryId,
        payload.type,
        "data.productId",
      );
      const priceId = yield* requireWebhookField(
        resolveSubscriptionWebhookPriceId(payload),
        deliveryId,
        payload.type,
        "data.prices[].id",
      );
      const cancellationTimestamp =
        payload.data.endsAt ?? payload.data.canceledAt;

      return yield* Schema.decodeUnknown(BillingProviderWebhookInputSchema)({
        provider: platformAdapterServiceName.polar,
        deliveryId,
        eventId: buildSubscriptionWebhookEventId(
          payload.type,
          payload.data.id,
          payload.timestamp,
        ),
        eventType: resolveSubscriptionWebhookEventType(payload.type),
        occurredAt: payload.timestamp.toISOString(),
        verifiedSignature: true,
        subscriptionId: payload.data.id,
        tenantScope,
        tenantScopeId,
        planId,
        priceId,
        customerId: payload.data.customerId,
        currentPeriodEnd: payload.data.currentPeriodEnd.toISOString(),
        ...(cancellationTimestamp !== null &&
        cancellationTimestamp !== undefined
          ? {
              cancelAt: cancellationTimestamp.toISOString(),
            }
          : {}),
      });
    }

    return null;
  });

export const validateAndNormalizePolarWebhookRequest = (input: {
  readonly request: Request;
  readonly secret: string;
}) =>
  Effect.tryPromise({
    try: async () => {
      const body = await input.request.text();
      const headers = Object.fromEntries(input.request.headers.entries());
      const deliveryId = input.request.headers.get("webhook-id") ?? "unknown";
      const payload = validateEvent(
        body,
        headers,
        input.secret,
      ) as PolarWebhookPayload;

      return { payload, deliveryId };
    },
    catch: (cause) => {
      const deliveryId = input.request.headers.get("webhook-id") ?? "unknown";

      if (cause instanceof WebhookVerificationError) {
        return {
          _tag: "PolarWebhookSignatureError",
          deliveryId,
        } satisfies PolarWebhookSignatureError;
      }

      return buildPolarWebhookPayloadMappingError(
        deliveryId,
        "unknown",
        "request.body",
        cause,
      );
    },
  }).pipe(
    Effect.flatMap(({ payload, deliveryId }) =>
      normalizeValidatedPolarWebhookPayload(payload, deliveryId),
    ),
  );

const PolarHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.polar,
);

export type PolarHealthcheck = Schema.Schema.Type<
  typeof PolarHealthcheckSchema
>;

const decodePolarHealthcheck = Schema.decodeUnknown(PolarHealthcheckSchema);

export type PolarAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.polar;
  readonly apiUrl: string;
  readonly healthcheck: Effect.Effect<
    PolarHealthcheck,
    ParseResult.ParseError | PolarAdapterRequestError
  >;
  readonly listPlans: Effect.Effect<
    PublicBillingPlanCatalog,
    PolarCatalogError
  >;
  readonly createManagedBillingPlan: (
    input: BillingPlanCreateInput,
  ) => Effect.Effect<BillingPlanCreateResult, PolarManagedBillingPlanError>;
  readonly updateManagedBillingPlan: (
    planId: BillingPlan["planId"],
    input: BillingPlanCreateInput,
  ) => Effect.Effect<BillingPlanCreateResult, PolarManagedBillingPlanError>;
  readonly archiveManagedBillingPlan: (
    planId: BillingPlan["planId"],
  ) => Effect.Effect<BillingPlanCreateResult, PolarManagedBillingPlanError>;
  readonly createCheckoutSession: (
    input: BillingCheckoutSessionInput,
  ) => Effect.Effect<BillingCheckoutSession, PolarCheckoutSessionError>;
  readonly reconcileWebhookEvent: (
    input: BillingProviderWebhookInput,
  ) => Effect.Effect<
    BillingWebhookReconciliation,
    PolarWebhookReconciliationError
  >;
  readonly lookupActiveSubscriptionByExternalCustomerId: (
    externalCustomerId: string,
  ) => Effect.Effect<
    PolarActiveSubscriptionLookup | undefined,
    PolarAdapterRequestError
  >;
};

export class PolarAdapter extends Context.Tag("PolarAdapter")<
  PolarAdapter,
  PolarAdapterService
>() {}

export const makePolarAdapter = (input: PolarAdapterOptions) =>
  Schema.decodeUnknown(PolarAdapterRuntimeOptionsSchema)(input).pipe(
    Effect.map((options): PolarAdapterService => {
      const sdkClient = createPolarSdkClient(options, input);

      const listRecurringProducts = (
        operation: PolarAdapterRequestError["operation"],
        visibility?: readonly BillingPlanVisibility[],
      ) =>
        Effect.tryPromise({
          try: async () => {
            const pages = await sdkClient.products.list({
              isArchived: false,
              isRecurring: true,
              ...(visibility !== undefined
                ? { visibility: [...visibility] }
                : {}),
              limit: 100,
            });
            const products: PolarSdkProduct[] = [];

            for await (const page of pages) {
              products.push(
                ...page.result.items.filter((product) => !product.isArchived),
              );
            }

            return products;
          },
          catch: (cause) =>
            buildPolarRequestError(operation, buildPolarRequestFailure(cause)),
        });

      const listCatalogPlans = (
        operation: PolarAdapterRequestError["operation"],
      ) =>
        listRecurringProducts(operation, [billingPlanVisibility.public]).pipe(
          Effect.flatMap((response) =>
            Effect.forEach(response, buildBillingPlanFromProduct),
          ),
        );

      const findActivePlan = (
        plans: readonly BillingPlan[],
        planId: BillingPlan["planId"],
      ) =>
        plans.find(
          (candidate) => candidate.planId === planId && candidate.active,
        );

      const findActivePrice = (
        plan: BillingPlan,
        priceId: BillingPlan["prices"][number]["priceId"],
      ) =>
        plan.prices.find(
          (candidate) => candidate.priceId === priceId && candidate.active,
        );

      const toSubscriptionStatus = (
        eventType: BillingWebhookEventType,
      ): BillingSubscriptionStatus => {
        switch (eventType) {
          case billingWebhookEventType.checkoutCompleted:
          case billingWebhookEventType.subscriptionRenewed:
          case billingWebhookEventType.entitlementUpdated:
            return billingSubscriptionStatus.active;
          case billingWebhookEventType.subscriptionCanceled:
            return billingSubscriptionStatus.canceled;
          case billingWebhookEventType.paymentFailed:
            return billingSubscriptionStatus.pastDue;
        }
      };

      return {
        serviceName: platformAdapterServiceName.polar,
        apiUrl: options.apiUrl,
        healthcheck: Effect.tryPromise({
          try: async () => {
            const pages = await sdkClient.products.list({ limit: 1 });

            for await (const _page of pages) {
              break;
            }
          },
          catch: (cause) =>
            buildPolarRequestError(
              "healthcheck",
              buildPolarRequestFailure(cause),
            ),
        }).pipe(
          Effect.flatMap(() =>
            decodePolarHealthcheck({
              healthy: true,
              service: platformAdapterServiceName.polar,
            }),
          ),
        ),
        listPlans: listCatalogPlans("listPlans").pipe(
          Effect.flatMap((plans) =>
            decodePublicBillingPlanCatalog(
              plans
                .filter((plan) => plan.active)
                .map((plan) => ({
                  planId: plan.planId,
                  planKey: plan.planKey,
                  displayName: plan.displayName,
                  ...(plan.description !== undefined
                    ? { description: plan.description }
                    : {}),
                  active: plan.active,
                  prices: plan.prices.filter((price) => price.active),
                })),
            ),
          ),
        ),
        createManagedBillingPlan: (planInput: BillingPlanCreateInput) =>
          decodeBillingPlanCreateInput(planInput).pipe(
            Effect.flatMap((decodedInput) =>
              listRecurringProducts("createManagedBillingPlan", [
                decodedInput.visibility,
              ]).pipe(
                Effect.flatMap((products) => {
                  const existingProduct = products.find((product) =>
                    matchesManagedPlanCreateInput(product, decodedInput),
                  );

                  if (existingProduct !== undefined) {
                    return buildBillingPlanCreateResult(
                      existingProduct,
                      decodedInput.visibility,
                    );
                  }

                  return Effect.tryPromise({
                    try: () =>
                      sdkClient.products.create(
                        buildManagedProductCreateRequest(decodedInput),
                      ),
                    catch: (cause) =>
                      buildPolarRequestError(
                        "createManagedBillingPlan",
                        buildPolarRequestFailure(cause),
                      ),
                  }).pipe(
                    Effect.flatMap((product) =>
                      buildBillingPlanCreateResult(
                        product,
                        decodedInput.visibility,
                      ),
                    ),
                  );
                }),
              ),
            ),
          ),
        updateManagedBillingPlan: (
          planId: BillingPlan["planId"],
          planInput: BillingPlanCreateInput,
        ) =>
          decodeBillingPlanId(planId).pipe(
            Effect.flatMap((decodedPlanId) =>
              decodeBillingPlanCreateInput(planInput).pipe(
                Effect.flatMap((decodedInput) =>
                  Effect.tryPromise({
                    try: () =>
                      sdkClient.products.update({
                        id: decodedPlanId,
                        productUpdate:
                          buildManagedProductUpdateRequest(decodedInput),
                      }),
                    catch: (cause) =>
                      buildPolarRequestError(
                        "updateManagedBillingPlan",
                        buildPolarRequestFailure(cause),
                      ),
                  }).pipe(
                    Effect.flatMap((product) =>
                      buildBillingPlanCreateResult(
                        product,
                        decodedInput.visibility,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        archiveManagedBillingPlan: (planId: BillingPlan["planId"]) =>
          decodeBillingPlanId(planId).pipe(
            Effect.flatMap((decodedPlanId) =>
              Effect.tryPromise({
                try: () =>
                  sdkClient.products.update({
                    id: decodedPlanId,
                    productUpdate: {
                      isArchived: true,
                    },
                  }),
                catch: (cause) =>
                  buildPolarRequestError(
                    "archiveManagedBillingPlan",
                    buildPolarRequestFailure(cause),
                  ),
              }).pipe(
                Effect.flatMap((product) =>
                  buildBillingPlanCreateResult(
                    product,
                    isBillingPlanVisibility(product.visibility)
                      ? product.visibility
                      : billingPlanVisibility.public,
                  ),
                ),
              ),
            ),
          ),
        createCheckoutSession: (checkoutInput: BillingCheckoutSessionInput) =>
          Schema.decodeUnknown(BillingCheckoutSessionInputSchema)(
            checkoutInput,
          ).pipe(
            Effect.flatMap((decodedInput) =>
              listCatalogPlans("createCheckoutSession").pipe(
                Effect.flatMap(
                  (
                    plans,
                  ): Effect.Effect<
                    BillingCheckoutSession,
                    PolarCheckoutSessionError
                  > => {
                    const plan = findActivePlan(plans, decodedInput.planId);

                    if (plan === undefined) {
                      return Effect.fail({
                        _tag: "PolarPlanNotFoundError",
                        planId: decodedInput.planId,
                      } satisfies PolarPlanNotFoundError);
                    }

                    const price = findActivePrice(plan, decodedInput.priceId);

                    if (price === undefined) {
                      return Effect.fail({
                        _tag: "PolarPriceNotFoundError",
                        planId: plan.planId,
                        priceId: decodedInput.priceId,
                      } satisfies PolarPriceNotFoundError);
                    }

                    return Effect.tryPromise({
                      try: () =>
                        sdkClient.checkouts.create({
                          products: [plan.planId],
                          successUrl: decodedInput.successUrl,
                          returnUrl: decodedInput.cancelUrl,
                          externalCustomerId: decodedInput.tenantScopeId,
                          metadata: buildPolarCheckoutMetadata({
                            tenantScope: decodedInput.tenantScope,
                            tenantScopeId: decodedInput.tenantScopeId,
                            planId: plan.planId,
                            priceId: price.priceId,
                          }),
                        }),
                      catch: (cause) =>
                        buildPolarRequestError(
                          "createCheckoutSession",
                          buildPolarRequestFailure(cause),
                        ),
                    }).pipe(
                      Effect.flatMap((checkout) =>
                        Schema.decodeUnknown(BillingCheckoutSessionSchema)({
                          checkoutSessionId: checkout.id,
                          checkoutUrl: checkout.url,
                          planId: plan.planId,
                          priceId: price.priceId,
                          interval: price.interval,
                          provider: platformAdapterServiceName.polar,
                          expiresAt:
                            checkout.expiresAt instanceof Date
                              ? checkout.expiresAt.toISOString()
                              : checkout.expiresAt,
                        }),
                      ),
                    );
                  },
                ),
              ),
            ),
          ),
        reconcileWebhookEvent: (webhookInput: BillingProviderWebhookInput) =>
          Schema.decodeUnknown(BillingProviderWebhookInputSchema)(
            webhookInput,
          ).pipe(
            Effect.flatMap((decodedInput) =>
              Effect.gen(function* () {
                if (!decodedInput.verifiedSignature) {
                  return yield* Effect.fail({
                    _tag: "PolarWebhookSignatureError",
                    deliveryId: decodedInput.deliveryId,
                  } satisfies PolarWebhookSignatureError);
                }

                const plans = yield* listCatalogPlans("reconcileWebhookEvent");
                const plan = yield* Effect.fromNullable(
                  findActivePlan(plans, decodedInput.planId),
                ).pipe(
                  Effect.mapError(
                    () =>
                      ({
                        _tag: "PolarPlanNotFoundError",
                        planId: decodedInput.planId,
                      }) satisfies PolarPlanNotFoundError,
                  ),
                );
                const price = yield* Effect.fromNullable(
                  findActivePrice(plan, decodedInput.priceId),
                ).pipe(
                  Effect.mapError(
                    () =>
                      ({
                        _tag: "PolarPriceNotFoundError",
                        planId: plan.planId,
                        priceId: decodedInput.priceId,
                      }) satisfies PolarPriceNotFoundError,
                  ),
                );
                const status = toSubscriptionStatus(decodedInput.eventType);
                const action =
                  decodedInput.eventType ===
                  billingWebhookEventType.checkoutCompleted
                    ? billingWebhookReconciliationAction.activate
                    : decodedInput.eventType ===
                        billingWebhookEventType.subscriptionRenewed
                      ? billingWebhookReconciliationAction.renew
                      : decodedInput.eventType ===
                          billingWebhookEventType.subscriptionCanceled
                        ? billingWebhookReconciliationAction.deactivate
                        : decodedInput.eventType ===
                            billingWebhookEventType.paymentFailed
                          ? billingWebhookReconciliationAction.flagPastDue
                          : billingWebhookReconciliationAction.sync;

                return yield* Schema.decodeUnknown(
                  BillingWebhookReconciliationSchema,
                )({
                  action,
                  event: {
                    provider: decodedInput.provider,
                    deliveryId: decodedInput.deliveryId,
                    eventId: decodedInput.eventId,
                    eventType: decodedInput.eventType,
                    occurredAt: decodedInput.occurredAt,
                    subscriptionId: decodedInput.subscriptionId,
                    tenantScope: decodedInput.tenantScope,
                    tenantScopeId: decodedInput.tenantScopeId,
                    planId: decodedInput.planId,
                    priceId: decodedInput.priceId,
                    customerId: decodedInput.customerId,
                  },
                  subscription: {
                    subscriptionId: decodedInput.subscriptionId,
                    planId: plan.planId,
                    priceId: price.priceId,
                    status,
                    interval: price.interval,
                    currentPeriodEnd: decodedInput.currentPeriodEnd,
                    cancelAt: decodedInput.cancelAt,
                    entitlements: plan.entitlements,
                  },
                  entitlementsActive:
                    status === billingSubscriptionStatus.active,
                });
              }),
            ),
          ),
        lookupActiveSubscriptionByExternalCustomerId: (
          externalCustomerId: string,
        ) =>
          Effect.tryPromise({
            try: async () => {
              let customer: PolarSdkCustomer | undefined;

              try {
                customer =
                  await sdkClient.customers.getExternal(externalCustomerId);
              } catch {
                return undefined;
              }

              if (customer === undefined) {
                return undefined;
              }

              const pages = await sdkClient.subscriptions.list({
                customerId: customer.id,
                active: true,
                limit: 10,
              });
              let subscription: PolarSdkSubscription | undefined;

              for await (const page of pages) {
                const active = page.result.items.find(
                  (s) =>
                    s.status === "active" ||
                    s.status === "trialing" ||
                    s.status === "past_due",
                );

                if (active !== undefined) {
                  subscription = active;
                  break;
                }
              }

              if (subscription === undefined) {
                return undefined;
              }

              const priceId =
                subscription.prices.find((p) => !p.isArchived)?.id ??
                subscription.prices[0]?.id;

              if (priceId === undefined) {
                return undefined;
              }

              const rawStatus = subscription.status;
              const mappedStatus =
                rawStatus === "active" || rawStatus === "trialing"
                  ? billingSubscriptionStatus.active
                  : rawStatus === "past_due"
                    ? billingSubscriptionStatus.pastDue
                    : rawStatus === "canceled" || rawStatus === "revoked"
                      ? billingSubscriptionStatus.canceled
                      : undefined;

              if (mappedStatus === undefined) {
                return undefined;
              }

              const currentPeriodEnd =
                subscription.currentPeriodEnd instanceof Date
                  ? subscription.currentPeriodEnd.toISOString()
                  : typeof subscription.currentPeriodEnd === "string"
                    ? subscription.currentPeriodEnd
                    : undefined;

              return {
                customerId: customer.id,
                subscriptionId: subscription.id,
                planId: subscription.productId,
                priceId,
                status: mappedStatus,
                currentPeriodEnd,
              } satisfies PolarActiveSubscriptionLookup;
            },
            catch: (cause) =>
              buildPolarRequestError(
                "lookupActiveSubscriptionByExternalCustomerId",
                buildPolarRequestFailure(cause),
              ),
          }),
      };
    }),
  );

export const makePolarAdapterLayer = (options: PolarAdapterOptions) =>
  Layer.effect(PolarAdapter, makePolarAdapter(options));
