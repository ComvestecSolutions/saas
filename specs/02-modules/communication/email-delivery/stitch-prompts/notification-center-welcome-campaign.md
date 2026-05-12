# Stitch Prompt: Notification-Center Welcome Campaign Email

Use this prompt in its own Stitch project. If you are generating the full email family in one Stitch project, start from [all-email-templates-stitch-project.md](all-email-templates-stitch-project.md).

**Template id:** `notification-center.welcome-campaign`  
**Current status:** current code-backed template  
**Default app surface:** mirror the destination experience; use `product-app` by default, `public-web` for public-entry welcomes, and `admin-app` for operator onboarding  
**Allowed app surfaces:** `product-app`, `public-web`, `admin-app`

## Prompt

Design the **welcome campaign email** for **Comvestec Solutions SaaS Foundation**, a governed multi-tenant SaaS platform.

This email is the platform's first code-owned onboarding-style engagement email. It should feel warmer than a password reset or invoice notice, but still clearly belong to a backend-first, audit-aware, enterprise SaaS platform rather than a hype-heavy marketing funnel.

## Shared app-centric dark-mode rules

- Design in **dark mode only**. Do not generate a light-theme alternative.
- Keep the layout **email-safe and responsive**; translate the chosen app surface through palette, typography, spacing, checklist rhythm, and panel treatment rather than literal app screens.
- `product-app` should feel like a **precision workspace** welcome in dark mode: deep-neutral shell, premium onboarding panels, crisp checklist structure, and calm status accents.
- `public-web` should feel like an **editorial enterprise** welcome in dark mode: slightly more spacious, brand-forward, and warm without becoming promotional.
- `admin-app` should feel like an **operations control tower** welcome in dark mode: denser structure, technical labels, and a visibly governed operator posture.
- If the welcome email is for admin-app users, it must clearly adopt the **admin-app** look and feel.

## Product and workflow context

- Notification-center owns multi-channel orchestration and exact-template email preferences for governed communication flows.
- Email delivery still owns the shared template registry, branded sender identity, and email-safe chrome.
- The email should support the platform-default brand and approved tenant-branded sender identity where allowed.
- The email's job is to orient a new recipient quickly, not to simulate an in-app onboarding wizard.

## Visual direction

- Create a **high-trust onboarding** aesthetic in dark mode: calm, premium, structured, welcoming, and email-safe.
- Keep the layout slightly warmer than security emails, but still disciplined and enterprise-ready.
- Prefer clear modular sections, strong action hierarchy, and subtle visual warmth.
- Use email-safe responsive structure, not app-screen mockups.
- Avoid loud celebration graphics, hype copy, or startup-growth-hack styling.

## What this email must accomplish

1. Welcome the recipient clearly.
2. Make the primary next action obvious.
3. Present a compact onboarding checklist or next-step list.
4. Offer a visible support path.
5. Make the sender feel brand-consistent and trustworthy.

## Dynamic content the design should allow for

- Platform or tenant display name
- Recipient email address
- Primary action URL
- Support URL
- Optional send timestamp
- Short next-step checklist items

## Template sections to design

1. **Header**
   - Platform-default or tenant-branded identity area
   - Small welcome or getting-started label

2. **Primary welcome block**
   - Headline welcoming the recipient
   - Supporting line that references the intended recipient email or account context
   - One strong CTA button to continue

3. **Next-step checklist**
   - Compact modular checklist or list area
   - Clear visual rhythm for 2 to 4 short setup tasks

4. **Support block**
   - Calm guidance on where to get help
   - Secondary support link treatment

5. **Footer**
   - Branded sender identity and support details
   - No noisy promotional unsubscribe treatment unless the footer needs a subtle preferences link area

## Content and tone guidance

- Tone should be welcoming, direct, and trustworthy.
- This is not a sales email and not a broad brand campaign.
- Use plain language and keep the reading path easy on mobile.
- Make the CTA and next steps easy to scan in under ten seconds.

## Important constraints

- Do not design this like a discount or product-launch blast.
- Do not imply complex campaign sequencing that is not already represented in the code-owned surface.
- Do not depend on app-only UI elements to communicate the next step.
- Do not render light mode.
- Keep the layout robust for desktop and mobile email clients.

## Deliverable intent

Create a polished welcome campaign email that feels premium, brand-consistent, dark-mode, app-aware, and clearly helpful, with one obvious next action plus a compact onboarding checklist and support path.
