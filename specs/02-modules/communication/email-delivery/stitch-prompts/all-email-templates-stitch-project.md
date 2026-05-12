# Stitch Prompt: All Email Templates in One Stitch Project

Use this prompt when you want **one Stitch project** that generates the full Comvestec email-template family as a single, coherent system.

This file is the **combined master prompt** for the shared dark-mode system plus every current template concept. It consolidates the working guidance from the individual prompt files so you can stay inside one Stitch project.

**Project goal:** create the full email-template family in one project  
**Theme requirement:** dark mode only  
**Required app surfaces:** `public-web`, `product-app`, `admin-app`

## Prompt

Design the complete **email template system** for **Comvestec Solutions SaaS Foundation**, a governed multi-tenant SaaS platform with three first-class applications: **public web**, **product app**, and **admin app**.

This Stitch project must produce a **single dark-mode, email-safe design system** plus all current code-owned email templates. The result should feel unified at the system level while still making each template clearly belong to the app surface the recipient is actually interacting with.

Some templates are tied to the public entry flow, some to the authenticated product workspace, and some to operator or governance workflows. If a template is seen by or sent for **admin-app users**, it must visibly adopt the **admin app** look and feel. Do not make admin emails look like lightly recolored customer emails.

## Global system rules

- Design in **dark mode only**. Do not generate light-theme alternates.
- Keep everything **email-safe and responsive**. Use app-inspired palette, typography, spacing, panels, dividers, chips, and metadata treatments rather than literal dashboard screenshots or page mockups.
- Support both the **platform-default brand** and approved **tenant-branded sender identity and email chrome** inside the active app surface.
- Use one shared email family with a recognizable structural grammar: branded header, status or context label, dominant primary panel, disciplined CTA treatment, compatibility-safe plain-text link areas where needed, and a calm footer.
- Preserve strong distinction between **security-sensitive transactional**, **operational transactional**, and **editorial or onboarding** emails.
- Make the system feel premium, memorable, and distinctly designed for this platform. Avoid generic AI-looking SaaS email aesthetics.

## App-surface language

### `public-web`

- Use the **editorial enterprise** direction from the public-web Stitch prompt, translated into dark mode.
- Spacious charcoal or near-black canvas, refined typography, confident negative space, subtle blueprint or architecture-grid texture, and restrained verdigris or teal plus copper or amber accents.
- Feels like the safe front door of the platform: brand-forward, calm, credible, and polished.
- Best for discovery, pre-auth handoff, and editorial communication.

### `product-app`

- Use the **precision workspace** direction from the product-app Stitch prompt.
- Deep-neutral shell, elevated slate or graphite panels, crisp operational hierarchy, premium information density, calm status chips, and tenant-aware accents.
- Feels like a secure authenticated workspace: focused, fast, high-trust, and modular.
- Best for billing, tenant access, account, and in-workspace onboarding flows.

### `admin-app`

- Use the **operations control tower** direction from the admin-app Stitch prompt.
- Midnight graphite or steel shell, denser panels, clearer status coding, technical label treatments for ids and workflow states, and visibly governed action hierarchy.
- Feels like a high-signal operator console: serious, auditable, calm under pressure, and unmistakably administrative.
- Best for operator, governance, support, and admin-audience versions of shared templates.

## App-surface selection rules

1. If the recipient is an **admin-app** user, or the workflow is clearly operator, governance, support, audit, compliance, or internal control-plane oriented, use `admin-app`.
2. If the email is about tenant workspace activity, subscription posture, onboarding into a tenant workspace, or account actions inside the authenticated product, use `product-app` unless rule 1 overrides it.
3. If the email is primarily a public entry, editorial, or pre-auth handoff surface, use `public-web` unless the known audience or originating workflow requires `product-app` or `admin-app`.
4. For identity templates, the visual family must mirror the **originating handoff**:
   - public entry flow -> `public-web`
   - tenant workspace auth flow -> `product-app`
   - operator or support auth flow -> `admin-app`
5. For invitation templates, mirror the **destination workspace**:
   - tenant member or tenant admin joining the customer workspace -> `product-app`
   - operator, support, governance, or internal staff invite -> `admin-app`
   - only use `public-web` as a restrained edge variant for front-door framing, never as the default when the destination app is known

## Shared visual grammar

- A system header that can hold platform-default or tenant-branded identity without looking like a marketing banner.
- Eyebrow labels and status chips that change by app surface and template state.
- One dominant primary panel per email with secondary support panels only when needed.
- Strong CTA hierarchy with accessible contrast and obvious click targets.
- Metadata rows, token panels, checklist modules, and repeating content cards that feel related across the family.
- Footer chrome that stays calm, legitimate, and role-appropriate.

## Cross-template family requirements

- **Identity family** (`identity-session.email-verification`, `identity-session.mfa-code`, `identity-session.password-reset`) should share one security-first family language, with the MFA code email making the code the visual focal point.
- **Billing family** (`billing.invoice-ready`, `billing.invoice-ready-digest`) should share one operational billing family language, with the digest becoming denser but never chaotic.
- **Invitation family** (`tenant-management.membership-invitation`, `tenant-management.membership-invitation-reminder`, `tenant-management.membership-invitation-expiry-notification`) should clearly belong together, with initial invite, pending reminder, and expired state variations that are immediately recognizable.
- **Engagement family** (`notification-center.welcome-campaign`, `notification-center.newsletter`) can be warmer and more editorial, but still governed, premium, and clearly part of the same dark-mode platform system.

## Template inventory and required intent

| Template id                                                   | Default app-surface rule                                                                                                                                              | Core job                                                                             |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `billing.invoice-ready`                                       | `product-app` by default; `admin-app` for operator billing audiences; restrained `public-web` edge variant only when the destination workspace is not yet established | Confirm a single invoice is ready and drive one trusted billing action               |
| `billing.invoice-ready-digest`                                | `product-app` by default; `admin-app` for operator billing audiences; restrained `public-web` edge variant only when the destination workspace is not yet established | Summarize several ready invoices in one highly scannable digest                      |
| `identity-session.email-verification`                         | mirror the originating identity handoff                                                                                                                               | Verify an email address with one clear secure CTA                                    |
| `identity-session.mfa-code`                                   | mirror the originating identity handoff                                                                                                                               | Present a short-lived MFA code with extreme clarity                                  |
| `identity-session.password-reset`                             | mirror the originating identity handoff                                                                                                                               | Help the user reset a password safely and quickly                                    |
| `tenant-management.membership-invitation`                     | `product-app` by default; `admin-app` for operator-facing invites; restrained `public-web` edge variant only when the destination workspace is not yet established    | Invite a recipient into a tenant or operator context with auth-first redemption      |
| `tenant-management.membership-invitation-reminder`            | same as the invitation destination surface, including the restrained `public-web` edge variant when the destination workspace is not yet established                  | Remind the recipient that access is still pending without repeating the token        |
| `tenant-management.membership-invitation-expiry-notification` | same as the invitation destination surface, including the restrained `public-web` edge variant when the destination workspace is not yet established                  | Confirm expiry and direct the user to the correct next step                          |
| `notification-center.welcome-campaign`                        | `product-app` by default; `public-web` or `admin-app` when audience-specific                                                                                          | Welcome the recipient and orient them to the next action                             |
| `notification-center.newsletter`                              | `public-web` by default; `product-app` or `admin-app` when audience-specific                                                                                          | Deliver editorial updates with premium scannability and clear preferences management |

## Per-template prompt details

### 1. `billing.invoice-ready`

- **App surface rule:** mirror the destination workspace; use `product-app` by default, switch to `admin-app` for operator-facing billing audiences, and allow a restrained `public-web` edge variant only when the destination workspace is not yet established.
- **Intent:** serious operational billing notification, never a marketing blast and never a PDF invoice replacement.
- **What it must accomplish:** confirm a specific invoice is ready, make tenant or account context obvious, show invoice number, total due, due date, and give one obvious review or pay action.
- **Dynamic content:** tenant label, recipient email address, invoice number, invoice URL, due timestamp, total-due display value.
- **Required sections:** header, primary summary block, primary CTA, trust and guidance copy, disciplined footer.
- **Design cues:** one dominant invoice summary panel, compact metadata row, strong CTA hierarchy, calm teal or amber accent, premium operational tone.
- **Constraints:** no promotional styling, no implication that the email itself contains the invoice document, no admin-only billing metadata, no internal reconciliation detail, no light mode.

### 2. `billing.invoice-ready-digest`

- **App surface rule:** mirror the destination workspace; use `product-app` by default, switch to `admin-app` for operator-facing billing audiences, and allow a restrained `public-web` edge variant only when the destination workspace is not yet established.
- **Intent:** compact operational digest that helps a user scan several ready invoices quickly without losing clarity or trust.
- **What it must accomplish:** make the count of ready invoices obvious, show tenant context and intended recipient, provide a scannable summary of each item, and keep actions at the per-invoice level.
- **Dynamic content:** tenant label, recipient email address, and a list of invoice items with invoice number, invoice URL, due timestamp, and total-due display value.
- **Required sections:** header, digest summary block, invoice list, digest-level summary treatment, transactional footer.
- **Design cues:** stacked cards or rows, disciplined list rhythm, compact summary chips, high scanability, denser than the single-invoice email but never chaotic.
- **Constraints:** no newsletter behavior, no marketing banners, no analytics charts, no internal queueing or receipt detail, no desktop-only wide tables, no light mode.

### 3. `identity-session.email-verification`

- **App surface rule:** mirror the originating identity handoff - `public-web` for public entry, `product-app` for tenant workspace auth, `admin-app` for operator auth.
- **Intent:** security-first transactional verification email that feels official, calm, and unmistakably legitimate.
- **What it must accomplish:** confirm verification is needed, provide one clear verification path, communicate expiry or time sensitivity, and tell the recipient what to do if the request was unexpected.
- **Dynamic content:** platform or tenant display name, recipient email address, verification URL, expiry hint, reply-to or support identity, optional request timestamp.
- **Required sections:** header, primary action block, time-sensitivity guidance, security reassurance block, calm security footer.
- **Design cues:** minimal dark-mode layout, strong CTA hierarchy, conservative accent use, obvious legitimacy signals, no phishing-like ambiguity.
- **Constraints:** no passwords, no MFA codes, no unnecessary secret material, no broad account-management announcement, no speculative security telemetry by default, no light mode.

### 4. `identity-session.mfa-code`

- **App surface rule:** mirror the originating identity handoff - `public-web` for public entry, `product-app` for tenant workspace auth, `admin-app` for operator auth.
- **Intent:** security-first code-delivery email with extreme hierarchy around the one-time code.
- **What it must accomplish:** present the MFA code clearly, make expiry immediately obvious, reassure unexpected recipients, and keep the reading path extremely fast on mobile.
- **Dynamic content:** platform or tenant display name, recipient email address, MFA code, expiry timestamp, optional request timestamp, reply-to or support identity.
- **Required sections:** header, code block, time-sensitivity guidance, security reassurance block, calm security footer.
- **Design cues:** one dominant code panel, strong contrast, restrained accent, short supporting copy, urgency without panic.
- **Constraints:** do not hide the code, do not include passwords or long-lived secrets, do not turn it into a dashboard export or marketing blast, do not add speculative device telemetry by default, no light mode.

### 5. `identity-session.password-reset`

- **App surface rule:** mirror the originating identity handoff - `public-web` for public entry, `product-app` for tenant workspace auth, `admin-app` for operator auth.
- **Intent:** security-first reset email that feels simple, official, and safe.
- **What it must accomplish:** confirm a password reset was requested, provide one clear reset action, communicate expiry, and reassure the recipient if the request was unexpected.
- **Dynamic content:** platform or tenant display name, recipient email address, reset URL, expiry hint, reply-to or support identity, optional request timestamp.
- **Required sections:** header, primary action block, time-sensitivity guidance, security reassurance block, calm security footer.
- **Design cues:** minimal dark-mode layout, strong CTA hierarchy, conservative accent treatment, clear expiration messaging, no clutter.
- **Constraints:** no passwords or temporary passwords, no speculative telemetry by default, no broad account-management announcement, no app-dashboard mimicry, no light mode.

### 6. `tenant-management.membership-invitation`

- **App surface rule:** mirror the destination workspace; use `product-app` for tenant-facing invites, `admin-app` for operator, support, or governance invites, and allow a restrained `public-web` edge variant only when the destination workspace is not yet established.
- **Intent:** high-trust access handoff that makes the invite feel legitimate, secure, and structured.
- **What it must accomplish:** confirm the recipient was invited to a specific tenant or operator context, make the invited relation obvious, show expiry, explain the auth-first redemption flow, and present the invitation token clearly.
- **Dynamic content:** tenant label, recipient email address, invited relation, invitation token, expiry timestamp, auth start or sign-in URL.
- **Required sections:** header, invitation summary, auth-first CTA, invitation token block, fallback guidance, security-oriented footer.
- **Design cues:** crisp hierarchy, token in a strong copy-friendly panel, CTA clearly separated from the token, premium access-handoff posture.
- **Constraints:** no unauthenticated accept flow, do not hide the token, do not include admin-only tenant metadata, do not turn it into a generic login notice, no light mode.

### 7. `tenant-management.membership-invitation-reminder`

- **App surface rule:** mirror the destination workspace; use `product-app` for tenant-facing invites, `admin-app` for operator, support, or governance invites, and allow a restrained `public-web` edge variant only when the destination workspace is not yet established.
- **Intent:** polite but clear pending-access reminder that stays visibly related to the invitation family.
- **What it must accomplish:** remind the recipient the invitation is still pending, reconfirm tenant and role context, show expiry clearly, point the recipient back to sign-in, and explain that the original invitation or a new operator-issued invitation may be needed.
- **Dynamic content:** tenant label, recipient email address, invited relation, expiry timestamp, auth start or sign-in URL.
- **Required sections:** header, pending reminder block, primary CTA, recovery guidance, calm transactional footer.
- **Design cues:** same invitation family, lighter urgency signal, subtle reminder badge or time badge, clear next-step emphasis.
- **Constraints:** no invitation token in the reminder, no direct accept flow from the reminder, no implication that the invitation was reissued, no expired-state styling, no light mode.

### 8. `tenant-management.membership-invitation-expiry-notification`

- **App surface rule:** mirror the destination workspace; use `product-app` for tenant-facing invites, `admin-app` for operator, support, or governance invites, and allow a restrained `public-web` edge variant only when the destination workspace is not yet established.
- **Intent:** definite but helpful expiry notification that closes the loop on the invitation workflow.
- **What it must accomplish:** clearly state the invitation expired, reconfirm tenant and role context, show the validity end time, and explain the next step such as sign-in for follow-up or requesting a new invitation.
- **Dynamic content:** tenant label, recipient email address, invited relation, expiry timestamp, auth start or sign-in URL.
- **Required sections:** header, expired notice block, next-step CTA, guidance block, transactional footer.
- **Design cues:** same invitation family with clear expired-state treatment, measured status cue, strong closure without panic.
- **Constraints:** no token, no suggestion that the old invite can still be redeemed, no retry path that bypasses operator re-invitation, no internal operator or audit metadata, no light mode.

### 9. `notification-center.welcome-campaign`

- **App surface rule:** mirror the destination experience; use `product-app` by default, `public-web` for public-entry welcomes, and `admin-app` for operator onboarding.
- **Intent:** onboarding-style engagement email that is warmer than security or billing messages but still clearly governed and enterprise-grade.
- **What it must accomplish:** welcome the recipient clearly, make the primary next action obvious, present a compact onboarding checklist, and provide a visible support path.
- **Dynamic content:** platform or tenant display name, recipient email address, primary action URL, support URL, optional send timestamp, short next-step checklist items.
- **Required sections:** header, primary welcome block, next-step checklist, support block, footer.
- **Design cues:** premium dark-mode onboarding rhythm, structured checklist modules, slightly warmer visual tone than the security family, still disciplined and email-safe.
- **Constraints:** no discount or product-launch blast energy, no implied complex campaign sequencing, no dependence on app-only UI elements, no light mode.

### 10. `notification-center.newsletter`

- **App surface rule:** `public-web` by default; switch to `product-app` or `admin-app` when the audience is clearly tied to those surfaces.
- **Intent:** editorial, premium, trustworthy newsletter that remains governed and high-trust.
- **What it must accomplish:** make the edition label obvious, present highlight stories in a scannable way, offer a clear read-online path, and include visible preferences or unsubscribe management.
- **Dynamic content:** recipient email address, issue label, publication timestamp, web-view URL, preferences or unsubscribe URL, multiple highlight items with title, summary, and article URL.
- **Required sections:** header, issue intro block, highlight story modules, read-online and preferences block, professional editorial footer.
- **Design cues:** dark-mode editorial enterprise system, refined typography, calm modular story cards, clear content hierarchy, premium publication posture.
- **Constraints:** no retail-promo styling, do not omit preferences or unsubscribe handling, do not depend on dashboard UI patterns, no light mode.

## Required output qualities

- Every template must look like part of one family without collapsing into one generic samey layout.
- Admin-app variants must feel genuinely administrative.
- Product-app variants must feel like a secure tenant workspace.
- Public-web variants must feel like a premium brand front door.
- The system should feel polished on both desktop and mobile email clients.
- Do not invent unsupported workflow steps, dashboards, or backend data not present in the prompt set.

## Deliverable intent

Create one Stitch project that yields a **complete dark-mode email template system** for the platform: unified, app-aware, email-safe, and visually distinctive across identity, billing, invitation, welcome, and newsletter surfaces.
