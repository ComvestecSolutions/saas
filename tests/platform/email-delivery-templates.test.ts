import { Effect } from "effect";
import { emailDeliveryTemplateId } from "@comvestec/contracts";
import {
  identitySessionEmailVerificationEmailTemplateTrackingId,
  identitySessionMfaCodeEmailTemplateTrackingId,
  identitySessionPasswordResetEmailTemplateTrackingId,
  notificationCenterNewsletterEmailTemplateTrackingId,
  notificationCenterWelcomeCampaignEmailTemplateTrackingId,
  renderIdentitySessionEmailVerificationEmailTemplate,
  renderIdentitySessionMfaCodeEmailTemplate,
  renderIdentitySessionPasswordResetEmailTemplate,
  renderNotificationCenterNewsletterEmailTemplate,
  renderNotificationCenterWelcomeCampaignEmailTemplate,
} from "@comvestec/platform";

describe("platform email delivery templates", () => {
  it("renders the identity-session password reset template with a display-name hint", async () => {
    const rendered = await Effect.runPromise(
      renderIdentitySessionPasswordResetEmailTemplate({
        recipientEmail: "customer@example.com",
        resetUrl: "https://product.example.com/auth/reset?ticket=reset_1",
        expiresAt: "2026-05-12T10:00:00.000Z",
        requestedAt: "2026-05-12T09:45:00.000Z",
        displayNameHint: "Acme Workspace",
      }),
    );

    expect(identitySessionPasswordResetEmailTemplateTrackingId).toBe(
      `${emailDeliveryTemplateId.identitySessionPasswordReset}@v1`,
    );
    expect(rendered.template).toBe(
      identitySessionPasswordResetEmailTemplateTrackingId,
    );
    expect(rendered.subject).toBe("Reset your password for Acme Workspace");
    expect(rendered.html).toContain("Acme Workspace");
    expect(rendered.html).toContain("customer@example.com");
    expect(rendered.html).toContain(
      "https://product.example.com/auth/reset?ticket=reset_1",
    );
    expect(rendered.html).toContain("2026-05-12T10:00:00.000Z");
    expect(rendered.html).toContain("2026-05-12T09:45:00.000Z");
    expect(rendered.text).toContain("If you did not request this reset");
  });

  it("falls back to generic password reset copy when no display-name hint exists", async () => {
    const rendered = await Effect.runPromise(
      renderIdentitySessionPasswordResetEmailTemplate({
        recipientEmail: "customer@example.com",
        resetUrl: "https://product.example.com/auth/reset?ticket=reset_2",
        expiresAt: "2026-05-12T11:00:00.000Z",
      }),
    );

    expect(rendered.subject).toBe("Reset your password");
    expect(rendered.html).not.toContain("for undefined");
    expect(rendered.text).not.toContain("for undefined");
  });

  it("rejects invalid password reset template input", async () => {
    const result = await Effect.runPromise(
      Effect.either(
        renderIdentitySessionPasswordResetEmailTemplate({
          recipientEmail: "",
          resetUrl: "https://product.example.com/auth/reset?ticket=reset_3",
          expiresAt: "2026-05-12T11:00:00.000Z",
        }),
      ),
    );

    expect(result._tag).toBe("Left");
  });

  it("renders the identity-session email verification template with a display-name hint", async () => {
    const rendered = await Effect.runPromise(
      renderIdentitySessionEmailVerificationEmailTemplate({
        recipientEmail: "customer@example.com",
        verificationUrl:
          "https://product.example.com/auth/verify?ticket=verify_1",
        expiresAt: "2026-05-12T12:00:00.000Z",
        requestedAt: "2026-05-12T11:45:00.000Z",
        displayNameHint: "Acme Workspace",
      }),
    );

    expect(identitySessionEmailVerificationEmailTemplateTrackingId).toBe(
      `${emailDeliveryTemplateId.identitySessionEmailVerification}@v1`,
    );
    expect(rendered.template).toBe(
      identitySessionEmailVerificationEmailTemplateTrackingId,
    );
    expect(rendered.subject).toBe("Verify your email for Acme Workspace");
    expect(rendered.html).toContain(
      "https://product.example.com/auth/verify?ticket=verify_1",
    );
    expect(rendered.text).toContain("If you did not request this verification");
  });

  it("falls back to generic verification copy when no display-name hint exists", async () => {
    const rendered = await Effect.runPromise(
      renderIdentitySessionEmailVerificationEmailTemplate({
        recipientEmail: "customer@example.com",
        verificationUrl:
          "https://product.example.com/auth/verify?ticket=verify_2",
        expiresAt: "2026-05-12T13:00:00.000Z",
      }),
    );

    expect(rendered.subject).toBe("Verify your email");
    expect(rendered.html).not.toContain("for undefined");
    expect(rendered.text).not.toContain("for undefined");
  });

  it("rejects invalid verification template input", async () => {
    const result = await Effect.runPromise(
      Effect.either(
        renderIdentitySessionEmailVerificationEmailTemplate({
          recipientEmail: "customer@example.com",
          verificationUrl: "",
          expiresAt: "2026-05-12T13:00:00.000Z",
        }),
      ),
    );

    expect(result._tag).toBe("Left");
  });

  it("renders the identity-session MFA code template", async () => {
    const rendered = await Effect.runPromise(
      renderIdentitySessionMfaCodeEmailTemplate({
        recipientEmail: "customer@example.com",
        mfaCode: "438201",
        expiresAt: "2026-05-12T12:30:00.000Z",
        requestedAt: "2026-05-12T12:25:00.000Z",
        displayNameHint: "Acme Workspace",
      }),
    );

    expect(identitySessionMfaCodeEmailTemplateTrackingId).toBe(
      `${emailDeliveryTemplateId.identitySessionMfaCode}@v1`,
    );
    expect(rendered.template).toBe(
      identitySessionMfaCodeEmailTemplateTrackingId,
    );
    expect(rendered.subject).toBe("Your MFA code for Acme Workspace");
    expect(rendered.html).toContain("<code>438201</code>");
    expect(rendered.text).toContain("438201");
  });

  it("rejects invalid MFA code template input", async () => {
    const result = await Effect.runPromise(
      Effect.either(
        renderIdentitySessionMfaCodeEmailTemplate({
          recipientEmail: "customer@example.com",
          mfaCode: "",
          expiresAt: "2026-05-12T12:30:00.000Z",
        }),
      ),
    );

    expect(result._tag).toBe("Left");
  });

  it("renders the notification-center welcome campaign template", async () => {
    const rendered = await Effect.runPromise(
      renderNotificationCenterWelcomeCampaignEmailTemplate({
        recipientEmail: "customer@example.com",
        primaryActionUrl: "https://product.example.com/start",
        supportUrl: "https://product.example.com/help",
        nextSteps: [
          "Complete your workspace profile",
          "Invite your first teammate",
        ],
        sentAt: "2026-05-12T14:00:00.000Z",
        displayNameHint: "Acme Workspace",
      }),
    );

    expect(notificationCenterWelcomeCampaignEmailTemplateTrackingId).toBe(
      `${emailDeliveryTemplateId.notificationCenterWelcomeCampaign}@v1`,
    );
    expect(rendered.template).toBe(
      notificationCenterWelcomeCampaignEmailTemplateTrackingId,
    );
    expect(rendered.subject).toBe("Welcome to Acme Workspace");
    expect(rendered.html).toContain("Complete your workspace profile");
    expect(rendered.text).toContain("Invite your first teammate");
    expect(rendered.text).toContain("https://product.example.com/help");
  });

  it("falls back to a generic welcome subject when no display-name hint exists", async () => {
    const rendered = await Effect.runPromise(
      renderNotificationCenterWelcomeCampaignEmailTemplate({
        recipientEmail: "customer@example.com",
        primaryActionUrl: "https://product.example.com/start",
        supportUrl: "https://product.example.com/help",
        nextSteps: [],
      }),
    );

    expect(rendered.subject).toBe("Welcome");
    expect(rendered.html).not.toContain("to undefined");
  });

  it("rejects welcome campaign input with too many next steps", async () => {
    const result = await Effect.runPromise(
      Effect.either(
        renderNotificationCenterWelcomeCampaignEmailTemplate({
          recipientEmail: "customer@example.com",
          primaryActionUrl: "https://product.example.com/start",
          supportUrl: "https://product.example.com/help",
          nextSteps: [
            "Complete your workspace profile",
            "Invite your first teammate",
            "Review permissions",
            "Upload your logo",
            "Configure notifications",
          ],
        }),
      ),
    );

    expect(result._tag).toBe("Left");
  });

  it("rejects welcome campaign input with an overlong next-step entry", async () => {
    const result = await Effect.runPromise(
      Effect.either(
        renderNotificationCenterWelcomeCampaignEmailTemplate({
          recipientEmail: "customer@example.com",
          primaryActionUrl: "https://product.example.com/start",
          supportUrl: "https://product.example.com/help",
          nextSteps: ["A".repeat(161)],
        }),
      ),
    );

    expect(result._tag).toBe("Left");
  });

  it("renders the notification-center newsletter template", async () => {
    const rendered = await Effect.runPromise(
      renderNotificationCenterNewsletterEmailTemplate({
        recipientEmail: "customer@example.com",
        issueLabel: "May product update",
        publishedAt: "2026-05-12T15:00:00.000Z",
        webViewUrl: "https://public.example.com/newsletters/may-product-update",
        unsubscribeUrl: "https://product.example.com/preferences/newsletters",
        highlights: [
          {
            title: "Audit-safe operator tools",
            summary:
              "New governance flows make privileged operations easier to review.",
            articleUrl:
              "https://public.example.com/newsletters/may-product-update#audit-safe-operator-tools",
          },
          {
            title: "Branded transactional emails",
            summary:
              "Tenant-aware sender identity now flows through the shared email boundary.",
            articleUrl:
              "https://public.example.com/newsletters/may-product-update#branded-transactional-emails",
          },
        ],
      }),
    );

    expect(notificationCenterNewsletterEmailTemplateTrackingId).toBe(
      `${emailDeliveryTemplateId.notificationCenterNewsletter}@v1`,
    );
    expect(rendered.template).toBe(
      notificationCenterNewsletterEmailTemplateTrackingId,
    );
    expect(rendered.subject).toBe("Newsletter: May product update");
    expect(rendered.html).toContain("Audit-safe operator tools");
    expect(rendered.text).toContain(
      "https://product.example.com/preferences/newsletters",
    );
  });

  it("rejects invalid newsletter template input", async () => {
    const result = await Effect.runPromise(
      Effect.either(
        renderNotificationCenterNewsletterEmailTemplate({
          recipientEmail: "customer@example.com",
          issueLabel: "",
          publishedAt: "2026-05-12T15:00:00.000Z",
          webViewUrl:
            "https://public.example.com/newsletters/may-product-update",
          unsubscribeUrl: "https://product.example.com/preferences/newsletters",
          highlights: [],
        }),
      ),
    );

    expect(result._tag).toBe("Left");
  });

  it("rejects newsletter input with an overlong issue label", async () => {
    const result = await Effect.runPromise(
      Effect.either(
        renderNotificationCenterNewsletterEmailTemplate({
          recipientEmail: "customer@example.com",
          issueLabel: "A".repeat(161),
          publishedAt: "2026-05-12T15:00:00.000Z",
          webViewUrl:
            "https://public.example.com/newsletters/may-product-update",
          unsubscribeUrl: "https://product.example.com/preferences/newsletters",
          highlights: [],
        }),
      ),
    );

    expect(result._tag).toBe("Left");
  });

  it("rejects newsletter input with too many highlight items", async () => {
    const highlights = Array.from({ length: 7 }, (_, index) => ({
      title: `Highlight ${index + 1}`,
      summary: `Summary ${index + 1}`,
      articleUrl: `https://public.example.com/newsletters/may-product-update#highlight-${index + 1}`,
    }));

    const result = await Effect.runPromise(
      Effect.either(
        renderNotificationCenterNewsletterEmailTemplate({
          recipientEmail: "customer@example.com",
          issueLabel: "May product update",
          publishedAt: "2026-05-12T15:00:00.000Z",
          webViewUrl:
            "https://public.example.com/newsletters/may-product-update",
          unsubscribeUrl: "https://product.example.com/preferences/newsletters",
          highlights,
        }),
      ),
    );

    expect(result._tag).toBe("Left");
  });

  it("rejects newsletter input with an overlong highlight summary", async () => {
    const result = await Effect.runPromise(
      Effect.either(
        renderNotificationCenterNewsletterEmailTemplate({
          recipientEmail: "customer@example.com",
          issueLabel: "May product update",
          publishedAt: "2026-05-12T15:00:00.000Z",
          webViewUrl:
            "https://public.example.com/newsletters/may-product-update",
          unsubscribeUrl: "https://product.example.com/preferences/newsletters",
          highlights: [
            {
              title: "Audit-safe operator tools",
              summary: "A".repeat(281),
              articleUrl:
                "https://public.example.com/newsletters/may-product-update#audit-safe-operator-tools",
            },
          ],
        }),
      ),
    );

    expect(result._tag).toBe("Left");
  });

  it("rejects newsletter input with an overlong highlight title", async () => {
    const result = await Effect.runPromise(
      Effect.either(
        renderNotificationCenterNewsletterEmailTemplate({
          recipientEmail: "customer@example.com",
          issueLabel: "May product update",
          publishedAt: "2026-05-12T15:00:00.000Z",
          webViewUrl:
            "https://public.example.com/newsletters/may-product-update",
          unsubscribeUrl: "https://product.example.com/preferences/newsletters",
          highlights: [
            {
              title: "A".repeat(121),
              summary:
                "New governance flows make privileged operations easier to review.",
              articleUrl:
                "https://public.example.com/newsletters/may-product-update#audit-safe-operator-tools",
            },
          ],
        }),
      ),
    );

    expect(result._tag).toBe("Left");
  });
});
