# Stitch Prompt: Identity MFA Code Email

Use this prompt in its own Stitch project. If you are generating the full email family in one Stitch project, start from [all-email-templates-stitch-project.md](all-email-templates-stitch-project.md).

**Template id:** `identity-session.mfa-code`  
**Current status:** current code-backed template  
**Default app surface:** mirror the originating identity handoff - `public-web` for public entry, `product-app` for tenant workspace auth, `admin-app` for operator auth  
**Allowed app surfaces:** `public-web`, `product-app`, `admin-app`

## Prompt

Design the **MFA code email** for **Comvestec Solutions SaaS Foundation**, a governed multi-tenant SaaS platform.

This is a **security-sensitive transactional email** tied to the identity-session flow. The platform needs a high-trust email surface for short-lived sign-in or step-up verification codes that still feels aligned with the platform's calm, enterprise-grade identity experience.

## Shared app-centric dark-mode rules

- Design in **dark mode only**. Do not generate a light-theme alternative.
- Keep the layout **email-safe and responsive**; translate the chosen app surface through palette, spacing, typography, and panel treatment rather than literal app screens.
- `public-web` should feel like an **editorial enterprise** dark-mode handoff with slightly more negative space and brand-forward restraint.
- `product-app` should feel like a **precision workspace** dark-mode handoff with crisp panels, disciplined spacing, and focused status hierarchy.
- `admin-app` should feel like an **operations control tower** dark-mode handoff with denser structure, technical labels, and visibly governed seriousness.
- If the MFA email is for an admin-app user or operator auth flow, it must clearly adopt the **admin-app** look and feel.

## Product and workflow context

- Identity and session flows are handled through Keycloak-backed authentication, federation, MFA, and session lifecycle responsibilities.
- Public or product surfaces may resolve tenant branding before redirecting users into identity flows.
- The email should support the platform-default brand and approved tenant-branded sender identity where that is safe and allowed.
- The email's job is to help a user complete MFA securely and quickly, not to teach them IAM concepts.

## Visual direction

- Create a **security-first code delivery** aesthetic in the active app surface.
- Use a minimal, highly legible dark-mode layout with exceptional hierarchy around the code itself.
- The design should feel official, calm, and impossible to confuse with a marketing email.
- Prefer clear spacing, strong heading hierarchy, a large code panel, and a restrained accent treatment.
- Avoid decorative illustrations, promotional ribbons, or busy dashboard motifs.

## What this email must accomplish

1. Present the one-time MFA code clearly.
2. Make the expiration window immediately obvious.
3. Reassure the recipient about what to do if they did not request the code.
4. Support both platform-default and approved tenant-branded sender identity.
5. Keep the reading path extremely fast on mobile.

## Dynamic content the design should allow for

- Platform or tenant display name
- Recipient email address
- MFA code
- Expiry timestamp
- Optional request timestamp
- Reply-to or support email identity

## Template sections to design

1. **Header**
   - Platform-default or tenant-branded identity area
   - Small security label such as verification code

2. **Code block**
   - Clear headline that a sign-in or verification code was requested
   - Large, unmistakable code treatment
   - Supporting line that references the recipient email when helpful

3. **Time-sensitivity guidance**
   - Compact notice about code expiration
   - Optional short usage guidance for email clients with poor styling

4. **Security reassurance block**
   - Short copy explaining that if the recipient did not request this, they can ignore the email
   - Optional support or contact path

5. **Footer**
   - Branded sender identity and support details
   - Calm security footer treatment

## Content and tone guidance

- Tone is controlled, direct, and reassuring.
- The code should be visually dominant without feeling alarming.
- Use plain language and avoid jargon-heavy IAM terminology.
- Keep the action unmistakable and the supporting copy short.

## Important constraints

- Do not hide the code deep in the layout.
- Do not include passwords, long-lived secrets, or recovery-token style content.
- Do not design this like a marketing blast or dashboard export.
- Do not add speculative device telemetry or location blocks unless they can be optional.
- Do not render light mode.
- Keep the visual treatment clearly legitimate and easy to scan on mobile.

## Deliverable intent

Create a high-trust MFA code email that makes the one-time code immediately visible, communicates urgency without panic, and feels safe, premium, brand-consistent, and app-aware across desktop and mobile email clients.
