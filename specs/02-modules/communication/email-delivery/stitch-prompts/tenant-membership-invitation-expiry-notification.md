# Stitch Prompt: Tenant Membership Invitation Expiry Notification Email

Use this prompt in its own Stitch project. If you are generating the full email family in one Stitch project, start from [all-email-templates-stitch-project.md](all-email-templates-stitch-project.md).

**Template id:** `tenant-management.membership-invitation-expiry-notification`  
**Current status:** current code-backed template  
**Default app surface:** mirror the destination workspace; use `product-app` for tenant-facing invites and `admin-app` for operator, support, or governance invites  
**Allowed app surfaces:** `product-app`, `admin-app`, restrained `public-web` edge variant only when the destination workspace is still not established

## Prompt

Design the **tenant membership invitation expiry notification email** for **Comvestec Solutions SaaS Foundation**, a governed multi-tenant SaaS platform.

This email is sent after an invitation has expired. It should feel definite and trustworthy without sounding punitive. The template needs to communicate that the previous invite is no longer redeemable, restate who the invite was for, and direct the recipient toward the correct follow-up path.

Treat this as an **accepted-direction design target** for a code-owned platform notification template.

## Shared app-centric dark-mode rules

- Design in **dark mode only**. Do not generate a light-theme alternative.
- Keep the layout **email-safe and responsive**; translate the chosen app surface through palette, spacing, typography, and panel treatment rather than literal app screens.
- `product-app` should feel like a **precision workspace** expired-state email in dark mode: deep-neutral shell, clear hierarchy, and calm operational accents.
- `admin-app` should feel like an **operations control tower** expired-state email in dark mode: denser graphite panels, technical labels, and visibly governed seriousness.
- `public-web` may be used only as a restrained front-door edge variant when the destination surface is not yet known; once the audience is known, use the destination app look and feel.
- If the expiry notification is for an admin-app user, it must clearly adopt the **admin-app** look and feel.

## Product and workflow context

- The prior invitation is no longer valid.
- The recipient may still need to sign in for follow-up steps or request a new invitation from an operator.
- No invitation token is sent in this message.
- The email should feel like part of the same invitation family, but with an expired-state treatment that is clear and composed.

## Visual direction

- Create a **resolved or expired access state** aesthetic in dark mode.
- Use clear hierarchy and status styling that communicates closure, not panic.
- Add a restrained expired-state cue, such as a muted amber or graphite status badge, rather than aggressive failure red unless absolutely necessary.
- Keep the layout related to the original invitation family so recipients understand the connection.

## What this email must accomplish

1. Clearly state that the invitation expired.
2. Reconfirm the tenant and invited role context.
3. Show the time until which the invitation had been valid.
4. Explain the next step: sign in for follow-up or request a new invitation.
5. Preserve trust and sender legitimacy.

## Dynamic content available

- Tenant label such as scope and scope id
- Recipient email address
- Invited relation
- Expiry timestamp
- Auth start or sign-in URL

## Template sections to design

1. **Header**
   - Branded invitation-family header
   - Clear expired status marker

2. **Expired notice block**
   - Headline that the invitation has expired
   - Tenant context and role
   - Metadata line showing the validity end time

3. **Next-step CTA**
   - Sign in for follow-up steps or to continue into the product entry point
   - Supporting copy that a new invitation may be required

4. **Guidance block**
   - Short explanation that the previous invite cannot be redeemed anymore
   - Calm note about contacting an operator or support if access is still needed

5. **Footer**
   - Branded support / reply-to identity
   - Transactional footer chrome

## Content and tone guidance

- Tone is calm, definite, and helpful.
- Do not sound accusatory or overly alarmist.
- Make it clear that expiry is a workflow state, not an account failure.
- The layout should help the user understand the outcome immediately.

## Important constraints

- Do not include the invitation token.
- Do not imply that the old invite can still be redeemed.
- Do not design a retry action that bypasses operator-issued re-invitation.
- Do not expose internal operator or audit metadata.
- Do not render light mode.
- Keep the expired-state styling clear but measured.

## Deliverable intent

Create an expiry-notification email that closes the loop on the invitation workflow with a clear state change, useful next steps, and a polished dark-mode, app-aware enterprise transactional design.
