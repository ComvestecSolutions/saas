import { Effect } from "effect";
import {
  billingEnforcementMode,
  billingMeteringMode,
  billingPlanInterval,
  billingPlanVisibility,
  platformModuleId,
} from "@comvestec/contracts";
import {
  adminBillingApiPath,
  createAdminBillingHttpHandler,
  platformAdapterServiceName,
  type SubscriberJourneyService,
} from "@comvestec/platform";

const unexpectedSubscriberJourneyServiceEffect = <A>() =>
  Effect.die(new Error("Unexpected admin billing test service call."));

const defaultResolveRequestContext: SubscriberJourneyService["resolveRequestContext"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultStartAuthentication: SubscriberJourneyService["startAuthentication"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultCompleteAuthentication: SubscriberJourneyService["completeAuthentication"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultCreateManagedBillingPlan: SubscriberJourneyService["createManagedBillingPlan"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultCreateCheckoutSession: SubscriberJourneyService["createCheckoutSession"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultProcessBillingWebhook: SubscriberJourneyService["processBillingWebhook"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultReplayBillingWebhook: SubscriberJourneyService["replayBillingWebhook"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const defaultBuildProductBootstrap: SubscriberJourneyService["buildProductBootstrap"] =
  () => unexpectedSubscriberJourneyServiceEffect();

const createSubscriberJourneyServiceDouble = (
  overrides: Partial<SubscriberJourneyService>,
): SubscriberJourneyService => ({
  listPublicPlans:
    overrides.listPublicPlans ?? unexpectedSubscriberJourneyServiceEffect(),
  resolveRequestContext:
    overrides.resolveRequestContext ?? defaultResolveRequestContext,
  startAuthentication:
    overrides.startAuthentication ?? defaultStartAuthentication,
  completeAuthentication:
    overrides.completeAuthentication ?? defaultCompleteAuthentication,
  createManagedBillingPlan:
    overrides.createManagedBillingPlan ?? defaultCreateManagedBillingPlan,
  createCheckoutSession:
    overrides.createCheckoutSession ?? defaultCreateCheckoutSession,
  processBillingWebhook:
    overrides.processBillingWebhook ?? defaultProcessBillingWebhook,
  replayBillingWebhook:
    overrides.replayBillingWebhook ?? defaultReplayBillingWebhook,
  buildProductBootstrap:
    overrides.buildProductBootstrap ?? defaultBuildProductBootstrap,
});

const createTestHandler = (service: Partial<SubscriberJourneyService>) =>
  createAdminBillingHttpHandler((use) =>
    use(createSubscriberJourneyServiceDouble(service)),
  );

describe("platform admin billing http", () => {
  it("creates managed billing plans through the admin HTTP surface", async () => {
    const handler = createTestHandler({
      createManagedBillingPlan: (input) =>
        Effect.succeed({
          plan: {
            planId: "plan_scale",
            planKey: input.plan.planKey,
            displayName: input.plan.displayName,
            description: input.plan.description,
            active: true,
            prices: [
              {
                priceId: "price_scale_month_1",
                interval: input.plan.price.interval,
                currency: input.plan.price.currency,
                amountMinor: input.plan.price.amountMinor,
                active: true,
                providerPriceId: "polar_price_scale_month_1",
              },
            ],
            entitlements: input.plan.entitlements,
          },
          visibility: input.plan.visibility,
          provider: platformAdapterServiceName.polar,
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminBillingApiPath.createManagedPlan}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_plan_create",
              plan: {
                planKey: "scale",
                displayName: "Scale",
                description: "Operator-created recurring plan.",
                visibility: billingPlanVisibility.draft,
                price: {
                  interval: billingPlanInterval.month,
                  currency: "USD",
                  amountMinor: 4900,
                },
                entitlements: [
                  {
                    moduleId: platformModuleId.tenantManagement,
                    included: true,
                    meteringMode: billingMeteringMode.none,
                    enforcementMode: billingEnforcementMode.none,
                  },
                ],
              },
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        plan: expect.objectContaining({
          planKey: "scale",
          displayName: "Scale",
        }),
        visibility: billingPlanVisibility.draft,
        provider: platformAdapterServiceName.polar,
      }),
    );
  });

  it("returns 403 when plan management is not authorized", async () => {
    const handler = createTestHandler({
      createManagedBillingPlan: () =>
        Effect.fail({
          _tag: "ManagedBillingPlanAccessDeniedError",
          reason: "No matching authorization tuple was found.",
          auditRequired: false,
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminBillingApiPath.createManagedPlan}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sessionId: "sess_denied",
              plan: {
                planKey: "scale",
                displayName: "Scale",
                visibility: billingPlanVisibility.draft,
                price: {
                  interval: billingPlanInterval.month,
                  currency: "USD",
                  amountMinor: 4900,
                },
                entitlements: [
                  {
                    moduleId: platformModuleId.tenantManagement,
                    included: true,
                    meteringMode: billingMeteringMode.none,
                    enforcementMode: billingEnforcementMode.none,
                  },
                ],
              },
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Billing plan management is not allowed for this session.",
    });
  });
});
