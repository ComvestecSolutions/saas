import { afterEach, describe, expect, it } from "vitest";
import { Option } from "effect";
import {
  operatorWebhookDeliveryStatus,
  platformScope,
} from "@comvestec/contracts";
import {
  createAdminBrowserFixtureState,
  type AdminBrowserFixtureState,
} from "../../../testing/admin-browser-fixtures";
import {
  changeInputValue,
  click,
  getFieldControlByLabel,
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "../../../testing/admin-browser-harness";
import { mockedLoaders } from "../../../testing/admin-browser-mock-state";

void Option;

/**
 * Browser coverage for the spec-canonical
 * `/desk/delivery/$deliveryId` Webhook Delivery Detail v2 surface
 * shipped by Phase 5 Support / compliance / integrations
 * operator screens commit 3 (admin-app implementation plan
 * §8.12 + §11). Exercises the
 * `delivery-detail-{loader,route-data,route-server}` trio end
 * to end through the admin browser harness mock state.
 *
 * Covers: ready spine + body with HighRiskActionGuard CTA arm
 * state, denied StateScreen, stale-session StateScreen, error
 * StateScreen.
 */
const PATH = `/desk/delivery/dlv_org_demo_01?scope=${platformScope.organization}&scopeId=org_demo`;

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/desk/delivery/$deliveryId Webhook Delivery Detail v2 route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
    mockedLoaders.retryWebhookDelivery.mockClear();
  });

  it("renders the ready delivery surface with summary + request/response panels", async () => {
    rendered = await renderAdminApp(createAdminBrowserFixtureState(), PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='delivery-detail-ready']",
        ) !== null,
      "Expected delivery detail v2 ready surface to render.",
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='delivery-detail-summary']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='delivery-detail-request']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='delivery-detail-response']",
      ),
    ).not.toBeNull();
  });

  it("invokes the retry mutations-server flow through the high-risk guard", async () => {
    const retryFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadDeliveryDetail: async () => ({
          kind: "ready",
          delivery: {
            id: "dlv_org_demo_01",
            subscriptionId: "sub_org_01",
            targetTenant: {
              scope: platformScope.organization,
              scopeId: "org_demo",
            },
            eventType: "billing.subscription.updated",
            requestUrl: "https://hooks.example.com/org-demo/1",
            requestMethod: "POST",
            requestBody: '{"event":"demo"}',
            payloadHash: "c".repeat(64),
            signature: "d".repeat(64),
            signatureTimestamp: new Date(0).toISOString(),
            status: operatorWebhookDeliveryStatus.failed,
            attemptCount: 3,
            enqueuedAt: new Date(0).toISOString(),
            lastAttemptAt: new Date(1000).toISOString(),
            lastResponseStatus: 502,
            lastErrorMessage: "Upstream timed out",
            lastResponseBodySnippet: '{"status":"retry"}',
            correlationId: "cor_delivery_retry",
          },
          scope: platformScope.organization,
          scopeId: "org_demo",
        }),
      }),
    );

    rendered = await renderAdminApp(retryFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='delivery-detail-retry-cta']",
        ) !== null,
      "Expected delivery retry CTA to render.",
    );

    await click(
      rendered.container.querySelector<HTMLButtonElement>(
        "[data-testid='delivery-detail-retry-cta']",
      )!,
    );

    await waitFor(
      () =>
        rendered?.container.ownerDocument.querySelector(
          "[data-testid='high-risk-body']",
        ) !== null,
      "Expected delivery high-risk guard to open.",
    );

    await click(
      getFieldControlByLabel<HTMLInputElement>(
        rendered.container.ownerDocument,
        "Transient upstream failure — retry delivery",
        "input",
      ),
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "Transient upstream failure cleared",
    );
    await click(
      rendered.container.ownerDocument.querySelector<HTMLButtonElement>(
        "[data-testid='high-risk-arm']",
      )!,
    );
    await click(
      rendered.container.ownerDocument.querySelector<HTMLButtonElement>(
        "[data-testid='high-risk-confirm-final']",
      )!,
    );

    await waitFor(
      () =>
        mockedLoaders.retryWebhookDelivery.mock.calls.length === 1 &&
        rendered?.container.textContent?.includes("Retry accepted for") ===
          true,
      "Expected delivery retry mutations-server flow to complete.",
    );

    expect(mockedLoaders.retryWebhookDelivery).toHaveBeenCalledWith({
      data: {
        deliveryId: "dlv_org_demo_01",
        retryReasonCatalogId:
          "operator-webhook-delivery.retry.transient-upstream-failure",
      },
    });
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadDeliveryDetail: async () => ({
          kind: "denied",
          reason:
            "The current operator session cannot inspect this webhook delivery.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected delivery denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "The current operator session cannot inspect this webhook delivery.",
    );
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadDeliveryDetail: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access webhook delivery detail.",
        ) ?? false,
      "Expected delivery stale-session affordance.",
    );
  });

  it("surfaces an error StateScreen when the loader errors", async () => {
    const errorFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadDeliveryDetail: async () => ({
          kind: "error",
          title: "Delivery detail unavailable",
          description: "Upstream delivery adapter unreachable.",
        }),
      }),
    );

    rendered = await renderAdminApp(errorFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Delivery detail unavailable",
        ) ?? false,
      "Expected delivery error state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Upstream delivery adapter unreachable.",
    );
  });

  it("exposes the retry CTA only when the delivery status is failed or exhausted", async () => {
    const exhaustedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => {
        const baseDelivery = {
          id: "dlv_org_demo_99",
          subscriptionId: "sub_org_01",
          targetTenant: {
            scope: platformScope.organization,
            scopeId: "org_demo",
          },
          eventType: "billing.subscription.updated",
          requestUrl: "https://hooks.example.com/org-demo/1",
          requestMethod: "POST" as const,
          requestBody: '{"event":"demo"}',
          payloadHash: "c".repeat(64),
          signature: "d".repeat(64),
          signatureTimestamp: new Date(0).toISOString(),
          status: operatorWebhookDeliveryStatus.exhausted,
          attemptCount: 5,
          enqueuedAt: new Date(0).toISOString(),
          correlationId: "cor_demo_99",
        };
        return {
          ...fixture,
          loadDeliveryDetail: async () => ({
            kind: "ready",
            delivery: baseDelivery,
            scope: platformScope.organization,
            scopeId: "org_demo",
          }),
        };
      },
    );

    rendered = await renderAdminApp(exhaustedFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='delivery-detail-retry-cta']",
        ) !== null,
      "Expected delivery retry CTA to render for exhausted deliveries.",
    );
    expect(
      rendered.container.querySelector(
        "[data-testid='delivery-detail-retry-cta']",
      ),
    ).not.toBeNull();
  });
});
