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
  getButtonByText,
  getFieldControlByLabel,
  getInputByPlaceholder,
  renderAdminApp,
  waitFor,
  type RenderedAdminApp,
} from "../../../testing/admin-browser-harness";
import { mockedLoaders } from "../../../testing/admin-browser-mock-state";

/**
 * Browser coverage for the spec-canonical `/desk/notify` Notification
 * Center v2 list surface shipped by Phase 6 vendor + workflow
 * operator screens commit 6b (admin-app implementation plan §8.16
 * + §11). Exercises the `notify-list-{loader,route-data,route-server}`
 * trio end to end through the admin browser harness mock state.
 *
 * Covers: ready spine + body, denied StateScreen, stale-session
 * StateScreen, error StateScreen.
 */
const PATH = "/desk/notify";

const withFixtureTransform = (
  base: AdminBrowserFixtureState,
  apply: (fixture: AdminBrowserFixtureState) => AdminBrowserFixtureState,
): AdminBrowserFixtureState => apply(base);

describe("/desk/notify Notification Center v2 list route", () => {
  let rendered: RenderedAdminApp | null = null;

  afterEach(async () => {
    if (rendered !== null) {
      await rendered.cleanup();
      rendered = null;
    }
    mockedLoaders.resendNotification.mockClear();
  });

  it("renders the ready notification workspace with pivots, search, and resend guardrails", async () => {
    const readyFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadNotifyList: async (input) => ({
          kind: "ready",
          filters: input.filters,
          result: {
            notifications: [
              {
                notificationId: "ntf_browser_1",
                channel: notificationChannel.email,
                status: notificationDeliveryStatus.delivered,
                recipientProjection: "ops@example.test",
                subjectProjection: "Welcome to the workspace",
                createdAt: new Date(0).toISOString(),
                deliveredAt: new Date(1000).toISOString(),
              },
              {
                notificationId: "ntf_browser_2",
                channel: notificationChannel.email,
                status: notificationDeliveryStatus.failed,
                recipientProjection: "alerts@example.test",
                subjectProjection: "Notification delivery failure",
                createdAt: new Date(2000).toISOString(),
                deliveredAt: undefined,
              },
              {
                notificationId: "ntf_browser_3",
                channel: notificationChannel.inApp,
                status: notificationDeliveryStatus.queued,
                recipientProjection: "ops-mobile@example.test",
                subjectProjection: "Queued operator digest",
                createdAt: new Date(3000).toISOString(),
                deliveredAt: undefined,
              },
            ],
            partialFailures: [
              {
                bucket: "provider-metadata",
                reason: "Novu metadata reconciliation timed out.",
              },
            ],
          },
        }),
      }),
    );

    rendered = await renderAdminApp(readyFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='notify-list-ready']",
        ) !== null,
      "Expected notify list v2 ready surface to render.",
    );

    expect(
      rendered.container.querySelector("[data-testid='notify-list-posture']"),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='notify-list-entries-table']",
      ),
    ).not.toBeNull();
    expect(
      rendered.container.querySelector(
        "[data-testid='notify-list-partial-failures']",
      ),
    ).not.toBeNull();

    await click(getButtonByText(rendered.container, "Attention"));
    await waitFor(
      () =>
        rendered?.container.querySelectorAll(
          "[data-testid='notify-list-entry-row']",
        ).length === 2,
      "Expected attention tab to narrow the notification roster.",
    );
    expect(rendered.container.textContent).toContain(
      "Notification delivery failure",
    );

    await click(getButtonByText(rendered.container, "All"));
    await waitFor(
      () =>
        rendered?.container.querySelectorAll(
          "[data-testid='notify-list-entry-row']",
        ).length === 3,
      "Expected all tab to restore the full notification roster.",
    );

    await changeInputValue(
      getInputByPlaceholder(
        rendered.container,
        "Search notifications, recipients, or subjects…",
      ),
      "ops-mobile@example.test",
    );
    await waitFor(
      () =>
        rendered?.container.querySelectorAll(
          "[data-testid='notify-list-entry-row']",
        ).length === 1,
      "Expected notification search to narrow the roster to the requested recipient.",
    );
    expect(rendered.container.textContent).toContain("Queued operator digest");

    await click(getButtonByText(rendered.container, "Resend"));
    await waitFor(
      () =>
        rendered?.container.ownerDocument.querySelector(
          "[data-testid='high-risk-body']",
        ) !== null,
      "Expected resend guardrails to open from the list workspace.",
    );
  });

  it("invokes the resend mutations-server flow from the list workspace", async () => {
    const readyFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadNotifyList: async (input) => ({
          kind: "ready",
          filters: input.filters,
          result: {
            notifications: [
              {
                notificationId: "ntf_browser_1",
                channel: notificationChannel.email,
                status: notificationDeliveryStatus.delivered,
                recipientProjection: "ops@example.test",
                subjectProjection: "Welcome to the workspace",
                createdAt: new Date(0).toISOString(),
                deliveredAt: new Date(1000).toISOString(),
              },
              {
                notificationId: "ntf_browser_2",
                channel: notificationChannel.email,
                status: notificationDeliveryStatus.failed,
                recipientProjection: "alerts@example.test",
                subjectProjection: "Notification delivery failure",
                createdAt: new Date(2000).toISOString(),
                deliveredAt: undefined,
              },
            ],
            partialFailures: [],
          },
        }),
      }),
    );

    rendered = await renderAdminApp(readyFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.querySelector(
          "[data-testid='notify-list-resend-cta']",
        ) !== null,
      "Expected list resend CTA to render.",
    );

    await click(
      rendered.container.querySelector<HTMLButtonElement>(
        "[data-testid='notify-list-resend-cta']",
      )!,
    );

    await waitFor(
      () =>
        rendered?.container.ownerDocument.querySelector(
          "[data-testid='high-risk-body']",
        ) !== null,
      "Expected list resend high-risk guard to open.",
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
      "Provider recovered and can accept retries",
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
      "Expected list resend mutations-server flow to complete.",
    );

    expect(mockedLoaders.resendNotification).toHaveBeenCalledWith({
      data: {
        notificationId: "ntf_browser_2",
        reason: "notification-center.resend.provider-outage-recovery",
        reasonAttachmentText: "Provider recovered and can accept retries",
      },
    });
  });

  it("surfaces a denied StateScreen when the loader returns denied", async () => {
    const deniedFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadNotifyList: async () => ({
          kind: "denied",
          reason:
            "The current operator session cannot inspect the notification center.",
        }),
      }),
    );

    rendered = await renderAdminApp(deniedFixture, PATH);

    await waitFor(
      () => rendered?.container.textContent?.includes("Access denied") ?? false,
      "Expected notify denied state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "The current operator session cannot inspect the notification center.",
    );
  });

  it("surfaces the stale-session affordance when the loader is stale", async () => {
    const staleFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadNotifyList: async () => ({ kind: "stale-session" }),
      }),
    );

    rendered = await renderAdminApp(staleFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Re-authenticate to access the notification center.",
        ) ?? false,
      "Expected notify stale-session affordance.",
    );
  });

  it("surfaces an error StateScreen when the loader errors", async () => {
    const errorFixture = withFixtureTransform(
      createAdminBrowserFixtureState(),
      (fixture) => ({
        ...fixture,
        loadNotifyList: async () => ({
          kind: "error",
          title: "Notification center unavailable",
          description: "Upstream notification adapter unreachable.",
        }),
      }),
    );

    rendered = await renderAdminApp(errorFixture, PATH);

    await waitFor(
      () =>
        rendered?.container.textContent?.includes(
          "Notification center unavailable",
        ) ?? false,
      "Expected notify error state to render.",
    );
    expect(rendered.container.textContent).toContain(
      "Upstream notification adapter unreachable.",
    );
  });
});
