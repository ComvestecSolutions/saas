import {
  billingAndMeteringFeatureFlag,
  billingEnforcementMode,
  billingMeteringMode,
  billingPlanInterval,
  platformModuleId,
  usageQuotaPeriod,
  type BillingPlan,
} from "@comvestec/contracts";
import {
  buildPolarCatalogProductMetadata,
  polarMetadataKey,
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
    description: "Starter plan for adapter tests.",
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
] as const;

const buildPolarCatalogItems = (plans: readonly BillingPlan[]) =>
  plans.map((plan) => ({
    id: plan.planId,
    name: plan.displayName,
    description: plan.description ?? null,
    recurringInterval: null,
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

const createPolarProductListResult = (plans: readonly BillingPlan[]) => ({
  async *[Symbol.asyncIterator]() {
    yield {
      result: {
        items: buildPolarCatalogItems(plans),
      },
    };
  },
});

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

  return {
    apiKey: overrides?.apiKey ?? "polar-key",
    apiUrl,
    sdkClient: overrides?.sdkClient ?? {
      products: {
        list: async () => createPolarProductListResult(plans),
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
