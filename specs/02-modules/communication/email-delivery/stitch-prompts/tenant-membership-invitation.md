# Stitch Prompt: Tenant Membership Invitation Email

Use this prompt in its own Stitch project. If you are generating the full email family in one Stitch project, start from [all-email-templates-stitch-project.md](all-email-templates-stitch-project.md).

**Template id:** `tenant-management.membership-invitation`  
**Current status:** current code-backed template  
**Default app surface:** mirror the destination workspace; use `product-app` for tenant-facing invites and `admin-app` for operator, support, or governance invites  
**Allowed app surfaces:** `product-app`, `admin-app`, restrained `public-web` edge variant only when the destination workspace is still not established

## Prompt

Design the **tenant membership invitation email** for **Comvestec Solutions SaaS Foundation**, a governed multi-tenant SaaS platform.

This email is sent when an operator issues an invitation for someone to join a tenant in a specific relation. It must feel secure, trustworthy, and highly legible because it contains an invitation token and explains an authenticated redemption flow. The design should make the invite feel legitimate and structured, not casual or consumer-social.

Treat this as an **accepted-direction design target** for a code-owned platform email template.

## Shared app-centric dark-mode rules

- Design in **dark mode only**. Do not generate a light-theme alternative.
- Keep the layout **email-safe and responsive**; translate the chosen app surface through palette, spacing, typography, and panel treatment rather than literal app screens.
- `product-app` should feel like a **precision workspace** access handoff in dark mode: deep-neutral shell, crisp hierarchy, premium panels, and calm operational accents.
- `admin-app` should feel like an **operations control tower** access handoff in dark mode: denser graphite panels, technical labels, explicit status posture, and visibly governed seriousness.
- `public-web` may be used only as a restrained front-door edge variant when the destination surface is not yet known; once the audience is known, use the destination app look and feel.
- If the invite is for an admin-app user, it must clearly adopt the **admin-app** look and feel.

## Product and workflow context

- The platform is modular, backend-first, and audit-aware.
- Invitation issuance persists on the backend before the email is sent.
- The recipient must **sign in first** and then redeem the invitation token through the authenticated flow.
- The template must work with the platform-default brand and approved tenant-branded sender identity and email chrome.
- The invitation identifies the target tenant context, the invited relation, the expiry timestamp, the sign-in location, and the invitation token.

## Visual direction

- Create a **high-trust access handoff** aesthetic in dark mode.
- Use crisp hierarchy, restrained accent color, and secure-feeling components.
- The invitation token should appear in a distinctive but email-safe code or key panel.
- The CTA and the token block should be visually separate so the flow is easy to understand.
- Avoid playful invitation-party aesthetics, whimsical illustrations, or startup gimmicks.

## What this email must accomplish

1. Confirm that the recipient was invited to join a specific tenant.
2. Make the invited role or relation obvious.
3. Show when the invitation expires.
4. Explain that the user must sign in before redeeming the invitation.
5. Present the invitation token clearly and safely.
6. Make the sender feel legitimate and platform-governed.

## Dynamic content available

- Tenant label such as scope and scope id
- Recipient email address
- Invited relation
- Invitation token
- Expiry timestamp
- Auth start or sign-in URL

## Template sections to design

1. **Header**
   - Platform-default or tenant-branded sender identity
   - Strong transactional access label such as invitation or access request

2. **Invitation summary**
   - Headline that the recipient has been invited
   - Tenant context and invited relation
   - Compact metadata area that includes the expiry timestamp

3. **Auth-first CTA**
   - Primary button to sign in and continue
   - Supporting copy that explains the invite is redeemed after authentication, not directly from an anonymous link

4. **Invitation token block**
   - Clear, email-safe code panel or key card
   - Strong legibility and copy-paste friendliness
   - Treated as important but not visually chaotic

5. **Fallback guidance**
   - Explain what to do if the recipient is not expecting the invite
   - Explain where to go for support

6. **Footer**
   - Branded footer identity
   - Reply-to / support identity
   - Calm security-oriented footer treatment

## Content and tone guidance

- Tone should be calm, authoritative, and reassuring.
- Explain the auth-first redemption flow in plain language.
- Make the token feel important without sounding alarming.
- Keep the message concise and highly scannable.

## Important constraints

- Do not design a direct unauthenticated accept-invite experience.
- Do not hide the token inside a decorative pattern or tiny copy block.
- Do not include admin-only tenant metadata.
- Do not turn the email into a generic login notice.
- Do not render light mode.
- Keep the design robust for mobile email clients where copying the token still needs to feel manageable.

## Deliverable intent

Create a polished invitation email that combines clear access intent, visible tenant and role context, a strong sign-in CTA, and a highly legible invitation token block within a premium dark-mode, app-aware transactional visual system.
