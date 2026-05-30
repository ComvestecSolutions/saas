import { afterEach, describe, expect, it } from "vitest";
import { platformScope, webhookApiKeyStatus } from "@comvestec/contracts";
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

/**
 * Browser coverage for the spec-canonical `/desk/api-key/$keyId`
 * Webhook API Key Detail v2 surface shipped by Phase 5 Support
 * / compliance / integrations operator screens commit 3
 * (admin-app implementation plan §8.12 + §11). Exercises the
 * `api-key-detail-{loader,route-data,route-server}` trio end
 * to end through the admin browser harness mock state.
 *
 * Covers: ready spine + body with HighRiskActionGuard rotate +
 * revoke CTAs (active key), denied StateScreen, stale-session
 * StateScreen, error StateScreen.
 */
const PATH = `/desk/api-key/api_org_01?scope=${platformScope.organization}&scopeId=org_demo`;

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/desk/api-key/$keyId Webhook API Key Detail v2 route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
    mockedLoaders.rotateWebhookApiKey.mockClear();
    mockedLoaders.revokeWebhookApiKey.mockClear();
  });

  it("renders the ready api-key surface with summary + scope panels and CTAs", async () => {
    const activeFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadApiKeyDetail: async (input) => ({
          kind: "ready",
          apiKey: {
            apiKeyId: input.keyId,
            label: "Operations key",
            prefix: "org_01",
            status: webhookApiKeyStatus.active,
            createdAt: new Date(0).toISOString(),
          },
          scope: input.scope,
          scopeId: input.scopeId,
        }),
      }),
    );

    rendered = await renderAdminApp(activeFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='api-key-detail-ready']",
        ) !== null,
      "Expected api-key v2 ready surface to render.",
    );

    expect(
      rendered.container.querySelector(
        "[data-testid='api-key-detail-summary']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector("[data-testid='api-key-detail-scope']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='api-key-detail-rotate-cta']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='api-key-detail-revoke-cta']",
      ),
    ).not.toBeNull();
  });

  it("invokes the rotate mutations-server flow through the high-risk guard", async () => {
    const activeFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadApiKeyDetail: async (input) => ({
          kind: "ready",
          apiKey: {
            apiKeyId: input.keyId,
            label: "Operations key",
            prefix: "org_01",
            status: webhookApiKeyStatus.active,
            createdAt: new Date(0).toISOString(),
          },
          scope: input.scope,
          scopeId: input.scopeId,
        }),
      }),
    );

    rendered = await renderAdminApp(activeFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='api-key-detail-rotate-cta']",
        ) !== null,
      "Expected api-key rotate CTA to render.",
    );

    await click(
      rendered.container.querySelector<HTMLButtonElement>(
        "[data-testid='api-key-detail-rotate-cta']",
      )!,
    );

    await waitFor(
      () =>
        rendered?.container.ownerDocument.querySelector(
          "[data-testid='high-risk-body']",
        ) !== null,
      "Expected api-key rotate guard to open.",
    );

    await click(
      getFieldControlByLabel<HTMLInputElement>(
        rendered.container.ownerDocument,
        "Scheduled rotation — rotate key",
        "input",
      ),
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "Routine scheduled rotation",
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
        mockedLoaders.rotateWebhookApiKey.mock.calls.length === 1 &&
        rendered?.container.textContent?.includes("Rotate accepted for") ===
          true,
      "Expected api-key rotate mutations-server flow to complete.",
    );

    expect(mockedLoaders.rotateWebhookApiKey).toHaveBeenCalledWith({
      data: {
        apiKeyId: "api_org_01",
        scope: platformScope.organization,
        scopeId: "org_demo",
      },
    });
  });

  it("invokes the revoke mutations-server flow through the high-risk guard", async () => {
    const activeFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadApiKeyDetail: async (input) => ({
          kind: "ready",
          apiKey: {
            apiKeyId: input.keyId,
            label: "Operations key",
            prefix: "org_01",
            status: webhookApiKeyStatus.active,
            createdAt: new Date(0).toISOString(),
          },
          scope: input.scope,
          scopeId: input.scopeId,
        }),
      }),
    );

    rendered = await renderAdminApp(activeFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='api-key-detail-revoke-cta']",
        ) !== null,
      "Expected api-key revoke CTA to render.",
    );

    await click(
      rendered.container.querySelector<HTMLButtonElement>(
        "[data-testid='api-key-detail-revoke-cta']",
      )!,
    );

    await waitFor(
      () =>
        rendered?.container.ownerDocument.querySelector(
          "[data-testid='high-risk-body']",
        ) !== null,
      "Expected api-key revoke guard to open.",
    );

    await click(
      getFieldControlByLabel<HTMLInputElement>(
        rendered.container.ownerDocument,
        "Policy violation — revoke key",
        "input",
      ),
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "Immediate revocation requested",
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
        mockedLoaders.revokeWebhookApiKey.mock.calls.length === 1 &&
        rendered?.container.textContent?.includes("Revoke accepted for") ===
          true,
      "Expected api-key revoke mutations-server flow to complete.",
    );

    expect(mockedLoaders.revokeWebhookApiKey).toHaveBeenCalledWith({
      data: {
        apiKeyId: "api_org_01",
        scope: platformScope.organization,
        scopeId: "org_demo",
      },
    });
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadApiKeyDetail: async () => ({
          kind: "denied",
          reason:
            "The current operator session cannot inspect this webhook API key.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected api-key denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "The current operator session cannot inspect this webhook API key.",
    );
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadApiKeyDetail: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access webhook API key detail.",
        ) ?? false,
      "Expected api-key stale-session affordance.",
    );
  });

  it("surfaces an error StateScreen when the loader errors", async () => {
    const errorFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadApiKeyDetail: async () => ({
          kind: "error",
          title: "API key detail unavailable",
          description: "Upstream api-key adapter unreachable.",
        }),
      }),
    );

    rendered = await renderAdminApp(errorFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "API key detail unavailable",
        ) ?? false,
      "Expected api-key error state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Upstream api-key adapter unreachable.",
    );
  });
});
