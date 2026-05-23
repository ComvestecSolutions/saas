import { afterEach, describe, expect, it } from "vitest";
import {
  notificationChannel,
  notificationDeliveryStatus,
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

/**
 * Browser coverage for the spec-canonical `/r/notify/$id`
 * Notification Center v2 detail surface shipped by Phase 6
 * commit 6c (admin-app implementation plan §8.16 + §11).
 */
const PATH = "/r/notify/ntf_browser_1";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/r/notify/$id Notification Center v2 detail route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
    mockedLoaders.resendNotification.mockClear();
  });

  it("renders the ready notification detail surface with summary + payload + resend CTA", async () => {
    const readyFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadNotifyDetail: async (input) => ({
          kind: "ready",
          notification: {
            notificationId: input.notificationId,
            channel: notificationChannel.email,
            status: notificationDeliveryStatus.failed,
            recipientProjection: "ops-recipient@example.test",
            subjectProjection: "Password reset",
            createdAt: new Date(0).toISOString(),
            lastError: "Provider rejected the recipient address.",
            payloadProjection: '{ "template": "password-reset" }',
            providerMetadata: '{ "providerId": "novu" }',
            auditCorrelationId: "corr_ntf_browser_1",
          },
        }),
      }),
    );

    rendered = await renderAdminApp(readyFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='notify-detail-ready']",
        ) !== null,
      "Expected notify detail v2 ready surface to render.",
    );

    expect(
      rendered.container.querySelector("[data-testid='notify-detail-summary']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='notify-detail-resend-cta']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='notify-detail-payload-projection']",
      )?.textContent,
    ).toContain("password-reset");
  });

  it("invokes the resend mutations-server flow through the high-risk guard", async () => {
    const readyFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadNotifyDetail: async (input) => ({
          kind: "ready",
          notification: {
            notificationId: input.notificationId,
            channel: notificationChannel.email,
            status: notificationDeliveryStatus.failed,
            recipientProjection: "ops-recipient@example.test",
            subjectProjection: "Password reset",
            createdAt: new Date(0).toISOString(),
            lastError: "Provider rejected the recipient address.",
            payloadProjection: '{ "template": "password-reset" }',
            providerMetadata: '{ "providerId": "novu" }',
            auditCorrelationId: "corr_ntf_browser_resend",
          },
        }),
      }),
    );

    rendered = await renderAdminApp(readyFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='notify-detail-resend-cta']",
        ) !== null,
      "Expected resend CTA to render.",
    );

    await click(
      rendered.container.querySelector<HTMLButtonElement>(
        "[data-testid='notify-detail-resend-cta']",
      )!,
    );

    await waitFor(
      () =>
        rendered?.container.ownerDocument.querySelector(
          "[data-testid='high-risk-body']",
        ) !== null,
      "Expected resend high-risk guard to open.",
    );

    await click(
      getFieldControlByLabel<HTMLInputElement>(
        rendered.container.ownerDocument,
        "Provider outage recovery — resend notification",
        "input",
      ),
    );
    await changeInputValue(
      rendered.container.ownerDocument.querySelector<HTMLTextAreaElement>(
        "[data-testid='high-risk-note']",
      )!,
      "Provider incident recovered",
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
        mockedLoaders.resendNotification.mock.calls.length === 1 &&
        rendered?.container.textContent?.includes("Resend accepted for") ===
          true,
      "Expected resend mutations-server flow to complete.",
    );

    expect(mockedLoaders.resendNotification).toHaveBeenCalledWith({
      data: {
        notificationId: "ntf_browser_1",
        reason: "notification-center.resend.provider-outage-recovery",
        reasonAttachmentText: "Provider incident recovered",
      },
    });
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadNotifyDetail: async () => ({
          kind: "denied",
          reason:
            "The current operator session cannot inspect this notification.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected notify detail denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "The current operator session cannot inspect this notification.",
    );
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadNotifyDetail: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access notification detail.",
        ) ?? false,
      "Expected notify detail stale-session affordance.",
    );
  });

  it("surfaces an error StateScreen when the loader errors", async () => {
    const errorFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadNotifyDetail: async () => ({
          kind: "error",
          title: "Notification detail unavailable",
          description: "Upstream Novu admin port unreachable.",
        }),
      }),
    );

    rendered = await renderAdminApp(errorFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Notification detail unavailable",
        ) ?? false,
      "Expected notify detail error state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Upstream Novu admin port unreachable.",
    );
  });
});
