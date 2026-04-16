import {
  billingAndMeteringFeatureFlag,
  billingEnforcementMode,
  billingMeteringMode,
  billingPlanInterval,
  billingPlanVisibility,
  platformModuleId,
  tenantBrandingFeatureFlag,
  tenantManagementFeatureFlag,
  usageQuotaPeriod,
  type BillingPlan,
} from "@comvestec/contracts";
import {
  buildPolarCatalogProductMetadata,
  polarMetadataKey,
  readPolarCatalogProductEntitlements,
} from "@comvestec/platform";
import type {
  KeycloakAdapterOptions,
  OryKetoAdapterOptions,
  PolarAdapterOptions,
  ValkeyRedisClient,
} from "@comvestec/platform";

const createJsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

export const defaultTestBillingPlans: readonly BillingPlan[] = [
  {
    planId: "plan_starter",
    planKey: "starter",
    displayName: "Starter",
    description:
      "Single-organization workspace with guided onboarding and essential API throughput.",
    active: true,
    prices: [
      {
        priceId: "price_starter_month",
        interval: billingPlanInterval.month,
        currency: "USD",
        amountMinor: 1900,
        active: true,
        providerPriceId: "polar_price_starter_month",
      },
      {
        priceId: "price_starter_year",
        interval: billingPlanInterval.year,
        currency: "USD",
        amountMinor: 19000,
        active: true,
        providerPriceId: "polar_price_starter_year",
      },
    ],
    entitlements: [
      {
        moduleId: platformModuleId.tenantManagement,
        featureKey: tenantManagementFeatureFlag.enabled,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.identitySession,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.tenantManagement,
        featureKey: tenantManagementFeatureFlag.guidedOnboarding,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.billingAndMetering,
        featureKey: billingAndMeteringFeatureFlag.apiRequests,
        included: true,
        meteringMode: billingMeteringMode.rateLimit,
        meterKey: billingAndMeteringFeatureFlag.apiRequests,
        unit: "request",
        quotaLimit: 60,
        quotaPeriod: usageQuotaPeriod.minute,
        enforcementMode: billingEnforcementMode.rateLimit,
      },
    ],
  },
  {
    planId: "plan_growth",
    planKey: "growth",
    displayName: "Growth",
    description:
      "Branded tenant workspace with email branding, guided onboarding, and higher API throughput.",
    active: true,
    prices: [
      {
        priceId: "price_growth_month",
        interval: billingPlanInterval.month,
        currency: "USD",
        amountMinor: 7900,
        active: true,
        providerPriceId: "polar_price_growth_month",
      },
      {
        priceId: "price_growth_year",
        interval: billingPlanInterval.year,
        currency: "USD",
        amountMinor: 79000,
        active: true,
        providerPriceId: "polar_price_growth_year",
      },
    ],
    entitlements: [
      {
        moduleId: platformModuleId.tenantManagement,
        featureKey: tenantManagementFeatureFlag.enabled,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.identitySession,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.tenantManagement,
        featureKey: tenantManagementFeatureFlag.guidedOnboarding,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.tenantBranding,
        featureKey: tenantBrandingFeatureFlag.enabled,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.tenantBranding,
        featureKey: tenantBrandingFeatureFlag.brandedEmails,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.billingAndMetering,
        featureKey: billingAndMeteringFeatureFlag.apiRequests,
        included: true,
        meteringMode: billingMeteringMode.rateLimit,
        meterKey: billingAndMeteringFeatureFlag.apiRequests,
        unit: "request",
        quotaLimit: 600,
        quotaPeriod: usageQuotaPeriod.minute,
        enforcementMode: billingEnforcementMode.rateLimit,
      },
    ],
  },
  {
    planId: "plan_scale",
    planKey: "scale",
    displayName: "Scale",
    description:
      "Multi-organization rollout with enterprise hierarchy, custom domains, branded emails, and high-volume API throughput.",
    active: true,
    prices: [
      {
        priceId: "price_scale_month",
        interval: billingPlanInterval.month,
        currency: "USD",
        amountMinor: 19900,
        active: true,
        providerPriceId: "polar_price_scale_month",
      },
      {
        priceId: "price_scale_year",
        interval: billingPlanInterval.year,
        currency: "USD",
        amountMinor: 199000,
        active: true,
        providerPriceId: "polar_price_scale_year",
      },
    ],
    entitlements: [
      {
        moduleId: platformModuleId.tenantManagement,
        featureKey: tenantManagementFeatureFlag.enabled,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.identitySession,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.tenantManagement,
        featureKey: tenantManagementFeatureFlag.guidedOnboarding,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.tenantManagement,
        featureKey: tenantManagementFeatureFlag.enterpriseHierarchy,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.tenantBranding,
        featureKey: tenantBrandingFeatureFlag.enabled,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.tenantBranding,
        featureKey: tenantBrandingFeatureFlag.customDomain,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.tenantBranding,
        featureKey: tenantBrandingFeatureFlag.brandedEmails,
        included: true,
        meteringMode: billingMeteringMode.none,
        enforcementMode: billingEnforcementMode.none,
      },
      {
        moduleId: platformModuleId.billingAndMetering,
        featureKey: billingAndMeteringFeatureFlag.apiRequests,
        included: true,
        meteringMode: billingMeteringMode.rateLimit,
        meterKey: billingAndMeteringFeatureFlag.apiRequests,
        unit: "request",
        quotaLimit: 2400,
        quotaPeriod: usageQuotaPeriod.minute,
        enforcementMode: billingEnforcementMode.rateLimit,
      },
    ],
  },
] as const;

type PolarTestCatalogItem = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly recurringInterval: string | null;
  readonly recurringIntervalCount?: number | null;
  readonly visibility?: string;
  readonly isArchived: boolean;
  readonly metadata: ReturnType<typeof buildPolarCatalogProductMetadata>;
  readonly prices: {
    readonly id: string;
    readonly recurringInterval: string;
    readonly priceCurrency: string;
    readonly priceAmount: number;
    readonly isArchived: boolean;
  }[];
};

const buildPolarCatalogItems = (
  plans: readonly BillingPlan[],
): PolarTestCatalogItem[] =>
  plans.map((plan) => ({
    id: plan.planId,
    name: plan.displayName,
    description: plan.description ?? null,
    recurringInterval: null,
    visibility: billingPlanVisibility.public,
    isArchived: !plan.active,
    metadata: buildPolarCatalogProductMetadata({
      planKey: plan.planKey,
      entitlements: JSON.stringify(plan.entitlements),
    }),
    prices: plan.prices.map((price) => ({
      id: price.priceId,
      recurringInterval: price.interval,
      priceCurrency: price.currency,
      priceAmount: price.amountMinor,
      isArchived: !price.active,
    })),
  }));

const createPolarProductListResult = (
  items: readonly PolarTestCatalogItem[],
) => ({
  async *[Symbol.asyncIterator]() {
    yield {
      result: {
        items,
      },
    };
  },
});

const buildPolarCatalogItemFromCreateRequest = (
  request: NonNullable<
    PolarAdapterOptions["sdkClient"]
  >["products"]["create"] extends (input: infer TRequest) => Promise<unknown>
    ? TRequest
    : never,
  sequence: number,
): PolarTestCatalogItem => {
  const metadata = request.metadata ?? {};
  const planKeyValue = metadata[polarMetadataKey.planKey];
  const entitlementsValue = readPolarCatalogProductEntitlements(metadata);
  const resolvedPlanKey =
    typeof planKeyValue === "string" && planKeyValue.length > 0
      ? planKeyValue
      : `managed-${sequence}`;
  const resolvedEntitlements =
    typeof entitlementsValue === "string" && entitlementsValue.length > 0
      ? entitlementsValue
      : "[]";

  return {
    id: `plan_${resolvedPlanKey}`,
    name: request.name,
    description: request.description ?? null,
    recurringInterval: request.recurringInterval,
    recurringIntervalCount: request.recurringIntervalCount ?? 1,
    visibility: request.visibility ?? "draft",
    isArchived: false,
    metadata: {
      ...metadata,
      [polarMetadataKey.planKey]: resolvedPlanKey,
      [polarMetadataKey.entitlements]: resolvedEntitlements,
    },
    prices: request.prices.map((price, index) => ({
      id: `price_${resolvedPlanKey}_${request.recurringInterval}_${index + 1}`,
      recurringInterval: request.recurringInterval,
      priceCurrency: price.priceCurrency ?? "USD",
      priceAmount: price.priceAmount,
      isArchived: false,
    })),
  };
};

const isExistingPolarProductPriceReference = (
  price: NonNullable<
    NonNullable<
      NonNullable<
        PolarAdapterOptions["sdkClient"]
      >["products"]["update"] extends (
        input: infer TRequest,
      ) => Promise<unknown>
        ? TRequest
        : never
    >["productUpdate"]["prices"]
  >[number],
): price is { readonly id: string } => "id" in price;

const buildPolarCatalogItemFromUpdateRequest = (
  item: PolarTestCatalogItem,
  request: NonNullable<
    PolarAdapterOptions["sdkClient"]
  >["products"]["update"] extends (input: infer TRequest) => Promise<unknown>
    ? TRequest
    : never,
  sequence: number,
): PolarTestCatalogItem => {
  const nextPlanKey =
    request.productUpdate.metadata?.[polarMetadataKey.planKey]?.toString() ??
    item.metadata[polarMetadataKey.planKey]?.toString() ??
    `managed-${sequence}`;
  const nextRecurringInterval =
    request.productUpdate.recurringInterval ??
    item.recurringInterval ??
    "month";
  const nextRecurringIntervalCount =
    request.productUpdate.recurringIntervalCount === undefined
      ? item.recurringIntervalCount
      : request.productUpdate.recurringIntervalCount;
  const nextVisibility =
    request.productUpdate.visibility === undefined ||
    request.productUpdate.visibility === null
      ? item.visibility
      : request.productUpdate.visibility;
  const nextPrices =
    request.productUpdate.prices === undefined ||
    request.productUpdate.prices === null
      ? item.prices
      : request.productUpdate.prices.flatMap((price, index) => {
          if (isExistingPolarProductPriceReference(price)) {
            const existingPrice = item.prices.find(
              (candidate) => candidate.id === price.id,
            );

            return existingPrice === undefined ? [] : [existingPrice];
          }

          return [
            {
              id: `price_${nextPlanKey}_${nextRecurringInterval}_${sequence + index + 1}`,
              recurringInterval: nextRecurringInterval,
              priceCurrency: price.priceCurrency ?? "USD",
              priceAmount: price.priceAmount,
              isArchived: false,
            },
          ];
        });

  return {
    ...item,
    name:
      request.productUpdate.name === undefined
        ? item.name
        : (request.productUpdate.name ?? item.name),
    description:
      request.productUpdate.description === undefined
        ? item.description
        : request.productUpdate.description,
    recurringInterval: nextRecurringInterval,
    ...(nextRecurringIntervalCount !== undefined
      ? { recurringIntervalCount: nextRecurringIntervalCount }
      : {}),
    ...(nextVisibility !== undefined ? { visibility: nextVisibility } : {}),
    isArchived: request.productUpdate.isArchived ?? item.isArchived,
    metadata:
      request.productUpdate.metadata === undefined
        ? item.metadata
        : {
            ...item.metadata,
            ...request.productUpdate.metadata,
          },
    prices: nextPrices,
  };
};

export const createKeycloakTestOptions = (
  overrides?: Partial<KeycloakAdapterOptions>,
): KeycloakAdapterOptions => {
  const baseUrl = overrides?.baseUrl ?? "http://localhost:8080";
  const realm = overrides?.realm ?? "comvestec";
  const issuer = `${baseUrl}/realms/${realm}`;

  return {
    baseUrl,
    realm,
    clientId: overrides?.clientId ?? "saas-platform",
    clientSecret: overrides?.clientSecret ?? "change-me",
    fetch:
      overrides?.fetch ??
      (async (input) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url === `${issuer}/.well-known/openid-configuration`) {
          return createJsonResponse({ issuer });
        }

        if (url === `${issuer}/protocol/openid-connect/token/introspect`) {
          return createJsonResponse({
            active: true,
            sub: "usr_token",
            sid: "sess_token",
            iss: issuer,
          });
        }

        if (url === `${issuer}/protocol/openid-connect/token`) {
          return createJsonResponse({ access_token: "access-token" });
        }

        return new Response("Not Found", {
          status: 404,
          statusText: "Not Found",
        });
      }),
  };
};

export const createValkeyTestClient = (): ValkeyRedisClient => {
  let open = false;
  const values = new Map<string, string>();

  return {
    get isOpen() {
      return open;
    },
    connect: async () => {
      open = true;
    },
    quit: async () => {
      open = false;
    },
    ping: async () => "PONG",
    incrByFloat: async (key, increment) => {
      const nextValue = Number(values.get(key) ?? "0") + increment;
      values.set(key, `${nextValue}`);

      return `${nextValue}`;
    },
    set: async (key, value) => {
      values.set(key, value);
    },
    get: async (key) => values.get(key) ?? null,
  };
};

export const createOryKetoTestOptions = (
  overrides?: Partial<OryKetoAdapterOptions>,
): OryKetoAdapterOptions => {
  const tuples = new Set<string>();
  const readUrl = overrides?.readUrl ?? "http://localhost:4466";
  const writeUrl = overrides?.writeUrl ?? "http://localhost:4467";

  return {
    readUrl,
    writeUrl,
    fetch:
      overrides?.fetch ??
      (async (input, init) => {
        const url = new URL(
          typeof input === "string" ? input : input.toString(),
        );
        const method = init?.method ?? "GET";

        if (method === "GET" && url.pathname === "/health/ready") {
          return createJsonResponse({ status: "ok" });
        }

        if (method === "PUT" && url.pathname === "/admin/relation-tuples") {
          const payload = JSON.parse(String(init?.body ?? "{}")) as {
            namespace: string;
            object: string;
            relation: string;
            subject_id: string;
          };
          tuples.add(
            [
              payload.namespace,
              payload.object,
              payload.relation,
              payload.subject_id,
            ].join(":"),
          );

          return createJsonResponse(payload, 201);
        }

        if (method === "GET" && url.pathname === "/relation-tuples/check") {
          const tupleKey = [
            url.searchParams.get("namespace"),
            url.searchParams.get("object"),
            url.searchParams.get("relation"),
            url.searchParams.get("subject_id"),
          ].join(":");

          return createJsonResponse({ allowed: tuples.has(tupleKey) });
        }

        return new Response("Not Found", {
          status: 404,
          statusText: "Not Found",
        });
      }),
  };
};

export const createPolarTestOptions = (
  overrides?: Partial<PolarAdapterOptions> & {
    readonly plans?: readonly BillingPlan[];
  },
): PolarAdapterOptions => {
  const plans = overrides?.plans ?? defaultTestBillingPlans;
  const apiUrl = overrides?.apiUrl ?? "http://localhost:8888";
  const catalogItems = buildPolarCatalogItems(plans);

  return {
    apiKey: overrides?.apiKey ?? "polar-key",
    apiUrl,
    sdkClient: overrides?.sdkClient ?? {
      products: {
        list: async (request) =>
          createPolarProductListResult(
            catalogItems.filter((item) => {
              if (request.isArchived === false && item.isArchived) {
                return false;
              }

              if (
                request.visibility !== undefined &&
                request.visibility !== null &&
                (item.visibility === undefined ||
                  !request.visibility.includes(item.visibility))
              ) {
                return false;
              }

              return true;
            }),
          ),
        create: async (request) => {
          const createdItem = buildPolarCatalogItemFromCreateRequest(
            request,
            catalogItems.length + 1,
          );

          catalogItems.push(createdItem);

          return createdItem;
        },
        update: async (request) => {
          const itemIndex = catalogItems.findIndex(
            (candidate) => candidate.id === request.id,
          );

          if (itemIndex === -1) {
            throw new Error(`Unknown polar test product: ${request.id}`);
          }

          const updatedItem = buildPolarCatalogItemFromUpdateRequest(
            catalogItems[itemIndex]!,
            request,
            catalogItems.length + 1,
          );

          catalogItems[itemIndex] = updatedItem;

          return updatedItem;
        },
      },
      checkouts: {
        create: async (request) => {
          const planId =
            request.products[0] ?? plans[0]?.planId ?? "plan_unknown";
          const priceId =
            request.metadata?.[polarMetadataKey.priceId]?.toString() ??
            plans[0]?.prices[0]?.priceId ??
            "price_unknown";

          return {
            id: `checkout:${planId}:${priceId}`,
            url: `http://polar.test/checkout/${encodeURIComponent(planId)}/${encodeURIComponent(priceId)}`,
            expiresAt: new Date(Date.now() + 30 * 60_000),
          };
        },
      },
    },
  };
};
