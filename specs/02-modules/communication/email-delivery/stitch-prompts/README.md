# Stitch Prompts: Email Templates

Use these prompts as the repo-owned source when generating email-template concepts in [Stitch](https://stitch.withgoogle.com). These files are design-reference prompts, not governing specs or delivery-status documents.

For a **single Stitch project that covers the full template family**, start with [all-email-templates-stitch-project.md](all-email-templates-stitch-project.md). That file now consolidates the current template-level guidance into one master prompt, while the individual files remain the per-template maintenance references.

## Scope

This set covers:

| Status  | Template / surface                                            | Prompt file                                                                                                | Source of truth                                                                                                                                                                                                               |
| ------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| current | full shared system                                            | [all-email-templates-stitch-project.md](all-email-templates-stitch-project.md)                             | This folder plus the app-level Stitch prompts in `specs/02-apps/{public-web,product-app,admin-app}/stitch-prompt.md`                                                                                                          |
| current | `billing.invoice-ready`                                       | [billing-invoice-ready.md](billing-invoice-ready.md)                                                       | `packages/contracts/src/domains/email-delivery.ts`, `packages/platform/src/services/communication/email-delivery-templates.ts`, `specs/02-modules/communication/email-delivery/notification-center-billing-invoice-ready.md`  |
| current | `billing.invoice-ready-digest`                                | [billing-invoice-ready-digest.md](billing-invoice-ready-digest.md)                                         | `packages/contracts/src/domains/email-delivery.ts`, `packages/platform/src/services/communication/email-delivery-templates.ts`, `specs/02-modules/communication/notification-center/digest-scheduling.md`                     |
| current | `identity-session.email-verification`                         | [identity-email-verification.md](identity-email-verification.md)                                           | `specs/02-modules/communication/email-delivery/identity-session-email-verification-email.md`, `packages/contracts/src/domains/email-delivery.ts`, `packages/platform/src/services/communication/email-delivery-templates.ts`  |
| current | `identity-session.mfa-code`                                   | [identity-mfa-code.md](identity-mfa-code.md)                                                               | `specs/02-modules/communication/email-delivery/identity-session-mfa-code-email.md`, `packages/contracts/src/domains/email-delivery.ts`, `packages/platform/src/services/communication/email-delivery-templates.ts`            |
| current | `tenant-management.membership-invitation`                     | [tenant-membership-invitation.md](tenant-membership-invitation.md)                                         | `packages/contracts/src/domains/email-delivery.ts`, `packages/platform/src/services/communication/email-delivery-templates.ts`, `specs/02-modules/communication/email-delivery/template-registry-and-invitation-delivery.md`  |
| current | `tenant-management.membership-invitation-reminder`            | [tenant-membership-invitation-reminder.md](tenant-membership-invitation-reminder.md)                       | `packages/contracts/src/domains/email-delivery.ts`, `packages/platform/src/services/communication/email-delivery-templates.ts`, `specs/02-modules/communication/email-delivery/template-registry-and-invitation-delivery.md`  |
| current | `tenant-management.membership-invitation-expiry-notification` | [tenant-membership-invitation-expiry-notification.md](tenant-membership-invitation-expiry-notification.md) | `packages/contracts/src/domains/email-delivery.ts`, `packages/platform/src/services/communication/email-delivery-templates.ts`, `specs/02-modules/communication/email-delivery/template-registry-and-invitation-delivery.md`  |
| current | `identity-session.password-reset`                             | [identity-password-reset.md](identity-password-reset.md)                                                   | `specs/02-modules/communication/email-delivery/identity-session-password-reset-email.md`, `packages/contracts/src/domains/email-delivery.ts`, `packages/platform/src/services/communication/email-delivery-templates.ts`      |
| current | `notification-center.welcome-campaign`                        | [notification-center-welcome-campaign.md](notification-center-welcome-campaign.md)                         | `specs/02-modules/communication/email-delivery/notification-center-welcome-campaign-email.md`, `packages/contracts/src/domains/email-delivery.ts`, `packages/platform/src/services/communication/email-delivery-templates.ts` |
| current | `notification-center.newsletter`                              | [notification-center-newsletter.md](notification-center-newsletter.md)                                     | `specs/02-modules/communication/email-delivery/notification-center-newsletter-email.md`, `packages/contracts/src/domains/email-delivery.ts`, `packages/platform/src/services/communication/email-delivery-templates.ts`       |

## Shared design assumptions

1. **All template concepts are dark mode only.** Do not generate light-theme alternatives in this prompt set.
2. Every template must be **app-centric** and visibly align with one active surface: `public-web`, `product-app`, or `admin-app`.
3. If a template is viewed by or sent for an **admin-app** audience, it must clearly adopt the admin-app's operations-control-tower look and feel rather than a recolored customer email.
4. `product-app` emails should feel like a precision workspace in email form: focused, operational, premium, and tenant-aware.
5. `public-web` emails should feel like the platform's editorial front door in dark mode: spacious, brand-forward, and high-trust.
6. Layouts must stay **email-safe and responsive**, not app-screen mockups disguised as emails.
7. Every template should support the **platform-default brand** plus approved **tenant-branded sender identity and email chrome** inside the chosen app surface.
8. Where the current code-backed template copy is intentionally simple, Stitch should elevate the visual treatment without inventing unsupported workflow steps.

## Deliberate exclusions

This set still excludes multi-step marketing automation, sequenced nurture drips beyond the first welcome email, operator-authored campaign variants, and non-email channel templates because the current accepted specs and code-owned template inventory do not define those surfaces yet.
