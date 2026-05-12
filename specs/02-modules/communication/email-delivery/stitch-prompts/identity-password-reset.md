# Stitch Prompt: Identity Password Reset Email

Use this prompt in its own Stitch project. If you are generating the full email family in one Stitch project, start from [all-email-templates-stitch-project.md](all-email-templates-stitch-project.md).

**Template id:** `identity-session.password-reset`  
**Current status:** current code-backed template  
**Default app surface:** mirror the originating identity handoff - `public-web` for public entry, `product-app` for tenant workspace auth, `admin-app` for operator auth  
**Allowed app surfaces:** `public-web`, `product-app`, `admin-app`

## Prompt

Design the **password reset email** for **Comvestec Solutions SaaS Foundation**, a governed multi-tenant SaaS platform.

This is a **security-sensitive transactional email** tied to the identity-session flow. The platform's accepted direction keeps login and reset experiences aligned with tenant branding and branded redirect handoff, even when the final reset screen is owned by the identity provider. The email therefore needs to feel consistent with the platform's high-trust product system while staying extremely simple and safe.

## Shared app-centric dark-mode rules

- Design in **dark mode only**. Do not generate a light-theme alternative.
- Keep the layout **email-safe and responsive**; translate the chosen app surface through palette, spacing, typography, and panel treatment rather than literal app screens.
- `public-web` should feel like an **editorial enterprise** dark-mode handoff with refined brand presence and calm negative space.
- `product-app` should feel like a **precision workspace** dark-mode handoff with crisp panels, focused CTA hierarchy, and disciplined operational clarity.
- `admin-app` should feel like an **operations control tower** dark-mode handoff with denser graphite panels, technical labels, and visibly governed seriousness.
- If the reset email is for an admin-app user or operator auth flow, it must clearly adopt the **admin-app** look and feel.

## Product and workflow context

- Identity and session flows are handled through Keycloak-backed authentication, federation, MFA, and password reset responsibilities.
- Public or product surfaces may resolve tenant branding before redirecting users into login or reset flows.
- The email should support the platform-default brand and approved tenant-branded sender identity where that is safe and allowed.
- The email's job is to help a user reset a password securely, not to explain the whole auth system.

## Visual direction

- Create a **security-first transactional** aesthetic in the active app surface.
- Use a minimal, highly legible dark-mode layout with strong CTA hierarchy.
- The design should feel official, calm, and hard to mistake for a phishing-style fake.
- Prefer clear spacing, strong heading hierarchy, compact expiration guidance, and conservative accent use.
- Avoid decorative illustrations, marketing banners, or busy account-dashboard motifs.

## What this email must accomplish

1. Confirm that a password reset was requested.
2. Provide one clear path to continue the reset flow.
3. Communicate any expiration window or time sensitivity clearly.
4. Reassure the recipient about what to do if they did not request the reset.
5. Make the sender feel legitimate and brand-consistent.

## Dynamic content the design should allow for

- Platform or tenant display name
- Recipient email address
- Reset URL
- Expiry timestamp or reset-window hint
- Reply-to or support email identity
- Optional request timestamp

## Template sections to design

1. **Header**
   - Platform-default or tenant-branded identity area
   - Security-oriented label such as password reset

2. **Primary action block**
   - Headline that a password reset was requested
   - Supporting line that references the account or recipient email
   - Strong reset-password CTA button

3. **Time-sensitivity guidance**
   - Clear, compact notice about link expiration
   - Optional secondary plain-text URL block for compatibility

4. **Security reassurance block**
   - Short copy explaining that if the recipient did not request this, they can ignore the email
   - Optional support / contact path

5. **Footer**
   - Branded sender identity and support details
   - Calm security footer treatment

## Content and tone guidance

- Tone is controlled, direct, and reassuring.
- The email should feel more security-oriented than marketing-oriented.
- Use plain language and avoid jargon-heavy IAM terminology.
- Keep the action unmistakable and the surrounding copy short.

## Important constraints

- Do not include passwords, temporary passwords, or unnecessary secret material.
- Do not turn the email into a broad account-management announcement.
- Do not rely on app-dashboard UI patterns.
- Do not add speculative security telemetry fields unless they can be optional.
- Do not render light mode.
- Keep the visual treatment obviously legitimate and easy to scan on mobile.

## Deliverable intent

Create a high-trust password reset email that feels safe, brand-consistent, app-aware, and unmistakably transactional, with one clear CTA and excellent clarity across desktop and mobile email clients.
