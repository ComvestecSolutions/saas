# Stitch Prompt: Notification-Center Newsletter Email

Use this prompt in its own Stitch project. If you are generating the full email family in one Stitch project, start from [all-email-templates-stitch-project.md](all-email-templates-stitch-project.md).

**Template id:** `notification-center.newsletter`  
**Current status:** current code-backed template  
**Default app surface:** `public-web` by default; switch to `product-app` or `admin-app` when the audience is clearly tied to those surfaces  
**Allowed app surfaces:** `public-web`, `product-app`, `admin-app`

## Prompt

Design the **newsletter email** for **Comvestec Solutions SaaS Foundation**, a governed multi-tenant SaaS platform.

This is a **code-owned editorial engagement email** rather than a transactional alert. It should still feel precise, enterprise-grade, and trustworthy, but it can carry a little more rhythm, hierarchy, and editorial polish than the platform's purely operational emails.

## Shared app-centric dark-mode rules

- Design in **dark mode only**. Do not generate a light-theme alternative.
- Keep the layout **email-safe and responsive**; translate the chosen app surface through palette, typography, spacing, and modular content treatment rather than literal app screens.
- `public-web` should feel like an **editorial enterprise** publication in dark mode: spacious charcoal canvas, refined typography, subtle architecture-grid cues, and controlled verdigris or copper accents.
- `product-app` should feel like a **precision workspace** digest in dark mode: elevated panels, cleaner list rhythm, and more operational structure.
- `admin-app` should feel like an **operations control tower** digest in dark mode: denser hierarchy, sharper dividers, and more explicit signal labeling without becoming noisy.
- If the newsletter is for admin-app users, it must clearly adopt the **admin-app** look and feel.

## Product and workflow context

- Notification-center owns multi-channel orchestration and exact-template email preferences for governed communication flows.
- Email delivery owns the shared template registry, branded sender identity, and email-safe chrome.
- The email should support the platform-default brand and approved tenant-branded sender identity where allowed.
- The email's job is to communicate curated updates clearly and respectfully, not to behave like an ad-tech marketing blast.

## Visual direction

- Create an **editorial enterprise newsletter** aesthetic in dark mode.
- Make it feel more content-rich than a transactional notice, but still email-safe and restrained.
- Use a structured responsive layout with strong issue framing, clean story modules, and calm trust signals.
- Prefer subtle hierarchy, thoughtful dividers, and controlled accent use.
- Avoid hype-heavy growth-marketing visuals, oversized hero art, or cluttered grid systems.

## What this email must accomplish

1. Make the issue or edition label obvious.
2. Present highlight stories or updates in a scannable way.
3. Offer a clear read-online path.
4. Include a visible preferences or unsubscribe management path.
5. Feel like a premium, credible product communication.

## Dynamic content the design should allow for

- Recipient email address
- Issue label
- Publication timestamp
- Web-view URL
- Preferences or unsubscribe URL
- Multiple highlight items with title, summary, and article URL

## Template sections to design

1. **Header**
   - Platform-default or tenant-branded identity area
   - Issue label and editorial framing

2. **Issue intro block**
   - Clear headline for the edition
   - Short supporting intro and publication context

3. **Highlight story modules**
   - Repeatable article cards or stacked modules
   - Each item should support title, short summary, and read-more link

4. **Read-online and preferences block**
   - Clear web-view CTA
   - Calm, visible preferences or unsubscribe treatment

5. **Footer**
   - Branded sender identity and support details
   - Professional editorial footer rather than a sales footer

## Content and tone guidance

- Tone should be editorial, confident, and measured.
- This is not a security alert, but it should still feel trustworthy and governed.
- Use plain language and strong scanning hierarchy.
- Keep the content modules easy to consume on mobile.

## Important constraints

- Do not design this like a discount campaign or retail promo blast.
- Do not omit the preferences or unsubscribe path.
- Do not depend on app-dashboard UI patterns to explain the content.
- Do not render light mode.
- Keep the layout robust for desktop and mobile email clients.

## Deliverable intent

Create a polished editorial newsletter email that feels premium, high-trust, email-safe, dark-mode, and app-aware, with strong scannability, elegant content modules, a clear read-online path, and a respectful preferences or unsubscribe treatment.
